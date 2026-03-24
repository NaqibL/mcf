'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { isSupabaseConfigured } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const navLinks = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/lowball', label: 'Lowball Checker' },
]

export default function PublicTopNav() {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-30 w-full border-b border-white/10 bg-slate-900/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="text-lg font-semibold text-white hover:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 rounded-lg transition-colors"
          aria-label="MCF Job Matcher home"
        >
          MCF
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2" aria-label="Primary navigation">
          {navLinks.map(({ href, label }) => {
            const isActive = pathname === href
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'hidden sm:block px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50',
                  isActive
                    ? 'bg-white/15 text-white'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                {label}
              </Link>
            )
          })}

          {isSupabaseConfigured && (
            <Link href="/matches">
              <Button
                size="sm"
                className="bg-white text-slate-900 hover:bg-slate-100 focus-visible:ring-white/50 ml-2"
              >
                Sign In
              </Button>
            </Link>
          )}
        </nav>
      </div>
    </header>
  )
}
