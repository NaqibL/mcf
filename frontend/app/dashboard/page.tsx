'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
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
}

type JobsOverTimePoint = { date: string; count: number; cumulative: number }

type CrawlRun = {
  run_id: string
  started_at: string
  finished_at: string | null
  total_seen: number
  added: number
  maintained: number
  removed: number
}

function DashboardContent() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [jobsOverTime, setJobsOverTime] = useState<JobsOverTimePoint[]>([])
  const [crawlRuns, setCrawlRuns] = useState<CrawlRun[]>([])
  const [topCompanies, setTopCompanies] = useState<Array<{ company_name: string; count: number }>>([])
  const [jobsByLocation, setJobsByLocation] = useState<Array<{ location: string; count: number }>>([])
  const [loading, setLoading] = useState(true)
  const [limitDays, setLimitDays] = useState(90)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [s, j, c, tc, jbl] = await Promise.all([
          dashboardApi.getSummary(),
          dashboardApi.getJobsOverTime(limitDays),
          dashboardApi.getCrawlRuns(50),
          dashboardApi.getTopCompanies(20),
          dashboardApi.getJobsByLocation(20),
        ])
        setSummary(s)
        setJobsOverTime(j)
        setCrawlRuns(c)
        setTopCompanies(tc)
        setJobsByLocation(jbl)
      } catch (err: unknown) {
        toast.error('Failed to load dashboard. Is the API server running?')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [limitDays])

  const formatDate = (d: string) => {
    const date = new Date(d)
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })
  }

  const formatRunId = (runId: string) => {
    if (runId.length >= 15) {
      return runId.slice(0, 8) + '…' + runId.slice(-4)
    }
    return runId
  }

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
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-4">
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
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm col-span-2 sm:col-span-1">
              <div className="text-sm font-medium text-gray-700 mb-1">By source</div>
              <div className="flex flex-wrap gap-2">
                {summary?.by_source
                  ? Object.entries(summary.by_source).map(([src, cnt]) => (
                      <span key={src} className="text-xs px-2 py-0.5 bg-gray-100 rounded-full">
                        {src}: {cnt.toLocaleString()}
                      </span>
                    ))
                  : '—'}
              </div>
            </div>
          </div>
        </section>

        {/* Jobs over time */}
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
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={jobsOverTime}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tickFormatter={(v) => formatDate(v)} fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip
                  formatter={(value: number) => [value.toLocaleString(), '']}
                  labelFormatter={(label) => formatDate(label)}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="count"
                  name="New jobs"
                  stroke="#3b82f6"
                  fill="#93c5fd"
                  fillOpacity={0.6}
                />
                <Area
                  type="monotone"
                  dataKey="cumulative"
                  name="Cumulative"
                  stroke="#10b981"
                  fill="#6ee7b7"
                  fillOpacity={0.3}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Crawl runs */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Crawl runs (added / maintained / removed)</h2>
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={crawlRuns.slice().reverse()}
                layout="vertical"
                margin={{ left: 60, right: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" fontSize={11} />
                <YAxis
                  type="category"
                  dataKey="run_id"
                  tickFormatter={formatRunId}
                  width={55}
                  fontSize={10}
                />
                <Tooltip
                  formatter={(value: number) => [value.toLocaleString(), '']}
                  labelFormatter={(_, payload) =>
                    payload?.[0] ? formatDate((payload[0].payload as CrawlRun).started_at) : ''
                  }
                />
                <Legend />
                <Bar dataKey="added" name="Added" fill="#22c55e" stackId="a" />
                <Bar dataKey="maintained" name="Maintained" fill="#3b82f6" stackId="a" />
                <Bar dataKey="removed" name="Removed" fill="#ef4444" stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Top companies & Jobs by location */}
        <div className="grid md:grid-cols-2 gap-8">
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Top companies (active jobs)</h2>
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topCompanies} layout="vertical" margin={{ left: 80, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" fontSize={11} />
                  <YAxis
                    type="category"
                    dataKey="company_name"
                    width={75}
                    fontSize={10}
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip formatter={(value: number) => [value.toLocaleString(), 'Jobs']} />
                  <Bar dataKey="count" name="Jobs" fill="#6366f1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Jobs by location</h2>
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={jobsByLocation} layout="vertical" margin={{ left: 80, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" fontSize={11} />
                  <YAxis
                    type="category"
                    dataKey="location"
                    width={75}
                    fontSize={10}
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip formatter={(value: number) => [value.toLocaleString(), 'Jobs']} />
                  <Bar dataKey="count" name="Jobs" fill="#0ea5e9" radius={[0, 4, 4, 0]} />
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
