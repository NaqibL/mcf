'use client'

import type { Match } from '@/lib/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getDaysAgo(dateStr?: string): number | null {
  if (!dateStr) return null
  const ms = Date.now() - new Date(dateStr).getTime()
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)))
}

function RecencyBadge({ daysAgo }: { daysAgo: number | null }) {
  if (daysAgo === null) return null
  const label = daysAgo === 0 ? 'Today' : daysAgo === 1 ? '1 day ago' : `${daysAgo} days ago`
  const cls =
    daysAgo <= 7
      ? 'bg-emerald-100 text-emerald-700'
      : daysAgo <= 30
      ? 'bg-amber-100 text-amber-700'
      : 'bg-gray-100 text-gray-600'
  return (
    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${cls}`}>{label}</span>
  )
}

// ─── Match card ───────────────────────────────────────────────────────────────

interface MatchCardProps {
  match: Match
  onInteraction: (uuid: string, type: string) => void
  loading?: boolean
  mode: 'resume' | 'taste'
}

function ScoreBadge({ score }: { score: number }) {
  const pct = (score * 100).toFixed(1)
  const cls =
    score >= 0.75
      ? 'text-emerald-600'
      : score >= 0.55
      ? 'text-amber-600'
      : 'text-gray-500'
  return (
    <div className="text-right shrink-0">
      <div className={`text-2xl font-bold tabular-nums ${cls}`}>{pct}%</div>
      <div className="text-xs text-gray-400 font-medium">match</div>
    </div>
  )
}

export function MatchCard({ match, onInteraction, loading, mode }: MatchCardProps) {
  const daysAgo = getDaysAgo(match.last_seen_at)

  return (
    <div
      className={`bg-white rounded-xl border-2 p-5 transition-all
        ${loading ? 'opacity-40 pointer-events-none' : 'hover:shadow-lg'}
        ${
          match.similarity_score >= 0.75
            ? 'border-emerald-200'
            : match.similarity_score >= 0.55
            ? 'border-amber-200'
            : 'border-gray-200'
        }`}
    >
      <div className="flex items-start gap-4 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            {match.job_url ? (
              <a
                href={match.job_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xl font-bold text-gray-900 hover:text-blue-700 hover:underline underline-offset-2"
              >
                {match.title}
              </a>
            ) : (
              <h3 className="text-xl font-bold text-gray-900">{match.title}</h3>
            )}
            <RecencyBadge daysAgo={daysAgo} />
          </div>
          <div className="text-sm text-gray-600 space-y-0.5 mb-2">
            {match.company_name && (
              <div className="font-medium text-gray-800">{match.company_name}</div>
            )}
            {match.location && <div>{match.location}</div>}
          </div>

          {/* Score breakdown (resume mode) */}
          {mode === 'resume' &&
            match.semantic_score !== undefined &&
            match.skills_overlap_score !== undefined && (
              <div className="flex gap-3 text-xs text-gray-500 mb-2">
                <span>Semantic: {(match.semantic_score * 100).toFixed(1)}%</span>
                <span>Skills: {(match.skills_overlap_score * 100).toFixed(1)}%</span>
              </div>
            )}

          {/* Matched skills */}
          {match.matched_skills && match.matched_skills.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {match.matched_skills.slice(0, 8).map((s) => (
                <span
                  key={s}
                  className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs rounded-full border border-emerald-100"
                >
                  {s}
                </span>
              ))}
              {match.matched_skills.length > 8 && (
                <span className="text-xs text-gray-400">+{match.matched_skills.length - 8} more</span>
              )}
            </div>
          )}

          {/* Taste mode skills */}
          {mode === 'taste' && match.job_skills && match.job_skills.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {match.job_skills.slice(0, 6).map((s) => (
                <span
                  key={s}
                  className="px-2 py-0.5 bg-purple-50 text-purple-700 text-xs rounded-full border border-purple-100"
                >
                  {s}
                </span>
              ))}
            </div>
          )}

          {match.job_url && (
            <a
              href={match.job_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-1 px-3 py-1.5 rounded-lg
                bg-blue-50 text-blue-700 text-sm font-medium border border-blue-100
                hover:bg-blue-100 transition-colors"
            >
              View job posting ↗
            </a>
          )}
        </div>
        <ScoreBadge score={match.similarity_score} />
      </div>

      <div className="flex gap-3 pt-3 border-t border-gray-100">
        <button
          onClick={() => onInteraction(match.job_uuid, 'not_interested')}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
            bg-red-50 text-red-600 font-medium text-sm
            hover:bg-red-100 active:bg-red-200 transition-colors"
        >
          <span className="text-lg leading-none">✕</span>
          Not Interested
        </button>
        <button
          onClick={() => onInteraction(match.job_uuid, 'interested')}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
            bg-emerald-50 text-emerald-700 font-medium text-sm
            hover:bg-emerald-100 active:bg-emerald-200 transition-colors"
        >
          <span className="text-lg leading-none">✓</span>
          Interested
        </button>
      </div>
    </div>
  )
}
