'use client'

import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { clearStoredProfile } from '@/lib/profile-cache'

export default function NavUserActions() {
  if (!isSupabaseConfigured) return null

  const handleSignOut = async () => {
    const { data } = await supabase.auth.getSession()
    const userId = data.session?.user?.id
    await supabase.auth.signOut()
    if (userId) clearStoredProfile(userId)
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
