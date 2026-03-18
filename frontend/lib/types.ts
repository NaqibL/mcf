export interface Job {
  job_uuid: string
  title: string
  company_name: string | null
  location: string | null
  job_url: string | null
  last_seen_at?: string
  skills?: string[]
  interactions?: string[]
}

/** Full job details from GET /api/jobs/:uuid (for prefetch & detail page) */
export interface JobDetail {
  job_uuid: string
  title: string
  company_name: string | null
  location: string | null
  job_url: string | null
  is_active?: boolean
  first_seen_at?: string
  last_seen_at?: string
  skills?: string[]
}

export interface Match {
  job_uuid: string
  title: string
  company_name: string | null
  location: string | null
  job_url: string | null
  similarity_score: number
  semantic_score?: number
  skills_overlap_score?: number
  matched_skills?: string[]
  job_skills?: string[]
  last_seen_at?: string
}

export interface Profile {
  user_id: string
  profile: any
  resume_path: string
  resume_exists: boolean
}

export interface DiscoverStats {
  interested: number
  not_interested: number
  unrated: number
  total_rated: number
}

export type InteractionType =
  | 'viewed'
  | 'dismissed'
  | 'applied'
  | 'saved'
  | 'interested'
  | 'not_interested'

export type MatchMode = 'resume' | 'taste'
