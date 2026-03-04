'use client'

import { useEffect, useState, useRef } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'

interface Props {
  children: (session: Session | null) => React.ReactNode
}

/**
 * Wraps the entire app. When Supabase is configured it shows a magic-link
 * sign-in form for unauthenticated visitors.  When Supabase is NOT configured
 * (local dev) it passes `session = null` directly through so the app works
 * without any auth setup.
 */
export default function AuthGate({ children }: Props) {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
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

  // Still loading
  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-400 text-sm animate-pulse">Loading…</div>
      </div>
    )
  }

  // Auth disabled (local dev) or already signed in
  if (!isSupabaseConfigured || session) {
    return <>{children(session)}</>
  }

  // Show sign-in form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setSending(true)
    setError('')
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false },
    })
    setSending(false)
    if (err) {
      setError(err.message)
    } else {
      setSent(true)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-200 p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Job Matcher</h1>
          <p className="text-sm text-gray-500 mt-1">Sign in to access your job matches.</p>
        </div>

        {sent ? (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-700">
            Check your inbox — we sent a magic link to <strong>{email}</strong>.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {error && (
              <p className="text-xs text-red-600">{error}</p>
            )}

            <button
              type="submit"
              disabled={sending}
              className="w-full py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium
                hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {sending ? 'Sending…' : 'Send magic link'}
            </button>
          </form>
        )}

        <p className="text-xs text-gray-400 text-center">
          Don&apos;t have an account? Ask the admin to invite you.
        </p>
      </div>
    </div>
  )
}
