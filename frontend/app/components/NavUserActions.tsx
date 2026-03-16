'use client'

import { supabase, isSupabaseConfigured } from '@/lib/supabase'

export default function NavUserActions() {
  if (!isSupabaseConfigured) return null

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <button
      onClick={handleSignOut}
      className="text-sm text-slate-400 hover:text-white transition-colors"
      title="Sign out"
    >
      Sign out
    </button>
  )
}
