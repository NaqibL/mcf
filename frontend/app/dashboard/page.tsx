'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
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
import { dashboardApi } from '@/lib/api'
import AuthGate from '../components/AuthGate'
import Spinner from '../components/Spinner'
import toast from 'react-hot-toast'

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

  const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']

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

  const employmentData = selectedCategory && categoryStats
    ? categoryStats.employment_types.filter((x) => x.employment_type !== 'Unknown')
    : jobsByEmploymentType
  const positionData = selectedCategory && categoryStats
    ? categoryStats.position_levels.filter((x) => x.position_level !== 'Unknown')
    : jobsByPositionLevel
  const salaryData = selectedCategory && categoryStats ? categoryStats.salary_buckets : salaryDistribution

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">Job Analytics Dashboard</h1>
          <Link
            href="/"
            className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
          >
            ← Back to Job Matcher
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-10">
        {/* Summary cards */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Summary</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="text-2xl font-bold text-gray-900">{summary?.total_jobs?.toLocaleString() ?? '—'}</div>
              <div className="text-sm text-gray-500">Total jobs</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="text-2xl font-bold text-emerald-600">{summary?.active_jobs?.toLocaleString() ?? '—'}</div>
              <div className="text-sm text-gray-500">Active jobs</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="text-2xl font-bold text-gray-500">{summary?.inactive_jobs?.toLocaleString() ?? '—'}</div>
              <div className="text-sm text-gray-500">Inactive jobs</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="text-2xl font-bold text-blue-600">{summary?.jobs_with_embeddings?.toLocaleString() ?? '—'}</div>
              <div className="text-sm text-gray-500">With embeddings</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="text-2xl font-bold text-amber-600">{summary?.jobs_needing_backfill?.toLocaleString() ?? '—'}</div>
              <div className="text-sm text-gray-500">Need backfill</div>
              <div className="text-xs text-gray-400 mt-0.5">Category/employment missing</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="text-sm font-medium text-gray-700 mb-1">By source (MCF only)</div>
              <div className="flex flex-wrap gap-2">
                {summary?.by_source?.mcf != null ? (
                  <span className="text-xs px-2 py-0.5 bg-gray-100 rounded-full">
                    mcf: {summary.by_source.mcf.toLocaleString()}
                  </span>
                ) : (
                  '—'
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Jobs by posted date and removed + Total active jobs */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Jobs over time</h2>
            <select
              value={limitDays}
              onChange={(e) => setLimitDays(Number(e.target.value))}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5"
            >
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={180}>Last 180 days</option>
              <option value={365}>Last 365 days</option>
            </select>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm min-h-[320px]">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Posted vs removed</h3>
              <div className="h-[280px] min-h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                <BarChart data={jobsPostedAndRemoved} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" tickFormatter={(v) => formatDate(v)} fontSize={11} />
                  <YAxis
                    fontSize={11}
                    domain={[
                      0,
                      jobsPostedAndRemoved.length
                        ? Math.max(100, Math.ceil(Math.max(...jobsPostedAndRemoved.map((d) => d.posted_count)) * 1.15))
                        : 1000,
                    ]}
                  />
                  <Tooltip
                    formatter={(value: number) => [value.toLocaleString(), '']}
                    labelFormatter={(label) => formatDate(label)}
                  />
                  <Legend />
                  <Bar dataKey="posted_count" name="Posted" fill="#10b981" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="removed_count" name="Removed" fill="#ef4444" radius={[0, 0, 0, 0]} />
                </BarChart>
                </ResponsiveContainer>
              </div>
              {jobsPostedAndRemoved.length === 0 && (
                <p className="text-sm text-gray-500 mt-2">No data for this period.</p>
              )}
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm min-h-[320px]">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Total active jobs</h3>
              <div className="h-[280px] min-h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={activeJobsOverTime} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="activeJobsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
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
                <p className="text-sm text-gray-500 mt-2">No data for this period.</p>
              )}
            </div>
          </div>
        </section>

        {/* Jobs by category - drill-down */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Jobs by category (MCF industry)</h2>
            {selectedCategory && (
              <button
                type="button"
                onClick={() => setSelectedCategory(null)}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Clear selection
              </button>
            )}
          </div>
          <p className="text-sm text-gray-500 mb-3">Click a category bar or pill to see details and filter other charts.</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {jobsByCategory.slice(0, 12).map((c) => (
              <button
                key={c.category}
                type="button"
                onClick={() => setSelectedCategory((prev) => (prev === c.category ? null : c.category))}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  selectedCategory === c.category
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {c.category}
              </button>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm h-96">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={jobsByCategory} layout="vertical" margin={{ left: 120, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" fontSize={11} />
                <YAxis
                  type="category"
                  dataKey="category"
                  width={115}
                  fontSize={10}
                  tick={{ fontSize: 9 }}
                />
                <Tooltip formatter={(value: number) => [value.toLocaleString(), 'Jobs']} />
                <Bar
                  dataKey="count"
                  name="Jobs"
                  radius={[0, 4, 4, 0]}
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

          {selectedCategory && (
            <div className="mt-6 bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">{selectedCategory}</h3>
              {categoryDetailLoading ? (
                <div className="flex items-center justify-center h-48">
                  <Spinner size="md" />
                </div>
              ) : categoryStats ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                    <div className="rounded-lg bg-gray-50 p-3">
                      <div className="text-xl font-bold text-gray-900">{categoryStats.active_count.toLocaleString()}</div>
                      <div className="text-xs text-gray-500">Active listings</div>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-3">
                      <div className="text-lg font-semibold text-gray-700">
                        {categoryStats.top_employment_type ?? '—'}
                      </div>
                      <div className="text-xs text-gray-500">Top employment type</div>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-3">
                      <div className="text-lg font-semibold text-gray-700">
                        {categoryStats.top_position_level ?? '—'}
                      </div>
                      <div className="text-xs text-gray-500">Top position level</div>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-3">
                      <div className="text-xl font-bold text-emerald-600">
                        {categoryStats.avg_salary != null
                          ? `$${(categoryStats.avg_salary / 1000).toFixed(1)}k`
                          : '—'}
                      </div>
                      <div className="text-xs text-gray-500">Avg min salary</div>
                    </div>
                  </div>
                  <div className="min-h-[280px]">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Active jobs trend</h4>
                    <div className="h-[240px] min-h-[200px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={categoryTrends} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="categoryTrendGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
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
                      <p className="text-sm text-gray-500 mt-2">No trend data for this category.</p>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          )}
        </section>

        {/* Employment type & Position level & Salary */}
        <div className="grid md:grid-cols-3 gap-8">
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Employment type
              <span className="block text-sm font-normal text-gray-500">
                {selectedCategory ? `(${selectedCategory})` : '(All industries)'}
              </span>
            </h2>
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={employmentData}
                    dataKey="count"
                    nameKey="employment_type"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
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
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Position level
              <span className="block text-sm font-normal text-gray-500">
                {selectedCategory ? `(${selectedCategory})` : '(All industries)'}
              </span>
            </h2>
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={positionData} layout="vertical" margin={{ left: 70, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" fontSize={11} />
                  <YAxis type="category" dataKey="position_level" width={65} fontSize={10} />
                  <Tooltip formatter={(value: number) => [value.toLocaleString(), 'Jobs']} />
                  <Bar dataKey="count" name="Jobs" fill="#0ea5e9" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Salary distribution (min)
              <span className="block text-sm font-normal text-gray-500">
                {selectedCategory ? `(${selectedCategory})` : '(All industries)'}
              </span>
            </h2>
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={salaryData} margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="bucket" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip formatter={(value: number) => [value.toLocaleString(), 'Jobs']} />
                  <Bar dataKey="count" name="Jobs" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
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
