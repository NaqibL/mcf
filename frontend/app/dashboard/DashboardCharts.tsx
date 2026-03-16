'use client'

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
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/design'
import { BarChart2, TrendingUp } from 'lucide-react'

const CHART_MARGIN_DEFAULT = { top: 8, right: 8, left: 0, bottom: 0 }
const CHART_MARGIN_VERTICAL_LARGE = { left: 120, right: 24 }
const CHART_MARGIN_VERTICAL = { left: 90, right: 24 }
const CHART_MARGIN_SALARY = { left: 8, right: 24 }

const CHART_COLORS = [
  'rgb(99, 102, 241)',
  'rgb(139, 92, 246)',
  'rgb(16, 185, 129)',
  'rgb(245, 158, 11)',
  'rgb(244, 63, 94)',
  'rgb(14, 165, 233)',
  'rgb(100, 116, 139)',
  'rgb(161, 98, 7)',
]

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

export interface DashboardChartsProps {
  jobsPostedAndRemoved: JobsPostedRemovedPoint[]
  activeJobsOverTime: Array<{ date: string; active_count: number }>
  jobsByCategory: Array<{ category: string; count: number }>
  employmentData: Array<{ employment_type: string; count: number }>
  positionData: Array<{ position_level: string; count: number }>
  salaryData: Array<{ bucket: string; count: number }>
  categoryTrends: Array<{ date: string; active_count: number; added_count: number; removed_count: number }>
  selectedCategory: string | null
  categoryStats: CategoryStats | null
  categoryDetailLoading?: boolean
  limitDays: number
  onCategorySelect: (category: string | null) => void
  formatDate: (d: string) => string
  getPostedRemovedDomainMax: () => number
}

