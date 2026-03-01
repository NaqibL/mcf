'use client'

import { useState } from 'react'
import { jobsApi, matchesApi } from '@/lib/api'
import type { Match, MatchMode } from '@/lib/types'
import { MatchCard } from './JobCard'
import toast from 'react-hot-toast'

interface Filters {
  topK: number
  minSimilarity: number
  maxDaysOld: number | null
}

export default function MatchesTab() {
  const [mode, setMode] = useState<MatchMode>('resume')
  const [matches, setMatches] = useState<Match[]>([])
  const [filters, setFilters] = useState<Filters>({ topK: 25, minSimilarity: 0, maxDaysOld: null })
  const [finding, setFinding] = useState(false)
  const [loadingUuids, setLoadingUuids] = useState<Set<string>>(new Set())
  const [lastMode, setLastMode] = useState<MatchMode | null>(null)

  const findMatches = async () => {
    setFinding(true)
    try {
      const data = await matchesApi.get(
        mode,
        true,
        filters.topK,
        filters.minSimilarity / 100,
        filters.maxDaysOld ?? undefined,
      )
      setMatches(data.matches)
      setLastMode(data.mode)
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

  const handleInteraction = async (uuid: string, type: string) => {
    const prev = [...matches]
    setMatches((m) => m.filter((j) => j.job_uuid !== uuid))
    setLoadingUuids((s) => new Set(s).add(uuid))
    try {
      await jobsApi.markInteraction(uuid, type)
      const label = type === 'interested' ? 'Interested ✓' : type === 'not_interested' ? 'Not Interested' : type
      toast.success(label, { duration: 1500 })
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

  return (
    <div className="space-y-6">
      {/* Mode + controls */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        {/* Mode toggle */}
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-700">Match by:</span>
          <div className="flex rounded-lg overflow-hidden border border-gray-200 text-sm">
            <button
              onClick={() => setMode('resume')}
              className={`px-5 py-2 font-medium transition-colors
                ${mode === 'resume'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              Resume
            </button>
            <button
              onClick={() => setMode('taste')}
              className={`px-5 py-2 font-medium transition-colors border-l border-gray-200
                ${mode === 'taste'
                  ? 'bg-purple-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              Taste Profile
            </button>
          </div>
        </div>

        {/* Mode descriptions */}
        {mode === 'resume' && (
          <p className="text-xs text-gray-500">
            Jobs ranked by how well they match your resume. Rate them as Interested or Not Interested
            to improve your Taste Profile over time.
          </p>
        )}
        {mode === 'taste' && (
          <p className="text-xs text-purple-700 bg-purple-50 rounded-lg px-3 py-2">
            Jobs ranked by your <strong>Taste Profile</strong> — built from your ratings in the
            Discover tab. The more you rate, the better this gets. Go to Discover to add more ratings,
            then click <strong>Update Taste Profile</strong>.
          </p>
        )}

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-gray-100">
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
              onChange={(e) =>
                setFilters({ ...filters, maxDaysOld: e.target.value ? parseInt(e.target.value) : null })
              }
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm
                focus:outline-none focus:ring-2 focus:ring-blue-400"
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
                focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
        </div>

        {/* Find button */}
        <button
          onClick={findMatches}
          disabled={finding}
          className={`w-full py-2.5 rounded-lg text-white font-medium text-sm transition-colors
            ${mode === 'resume'
              ? 'bg-blue-600 hover:bg-blue-700'
              : 'bg-purple-600 hover:bg-purple-700'}
            disabled:opacity-50`}
        >
          {finding ? 'Finding…' : mode === 'resume' ? 'Find Resume Matches' : 'Find Taste Matches'}
        </button>
      </div>

      {/* Results */}
      {matches.length > 0 ? (
        <div className="space-y-4">
          <div className="text-sm text-gray-500">
            Showing <strong>{matches.length}</strong> matches
            {lastMode && (
              <span className="ml-1">
                via <strong>{lastMode === 'taste' ? 'Taste Profile' : 'Resume'}</strong>
              </span>
            )}
          </div>
          {matches.map((m) => (
            <MatchCard
              key={m.job_uuid}
              match={m}
              mode={lastMode ?? mode}
              onInteraction={handleInteraction}
              loading={loadingUuids.has(m.job_uuid)}
            />
          ))}
        </div>
      ) : (
        !finding && (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <div className="text-4xl mb-3">🔍</div>
            <p className="text-gray-500">
              Click <strong>Find Matches</strong> above to search for jobs.
            </p>
          </div>
        )
      )}
    </div>
  )
}
