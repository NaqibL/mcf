'use client'

import { useState } from 'react'
import { lowballApi } from '@/lib/api'
import type { LowballResult, SimilarJob } from '@/lib/types'
import { Layout } from '../components/layout'
import NavUserActions from '../components/NavUserActions'
import { PageHeader, Card, CardBody } from '@/components/design'
import { Scale, ChevronDown, ChevronUp, ExternalLink, Loader2 } from 'lucide-react'

// ---------------------------------------------------------------------------
// Salary bar
// ---------------------------------------------------------------------------

function SalaryBar({ offered, p25, p50, p75 }: { offered: number; p25: number; p50: number; p75: number }) {
  const low = Math.min(offered, p25) * 0.85
  const high = Math.max(offered, p75) * 1.15
  const range = high - low

  const pct = (v: number) => `${Math.round(((v - low) / range) * 100)}%`

  return (
    <div className="mt-4 mb-2">
      <div className="relative h-6 rounded-full bg-slate-100 dark:bg-slate-800">
        {/* shaded interquartile band */}
        <div
          className="absolute top-0 h-full rounded-full bg-blue-100 dark:bg-blue-900/40"
          style={{ left: pct(p25), width: `${Math.round(((p75 - p25) / range) * 100)}%` }}
        />
        {/* p25 marker */}
        <div className="absolute top-0 h-full w-px bg-blue-400" style={{ left: pct(p25) }} />
        {/* p50 marker */}
        <div className="absolute top-0 h-full w-0.5 bg-blue-600" style={{ left: pct(p50) }} />
        {/* p75 marker */}
        <div className="absolute top-0 h-full w-px bg-blue-400" style={{ left: pct(p75) }} />
        {/* offered pin */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-white border-2 border-slate-700 dark:border-slate-200 shadow"
          style={{ left: pct(offered) }}
        />
      </div>
      <div className="relative mt-1 text-xs text-slate-500 dark:text-slate-400" style={{ height: '16px' }}>
        <span className="absolute -translate-x-1/2" style={{ left: pct(p25) }}>P25</span>
        <span className="absolute -translate-x-1/2" style={{ left: pct(p50) }}>P50</span>
        <span className="absolute -translate-x-1/2" style={{ left: pct(p75) }}>P75</span>
        <span
          className="absolute -translate-x-1/2 font-semibold text-slate-700 dark:text-slate-300"
          style={{ left: pct(offered) }}
        >
          You
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Similar jobs table
// ---------------------------------------------------------------------------

function SimilarJobsTable({ jobs }: { jobs: SimilarJob[] }) {
  const [open, setOpen] = useState(false)

  const fmt = (v: number | null) => (v != null ? `$${v.toLocaleString()}` : '—')

  return (
    <div className="mt-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
      >
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        {open ? 'Hide' : 'Show'} similar jobs ({jobs.length})
      </button>

      {open && (
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2 text-left">Title</th>
                <th className="px-3 py-2 text-left">Company</th>
                <th className="px-3 py-2 text-right">Salary range</th>
                <th className="px-3 py-2 text-right">Similarity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {jobs.map((j) => (
                <tr key={j.job_uuid} className="bg-white dark:bg-slate-900">
                  <td className="px-3 py-2 max-w-xs">
                    {j.job_url ? (
                      <a
                        href={j.job_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline truncate"
                      >
                        {j.title}
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    ) : (
                      <span className="truncate">{j.title}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-400 truncate max-w-[140px]">
                    {j.company_name ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-300 whitespace-nowrap">
                    {j.salary_min != null
                      ? j.salary_max != null
                        ? `${fmt(j.salary_min)} – ${fmt(j.salary_max)}`
                        : fmt(j.salary_min)
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-500 dark:text-slate-400">
                    {(j.similarity_score * 100).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Verdict display
// ---------------------------------------------------------------------------

const VERDICT_CONFIG = {
  lowballed: {
    label: 'You may be lowballed',
    color: 'text-red-600 dark:text-red-400',
    bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
  },
  below_median: {
    label: 'Below market median',
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
  },
  at_median: {
    label: 'Around market median',
    color: 'text-green-600 dark:text-green-400',
    bg: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
  },
  above_median: {
    label: 'Above market rate',
    color: 'text-green-600 dark:text-green-400',
    bg: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
  },
  insufficient_data: {
    label: 'Not enough data',
    color: 'text-slate-600 dark:text-slate-400',
    bg: 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700',
  },
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type PageState = 'form' | 'loading' | 'result'

export function LowballContent() {
  const [state, setState] = useState<PageState>('form')
  const [jobDesc, setJobDesc] = useState('')
  const [salaryMin, setSalaryMin] = useState('')
  const [salaryMax, setSalaryMax] = useState('')
  const [result, setResult] = useState<LowballResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setState('loading')

    try {
      const data = await lowballApi.check(
        jobDesc,
        parseInt(salaryMin, 10),
        salaryMax ? parseInt(salaryMax, 10) : undefined,
      )
      setResult(data)
      setState('result')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setState('form')
    }
  }

  const reset = () => {
    setState('form')
    setResult(null)
    setError(null)
  }

  const fmt = (v: number) => `$${v.toLocaleString()}`

  return (
    <Layout userSlot={<NavUserActions />}>
      <PageHeader
        title="Lowball Checker"
        subtitle="Paste a job description and your offered salary to see how it compares to similar roles in the market"
      />

      {state === 'form' && (
        <Card>
          <CardBody>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Job description
                </label>
                <textarea
                  value={jobDesc}
                  onChange={(e) => setJobDesc(e.target.value)}
                  rows={8}
                  required
                  minLength={50}
                  placeholder="Paste the full job description here…"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Minimum offered salary <span className="text-slate-400">(SGD/month)</span>
                  </label>
                  <input
                    type="number"
                    value={salaryMin}
                    onChange={(e) => setSalaryMin(e.target.value)}
                    required
                    min={100}
                    placeholder="e.g. 5000"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Maximum offered salary <span className="text-slate-400">(optional)</span>
                  </label>
                  <input
                    type="number"
                    value={salaryMax}
                    onChange={(e) => setSalaryMax(e.target.value)}
                    min={100}
                    placeholder="e.g. 6500"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              )}

              <button
                type="submit"
                className="flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 text-sm font-medium transition-colors"
              >
                <Scale className="w-4 h-4" />
                Check salary
              </button>
            </form>
          </CardBody>
        </Card>
      )}

      {state === 'loading' && (
        <Card>
          <CardBody>
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-500 dark:text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin" />
              <p className="text-sm">Analysing market data…</p>
            </div>
          </CardBody>
        </Card>
      )}

      {state === 'result' && result && (() => {
        const cfg = VERDICT_CONFIG[result.verdict]
        const hasMarketData = result.market_p25 != null && result.market_p50 != null && result.market_p75 != null

        return (
          <div className="space-y-4">
            {/* Verdict card */}
            <div className={`rounded-xl border p-5 ${cfg.bg}`}>
              <p className={`text-2xl font-bold ${cfg.color}`}>{cfg.label}</p>

              {result.percentile != null && (
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  Your offered salary ({fmt(result.offered_salary)}/mo) is at the{' '}
                  <strong>{result.percentile}th percentile</strong> of similar roles
                </p>
              )}

              {result.verdict === 'insufficient_data' && (
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  Only {result.salary_coverage} of {result.total_matched} matched jobs had disclosed salaries — need at least 5 to compute percentiles.
                </p>
              )}

              {hasMarketData && (
                <>
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <div className="text-center">
                      <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">P25</p>
                      <p className="font-semibold text-slate-800 dark:text-slate-200">{fmt(result.market_p25!)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">Median</p>
                      <p className="font-semibold text-slate-800 dark:text-slate-200">{fmt(result.market_p50!)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">P75</p>
                      <p className="font-semibold text-slate-800 dark:text-slate-200">{fmt(result.market_p75!)}</p>
                    </div>
                  </div>
                  <SalaryBar
                    offered={result.offered_salary}
                    p25={result.market_p25!}
                    p50={result.market_p50!}
                    p75={result.market_p75!}
                  />
                </>
              )}
            </div>

            {/* Coverage note */}
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Based on {result.salary_coverage} of {result.total_matched} matched jobs with disclosed salary
            </p>

            {/* Similar jobs */}
            {result.similar_jobs.length > 0 && (
              <Card>
                <CardBody>
                  <SimilarJobsTable jobs={result.similar_jobs} />
                </CardBody>
              </Card>
            )}

            <button
              onClick={reset}
              className="rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Check another
            </button>
          </div>
        )
      })()}
    </Layout>
  )
}
