'use client'

import { useEffect, useState, useRef } from 'react'
import type { Session } from '@supabase/supabase-js'
import Link from 'next/link'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { dashboardApi } from '@/lib/api'
import Nav from './Nav'
import Spinner from './Spinner'
import { Briefcase, CheckCircle, Database } from 'lucide-react'

interface Props {
  children: (session: Session | null) => React.ReactNode
}

type Summary = {
  total_jobs: number
  active_jobs: number
  jobs_with_embeddings: number
}

/**
 * Wraps the entire app. When Supabase is configured it shows a simple
 * email+password sign-in/sign-up form for unauthenticated visitors.
 * No magic links, no email services. When Supabase is NOT configured
 * (local dev) it passes `session = null` directly through so the app
 * works without any auth setup.
 */
export default function AuthGate({ children }: Props) {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [activeJobsOverTime, setActiveJobsOverTime] = useState<Array<{ date: string; active_count: number }>>([])
  const [jobsByCategory, setJobsByCategory] = useState<Array<{ category: string; count: number }>>([])
  const [dashboardLoaded, setDashboardLoaded] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setSession(null)
      return
    }

    supabase.auth.getSession().then(({ data }) => setSession(data.session))

    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured || session) return
    Promise.all([
      dashboardApi.getSummaryPublic().then((s) => {
        setSummary(s)
        return s
      }),
      dashboardApi.getActiveJobsOverTimePublic(30).then(setActiveJobsOverTime),
      dashboardApi.getJobsByCategoryPublic(30, 8).then((data) =>
        setJobsByCategory((data || []).filter((x) => x.category !== 'Unknown')),
      ),
    ])
      .then(() => setDashboardLoaded(true))
      .catch(() => setDashboardLoaded(true))
  }, [session])

  // Still loading
  if (session === undefined) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-slate-50 via-indigo-50/20 to-teal-50/30">
        <Spinner size="lg" />
        <p className="text-slate-500 text-sm">Loading…</p>
      </div>
    )
  }

  // Auth disabled (local dev) or already signed in
  if (!isSupabaseConfigured || session) {
    return <>{children(session)}</>
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) return
    setLoading(true)
    setError('')
    const { error: err } = isSignUp
      ? await supabase.auth.signUp({ email: email.trim(), password })
      : await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setLoading(false)
    if (err) {
      setError(err.message)
    }
  }

  const formatDate = (d: string) => {
    const date = new Date(d)
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  const hasDashboardData = summary || activeJobsOverTime.length > 0 || jobsByCategory.length > 0

  return (
    <div className="min-h-screen flex flex-col">
      <Nav variant="auth" />

      <div className="flex-1 flex flex-col lg:flex-row">
        {/* Left: Hero + Form */}
        <div className="lg:w-[40%] min-h-[60vh] flex flex-col justify-center px-8 py-12 bg-gradient-to-br from-slate-50 via-indigo-50/20 to-teal-50/30">
          <h2 className="text-2xl lg:text-3xl font-semibold text-slate-800">Find your next role here</h2>
          <p className="text-slate-600 mt-2">Sign in to see matches tailored to your resume.</p>
          <Link
            href="/how-it-works"
            className="text-sm text-indigo-600 hover:text-indigo-700 mt-3 inline-block font-medium"
          >
            How does it work? →
          </Link>

          <div className="mt-8 w-full max-w-sm">
            <div className="bg-white/90 backdrop-blur-sm rounded-xl border border-slate-200/80 shadow-sm p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">
                {isSignUp ? 'Create account' : 'Sign in'}
              </h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Email
                  </label>
                  <input
                    ref={inputRef}
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm
                      focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    autoComplete={isSignUp ? 'new-password' : 'current-password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm
                      focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>

                {error && (
                  <p className="text-sm text-rose-600 bg-rose-50 px-4 py-2 rounded-lg">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-lg bg-indigo-600 text-white text-sm font-medium
                    hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors
                    flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Spinner size="sm" variant="light" />
                      Please wait…
                    </>
                  ) : (
                    isSignUp ? 'Sign up' : 'Sign in'
                  )}
                </button>
              </form>

              <p className="text-sm text-slate-500 text-center mt-5">
                {isSignUp ? (
                  <>
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setIsSignUp(false)
                        setError('')
                      }}
                      className="text-indigo-600 hover:text-indigo-700 font-medium"
                    >
                      Sign in
                    </button>
                  </>
                ) : (
                  <>
                    Don&apos;t have an account?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setIsSignUp(true)
                        setError('')
                      }}
                      className="text-indigo-600 hover:text-indigo-700 font-medium"
                    >
                      Sign up
                    </button>
                  </>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Right: Dashboard */}
        <div className="lg:w-[60%] p-8 lg:p-12 bg-white/80 overflow-auto">
          {!dashboardLoaded && !hasDashboardData ? (
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
              <Spinner size="md" />
              <p className="text-sm text-slate-500">Loading job data…</p>
            </div>
          ) : !hasDashboardData ? (
            <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-500">
              <p className="text-sm">Live job data will appear when the server is connected.</p>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Stats row */}
              {summary && (
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-slate-100">
                      <Briefcase size={20} className="text-slate-600" />
                    </div>
                    <div>
                      <div className="text-xl font-bold text-slate-900 tabular-nums">
                        {summary.total_jobs?.toLocaleString() ?? '—'}
                      </div>
                      <div className="text-xs text-slate-500">Total jobs</div>
                    </div>
                  </div>
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-100">
                      <CheckCircle size={20} className="text-emerald-600" />
                    </div>
                    <div>
                      <div className="text-xl font-bold text-emerald-600 tabular-nums">
                        {summary.active_jobs?.toLocaleString() ?? '—'}
                      </div>
                      <div className="text-xs text-slate-500">Active jobs</div>
                    </div>
                  </div>
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-indigo-100">
                      <Database size={20} className="text-indigo-600" />
                    </div>
                    <div>
                      <div className="text-xl font-bold text-indigo-600 tabular-nums">
                        {summary.jobs_with_embeddings?.toLocaleString() ?? '—'}
                      </div>
                      <div className="text-xs text-slate-500">With embeddings</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Active jobs chart */}
              {activeJobsOverTime.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                  <h3 className="text-sm font-medium text-slate-700 mb-3">Active jobs over time (last 30 days)</h3>
                  <div className="h-[280px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={activeJobsOverTime} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="authActiveJobsGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="date" tickFormatter={formatDate} fontSize={11} />
                        <YAxis fontSize={11} />
                        <Tooltip
                          formatter={(value: number) => [value.toLocaleString(), 'Active jobs']}
                          labelFormatter={(label) => formatDate(label)}
                        />
                        <Area
                          type="monotone"
                          dataKey="active_count"
                          stroke="#3b82f6"
                          strokeWidth={2}
                          fill="url(#authActiveJobsGradient)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Jobs by category chart */}
              {jobsByCategory.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                  <h3 className="text-sm font-medium text-slate-700 mb-3">Top categories (last 30 days)</h3>
                  <div className="h-[280px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={jobsByCategory} layout="vertical" margin={{ left: 120, right: 24 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis type="number" fontSize={11} />
                        <YAxis type="category" dataKey="category" width={115} fontSize={11} />
                        <Tooltip formatter={(value: number) => [value.toLocaleString(), 'Jobs']} />
                        <Bar dataKey="count" name="Jobs" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={24} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
