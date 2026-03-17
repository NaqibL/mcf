'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import { Briefcase, CheckCircle, XCircle, Database, AlertCircle, BarChart2 } from 'lucide-react'
import { dashboardApi } from '@/lib/api'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import AuthGate from '../components/AuthGate'
import { Layout } from '../components/layout'
import NavUserActions from '../components/NavUserActions'
import {
  PageHeader,
  Card,
  CardBody,
  EmptyState,
  LoadingState,
} from '@/components/design'
import { DashboardErrorBoundary } from './DashboardErrorBoundary'
import { DashboardCharts } from './DashboardCharts'
import { toast } from 'sonner'

const LazyDashboardCharts = dynamic(() => import('./DashboardCharts').then((m) => ({ default: m.DashboardCharts })), {
  ssr: false,
  loading: () => (
    <div className="space-y-8">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="h-64 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-700" />
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="h-96 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-700" />
      </div>
    </div>
  ),
})

type Summary = {
  total_jobs: number
  active_jobs: number
  inactive_jobs: number
  by_source: Record<string, number>
  jobs_with_embeddings: number
  jobs_needing_backfill: number
}

type JobsPostedRemovedPoint = {
  date: string
  posted_count: number
  removed_count: number
  cumulative_posted: number
  cumulative_removed: number
}

type CategoryStats = {
  active_count: number
  top_employment_type: string | null
  top_position_level: string | null
  avg_salary: number | null
  employment_types: Array<{ employment_type: string; count: number }>
  position_levels: Array<{ position_level: string; count: number }>
  salary_buckets: Array<{ bucket: string; count: number }>
}

const TIME_RANGE_OPTIONS = [
  { value: 30, label: '30d' },
  { value: 90, label: '90d' },
  { value: 180, label: '180d' },
  { value: 365, label: '365d' },
]

const SUMMARY_CARDS = [
  {
    key: 'total_jobs',
    label: 'Total jobs',
    icon: Briefcase,
    iconColor: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',
    valueColor: 'text-slate-900 dark:text-slate-100',
    valueKey: 'total_jobs' as const,
  },
  {
    key: 'active_jobs',
    label: 'Active jobs',
    icon: CheckCircle,
    iconColor: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
    valueColor: 'text-emerald-600 dark:text-emerald-400',
    valueKey: 'active_jobs' as const,
  },
  {
    key: 'inactive_jobs',
    label: 'Inactive jobs',
    icon: XCircle,
    iconColor: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
    valueColor: 'text-slate-600 dark:text-slate-400',
    valueKey: 'inactive_jobs' as const,
  },
  {
    key: 'jobs_with_embeddings',
    label: 'With embeddings',
    icon: Database,
    iconColor: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400',
    valueColor: 'text-indigo-600 dark:text-indigo-400',
    valueKey: 'jobs_with_embeddings' as const,
  },
  {
    key: 'jobs_needing_backfill',
    label: 'Need backfill',
    icon: AlertCircle,
    iconColor: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
    valueColor: 'text-amber-600 dark:text-amber-400',
    valueKey: 'jobs_needing_backfill' as const,
    sublabel: 'Category/employment missing',
  },
  {
    key: 'by_source',
    label: 'By source (MCF)',
    icon: BarChart2,
    iconColor: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',
    valueColor: 'text-slate-600 dark:text-slate-400',
    valueKey: 'by_source' as const,
  },
]

