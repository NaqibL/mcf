'use client'

import { useState, useEffect, useCallback } from 'react'
import { jobsApi, matchesApi, profileApi, discoverApi } from '@/lib/api'
import type { Match, DiscoverStats } from '@/lib/types'
import { MatchCard } from './JobCard'
import Spinner from './Spinner'
import toast from 'react-hot-toast'

interface Filters {
  topK: number
  minSimilarity: number
  maxDaysOld: number | null
}

export default function TasteTab() {
  const [matches, setMatches] = useState<Match[]>([])
  const [stats, setStats] = useState<DiscoverStats | null>(null)
  const [filters, setFilters] = useState<Filters>({ topK: 25, minSimilarity: 0, maxDaysOld: null })
  const [finding, setFinding] = useState(false)
  const [loadingUuids, setLoadingUuids] = useState<Set<string>>(new Set())
  const [computing, setComputing] = useState(false)

  const loadStats = useCallback(async () => {
    try {
      const s = await discoverApi.getStats()
      setStats(s)
    } catch {
      // non-fatal
    }
  }, [])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  const findMatches = async () => {
    setFinding(true)
    try {
      const data = await matchesApi.get(
        'taste',
        true,
        filters.topK,
        filters.minSimilarity / 100,
        filters.maxDaysOld ?? undefined,
      )
      setMatches(data.matches)
      if (data.matches.length === 0) {
        toast('No matches found. Try lowering the minimum score filter.', { icon: 'ℹ️' })
      } else {
        toast.success(`Found ${data.matches.length} matches`)
      }
    } catch (err: any) {
      const detail = err.response?.data?.detail || err.message
      toast.error(detail)
    } finally {
      setFinding(false)
    }
  }

  const handleComputeTaste = async () => {
    setComputing(true)
    try {
      const result = await profileApi.computeTaste()
      toast.success(
        `Taste profile updated from ${result.interested} interested jobs!`,
        { duration: 4000 },
      )
      loadStats()
    } catch (err: any) {
      const detail = err.response?.data?.detail || err.message
      toast.error(detail)
    } finally {
      setComputing(false)
    }
  }

  const handleInteraction = async (uuid: string, type: string) => {
    const prev = [...matches]
    setMatches((m) => m.filter((j) => j.job_uuid !== uuid))
    setLoadingUuids((s) => new Set(s).add(uuid))
    try {
      await jobsApi.markInteraction(uuid, type)
      const label = type === 'interested' ? 'Interested ✓' : type === 'not_interested' ? 'Not Interested' : type
      toast.success(label, { duration: 1500 })
      loadStats()
    } catch (err: any) {
      setMatches(prev)
      toast.error(`Failed: ${err.response?.data?.detail || err.message}`)
    } finally {
      setLoadingUuids((s) => {
        const next = new Set(s)
        next.delete(uuid)
        return next
      })
    }
  }

  const interested = stats?.interested ?? 0
  const hasEnoughRatings = interested >= 3

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <p className="text-xs text-purple-700 bg-purple-50 rounded-lg px-3 py-2">
          Jobs ranked by your <strong>Taste Profile</strong> — built from your ratings in the Resume tab.
          The more you rate, the better this gets. Go to Resume to add more ratings, then click{' '}
          <strong>Update Taste Profile</strong>.
        </p>

        <div className="flex items-center gap-3">
          <button
            onClick={handleComputeTaste}
            disabled={computing || !hasEnoughRatings}
            title={
              !hasEnoughRatings
                ? `Mark at least 3 jobs as Interested in Resume tab first (${interested}/3)`
                : 'Rebuild your taste profile from current ratings'
            }
            className="px-5 py-2 rounded-lg text-sm font-medium transition-colors
              bg-purple-600 text-white hover:bg-purple-700
              disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {computing && <Spinner size="sm" variant="light" />}
            {computing ? 'Updating…' : 'Update Taste Profile'}
          </button>
          {!hasEnoughRatings && (
            <span className="text-xs text-gray-400">
              {3 - interested} more Interested {3 - interested === 1 ? 'job' : 'jobs'} needed (rate in Resume tab)
            </span>
          )}
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-gray-100">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Min Match: <span className="text-purple-600 font-bold">{filters.minSimilarity}%</span>
            </label>
            <input
              type="range"
              min={0}
              max={80}
              step={5}
              value={filters.minSimilarity}
              onChange={(e) => setFilters({ ...filters, minSimilarity: parseInt(e.target.value) })}
              className="w-full accent-purple-600"
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
                focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Results</label>
            <input
              type="number"
              min={1}
              max={100}
              value={filters.topK}
              onChange={(e) =>
                setFilters({ ...filters, topK: parseInt(e.target.value) || 25 })
              }
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm
                focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
          </div>
        </div>

        <button
          onClick={findMatches}
          disabled={finding || !hasEnoughRatings}
          className="w-full py-2.5 rounded-lg text-white font-medium text-sm transition-colors
            bg-purple-600 hover:bg-purple-700
            disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {finding ? (
            <>
              <Spinner size="sm" variant="light" />
              Finding…
            </>
          ) : (
            'Find Taste Matches'
          )}
        </button>
      </div>

      {/* Results */}
      {matches.length > 0 ? (
        <div className="space-y-4">
          <div className="text-sm text-gray-500">
            Showing <strong>{matches.length}</strong> matches via <strong>Taste Profile</strong>
          </div>
          {matches.map((m) => (
            <MatchCard
              key={m.job_uuid}
              match={m}
              mode="taste"
              onInteraction={handleInteraction}
              loading={loadingUuids.has(m.job_uuid)}
            />
          ))}
        </div>
      ) : finding ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 bg-white rounded-xl border border-gray-200">
          <Spinner size="lg" />
          <p className="text-gray-500 font-medium">Finding taste matches…</p>
        </div>
      ) : (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <div className="text-4xl mb-3">🔍</div>
          <p className="text-gray-500">
            Click <strong>Find Taste Matches</strong> above to search for jobs that match your taste.
          </p>
          {!hasEnoughRatings && (
            <p className="text-sm text-gray-400 mt-2">
              Rate at least 3 jobs as Interested in the Resume tab first, then Update Taste Profile.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
