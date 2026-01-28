'use client'

import { useEffect, useState } from 'react'
import { jobsApi } from '@/lib/api'

interface Job {
  job_uuid: string
  title: string
  company_name: string | null
  location: string | null
  description: string | null
}

interface CrawlRun {
  run_id: string
  started_at: string
  finished_at: string | null
  total_seen: number
  added: number
  maintained: number
  removed: number
}

interface CrawlStats {
  active_job_count: number
  recent_runs: CrawlRun[]
}

export default function Home() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [stats, setStats] = useState<CrawlStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [keywords, setKeywords] = useState('')
  const [offset, setOffset] = useState(0)
  const limit = 20

  useEffect(() => {
    loadData()
  }, [offset])

  const loadData = async () => {
    try {
      setLoading(true)
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const [jobsData, statsData] = await Promise.all([
        jobsApi.list(limit, offset, undefined, keywords || undefined),
        fetch(`${apiBase}/api/crawl/stats`).then(r => r.json()),
      ])
      setJobs(jobsData.jobs || [])
      setStats(statsData)
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = () => {
    setOffset(0)
    loadData()
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString()
  }

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 text-gray-900">MCF Job Crawler Dashboard</h1>

        {/* Stats Section */}
        {stats && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-2xl font-semibold mb-4">Crawl Statistics</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-blue-50 p-4 rounded">
                <div className="text-sm text-gray-600">Active Jobs</div>
                <div className="text-3xl font-bold text-blue-600">{stats.active_job_count.toLocaleString()}</div>
              </div>
              {stats.recent_runs[0] && (
                <>
                  <div className="bg-green-50 p-4 rounded">
                    <div className="text-sm text-gray-600">Last Added</div>
                    <div className="text-3xl font-bold text-green-600">{stats.recent_runs[0].added}</div>
                  </div>
                  <div className="bg-yellow-50 p-4 rounded">
                    <div className="text-sm text-gray-600">Last Maintained</div>
                    <div className="text-3xl font-bold text-yellow-600">{stats.recent_runs[0].maintained}</div>
                  </div>
                  <div className="bg-red-50 p-4 rounded">
                    <div className="text-sm text-gray-600">Last Removed</div>
                    <div className="text-3xl font-bold text-red-600">{stats.recent_runs[0].removed}</div>
                  </div>
                </>
              )}
            </div>

            {/* Recent Runs */}
            <div>
              <h3 className="text-lg font-semibold mb-2">Recent Crawl Runs</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Run ID</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Finished At</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Total Seen</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Added</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Maintained</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Removed</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {stats.recent_runs.slice(0, 10).map((run) => (
                      <tr key={run.run_id}>
                        <td className="px-4 py-2 text-sm text-gray-900">{run.run_id}</td>
                        <td className="px-4 py-2 text-sm text-gray-500">
                          {run.finished_at ? formatDate(run.finished_at) : '-'}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-900">{run.total_seen}</td>
                        <td className="px-4 py-2 text-sm text-green-600">{run.added}</td>
                        <td className="px-4 py-2 text-sm text-yellow-600">{run.maintained}</td>
                        <td className="px-4 py-2 text-sm text-red-600">{run.removed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Search Section */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-2xl font-semibold mb-4">Search Jobs</h2>
          <div className="flex gap-4 mb-4">
            <input
              type="text"
              placeholder="Search by keywords..."
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleSearch}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Search
            </button>
            <button
              onClick={() => {
                setKeywords('')
                setOffset(0)
                loadData()
              }}
              className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Jobs List */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-semibold mb-4">Jobs</h2>
          {loading ? (
            <div className="text-center py-8">Loading...</div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No jobs found</div>
          ) : (
            <>
              <div className="space-y-4">
                {jobs.map((job) => (
                  <div key={job.job_uuid} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">{job.title}</h3>
                    <div className="text-sm text-gray-600 mb-2">
                      {job.company_name && <span className="mr-4">Company: {job.company_name}</span>}
                      {job.location && <span>Location: {job.location}</span>}
                    </div>
                    {job.description && (
                      <p className="text-gray-700 line-clamp-3">{job.description}</p>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-6 flex justify-between">
                <button
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                  disabled={offset === 0}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => setOffset(offset + limit)}
                  disabled={jobs.length < limit}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  )
}
