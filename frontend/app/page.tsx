'use client'

import { useEffect, useRef, useState } from 'react'
import { profileApi } from '@/lib/api'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import type { Profile } from '@/lib/types'
import AuthGate from './components/AuthGate'
import DiscoverTab from './components/DiscoverTab'
import MatchesTab from './components/MatchesTab'
import toast, { Toaster } from 'react-hot-toast'

type Tab = 'discover' | 'matches'

function App() {
  const [tab, setTab] = useState<Tab>('discover')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [processingResume, setProcessingResume] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    profileApi
      .get()
      .then(async (data) => {
        setProfile(data)
        // Auto-process the resume if the file exists server-side but no profile
        // has been created yet (e.g. first run, or after clearing the database).
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
    // Reset so the same file can be re-uploaded
    e.target.value = ''

    setProcessingResume(true)
    try {
      await profileApi.uploadResume(file)
      const updated = await profileApi.get()
      setProfile(updated)
      toast.success('Resume uploaded and processed!')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Upload failed. Try again.')
    } finally {
      setProcessingResume(false)
    }
  }

  const handleSignOut = async () => {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut()
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster position="top-right" />

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">Job Matcher</h1>

          {/* Resume status + upload */}
          {!loadingProfile && (
            <div className="flex items-center gap-2">
              {profile?.profile ? (
                <>
                  <span className="text-xs px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                    Resume ready
                  </span>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={processingResume}
                    title="Upload a new resume (PDF or DOCX)"
                    className="text-xs text-gray-400 hover:text-gray-700 transition-colors px-2"
                  >
                    {processingResume ? 'Processing…' : '↑ Replace'}
                  </button>
                  <button
                    onClick={handleProcessResume}
                    disabled={processingResume}
                    className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
                    title="Re-process the server-side resume file"
                  >
                    ↺ Re-process
                  </button>
                </>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={processingResume}
                  className="text-xs px-3 py-1.5 rounded-full bg-blue-600 text-white font-medium
                    hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {processingResume ? 'Processing…' : '↑ Upload Resume'}
                </button>
              )}

              {isSupabaseConfigured && (
                <button
                  onClick={handleSignOut}
                  className="text-xs text-gray-400 hover:text-gray-700 transition-colors ml-1"
                  title="Sign out"
                >
                  Sign out
                </button>
              )}
            </div>
          )}
        </div>

        {/* Tab bar */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex gap-1 pb-0">
          {([
            { id: 'discover', label: 'Discover', description: 'Rate jobs to build your taste profile' },
            { id: 'matches', label: 'Matches', description: 'Find jobs matching your resume or taste' },
          ] as const).map(({ id, label, description }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              title={description}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors
                ${tab === id
                  ? id === 'discover'
                    ? 'border-purple-600 text-purple-700'
                    : 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-800'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {/* No-resume warning — only shown when no resume at all */}
      {!loadingProfile && profile && !profile.resume_exists && !profile.profile && (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 mt-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 text-sm text-amber-800">
            No resume found. Click <strong>↑ Upload Resume</strong> to get started.
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {tab === 'discover' && <DiscoverTab />}
        {tab === 'matches' && <MatchesTab />}
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