export function DashboardCharts({
  jobsPostedAndRemoved,
  activeJobsOverTime,
  jobsByCategory,
  employmentData,
  positionData,
  salaryData,
  categoryTrends,
  selectedCategory,
  categoryStats,
  categoryDetailLoading = false,
  limitDays,
  onCategorySelect,
  formatDate,
  getPostedRemovedDomainMax,
}: DashboardChartsProps) {
  return (
    <>
      <section className="space-y-6">
        <h2 className="text-lg font-semibold leading-tight text-slate-900 dark:text-slate-100">
          Jobs over time
        </h2>
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-colors dark:border-slate-700 dark:bg-slate-800">
            <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-4">
              Posted vs removed
            </h3>
            <div className="h-[280px] w-full min-h-[200px] sm:h-[300px]">
              {jobsPostedAndRemoved.length === 0 ? (
                <EmptyState
                  icon={BarChart2}
                  message="No data for this period"
                  description="Posted and removed counts will appear once jobs are crawled."
                  className="h-full py-8"
                />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                  data={jobsPostedAndRemoved}
                  margin={CHART_MARGIN_DEFAULT}
                  barCategoryGap={4}
                  barGap={2}
                  barSize={12}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(226, 232, 240)" />
                  <XAxis dataKey="date" tickFormatter={formatDate} fontSize={11} />
                  <YAxis fontSize={11} domain={[0, getPostedRemovedDomainMax()]} />
                  <Tooltip
                    formatter={(value: number) => [value.toLocaleString(), '']}
                    labelFormatter={(label) => formatDate(label)}
                  />
                  <Legend />
                  <Bar dataKey="posted_count" name="Posted" fill="rgb(16, 185, 129)" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="removed_count" name="Removed" fill="rgb(239, 68, 68)" radius={[2, 2, 0, 0]} />
                </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-colors dark:border-slate-700 dark:bg-slate-800">
            <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-4">
              Total active jobs
            </h3>
            <div className="h-[280px] w-full min-h-[200px] sm:h-[340px]">
              {activeJobsOverTime.length === 0 ? (
                <EmptyState
                  icon={TrendingUp}
                  message="No data for this period"
                  description="Active job counts will appear once jobs are crawled."
                  className="h-full py-8"
                />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={activeJobsOverTime} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="activeJobsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="rgb(59, 130, 246)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="rgb(59, 130, 246)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(226, 232, 240)" />
                  <XAxis dataKey="date" tickFormatter={formatDate} fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip
                    formatter={(value: number) => [value.toLocaleString(), 'Active jobs']}
                    labelFormatter={(label) => formatDate(label)}
                  />
                  <Area
                    type="monotone"
                    dataKey="active_count"
                    stroke="rgb(59, 130, 246)"
                    strokeWidth={2}
                    fill="url(#activeJobsGradient)"
                  />
                </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold leading-tight text-slate-900 dark:text-slate-100">
            Jobs by category (MCF industry)
          </h2>
          {selectedCategory && (
            <button
              type="button"
              onClick={() => onCategorySelect(null)}
              className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 rounded-lg dark:text-slate-400 dark:hover:text-slate-300"
            >
              Clear selection
            </button>
          )}
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Click a category bar or pill to see details and filter other charts.
        </p>
        <div className="flex flex-wrap gap-2">
          {jobsByCategory.slice(0, 12).map((c) => (
            <button
              key={c.category}
              type="button"
              onClick={() => onCategorySelect(selectedCategory === c.category ? null : c.category)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 ${
                selectedCategory === c.category
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
              }`}
            >
              {c.category}
            </button>
          ))}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-colors dark:border-slate-700 dark:bg-slate-800">
          <div className="h-[400px] w-full min-h-[300px] sm:h-[500px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={jobsByCategory} layout="vertical" margin={CHART_MARGIN_VERTICAL_LARGE}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(226, 232, 240)" />
                <XAxis type="number" fontSize={11} />
                <YAxis
                  type="category"
                  dataKey="category"
                  width={115}
                  fontSize={11}
                  tick={{ fontSize: 10 }}
                />
                <Tooltip formatter={(value: number) => [value.toLocaleString(), 'Jobs']} />
                <Bar
                  dataKey="count"
                  name="Jobs"
                  radius={[0, 4, 4, 0]}
                  barSize={24}
                  cursor="pointer"
                  onClick={(data: unknown) => {
                    const payload = (data as { payload?: { category?: string } })?.payload
                    const cat = payload?.category
                    if (cat) onCategorySelect(selectedCategory === cat ? null : cat)
                  }}
                >
                  {jobsByCategory.map((entry) => (
                    <Cell
                      key={entry.category}
                      fill={selectedCategory === entry.category ? 'rgb(67, 56, 202)' : 'rgb(99, 102, 241)'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {selectedCategory && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-colors dark:border-slate-700 dark:bg-slate-800">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
              {selectedCategory}
            </h3>
            {categoryDetailLoading ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-6">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-16 rounded-lg" />
                ))}
              </div>
            ) : categoryStats ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-6">
              <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-700/50">
                <div className="text-xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                  {categoryStats.active_count.toLocaleString()}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Active listings</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-700/50">
                <div className="text-lg font-semibold text-slate-700 dark:text-slate-300">
                  {categoryStats.top_employment_type ?? '—'}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Top employment type</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-700/50">
                <div className="text-lg font-semibold text-slate-700 dark:text-slate-300">
                  {categoryStats.top_position_level ?? '—'}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Top position level</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-700/50">
                <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                  {categoryStats.avg_salary != null
                    ? `$${(categoryStats.avg_salary / 1000).toFixed(1)}k`
                    : '—'}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Avg min salary</div>
              </div>
            </div>
            ) : null}
            <div className="min-h-[240px]">
              <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-4">
                Active jobs trend
              </h4>
              {categoryDetailLoading ? (
                <Skeleton className="h-[240px] w-full rounded-lg" />
              ) : (
              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={categoryTrends} margin={CHART_MARGIN_DEFAULT}>
                    <defs>
                      <linearGradient id="categoryTrendGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="rgb(99, 102, 241)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="rgb(99, 102, 241)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(226, 232, 240)" />
                    <XAxis dataKey="date" tickFormatter={formatDate} fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip
                      formatter={(value: number) => [value.toLocaleString(), 'Active']}
                      labelFormatter={(label) => formatDate(label)}
                    />
                    <Area
                      type="monotone"
                      dataKey="active_count"
                      stroke="rgb(99, 102, 241)"
                      strokeWidth={2}
                      fill="url(#categoryTrendGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              )}
            </div>
          </div>
        )}
      </section>

      <div className="space-y-8">
        <div className="grid gap-8 md:grid-cols-2">
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Employment type
              <span className="block text-sm font-normal text-slate-500 dark:text-slate-400">
                {selectedCategory ? `(${selectedCategory})` : '(All industries)'}
              </span>
            </h2>
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-colors dark:border-slate-700 dark:bg-slate-800">
              <div className="h-[280px] w-full min-h-[240px] sm:h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={employmentData}
                      dataKey="count"
                      nameKey="employment_type"
                      cx="50%"
                      cy="50%"
                      innerRadius={56}
                      outerRadius={100}
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

          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Position level
              <span className="block text-sm font-normal text-slate-500 dark:text-slate-400">
                {selectedCategory ? `(${selectedCategory})` : '(All industries)'}
              </span>
            </h2>
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-colors dark:border-slate-700 dark:bg-slate-800">
              <div className="h-[280px] w-full min-h-[240px] sm:h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={positionData} layout="vertical" margin={CHART_MARGIN_VERTICAL}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(226, 232, 240)" />
                    <XAxis type="number" fontSize={11} />
                    <YAxis type="category" dataKey="position_level" width={85} fontSize={11} />
                    <Tooltip formatter={(value: number) => [value.toLocaleString(), 'Jobs']} />
                    <Bar dataKey="count" name="Jobs" fill={CHART_COLORS[5]} radius={[0, 4, 4, 0]} barSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>
        </div>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Salary distribution (min)
            <span className="block text-sm font-normal text-slate-500 dark:text-slate-400">
              {selectedCategory ? `(${selectedCategory})` : '(All industries)'}
            </span>
          </h2>
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-colors dark:border-slate-700 dark:bg-slate-800">
            <div className="h-[260px] w-full min-h-[200px] sm:h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={salaryData} margin={CHART_MARGIN_SALARY}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(226, 232, 240)" />
                  <XAxis dataKey="bucket" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip formatter={(value: number) => [value.toLocaleString(), 'Jobs']} />
                  <Bar dataKey="count" name="Jobs" fill={CHART_COLORS[2]} radius={[4, 4, 0, 0]} barSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
