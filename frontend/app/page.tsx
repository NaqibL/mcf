'use client'

import { useEffect, useRef, useState } from 'react'
import { profileApi } from '@/lib/api'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import type { Profile } from '@/lib/types'
import AuthGate from './components/AuthGate'
import Nav from './components/Nav'
import ResumeTab from './components/ResumeTab'
import TasteTab from './components/TasteTab'
import Spinner from './components/Spinner'
import toast, { Toaster } from 'react-hot-toast'
import { Upload, RefreshCw } from 'lucide-react'

type Tab = 'resume' | 'taste'

function App() {
  const [tab, setTab] = useState<Tab>('resume')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [processingResume, setProcessingResume] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    profileApi
      .get()
      .then(async (data) => {
        setProfile(data)
        if (data.resume_exists && !data.profile) {
          setProcessingResume(true)
          try {
            await profileApi.processResume()
            const updated = await profileApi.get()
            setProfile(updated)
            toast.success('Resume processed automatically!')
          } catch (err: any) {
            toast.error(
              err.response?.data?.detail || 'Auto-processing resume failed. Upload your resume to continue.',
            )
          } finally {
            setProcessingResume(false)
          }
        }
      })
      .catch(() => toast.error('Could not connect to API'))
      .finally(() => setLoadingProfile(false))
  }, [])

  const handleProcessResume = async () => {
    setProcessingResume(true)
    try {
      await profileApi.processResume()
      const updated = await profileApi.get()
      setProfile(updated)
      toast.success('Resume processed!')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to process resume')
    } finally {
      setProcessingResume(false)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    setProcessingResume(true)
    try {
      await profileApi.uploadResume(file)
      const updated = await profileApi.get()
      setProfile(updated)
      toast.success('Resume uploaded and processed!')
    } catch (err: any) {
      const status = err.response?.status
      const detail = err.response?.data?.detail
      const msg =
        status === 401
          ? 'Session expired. Please sign in again.'
          : status === 403
            ? 'Access denied. Check your login.'
            : status === 500
              ? (detail || 'Server error. Check Railway logs for details.')
              : detail ||
                (err.message?.includes('Network') || !err.response
                  ? 'Network error. In Vercel, set NEXT_PUBLIC_API_URL to your Railway URL and redeploy.'
                  : 'Upload failed. Try again.')
      toast.error(msg)
      console.error('[Upload error]', {
        status,
        detail,
        message: err.message,
        apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000 (fallback — set NEXT_PUBLIC_API_URL in Vercel)',
        err,
      })
    } finally {
      setProcessingResume(false)
    }
  }

  const handleSignOut = async () => {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut()
    }
  }

  const navRightSlot = (
    <div className="flex items-center gap-3">
      {!loadingProfile && (
        <>
          {profile?.profile ? (
            <div className="flex items-center gap-2">
              <span className="text-xs px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                Resume ready
              </span>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={processingResume}
                title="Upload a new resume (PDF or DOCX)"
                className="text-xs text-slate-400 hover:text-white transition-colors flex items-center gap-1"
              >
                <Upload size={14} />
                Replace
              </button>
              <button
                onClick={handleProcessResume}
                disabled={processingResume}
                title="Re-process the server-side resume file"
                className="text-xs text-slate-400 hover:text-white transition-colors flex items-center gap-1"
              >
                <RefreshCw size={14} />
                Re-process
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={processingResume}
              className="text-xs px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium
                hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors
                flex items-center gap-2"
            >
              <Upload size={14} />
              {processingResume ? 'Processing…' : 'Upload Resume'}
            </button>
          )}

          {isSupabaseConfigured && (
            <button
              onClick={handleSignOut}
              className="text-xs text-slate-400 hover:text-white transition-colors"
              title="Sign out"
            >
              Sign out
            </button>
          )}
        </>
      )}
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50 relative">
      <Toaster position="top-right" />

      {processingResume && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Spinner size="lg" />
            <p className="text-slate-600 font-medium">Processing resume…</p>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx"
        className="hidden"
        onChange={handleFileUpload}
      />

      <Nav rightSlot={navRightSlot} />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Resume status card */}
        {!loadingProfile && profile && !profile.resume_exists && !profile.profile && (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 text-sm text-amber-800">
            No resume found. Click <strong>Upload Resume</strong> in the nav to get started.
          </div>
        )}

        {/* Tab bar */}
        <div className="flex gap-1 p-1 bg-slate-200/60 rounded-lg w-fit mb-8">
          {[
            { id: 'resume' as const, label: 'Resume Matches', accent: 'indigo' },
            { id: 'taste' as const, label: 'Taste Matches', accent: 'violet' },
          ].map(({ id, label, accent }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-5 py-2.5 text-sm font-medium rounded-md transition-colors
                ${tab === id
                  ? accent === 'indigo'
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'bg-white text-violet-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'resume' && <ResumeTab />}
        {tab === 'taste' && <TasteTab />}
      </main>
    </div>
  )
}

export default function Home() {
  return (
    <AuthGate>
      {() => <App />}
    </AuthGate>
  )
}
