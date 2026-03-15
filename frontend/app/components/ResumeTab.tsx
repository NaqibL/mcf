'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { jobsApi, matchesApi, profileApi, discoverApi } from '@/lib/api'
import type { Match, DiscoverStats } from '@/lib/types'
import { MatchCard } from './JobCard'
import Spinner from './Spinner'
import toast from 'react-hot-toast'

const JOBS_PER_PAGE = 25

interface Filters {
  minSimilarity: number
  maxDaysOld: number | null
}

export default function ResumeTab() {
  const [jobs, setJobs] = useState<Match[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [stats, setStats] = useState<DiscoverStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [computing, setComputing] = useState(false)
  const [ratingUuids, setRatingUuids] = useState<Set<string>>(new Set())
  const [filters, setFilters] = useState<Filters>({ minSimilarity: 0, maxDaysOld: null })
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionOffset, setSessionOffset] = useState(0)
  const sessionRef = useRef<{ sessionId: string | null; sessionOffset: number }>({ sessionId: null, sessionOffset: 0 })

  const loadStats = useCallback(async () => {
    try {
      const s = await discoverApi.getStats()
      setStats(s)
    } catch {
      // non-fatal
    }
  }, [])

  const loadJobs = useCallback(
    async (append = false) => {
      if (append) {
        setLoadingMore(true)
      } else {
        setLoading(true)
      }
      try {
        const { sessionId: sid, sessionOffset: off } = sessionRef.current
        const offset = append ? off : 0
        const data = await matchesApi.get(
          'resume',
          true,
          JOBS_PER_PAGE,
          offset,
          filters.minSimilarity / 100,
          filters.maxDaysOld ?? undefined,
          true,
          append ? (sid ?? undefined) : undefined,
        )
        if (!append) {
          sessionRef.current = { sessionId: data.session_id, sessionOffset: JOBS_PER_PAGE }
          setSessionId(data.session_id)
          setSessionOffset(JOBS_PER_PAGE)
          setJobs(data.matches)
        } else {
          sessionRef.current = { ...sessionRef.current, sessionOffset: off + JOBS_PER_PAGE }
          setSessionOffset((prev) => prev + JOBS_PER_PAGE)
          setJobs((prev) => [...prev, ...data.matches])
        }
        setHasMore(data.has_more)
        // #region agent log
        _log('loadJobs_success', {
          jobsCount: data.matches?.length ?? 0,
          newSessionId: data.session_id,
          newSessionOffset: append ? off + JOBS_PER_PAGE : JOBS_PER_PAGE,
          hypothesisId: 'H1',
        })
        // #endregion
      } catch (err: any) {
        toast.error('Failed to load jobs. Is the API server running?')
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [filters.minSimilarity, filters.maxDaysOld],
  )

  useEffect(() => {
    loadJobs()
    loadStats()
  }, [loadJobs, loadStats])

  const rate = async (uuid: string, interactionType: 'interested' | 'not_interested') => {
    setRatingUuids((prev) => new Set(prev).add(uuid))
    setJobs((prev) => prev.filter((j) => j.job_uuid !== uuid))

    try {
      await jobsApi.markInteraction(uuid, interactionType)
      setStats((prev) =>
        prev
          ? {
              ...prev,
              [interactionType]: prev[interactionType] + 1,
              total_rated: prev.total_rated + 1,
              unrated: Math.max(0, prev.unrated - 1),
            }
          : prev,
      )
    } catch (err: any) {
      toast.error('Failed to save rating')
      loadJobs()
      loadStats()
    } finally {
      setRatingUuids((prev) => {
        const next = new Set(prev)
        next.delete(uuid)
        return next
      })
    }
  }

  const handleComputeTaste = async () => {
    setComputing(true)
    try {
      const result = await profileApi.computeTaste()
      toast.success(
        `Taste profile updated from ${result.interested} interested jobs! Switch to Taste tab for personalised recommendations.`,
        { duration: 5000 },
      )
    } catch (err: any) {
      const detail = err.response?.data?.detail || err.message
      toast.error(detail)
    } finally {
      setComputing(false)
    }
  }

  const handleResetRatings = async () => {
    if (!confirm('Reset all your ratings and taste profile? This cannot be undone.')) return
    try {
      const result = await profileApi.resetRatings()
      toast.success(
        `Reset complete: ${result.interactions_deleted} ratings, taste profile cleared.`,
        { duration: 4000 },
      )
      loadJobs()
      loadStats()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Reset failed')
    }
  }

  const interested = stats?.interested ?? 0
  const hasEnoughRatings = interested >= 3

  return (
    <div className="space-y-5">
      {/* Stats + Update Taste Profile bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-center gap-4">
        <div className="flex gap-6 text-sm flex-1">
          <div>
            <span className="font-semibold text-emerald-600 text-lg">{stats?.interested ?? '—'}</span>
            <span className="text-gray-500 ml-1.5">Interested</span>
          </div>
          <div>
            <span className="font-semibold text-red-500 text-lg">{stats?.not_interested ?? '—'}</span>
            <span className="text-gray-500 ml-1.5">Not Interested</span>
          </div>
          <div>
            <span className="font-semibold text-gray-500 text-lg">{stats?.unrated ?? '—'}</span>
            <span className="text-gray-500 ml-1.5">Unrated</span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            <button
              onClick={handleResetRatings}
              className="text-xs text-gray-400 hover:text-amber-600 transition-colors"
              title="Clear all ratings and taste profile (for testing)"
            >
              Reset for testing
            </button>
            <button
              onClick={handleComputeTaste}
              disabled={computing || !hasEnoughRatings}
              title={
                !hasEnoughRatings
                  ? `Mark at least 3 jobs as Interested first (${interested}/3)`
                  : 'Rebuild your taste profile from current ratings'
              }
              className="px-5 py-2 rounded-lg text-sm font-medium transition-colors
                bg-purple-600 text-white hover:bg-purple-700
                disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {computing && <Spinner size="sm" variant="light" />}
              {computing ? 'Updating…' : 'Update Taste Profile'}
            </button>
          </div>
          {!hasEnoughRatings && (
            <p className="text-xs text-gray-400">
              {3 - interested} more Interested {3 - interested === 1 ? 'job' : 'jobs'} needed
            </p>
          )}
        </div>
      </div>

      {/* Hint */}
      <p className="text-sm text-gray-500 px-1">
        Top unrated resume matches are shown below (25 at a time) — rate each one to train your taste profile.
        Once you have enough ratings, click <strong>Update Taste Profile</strong> then use the <strong>Taste</strong> tab
        for personalised recommendations.
      </p>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Min Match: <span className="text-blue-600 font-bold">{filters.minSimilarity}%</span>
            </label>
            <input
              type="range"
              min={0}
              max={80}
              step={5}
              value={filters.minSimilarity}
              onChange={(e) => setFilters({ ...filters, minSimilarity: parseInt(e.target.value) })}
              className="w-full accent-blue-600"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Max Days Old</label>
            <input
              type="number"
              placeholder="No limit"
              min={1}
              value={filters.maxDaysOld ?? ''}
              onChange={(e) => {
                const val = e.target.value
                const parsed = val ? parseInt(val, 10) : null
                setFilters({
                  ...filters,
                  maxDaysOld: parsed != null && !Number.isNaN(parsed) && parsed > 0 ? parsed : null,
                })
              }}
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm
                focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
        </div>
      </div>

      {/* Job list */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Spinner size="lg" />
          <p className="text-gray-500 font-medium">Finding your best matches…</p>
        </div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <div className="text-4xl mb-3">🎉</div>
          <p className="text-gray-600 font-medium">All current matches have been rated!</p>
          <p className="text-gray-400 text-sm mt-1">
            Run <code className="font-mono text-xs">mcf crawl-incremental</code> to pull new jobs,
            or lower your filters above.
          </p>
          <button
              onClick={() => {
                sessionRef.current = { sessionId: null, sessionOffset: 0 }
                setSessionId(null)
                setSessionOffset(0)
                loadJobs(false)
              }}
              className="mt-4 px-5 py-2 text-sm rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
            >
              Refresh
            </button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-gray-400 px-1">
            Showing <strong className="text-gray-600">{jobs.length}</strong> unrated {jobs.length === 1 ? 'job' : 'jobs'}
          </p>
          {jobs.map((job) => (
            <MatchCard
              key={job.job_uuid}
              match={job}
              mode="resume"
              onInteraction={(uuid, type) => rate(uuid, type as 'interested' | 'not_interested')}
              loading={ratingUuids.has(job.job_uuid)}
            />
          ))}

          <div className="text-center pt-2 flex flex-wrap justify-center gap-3">
            <button
              onClick={() => loadJobs(true)}
              disabled={loadingMore || !hasMore}
              className="px-6 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium
                hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                flex items-center gap-2 disabled:hover:bg-blue-600"
              title={!hasMore ? 'No more matches available' : 'Load next 25 jobs'}
            >
              {loadingMore && <Spinner size="sm" variant="light" />}
              {loadingMore ? 'Loading…' : hasMore ? 'Load more' : 'No more matches'}
            </button>
            <button
              onClick={() => {
                sessionRef.current = { sessionId: null, sessionOffset: 0 }
                setSessionId(null)
                setSessionOffset(0)
                loadJobs(false)
              }}
              className="px-6 py-2.5 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium
                hover:bg-gray-200 transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
