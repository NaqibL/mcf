import axios from 'axios'
import type { Profile, Match, Job, DiscoverStats, MatchMode } from './types'
import { supabase } from './supabase'

export type { Profile, Match, Job, DiscoverStats, MatchMode }

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Attach the Supabase JWT (if present) to every outgoing request.
// When auth is disabled on the backend the header is simply ignored.
api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`
  }
  return config
})

// Jobs API
export const jobsApi = {
  markInteraction: async (jobUuid: string, interactionType: string) => {
    const response = await api.post(`/api/jobs/${jobUuid}/interact`, null, {
      params: { interaction_type: interactionType },
    })
    return response.data
  },
}

// Profile API
export const profileApi = {
  get: async () => {
    const response = await api.get('/api/profile')
    return response.data as Profile
  },

  processResume: async () => {
    const response = await api.post('/api/profile/process-resume')
    return response.data
  },

  uploadResume: async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)

    // Get token for manual FormData request
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token

    const response = await axios.post(`${API_BASE_URL}/api/profile/upload-resume`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
    return response.data
  },

  computeTaste: async () => {
    const response = await api.post('/api/profile/compute-taste')
    return response.data as { ok: boolean; interested: number; not_interested: number; rated_count: number }
  },
}

// Matches API
export const matchesApi = {
  get: async (
    mode: MatchMode = 'resume',
    excludeInteracted = true,
    topK = 25,
    minSimilarity?: number,
    maxDaysOld?: number,
  ) => {
    const params = new URLSearchParams({
      mode,
      exclude_interacted: excludeInteracted.toString(),
      top_k: topK.toString(),
    })
    if (minSimilarity !== undefined) params.append('min_similarity', minSimilarity.toString())
    if (maxDaysOld !== undefined) params.append('max_days_old', maxDaysOld.toString())
    const response = await api.get(`/api/matches?${params}`)
    return response.data as { matches: Match[]; total: number; mode: MatchMode }
  },
}

// Discover API
export const discoverApi = {
  getStats: async () => {
    const response = await api.get('/api/discover/stats')
    return response.data as DiscoverStats
  },
}
