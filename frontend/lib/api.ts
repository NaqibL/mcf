import axios from 'axios'
import type { Profile, Match, Job, DiscoverStats, MatchMode } from './types'
import { supabase } from './supabase'

export type { Profile, Match, Job, DiscoverStats, MatchMode }

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// Debug: log API URL in dev (helps verify Vercel has NEXT_PUBLIC_API_URL set)
if (typeof window !== 'undefined' && !process.env.NEXT_PUBLIC_API_URL) {
  console.warn('[API] NEXT_PUBLIC_API_URL not set — using localhost. Set it in Vercel for production.')
}

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
  // FormData needs multipart/form-data with boundary — let the browser set it
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type']
  }
  return config
})

// Jobs API
export const jobsApi = {
  getInterested: async () => {
    const response = await api.get('/api/jobs/interested')
    return response.data as { jobs: import('./types').Match[] }
  },

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

    // Use fetch for FormData — axios was sending wrong Content-Type (application/x-www-form-urlencoded)
    // which caused ERR_NETWORK. Fetch correctly sets multipart/form-data with boundary.
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`

    const res = await fetch(`${API_BASE_URL}/api/profile/upload-resume`, {
      method: 'POST',
      body: formData,
      headers,
      // Don't set Content-Type — browser sets multipart/form-data; boundary=...
    })
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      throw Object.assign(new Error(errBody.detail || res.statusText), {
        response: { status: res.status, data: errBody },
      })
    }
    return res.json()
  },

  computeTaste: async () => {
    const response = await api.post('/api/profile/compute-taste')
    return response.data as { ok: boolean; interested: number; not_interested: number; rated_count: number }
  },

  resetRatings: async () => {
    const response = await api.post('/api/profile/reset-ratings')
    return response.data as { interactions_deleted: number; taste_deleted: number; matches_deleted: number }
  },
}

// Matches API
export const matchesApi = {
  get: async (
    mode: MatchMode = 'resume',
    excludeInteracted = true,
    topK = 25,
    offset = 0,
    minSimilarity?: number,
    maxDaysOld?: number,
    excludeRatedOnly = true,
    sessionId?: string,
  ) => {
    const params = new URLSearchParams({
      mode,
      exclude_interacted: excludeInteracted.toString(),
      top_k: topK.toString(),
      offset: offset.toString(),
    })
    if (excludeRatedOnly) params.append('exclude_rated_only', 'true')
    if (minSimilarity !== undefined) params.append('min_similarity', minSimilarity.toString())
    // Only pass max_days_old when explicitly set to a valid positive number (never filter by default)
    if (maxDaysOld != null && !Number.isNaN(maxDaysOld) && maxDaysOld > 0) {
      params.append('max_days_old', maxDaysOld.toString())
    }
    if (sessionId) params.append('session_id', sessionId)
    const response = await api.get(`/api/matches?${params}`)
    return response.data as {
      matches: Match[]
      total: number
      has_more: boolean
      mode: MatchMode
      session_id: string
    }
  },
}

// Discover API
export const discoverApi = {
  getStats: async () => {
    const response = await api.get('/api/discover/stats')
    return response.data as DiscoverStats
  },
}

// Dashboard API
export const dashboardApi = {
  getSummary: async () => {
    const response = await api.get('/api/dashboard/summary')
    return response.data as {
      total_jobs: number
      active_jobs: number
      inactive_jobs: number
      by_source: Record<string, number>
      jobs_with_embeddings: number
      jobs_needing_backfill: number
    }
  },
  getSummaryPublic: async () => {
    const response = await api.get('/api/dashboard/summary-public')
    return response.data as {
      total_jobs: number
      active_jobs: number
      inactive_jobs: number
      by_source: Record<string, number>
      jobs_with_embeddings: number
      jobs_needing_backfill: number
    }
  },
  getJobsOverTimePostedAndRemoved: async (limitDays = 90) => {
    const response = await api.get('/api/dashboard/jobs-over-time-posted-and-removed', {
      params: { limit_days: limitDays },
    })
    return response.data as Array<{
      date: string
      posted_count: number
      removed_count: number
      cumulative_posted: number
      cumulative_removed: number
    }>
  },
  getActiveJobsOverTime: async (limitDays = 90) => {
    const response = await api.get('/api/dashboard/active-jobs-over-time', {
      params: { limit_days: limitDays },
    })
    return response.data as Array<{ date: string; active_count: number }>
  },
  getActiveJobsOverTimePublic: async (limitDays = 30) => {
    const response = await api.get('/api/dashboard/active-jobs-over-time-public', {
      params: { limit_days: limitDays },
    })
    return response.data as Array<{ date: string; active_count: number }>
  },
  getJobsByCategory: async (limitDays = 90, limit = 30) => {
    const response = await api.get('/api/dashboard/jobs-by-category', {
      params: { limit_days: limitDays, limit },
    })
    return response.data as Array<{ category: string; count: number }>
  },
  getJobsByCategoryPublic: async (limitDays = 30, limit = 8) => {
    const response = await api.get('/api/dashboard/jobs-by-category-public', {
      params: { limit_days: limitDays, limit },
    })
    return response.data as Array<{ category: string; count: number }>
  },
  getCategoryTrends: async (category: string, limitDays = 90) => {
    const response = await api.get('/api/dashboard/category-trends', {
      params: { category, limit_days: limitDays },
    })
    return response.data as Array<{
      date: string
      active_count: number
      added_count: number
      removed_count: number
    }>
  },
  getCategoryStats: async (category: string) => {
    const response = await api.get('/api/dashboard/category-stats', {
      params: { category },
    })
    return response.data as {
      active_count: number
      top_employment_type: string | null
      top_position_level: string | null
      avg_salary: number | null
      employment_types: Array<{ employment_type: string; count: number }>
      position_levels: Array<{ position_level: string; count: number }>
      salary_buckets: Array<{ bucket: string; count: number }>
    }
  },
  getJobsByEmploymentType: async (limitDays = 90, limit = 20) => {
    const response = await api.get('/api/dashboard/jobs-by-employment-type', {
      params: { limit_days: limitDays, limit },
    })
    return response.data as Array<{ employment_type: string; count: number }>
  },
  getJobsByPositionLevel: async (limitDays = 90, limit = 20) => {
    const response = await api.get('/api/dashboard/jobs-by-position-level', {
      params: { limit_days: limitDays, limit },
    })
    return response.data as Array<{ position_level: string; count: number }>
  },
  getSalaryDistribution: async () => {
    const response = await api.get('/api/dashboard/salary-distribution')
    return response.data as Array<{ bucket: string; count: number }>
  },
}
