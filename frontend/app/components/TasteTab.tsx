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
        0,
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
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-5">
        <p className="text-sm text-violet-700 bg-violet-50 rounded-lg px-4 py-3">
          Jobs ranked by your <strong>Taste Profile</strong> — built from your ratings in the Resume tab.
          The more you rate, the better this gets. Add more ratings in Resume, then click{' '}
          <strong>Update Taste Profile</strong>.
        </p>

        <div className="flex flex-wrap items-center gap-4">
          <button
            onClick={handleComputeTaste}
            disabled={computing || !hasEnoughRatings}
            title={
              !hasEnoughRatings
                ? `Mark at least 3 jobs as Interested in Resume tab first (${interested}/3)`
                : 'Rebuild your taste profile from current ratings'
            }
            className="px-5 py-2.5 rounded-lg text-sm font-medium transition-colors
              bg-violet-600 text-white hover:bg-violet-700
              disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {computing && <Spinner size="sm" variant="light" />}
            {computing ? 'Updating…' : 'Update Taste Profile'}
          </button>
          {!hasEnoughRatings && (
            <span className="text-sm text-slate-500">
              {3 - interested} more Interested {3 - interested === 1 ? 'job' : 'jobs'} needed (rate in Resume tab)
            </span>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-6 pt-4 border-t border-slate-100">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Min Match: <span className="text-violet-600 font-semibold">{filters.minSimilarity}%</span>
            </label>
            <input
              type="range"
              min={0}
              max={80}
              step={5}
              value={filters.minSimilarity}
              onChange={(e) => setFilters({ ...filters, minSimilarity: parseInt(e.target.value) })}
              className="w-full accent-violet-600"
            />
          </div>
          <div className="w-24">
            <label className="block text-sm font-medium text-slate-700 mb-1">Results</label>
            <input
              type="number"
              min={1}
              max={100}
              value={filters.topK}
              onChange={(e) =>
                setFilters({ ...filters, topK: parseInt(e.target.value) || 25 })
              }
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm
                focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
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
                focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
            />
          </div>
        </div>

        <button
          onClick={findMatches}
          disabled={finding || !hasEnoughRatings}
          className="w-full py-3 rounded-lg text-white font-medium text-sm transition-colors
            bg-violet-600 hover:bg-violet-700
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
          <p className="text-sm text-slate-500">
            Showing <strong className="text-slate-700">{matches.length}</strong> matches via <strong>Taste Profile</strong>
          </p>
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
        <div className="flex flex-col items-center justify-center py-24 gap-5 bg-white rounded-xl border border-slate-200 shadow-sm">
          <Spinner size="lg" />
          <p className="text-slate-600 font-medium">Finding taste matches…</p>
          <p className="text-sm text-slate-400">This may take a few seconds</p>
        </div>
      ) : (
        <div className="text-center py-20 bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="text-4xl mb-4">🔍</div>
          <p className="text-slate-900 font-semibold text-lg">Find jobs that match your taste</p>
          <p className="text-slate-500 text-sm mt-2">
            Click <strong>Find Taste Matches</strong> above to search for jobs ranked by your preferences.
          </p>
          {!hasEnoughRatings && (
            <p className="text-sm text-slate-400 mt-3">
              Rate at least 3 jobs as Interested in the Resume tab first, then Update Taste Profile.
            </p>
          )}
          <button
            onClick={findMatches}
            disabled={!hasEnoughRatings}
            className="mt-6 px-8 py-3 rounded-lg text-white font-medium bg-violet-600 hover:bg-violet-700
              disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Find Taste Matches
          </button>
        </div>
      )}
    </div>
  )
}
