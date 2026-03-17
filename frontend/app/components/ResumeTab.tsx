'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { jobsApi, matchesApi, profileApi, discoverApi } from '@/lib/api'
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue'
import type { Match, DiscoverStats } from '@/lib/types'
import { MatchCard } from './JobCard'
import {
  Card,
  CardBody,
  EmptyState,
  LoadingState,
} from '@/components/design'
import { Button } from '@/components/ui/button'
import Spinner from './Spinner'
import { toast } from 'sonner'
import { RefreshCw, Sparkles } from 'lucide-react'
import { TutorialModal, getTutorialStep, hasSeenTutorial } from './TutorialModal'

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
  const [localFilters, setLocalFilters] = useState<Filters>({ minSimilarity: 0, maxDaysOld: null })
  const debouncedFilters = useDebouncedValue(localFilters, 300)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionOffset, setSessionOffset] = useState(0)
  const [showTutorialStep3, setShowTutorialStep3] = useState(false)
  const [showTutorialStep4, setShowTutorialStep4] = useState(false)
  const sessionRef = useRef<{ sessionId: string | null; sessionOffset: number }>({ sessionId: null, sessionOffset: 0 })

  useEffect(() => {
    if (hasSeenTutorial()) return
    const step = getTutorialStep()
    if (step === 3 && jobs.length > 0) {
      setShowTutorialStep3(true)
    }
  }, [jobs.length])

  useEffect(() => {
    if (hasSeenTutorial()) return
    const step = getTutorialStep()
    if (step === 4 && (stats?.interested ?? 0) > 0) {
      setShowTutorialStep4(true)
    }
  }, [stats?.interested])

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
          debouncedFilters.minSimilarity / 100,
          debouncedFilters.maxDaysOld ?? undefined,
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
      } catch {
        toast.error('Failed to load jobs. Is the API server running?')
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [debouncedFilters.minSimilarity, debouncedFilters.maxDaysOld],
  )

  useEffect(() => {
    loadJobs()
    loadStats()
  }, [loadJobs, loadStats])

  const rate = useCallback(async (uuid: string, interactionType: string) => {
    const type = interactionType as 'interested' | 'not_interested'
    setRatingUuids((prev) => new Set(prev).add(uuid))
    setJobs((prev) => prev.filter((j) => j.job_uuid !== uuid))

    try {
      await jobsApi.markInteraction(uuid, type)
      setStats((prev) =>
        prev
          ? {
              ...prev,
              [type]: prev[type] + 1,
              total_rated: prev.total_rated + 1,
              unrated: Math.max(0, prev.unrated - 1),
            }
          : prev,
      )
    } catch {
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
  }, [loadJobs, loadStats])

  const handleComputeTaste = async () => {
    setComputing(true)
    try {
      const result = await profileApi.computeTaste()
      toast.success(
        `Taste profile updated from ${result.interested} interested jobs! Switch to Taste tab for personalised recommendations.`,
        { duration: 5000 },
      )
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(detail || 'Failed to update taste profile')
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
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(detail || 'Reset failed')
    }
  }

  const handleLoadMore = useCallback(() => loadJobs(true), [loadJobs])

  const handleRefresh = useCallback(() => {
    sessionRef.current = { sessionId: null, sessionOffset: 0 }
    setSessionId(null)
    setSessionOffset(0)
    loadJobs(false)
  }, [loadJobs])

  const interested = stats?.interested ?? 0
  const hasEnoughRatings = interested >= 3

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 dark:border-slate-700">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="flex gap-8">
              <div>
                <div className="text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {stats?.interested ?? '—'}
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-400">Interested</div>
              </div>
              <div>
                <div className="text-2xl font-semibold tabular-nums text-rose-500 dark:text-rose-400">
                  {stats?.not_interested ?? '—'}
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-400">Not Interested</div>
              </div>
              <div>
                <div className="text-2xl font-semibold tabular-nums text-slate-600 dark:text-slate-400">
                  {stats?.unrated ?? '—'}
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-400">Unrated</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleResetRatings}
                className="text-xs font-medium text-slate-400 transition-colors hover:text-amber-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 rounded-lg dark:text-slate-500 dark:hover:text-amber-500"
                title="Clear all ratings and taste profile (for testing)"
              >
                Reset for testing
              </button>
              <Button
                onClick={handleComputeTaste}
                disabled={computing || !hasEnoughRatings}
                title={
                  !hasEnoughRatings
                    ? `Mark at least 3 jobs as Interested first (${interested}/3)`
                    : 'Rebuild your taste profile from current ratings'
                }
                className="bg-violet-600 hover:bg-violet-700"
              >
                {computing && <Spinner size="sm" variant="light" />}
                {computing ? 'Updating…' : 'Update Taste Profile'}
              </Button>
            </div>
            {!hasEnoughRatings && (
              <p className="text-xs text-slate-400 w-full sm:w-auto">
                {3 - interested} more Interested {3 - interested === 1 ? 'job' : 'jobs'} needed
              </p>
            )}
          </div>
      </Card>

      <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
        Top unrated resume matches are shown below (25 at a time). Rate each one to train your taste profile.
        Once you have enough ratings, click <strong>Update Taste Profile</strong> then use the <strong>Taste</strong> tab
        for personalised recommendations.
      </p>

      <Card className="border-slate-200 dark:border-slate-700">
        <CardBody className="p-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Min Match: <span className="font-semibold text-indigo-600 dark:text-indigo-400">{localFilters.minSimilarity}%</span>
              </label>
              <input
                type="range"
                min={0}
                max={80}
                step={5}
                value={localFilters.minSimilarity}
                onChange={(e) => setLocalFilters({ ...localFilters, minSimilarity: parseInt(e.target.value) })}
                className="w-full accent-indigo-600"
              />
            </div>
            <div className="w-32">
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Max Days Old
              </label>
              <input
                type="number"
                placeholder="No limit"
                min={1}
                value={localFilters.maxDaysOld ?? ''}
                onChange={(e) => {
                  const val = e.target.value
                  const parsed = val ? parseInt(val, 10) : null
                  setLocalFilters({
                    ...localFilters,
                    maxDaysOld: parsed != null && !Number.isNaN(parsed) && parsed > 0 ? parsed : null,
                  })
                }}
                className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          </div>
        </CardBody>
      </Card>

      {loading && jobs.length === 0 ? (
        <LoadingState variant="matches" count={5} />
      ) : !loading && jobs.length === 0 ? (
        <Card className="border-slate-200 dark:border-slate-700">
          <CardBody>
            <EmptyState
              icon={Sparkles}
              message="All current matches have been rated!"
              description="Run mcf crawl-incremental to pull new jobs, or lower your filters above."
              action={
                <Button variant="outline" onClick={handleRefresh}>
                  <RefreshCw className="size-4" />
                  Refresh
                </Button>
              }
            />
          </CardBody>
        </Card>
      ) : (
        <div className="relative">
          {loading && jobs.length > 0 && (
            <div className="absolute inset-0 z-10 flex justify-center pt-8 bg-white/70 rounded-xl dark:bg-slate-900/70">
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                <Spinner size="sm" />
                <span className="text-sm text-slate-600 dark:text-slate-400">Updating matches…</span>
              </div>
            </div>
          )}
          <div className="space-y-4">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Showing <strong className="text-slate-700 dark:text-slate-300">{jobs.length}</strong> unrated {jobs.length === 1 ? 'job' : 'jobs'}
            </p>
            {jobs.map((job) => (
              <div
                key={job.job_uuid}
                className="transition-shadow hover:shadow-md"
              >
                <MatchCard
                  match={job}
                  mode="resume"
                  onInteraction={rate}
                  loading={ratingUuids.has(job.job_uuid)}
                />
              </div>
            ))}

            <div className="flex flex-wrap justify-center gap-4 pt-4">
              <Button
                onClick={handleLoadMore}
                disabled={loadingMore || !hasMore}
                title={!hasMore ? 'No more matches available' : 'Load next 25 jobs'}
              >
                {loadingMore && <Spinner size="sm" variant="light" />}
                {loadingMore ? 'Loading…' : hasMore ? 'Load more' : 'No more matches'}
              </Button>
              <Button variant="outline" onClick={handleRefresh}>
                <RefreshCw className="size-4" />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      )}

      {showTutorialStep3 && (
        <TutorialModal step={3} onClose={() => setShowTutorialStep3(false)} />
      )}
      {showTutorialStep4 && (
        <TutorialModal step={4} onClose={() => setShowTutorialStep4(false)} />
      )}
    </div>
  )
}
