'use client'

import { useEffect, useState } from 'react'
import { profileApi } from '@/lib/api'
import type { Profile } from '@/lib/types'
import DiscoverTab from './components/DiscoverTab'
import MatchesTab from './components/MatchesTab'
import toast, { Toaster } from 'react-hot-toast'

type Tab = 'discover' | 'matches'

export default function Home() {
  const [tab, setTab] = useState<Tab>('discover')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [processingResume, setProcessingResume] = useState(false)

  useEffect(() => {
    profileApi
      .get()
      .then(async (data) => {
        setProfile(data)
        // Auto-process the resume if the file exists but no profile has been
        // created yet (e.g. first run, or after clearing the database).
        if (data.resume_exists && !data.profile) {
          setProcessingResume(true)
          try {
            await profileApi.processResume()
            const updated = await profileApi.get()
            setProfile(updated)
            toast.success('Resume processed automatically!')
          } catch (err: any) {
            toast.error(err.response?.data?.detail || 'Auto-processing resume failed. Click "Re-process" to retry.')
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

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster position="top-right" />

      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">Job Matcher</h1>

          {/* Resume status pill */}
          {!loadingProfile && (
            <div className="flex items-center gap-3">
              {profile?.profile ? (
                <span className="text-xs px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                  Resume ready
                </span>
              ) : (
                <button
                  onClick={handleProcessResume}
                  disabled={processingResume || !profile?.resume_exists}
                  title={
                    !profile?.resume_exists
                      ? `Resume not found at ${profile?.resume_path}`
                      : 'Process your resume to start matching'
                  }
                  className="text-xs px-3 py-1.5 rounded-full bg-blue-600 text-white font-medium
                    hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {processingResume ? 'Processing…' : 'Process Resume'}
                </button>
              )}

              {profile?.profile && (
                <button
                  onClick={handleProcessResume}
                  disabled={processingResume}
                  className="text-xs text-gray-500 hover:text-gray-800 transition-colors"
                  title="Re-process resume"
                >
                  ↺ Re-process
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

      {/* No-resume warning */}
      {!loadingProfile && profile && !profile.resume_exists && (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 mt-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 text-sm text-amber-800">
            Resume not found at <code className="font-mono">{profile.resume_path}</code>.
            Place your resume file there and click <strong>Process Resume</strong>.
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
