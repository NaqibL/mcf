'use client'

import { useEffect, useState } from 'react'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { Briefcase, CheckCircle, XCircle, Database, AlertCircle, BarChart2 } from 'lucide-react'
import { dashboardApi } from '@/lib/api'
import AuthGate from '../components/AuthGate'
import Nav from '../components/Nav'
import NavUserActions from '../components/NavUserActions'
import Spinner from '../components/Spinner'
import toast from 'react-hot-toast'

const CHART_COLORS = ['#6366f1', '#8b5cf6', '#10b981', '#f59e0b', '#f43f5e', '#0ea5e9', '#64748b', '#a16207']

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
  const [categoryStats, setCategoryStats] = useState<{
    active_count: number
    top_employment_type: string | null
    top_position_level: string | null
    avg_salary: number | null
    employment_types: Array<{ employment_type: string; count: number }>
    position_levels: Array<{ position_level: string; count: number }>
    salary_buckets: Array<{ bucket: string; count: number }>
  } | null>(null)
  const [categoryDetailLoading, setCategoryDetailLoading] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
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
      } catch (err: unknown) {
        toast.error('Failed to load dashboard. Is the API server running?')
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

  const formatDate = (d: string) => {
    const date = new Date(d)
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })
  }

  // Use 90th percentile for Y axis to avoid backfill spikes dominating the scale
  const getPostedRemovedDomainMax = () => {
    if (!jobsPostedAndRemoved.length) return 100
    const values = jobsPostedAndRemoved.flatMap((d) => [d.posted_count, d.removed_count]).filter((v) => v > 0)
    if (!values.length) return 100
    const sorted = [...values].sort((a, b) => a - b)
    const p90Index = Math.floor(sorted.length * 0.9)
    const p90 = sorted[p90Index] ?? sorted[sorted.length - 1]
    return Math.max(100, Math.ceil(p90 * 1.2))
  }

  const employmentData = selectedCategory && categoryStats
    ? categoryStats.employment_types.filter((x) => x.employment_type !== 'Unknown')
    : jobsByEmploymentType
  const positionData = selectedCategory && categoryStats
    ? categoryStats.position_levels.filter((x) => x.position_level !== 'Unknown')
    : jobsByPositionLevel
  const salaryData = selectedCategory && categoryStats ? categoryStats.salary_buckets : salaryDistribution

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Nav rightSlot={<NavUserActions />} />
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <Spinner size="lg" />
          <p className="text-slate-500 text-sm">Loading dashboard…</p>
        </div>
      </div>
    )
  }

  const timeRangeOptions = [
    { value: 30, label: '30d' },
    { value: 90, label: '90d' },
    { value: 180, label: '180d' },
    { value: 365, label: '365d' },
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      <Nav rightSlot={null} />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-10">
        {/* Summary cards */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Summary</h2>
            <div className="flex gap-1 p-1 bg-slate-200/60 rounded-lg">
              {timeRangeOptions.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setLimitDays(value)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors
                    ${limitDays === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col items-center text-center min-h-[100px] justify-center">
              <div className="p-2 rounded-lg bg-slate-100 mb-2">
                <Briefcase size={20} className="text-slate-600" />
              </div>
              <div className="text-2xl font-bold text-slate-900 tabular-nums">{summary?.total_jobs?.toLocaleString() ?? '—'}</div>
              <div className="text-sm text-slate-500">Total jobs</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col items-center text-center min-h-[100px] justify-center">
              <div className="p-2 rounded-lg bg-emerald-100 mb-2">
                <CheckCircle size={20} className="text-emerald-600" />
              </div>
              <div className="text-2xl font-bold text-emerald-600 tabular-nums">{summary?.active_jobs?.toLocaleString() ?? '—'}</div>
              <div className="text-sm text-slate-500">Active jobs</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col items-center text-center min-h-[100px] justify-center">
              <div className="p-2 rounded-lg bg-slate-100 mb-2">
                <XCircle size={20} className="text-slate-500" />
              </div>
              <div className="text-2xl font-bold text-slate-600 tabular-nums">{summary?.inactive_jobs?.toLocaleString() ?? '—'}</div>
              <div className="text-sm text-slate-500">Inactive jobs</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col items-center text-center min-h-[100px] justify-center">
              <div className="p-2 rounded-lg bg-indigo-100 mb-2">
                <Database size={20} className="text-indigo-600" />
              </div>
              <div className="text-2xl font-bold text-indigo-600 tabular-nums">{summary?.jobs_with_embeddings?.toLocaleString() ?? '—'}</div>
              <div className="text-sm text-slate-500">With embeddings</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col items-center text-center min-h-[100px] justify-center">
              <div className="p-2 rounded-lg bg-amber-100 mb-2">
                <AlertCircle size={20} className="text-amber-600" />
              </div>
              <div className="text-2xl font-bold text-amber-600 tabular-nums">{summary?.jobs_needing_backfill?.toLocaleString() ?? '—'}</div>
              <div className="text-sm text-slate-500">Need backfill</div>
              <div className="text-xs text-slate-400 mt-0.5">Category/employment missing</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col items-center text-center min-h-[100px] justify-center">
              <div className="p-2 rounded-lg bg-slate-100 mb-2">
                <BarChart2 size={20} className="text-slate-600" />
              </div>
              <div className="text-2xl font-bold text-slate-600 tabular-nums">{summary?.by_source?.mcf?.toLocaleString() ?? '—'}</div>
              <div className="text-sm text-slate-500">By source (MCF)</div>
            </div>
          </div>
        </section>

        {/* Jobs by posted date and removed + Total active jobs */}
        <section>
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Jobs over time</h2>
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h3 className="text-sm font-medium text-slate-700 mb-2">Posted vs removed</h3>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={jobsPostedAndRemoved}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  barCategoryGap={4}
                  barGap={2}
                  barSize={12}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tickFormatter={(v) => formatDate(v)} fontSize={11} />
                  <YAxis fontSize={11} domain={[0, getPostedRemovedDomainMax()]} />
                  <Tooltip
                    formatter={(value: number) => [value.toLocaleString(), '']}
                    labelFormatter={(label) => formatDate(label)}
                  />
                  <Legend />
                  <Bar dataKey="posted_count" name="Posted" fill="#10b981" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="removed_count" name="Removed" fill="#ef4444" radius={[2, 2, 0, 0]} />
                </BarChart>
                </ResponsiveContainer>
              </div>
              {jobsPostedAndRemoved.length === 0 && (
                <p className="text-sm text-slate-500 mt-2">No data for this period.</p>
              )}
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h3 className="text-sm font-medium text-slate-700 mb-2">Total active jobs</h3>
              <div className="h-[340px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={activeJobsOverTime} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="activeJobsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tickFormatter={(v) => formatDate(v)} fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip
                    formatter={(value: number) => [value.toLocaleString(), 'Active jobs']}
                    labelFormatter={(label) => formatDate(label)}
                  />
                  <Area
                    type="monotone"
                    dataKey="active_count"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fill="url(#activeJobsGradient)"
                  />
                </AreaChart>
                </ResponsiveContainer>
              </div>
              {activeJobsOverTime.length === 0 && (
                <p className="text-sm text-slate-500 mt-2">No data for this period.</p>
              )}
            </div>
          </div>
        </section>

        {/* Jobs by category - drill-down */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Jobs by category (MCF industry)</h2>
            {selectedCategory && (
              <button
                type="button"
                onClick={() => setSelectedCategory(null)}
                className="text-sm text-slate-500 hover:text-slate-700"
              >
                Clear selection
              </button>
            )}
          </div>
          <p className="text-sm text-slate-500 mb-3">Click a category bar or pill to see details and filter other charts.</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {jobsByCategory.slice(0, 12).map((c) => (
              <button
                key={c.category}
                type="button"
                onClick={() => setSelectedCategory((prev) => (prev === c.category ? null : c.category))}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  selectedCategory === c.category
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {c.category}
              </button>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="h-[500px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={jobsByCategory} layout="vertical" margin={{ left: 140, right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" fontSize={11} />
                <YAxis
                  type="category"
                  dataKey="category"
                  width={135}
                  fontSize={11}
                  tick={{ fontSize: 10 }}
                />
                <Tooltip formatter={(value: number) => [value.toLocaleString(), 'Jobs']} />
                <Bar
                  dataKey="count"
                  name="Jobs"
                  radius={[0, 4, 4, 0]}
                  barSize={28}
                  cursor="pointer"
                  onClick={(data: unknown) => {
                    const payload = (data as { payload?: { category?: string } })?.payload
                    const cat = payload?.category
                    if (cat) {
                      setSelectedCategory((prev) => (prev === cat ? null : cat))
                    }
                  }}
                >
                  {jobsByCategory.map((entry, i) => (
                    <Cell
                      key={entry.category}
                      fill={selectedCategory === entry.category ? '#4338ca' : '#6366f1'}
                      style={{ cursor: 'pointer' }}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            </div>
          </div>

          {selectedCategory && (
            <div className="mt-6 bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">{selectedCategory}</h3>
              {categoryDetailLoading ? (
                <div className="flex items-center justify-center h-48">
                  <Spinner size="md" />
                </div>
              ) : categoryStats ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                    <div className="rounded-lg bg-slate-50 p-3">
                      <div className="text-xl font-bold text-slate-900 tabular-nums">{categoryStats.active_count.toLocaleString()}</div>
                      <div className="text-xs text-slate-500">Active listings</div>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3">
                      <div className="text-lg font-semibold text-slate-700">
                        {categoryStats.top_employment_type ?? '—'}
                      </div>
                      <div className="text-xs text-slate-500">Top employment type</div>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3">
                      <div className="text-lg font-semibold text-slate-700">
                        {categoryStats.top_position_level ?? '—'}
                      </div>
                      <div className="text-xs text-slate-500">Top position level</div>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3">
                      <div className="text-xl font-bold text-emerald-600">
                        {categoryStats.avg_salary != null
                          ? `$${(categoryStats.avg_salary / 1000).toFixed(1)}k`
                          : '—'}
                      </div>
                      <div className="text-xs text-slate-500">Avg min salary</div>
                    </div>
                  </div>
                  <div className="min-h-[280px]">
                    <h4 className="text-sm font-medium text-slate-700 mb-2">Active jobs trend</h4>
                    <div className="h-[240px] min-h-[200px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={categoryTrends} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="categoryTrendGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="date" tickFormatter={(v) => formatDate(v)} fontSize={11} />
                        <YAxis fontSize={11} />
                        <Tooltip
                          formatter={(value: number) => [value.toLocaleString(), 'Active']}
                          labelFormatter={(label) => formatDate(label)}
                        />
                        <Area
                          type="monotone"
                          dataKey="active_count"
                          stroke="#6366f1"
                          strokeWidth={2}
                          fill="url(#categoryTrendGradient)"
                        />
                      </AreaChart>
                      </ResponsiveContainer>
                    </div>
                    {categoryTrends.length === 0 && !categoryDetailLoading && (
                      <p className="text-sm text-slate-500 mt-2">No trend data for this category.</p>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          )}
        </section>

        {/* Employment type & Position level & Salary */}
        <div className="space-y-8">
          <div className="grid md:grid-cols-2 gap-8">
          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              Employment type
              <span className="block text-sm font-normal text-slate-500">
                {selectedCategory ? `(${selectedCategory})` : '(All industries)'}
              </span>
            </h2>
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={employmentData}
                    dataKey="count"
                    nameKey="employment_type"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={110}
                    paddingAngle={2}
                    label={({ employment_type, percent }) =>
                      percent ? `${employment_type} ${(percent * 100).toFixed(0)}%` : employment_type
                    }
                  >
                    {employmentData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => [value.toLocaleString(), 'Jobs']} />
                </PieChart>
              </ResponsiveContainer>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              Position level
              <span className="block text-sm font-normal text-slate-500">
                {selectedCategory ? `(${selectedCategory})` : '(All industries)'}
              </span>
            </h2>
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={positionData} layout="vertical" margin={{ left: 100, right: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" fontSize={11} />
                  <YAxis type="category" dataKey="position_level" width={95} fontSize={11} />
                  <Tooltip formatter={(value: number) => [value.toLocaleString(), 'Jobs']} />
                  <Bar dataKey="count" name="Jobs" fill={CHART_COLORS[5]} radius={[0, 4, 4, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
              </div>
            </div>
          </section>
          </div>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              Salary distribution (min)
              <span className="block text-sm font-normal text-slate-500">
                {selectedCategory ? `(${selectedCategory})` : '(All industries)'}
              </span>
            </h2>
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={salaryData} margin={{ left: 10, right: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="bucket" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip formatter={(value: number) => [value.toLocaleString(), 'Jobs']} />
                  <Bar dataKey="count" name="Jobs" fill={CHART_COLORS[2]} radius={[4, 4, 0, 0]} barSize={36} />
                </BarChart>
              </ResponsiveContainer>
              </div>
            </div>
          </section>
        </div>

      </main>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <AuthGate>
      {() => <DashboardContent />}
    </AuthGate>
  )
}
