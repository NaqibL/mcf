'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { jobsApi, matchesApi, profileApi, discoverApi } from '@/lib/api'
import type { Match, DiscoverStats } from '@/lib/types'
import { MatchCard } from './JobCard'
import Spinner from './Spinner'
import toast from 'react-hot-toast'

const JOBS_PER_PAGE = 25
const TUTORIAL_STORAGE_KEY = 'mcf_has_seen_resume_tutorial'

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
  const [hasSeenTutorial, setHasSeenTutorial] = useState(false)
  const sessionRef = useRef<{ sessionId: string | null; sessionOffset: number }>({ sessionId: null, sessionOffset: 0 })

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setHasSeenTutorial(!!localStorage.getItem(TUTORIAL_STORAGE_KEY))
    }
  }, [])

  const dismissTutorial = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(TUTORIAL_STORAGE_KEY, '1')
    }
    setHasSeenTutorial(true)
  }, [])

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
    <div className="space-y-6">
      {/* Stats + Update Taste Profile bar */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-8">
          <div>
            <div className="text-2xl font-semibold text-emerald-600 tabular-nums">{stats?.interested ?? '—'}</div>
            <div className="text-sm text-slate-500">Interested</div>
          </div>
          <div>
            <div className="text-2xl font-semibold text-rose-500 tabular-nums">{stats?.not_interested ?? '—'}</div>
            <div className="text-sm text-slate-500">Not Interested</div>
          </div>
          <div>
            <div className="text-2xl font-semibold text-slate-600 tabular-nums">{stats?.unrated ?? '—'}</div>
            <div className="text-sm text-slate-500">Unrated</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleResetRatings}
            className="text-xs text-slate-400 hover:text-amber-600 transition-colors"
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
            className="px-5 py-2.5 rounded-lg text-sm font-medium transition-colors
              bg-violet-600 text-white hover:bg-violet-700
              disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {computing && <Spinner size="sm" variant="light" />}
            {computing ? 'Updating…' : 'Update Taste Profile'}
          </button>
        </div>
        {!hasEnoughRatings && (
          <p className="text-xs text-slate-400 w-full sm:w-auto">
            {3 - interested} more Interested {3 - interested === 1 ? 'job' : 'jobs'} needed
          </p>
        )}
      </div>

      {/* Hint */}
      <p className="text-sm text-slate-600">
        Top unrated resume matches are shown below (25 at a time). Rate each one to train your taste profile.
        Once you have enough ratings, click <strong>Update Taste Profile</strong> then use the <strong>Taste</strong> tab
        for personalised recommendations.
      </p>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-wrap items-end gap-6">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Min Match: <span className="text-indigo-600 font-semibold">{filters.minSimilarity}%</span>
          </label>
          <input
            type="range"
            min={0}
            max={80}
            step={5}
            value={filters.minSimilarity}
            onChange={(e) => setFilters({ ...filters, minSimilarity: parseInt(e.target.value) })}
            className="w-full accent-indigo-600"
          />
        </div>
        <div className="w-32">
          <label className="block text-sm font-medium text-slate-700 mb-1">Max Days Old</label>
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
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm
              focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Job list */}
      {loading && jobs.length === 0 ? (
        <>
          <div className="flex flex-col items-center justify-center py-24 gap-5 bg-white rounded-xl border border-slate-200 shadow-sm">
            <Spinner size="lg" />
            <p className="text-slate-600 font-medium">Finding your best matches…</p>
            <p className="text-sm text-slate-400">This may take a few seconds</p>
          </div>
          {!hasSeenTutorial && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
              <div className="bg-white rounded-xl border border-slate-200 shadow-lg max-w-md p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-2">First time here?</h3>
                <p className="text-slate-600 text-sm mb-6">
                  Matching takes a few seconds because we scan thousands of jobs to find your best matches. This is
                  normal — you&apos;ll only wait once. Subsequent loads and filter changes are much faster.
                </p>
                <button
                  onClick={dismissTutorial}
                  className="w-full px-5 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
                >
                  Got it
                </button>
              </div>
            </div>
          )}
        </>
      ) : !loading && jobs.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="text-4xl mb-4">🎉</div>
          <p className="text-slate-900 font-semibold text-lg">All current matches have been rated!</p>
          <p className="text-slate-500 text-sm mt-2">
            Run <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">mcf crawl-incremental</code> to pull new jobs,
            or lower your filters above.
          </p>
          <button
            onClick={() => {
              sessionRef.current = { sessionId: null, sessionOffset: 0 }
              setSessionId(null)
              setSessionOffset(0)
              loadJobs(false)
            }}
            className="mt-6 px-5 py-2.5 text-sm font-medium rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
          >
            Refresh
          </button>
        </div>
      ) : (
        <div className="relative">
          {loading && jobs.length > 0 && (
            <div className="absolute inset-0 z-10 flex items-start justify-center pt-8 bg-white/70 rounded-xl">
              <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg border border-slate-200 shadow-sm">
                <Spinner size="sm" />
                <span className="text-sm text-slate-600">Updating matches…</span>
              </div>
            </div>
          )}
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              Showing <strong className="text-slate-700">{jobs.length}</strong> unrated {jobs.length === 1 ? 'job' : 'jobs'}
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

            <div className="flex flex-wrap justify-center gap-3 pt-4">
              <button
                onClick={() => loadJobs(true)}
                disabled={loadingMore || !hasMore}
                className="px-6 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium
                  hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                  flex items-center gap-2"
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
                className="px-6 py-2.5 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium
                  hover:bg-slate-200 transition-colors"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
