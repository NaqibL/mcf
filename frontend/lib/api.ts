import axios from 'axios'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

export interface Job {
  job_uuid: string
  title: string
  company_name: string | null
  location: string | null
  description: string | null
}

// Jobs API
export const jobsApi = {
  list: async (limit: number = 100, offset: number = 0, category?: string, keywords?: string) => {
    const params = new URLSearchParams({ limit: limit.toString(), offset: offset.toString() })
    if (category) params.append('category', category)
    if (keywords) params.append('keywords', keywords)
    const response = await api.get(`/api/jobs?${params}`)
    return response.data
  },
  get: async (jobUuid: string) => {
    const response = await api.get(`/api/jobs/${jobUuid}`)
    return response.data
  },
}
