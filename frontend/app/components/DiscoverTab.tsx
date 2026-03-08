'use client'

import { useEffect, useState, useCallback } from 'react'
import { jobsApi, matchesApi, profileApi, discoverApi } from '@/lib/api'
import type { Match, DiscoverStats } from '@/lib/types'
import { MatchCard } from './JobCard'
import toast from 'react-hot-toast'

// How many resume-matched jobs to surface for rating at a time
const BATCH_SIZE = 30

export default function DiscoverTab() {
  const [jobs, setJobs] = useState<Match[]>([])
  const [stats, setStats] = useState<DiscoverStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [computing, setComputing] = useState(false)
  const [ratingUuids, setRatingUuids] = useState<Set<string>>(new Set())

  const loadStats = useCallback(async () => {
    try {
      const s = await discoverApi.getStats()
      setStats(s)
    } catch {
      // non-fatal
    }
  }, [])

  // Load top resume-matched, unrated jobs so users see relevant roles immediately
  const loadJobs = useCallback(async () => {
    setLoading(true)
    try {
      const data = await matchesApi.get('resume', true, BATCH_SIZE, undefined, undefined, true)
      // Further filter out any jobs already rated in this session
      setJobs(data.matches)
    } catch (err: any) {
      toast.error('Failed to load jobs. Is the API server running?')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadJobs()
    loadStats()
  }, [loadJobs, loadStats])

  const rate = async (uuid: string, interactionType: 'interested' | 'not_interested') => {
    setRatingUuids((prev) => new Set(prev).add(uuid))

    // Optimistic removal — keep the list moving
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
        `Taste profile updated from ${result.interested} interested jobs! Switch to Matches → Taste to see results.`,
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
                disabled:opacity-40 disabled:cursor-not-allowed"
            >
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
        These are your top resume matches — rate each one to train your taste profile. Once you have
        enough ratings, click <strong>Update Taste Profile</strong> then use{' '}
        <strong>Matches → Taste</strong> for personalised recommendations.
      </p>

      {/* Job list */}
      {loading ? (
        <div className="text-center py-20 text-gray-400">Finding your best matches…</div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <div className="text-4xl mb-3">🎉</div>
          <p className="text-gray-600 font-medium">All current matches have been rated!</p>
          <p className="text-gray-400 text-sm mt-1">
            Run <code className="font-mono text-xs">mcf crawl-incremental</code> to pull new jobs,
            or lower your filters in the Matches tab.
          </p>
          <button
            onClick={loadJobs}
            className="mt-4 px-5 py-2 text-sm rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
          >
            Refresh
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => (
            <MatchCard
              key={job.job_uuid}
              match={job}
              mode="resume"
              onInteraction={(uuid, type) => rate(uuid, type as 'interested' | 'not_interested')}
              loading={ratingUuids.has(job.job_uuid)}
            />
          ))}

          <div className="text-center pt-2">
            <button
              onClick={loadJobs}
              className="px-6 py-2.5 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium
                hover:bg-gray-200 transition-colors"
            >
              Refresh matches
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
