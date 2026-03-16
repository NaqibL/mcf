'use client'

import { useEffect, useState, useRef } from 'react'
import type { Session } from '@supabase/supabase-js'
import Link from 'next/link'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { dashboardApi } from '@/lib/api'
import Nav from './Nav'
import Spinner from './Spinner'

interface Props {
  children: (session: Session | null) => React.ReactNode
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
  const [activeJobsOverTime, setActiveJobsOverTime] = useState<Array<{ date: string; active_count: number }>>([])
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
    dashboardApi.getActiveJobsOverTimePublic(30).then(setActiveJobsOverTime).catch(() => {})
  }, [session])

  // Still loading
  if (session === undefined) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50">
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

  return (
    <div className="min-h-screen bg-slate-50">
      <Nav variant="auth" />

      <main className="flex flex-col lg:flex-row items-center justify-center gap-8 lg:gap-12 px-4 py-16 max-w-5xl mx-auto">
        <div className="w-full max-w-md bg-white rounded-xl border border-slate-200 shadow-sm p-8 shrink-0">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-slate-900">Sign in</h1>
            <p className="text-slate-600 mt-1 text-sm">
              {isSignUp
                ? 'Create an account to get started.'
                : 'Sign in to access your job matches.'}
            </p>
            <Link
              href="/how-it-works"
              className="text-sm text-indigo-600 hover:text-indigo-700 mt-3 inline-block font-medium"
            >
              How does it work? →
            </Link>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
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

          <p className="text-sm text-slate-500 text-center mt-6">
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

        {activeJobsOverTime.length > 0 && (
          <div className="w-full max-w-md lg:max-w-lg bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-medium text-slate-700 mb-3">Total active jobs (last 30 days)</h3>
            <div className="h-[220px] w-full">
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
      </main>
    </div>
  )
}
