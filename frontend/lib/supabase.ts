import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// When running locally without Supabase configured, the client is a no-op
// (all auth calls will fail gracefully and the app falls back to local mode).
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)
