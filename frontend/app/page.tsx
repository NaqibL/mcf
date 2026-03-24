'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { dashboardApi } from '@/lib/api'
import PublicTopNav from './components/layout/PublicTopNav'
import { Card, CardBody } from '@/components/design'
import { Button } from '@/components/ui/button'
import { BarChart2, Scale, Briefcase, ArrowRight, Zap } from 'lucide-react'

const LazyDashboardPreview = dynamic(
  () => import('./components/AuthDashboardPreview').then((m) => ({ default: m.AuthDashboardPreview })),
  { ssr: false, loading: () => null },
)

type Summary = { total_jobs: number; active_jobs: number; jobs_with_embeddings: number }

const features = [
  {
    icon: BarChart2,
    title: 'Job Market Dashboard',
    badge: 'Free · No sign-in',
    badgeColor: 'bg-emerald-500/20 text-emerald-300',
    description: 'Track active job counts, salary distributions, hiring trends by category, employment type, and position level.',
    cta: 'Explore Dashboard',
    href: '/dashboard',
    variant: 'outline' as const,
    accent: 'from-blue-500/10 to-indigo-500/5',
  },
  {
    icon: Scale,
    title: 'Lowball Checker',
    badge: 'Free · No sign-in',
    badgeColor: 'bg-emerald-500/20 text-emerald-300',
    description: 'Paste any job description and your offered salary. See exactly where it falls in the market — p25, median, p75.',
    cta: 'Check an Offer',
    href: '/lowball',
    variant: 'outline' as const,
    accent: 'from-teal-500/10 to-emerald-500/5',
  },
  {
    icon: Briefcase,
    title: 'Resume Matching',
    badge: 'Requires sign-in',
    badgeColor: 'bg-violet-500/20 text-violet-300',
    description: 'Upload your resume and get every open role ranked by relevance. Rate jobs to train a taste profile for personalised recommendations.',
    cta: 'Sign In to Match',
    href: '/matches',
    variant: 'default' as const,
    accent: 'from-violet-500/10 to-indigo-500/5',
  },
]

export default function HomePage() {
  const router = useRouter()
  const [summary, setSummary] = useState<Summary | null>(null)
  const [activeJobsOverTime, setActiveJobsOverTime] = useState<Array<{ date: string; active_count: number }>>([])
  const [jobsByCategory, setJobsByCategory] = useState<Array<{ category: string; count: number }>>([])
  const [previewLoaded, setPreviewLoaded] = useState(false)

  // Redirect to /matches if already signed in
  useEffect(() => {
    if (!isSupabaseConfigured) return
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/matches')
    })
  }, [router])

  // Load live dashboard preview data
  useEffect(() => {
    Promise.all([
      dashboardApi.getSummaryPublic().then(setSummary).catch(() => null),
      dashboardApi.getActiveJobsOverTimePublic(30).then(setActiveJobsOverTime).catch(() => null),
      dashboardApi.getJobsByCategoryPublic(30, 8).then((data) =>
        setJobsByCategory((data || []).filter((x) => x.category !== 'Unknown'))
      ).catch(() => null),
    ]).finally(() => setPreviewLoaded(true))
  }, [])

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <PublicTopNav />

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-teal-900">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-800/20 via-transparent to-transparent pointer-events-none" />
        <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:py-36">
          {/* Live stats badge */}
          {summary?.active_jobs ? (
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm text-slate-300 backdrop-blur-sm">
              <Zap className="size-3.5 text-emerald-400" />
              <span>
                <span className="font-semibold text-emerald-400">{summary.active_jobs.toLocaleString()}</span> active jobs tracked
              </span>
            </div>
          ) : (
            <div className="mb-6 h-7 w-48 animate-pulse rounded-full bg-white/10" />
          )}

          <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
            Singapore Job Market{' '}
            <span className="bg-gradient-to-r from-indigo-400 to-teal-400 bg-clip-text text-transparent">
              Intelligence
            </span>
          </h1>

          <p className="mt-6 max-w-xl text-lg text-slate-300">
            Track the market, check if your offer is fair, and match your resume to the right roles — all in one place.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/dashboard">
              <Button size="lg" variant="outline" className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white backdrop-blur-sm">
                Explore the Market
                <ArrowRight className="ml-2 size-4" />
              </Button>
            </Link>
            <Link href="/matches">
              <Button size="lg" className="bg-indigo-500 hover:bg-indigo-400 text-white shadow-lg shadow-indigo-900/50">
                Get Resume Matches
                <ArrowRight className="ml-2 size-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Feature cards */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="mb-8 text-center text-sm font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          What you can do
        </h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, badge, badgeColor, description, cta, href, variant, accent }) => (
            <Card
              key={href}
              className={`relative overflow-hidden border-slate-200 bg-gradient-to-br ${accent} dark:border-slate-700 dark:bg-slate-800/50 transition-shadow hover:shadow-md`}
            >
              <CardBody className="flex flex-col gap-4 p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-900/5 dark:bg-white/5">
                    <Icon className="size-5 text-slate-700 dark:text-slate-300" />
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeColor}`}>
                    {badge}
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{description}</p>
                </div>

                <div className="mt-auto pt-2">
                  <Link href={href} className="block">
                    <Button variant={variant} size="sm" className="w-full">
                      {cta}
                      <ArrowRight className="ml-2 size-3.5" />
                    </Button>
                  </Link>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>

      {/* Live data preview */}
      {(previewLoaded && (summary || activeJobsOverTime.length > 0 || jobsByCategory.length > 0)) && (
        <section className="border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Live Market Data</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">Updated hourly from the job database</p>
              </div>
              <Link
                href="/dashboard"
                className="text-sm font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 flex items-center gap-1"
              >
                Full dashboard <ArrowRight className="size-3.5" />
              </Link>
            </div>
            <LazyDashboardPreview
              summary={summary}
              activeJobsOverTime={activeJobsOverTime}
              jobsByCategory={jobsByCategory}
              loading={!previewLoaded}
            />
          </div>
        </section>
      )}
    </div>
  )
}