function DashboardContent() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [jobsPostedAndRemoved, setJobsPostedAndRemoved] = useState<JobsPostedRemovedPoint[]>([])
  const [activeJobsOverTime, setActiveJobsOverTime] = useState<Array<{ date: string; active_count: number }>>([])
  const [jobsByCategory, setJobsByCategory] = useState<Array<{ category: string; count: number }>>([])
  const [jobsByEmploymentType, setJobsByEmploymentType] = useState<Array<{ employment_type: string; count: number }>>([])
  const [jobsByPositionLevel, setJobsByPositionLevel] = useState<Array<{ position_level: string; count: number }>>([])
  const [salaryDistribution, setSalaryDistribution] = useState<Array<{ bucket: string; count: number }>>([])
  const [loading, setLoading] = useState(true)
  const [limitDays, setLimitDays] = useState(90)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [categoryTrends, setCategoryTrends] = useState<
    Array<{ date: string; active_count: number; added_count: number; removed_count: number }>
  >([])
  const [categoryStats, setCategoryStats] = useState<CategoryStats | null>(null)
  const [categoryDetailLoading, setCategoryDetailLoading] = useState(false)

  const formatDate = useCallback((d: string) => {
    const date = new Date(d)
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })
  }, [])

  const getPostedRemovedDomainMax = useCallback(() => {
    if (!jobsPostedAndRemoved.length) return 100
    const values = jobsPostedAndRemoved.flatMap((d) => [d.posted_count, d.removed_count]).filter((v) => v > 0)
    if (!values.length) return 100
    const sorted = [...values].sort((a, b) => a - b)
    const p90Index = Math.floor(sorted.length * 0.9)
    const p90 = sorted[p90Index] ?? sorted[sorted.length - 1]
    return Math.max(100, Math.ceil(p90 * 1.2))
  }, [jobsPostedAndRemoved])

  const employmentData = useMemo(
    () =>
      selectedCategory && categoryStats
        ? categoryStats.employment_types.filter((x) => x.employment_type !== 'Unknown')
        : jobsByEmploymentType,
    [selectedCategory, categoryStats, jobsByEmploymentType]
  )
  const positionData = useMemo(
    () =>
      selectedCategory && categoryStats
        ? categoryStats.position_levels.filter((x) => x.position_level !== 'Unknown')
        : jobsByPositionLevel,
    [selectedCategory, categoryStats, jobsByPositionLevel]
  )
  const salaryData = useMemo(
    () => (selectedCategory && categoryStats ? categoryStats.salary_buckets : salaryDistribution),
    [selectedCategory, categoryStats, salaryDistribution]
  )

  const hasRetriedRef = useRef(false)

  useEffect(() => {
    const load = async (isRetry = false) => {
      setLoading(true)
      try {
        if (isSupabaseConfigured) {
          await supabase.auth.getSession()
        }
        const [s, jpr, ajo, jbc, jbet, jbpl, sd] = await Promise.all([
          dashboardApi.getSummary(),
          dashboardApi.getJobsOverTimePostedAndRemoved(limitDays),
          dashboardApi.getActiveJobsOverTime(limitDays),
          dashboardApi.getJobsByCategory(limitDays, 30),
          dashboardApi.getJobsByEmploymentType(limitDays, 20),
          dashboardApi.getJobsByPositionLevel(limitDays, 20),
          dashboardApi.getSalaryDistribution(),
        ])
        setSummary(s)
        setJobsPostedAndRemoved(jpr || [])
        setActiveJobsOverTime(ajo || [])
        setJobsByCategory((jbc || []).filter((x) => x.category !== 'Unknown'))
        setJobsByEmploymentType((jbet || []).filter((x) => x.employment_type !== 'Unknown'))
        setJobsByPositionLevel((jbpl || []).filter((x) => x.position_level !== 'Unknown'))
        setSalaryDistribution(sd || [])
        hasRetriedRef.current = false
      } catch (err: unknown) {
        if (!isRetry && !hasRetriedRef.current) {
          hasRetriedRef.current = true
          setTimeout(() => load(true), 1500)
        } else {
          toast.error('Failed to load dashboard. Is the API server running?')
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [limitDays])

  useEffect(() => {
    if (!selectedCategory) {
      setCategoryTrends([])
      setCategoryStats(null)
      return
    }
    const load = async () => {
      setCategoryDetailLoading(true)
      try {
        const [trends, stats] = await Promise.all([
          dashboardApi.getCategoryTrends(selectedCategory, limitDays),
          dashboardApi.getCategoryStats(selectedCategory),
        ])
        setCategoryTrends(trends || [])
        setCategoryStats(stats || null)
      } catch {
        setCategoryTrends([])
        setCategoryStats(null)
      } finally {
        setCategoryDetailLoading(false)
      }
    }
    load()
  }, [selectedCategory, limitDays])

  const hasData = summary || jobsPostedAndRemoved.length > 0 || activeJobsOverTime.length > 0 || jobsByCategory.length > 0

  return (
    <Layout userSlot={<NavUserActions />}>
      <DashboardErrorBoundary>
        <PageHeader
          title="Dashboard"
          subtitle="Job market analytics and trends"
          action={
            <div className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-700">
              {TIME_RANGE_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setLimitDays(value)}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 ${
                    limitDays === value
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-600 dark:text-slate-100'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          }
        />

        {loading ? (
          <LoadingState variant="dashboard" />
        ) : !hasData ? (
          <Card className="border-slate-200 dark:border-slate-700">
            <CardBody>
              <EmptyState
                icon={Database}
                message="No dashboard data"
                description="Live job data will appear when the API server is connected and has crawled jobs."
              />
            </CardBody>
          </Card>
        ) : (
          <div className="space-y-8">
            <section>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
                Summary
              </h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                {SUMMARY_CARDS.map(({ key, label, icon: Icon, iconColor, valueColor, valueKey, sublabel }) => {
                  const rawValue =
                    valueKey === 'by_source' ? summary?.by_source?.mcf : summary?.[valueKey]
                  const displayValue =
                    rawValue != null ? (typeof rawValue === 'number' ? rawValue.toLocaleString() : String(rawValue)) : '—'
                  return (
                    <Card
                      key={key}
                      size="compact"
                      className="flex flex-col items-center justify-center text-center min-h-[100px] border-slate-200 dark:border-slate-700 transition-shadow hover:shadow-md"
                    >
                      <div className={`p-2 rounded-lg mb-2 ${iconColor}`}>
                        <Icon className="size-5" aria-hidden />
                      </div>
                      <div className={`text-xl font-bold tabular-nums ${valueColor}`}>
                        {displayValue}
                      </div>
                      <div className="text-sm text-slate-500 dark:text-slate-400">{label}</div>
                      {sublabel && (
                        <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{sublabel}</div>
                      )}
                    </Card>
                  )
                })}
              </div>
            </section>

            <LazyDashboardCharts
              jobsPostedAndRemoved={jobsPostedAndRemoved}
              activeJobsOverTime={activeJobsOverTime}
              jobsByCategory={jobsByCategory}
              employmentData={employmentData}
              positionData={positionData}
              salaryData={salaryData}
              categoryTrends={categoryTrends}
              selectedCategory={selectedCategory}
              categoryStats={categoryStats}
              categoryDetailLoading={categoryDetailLoading}
              limitDays={limitDays}
              onCategorySelect={setSelectedCategory}
              formatDate={formatDate}
              getPostedRemovedDomainMax={getPostedRemovedDomainMax}
            />
          </div>
        )}
      </DashboardErrorBoundary>
    </Layout>
  )
}

export default function DashboardPage() {
  return (
    <AuthGate>
      {() => <DashboardContent />}
    </AuthGate>
  )
}
