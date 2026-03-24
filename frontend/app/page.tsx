'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { BarChart2, Scale, Briefcase, ArrowRight, TrendingUp, Users, Zap } from 'lucide-react'
import { dashboardApi } from '@/lib/api'
import { Layout } from './components/layout'
import NavUserActions from './components/NavUserActions'
import { Card, CardBody } from '@/components/design'
import { Skeleton } from '@/components/ui/skeleton'
import { isSupabaseConfigured } from '@/lib/supabase'

type ActiveJobsPoint = { date: string; active_count: number }

function formatDate(d: string) {
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const tools = [
  {
    icon: BarChart2,
    title: 'Market Dashboard',
    description:
      'Explore salary distributions, hiring trends by category and seniority, and active job counts — updated daily from live MCF data.',
    href: '/dashboard',
    auth: false,
    iconColor: 'text-indigo-600 dark:text-indigo-400',
    iconBg: 'bg-indigo-50 dark:bg-indigo-950/50',
    accentBorder: 'border-t-indigo-500 dark:border-t-indigo-400',
  },
  {
    icon: Scale,
    title: 'Lowball Checker',
    description:
      'Paste a job description and salary offer to instantly see where it sits in the market — ranked by percentile against similar roles.',
    href: '/lowball',
    auth: false,
    iconColor: 'text-violet-600 dark:text-violet-400',
    iconBg: 'bg-violet-50 dark:bg-violet-950/50',
    accentBorder: 'border-t-violet-500 dark:border-t-violet-400',
  },
  {
    icon: Briefcase,
    title: 'Resume Matching',
    description:
      'Upload your resume to get roles ranked by relevance. Rate jobs to build a taste profile that improves over time.',
    href: '/matches',
    auth: true,
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    iconBg: 'bg-emerald-50 dark:bg-emerald-950/50',
    accentBorder: 'border-t-emerald-500 dark:border-t-emerald-400',
  },
]

const highlights = [
  {
    icon: TrendingUp,
    label: 'Live salary benchmarks',
    detail: 'Real percentile data from active listings',
  },
  {
    icon: Zap,
    label: 'Instant analysis',
    detail: 'Results in seconds, no sign-up needed',
  },
  {
    icon: Users,
    label: 'Resume-to-job matching',
    detail: 'Semantic matching across thousands of roles',
  },
]

export default function HomePage() {
  const [activeJobs, setActiveJobs] = useState<ActiveJobsPoint[]>([])
  const [activeCount, setActiveCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      dashboardApi.getActiveJobsOverTimePublic(30).then(setActiveJobs).catch(() => null),
      dashboardApi.getSummaryPublic().then((s) => setActiveCount(s.active_jobs)).catch(() => null),
    ]).finally(() => setLoading(false))
  }, [])

  return (
    <Layout userSlot={<NavUserActions />}>
      <div className="flex flex-col gap-16">

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="-mx-4 lg:-mx-8 px-4 lg:px-8 pt-14 pb-16 bg-gradient-to-br from-indigo-50/80 via-white to-slate-50 dark:from-indigo-950/25 dark:via-slate-900 dark:to-slate-900 border-b border-slate-200/70 dark:border-slate-800">
          <div className="max-w-2xl">
            <span className="mb-4 inline-block rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
              Singapore · Live MCF data
            </span>
            <h1 className="text-5xl sm:text-[56px] font-bold tracking-tight text-slate-900 dark:text-slate-50 leading-[1.1]">
              Know your<br className="hidden sm:block" /> market worth
            </h1>
            <p className="mt-5 text-lg text-slate-500 dark:text-slate-400 leading-[1.7] max-w-xl">
              Job market intelligence powered by live MyCareersFuture listings. Explore hiring
              trends, check if you&rsquo;re being lowballed, and find roles that fit your resume.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/dashboard"
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-indigo-600 px-6 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-700 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
              >
                Explore Dashboard <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/lowball"
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Check my offer
              </Link>
            </div>

            {/* Highlight pills */}
            <div className="mt-10 flex flex-wrap gap-5">
              {highlights.map(({ icon: Icon, label, detail }) => (
                <div key={label} className="flex items-center gap-2.5">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                    <Icon className="size-4 text-slate-500 dark:text-slate-400" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{label}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">{detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Tools ────────────────────────────────────────────────────────── */}
        <section>
          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              What you can do
            </h2>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
              Three tools to help you navigate the Singapore job market.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            {tools.map(({ icon: Icon, title, description, href, auth, iconColor, iconBg, accentBorder }) => (
              <Link key={href} href={href} className="group block">
                <Card
                  className={`h-full border-t-4 ${accentBorder} transition-all hover:shadow-lg hover:-translate-y-0.5`}
                >
                  <CardBody className="flex flex-col gap-4">
                    <div className={`flex size-10 items-center justify-center rounded-xl ${iconBg}`}>
                      <Icon className={`size-5 ${iconColor}`} />
                    </div>
                    <div className="flex-1">
                      <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        {title}
                      </p>
                      <p className="mt-1.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                        {description}
                      </p>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      {auth && isSupabaseConfigured ? (
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          Sign in required
                        </span>
                      ) : (
                        <span />
                      )}
                      <span
                        className={`flex items-center gap-1 text-xs font-semibold ${iconColor} opacity-0 transition-opacity group-hover:opacity-100`}
                      >
                        Open <ArrowRight className="size-3" />
                      </span>
                    </div>
                  </CardBody>
                </Card>
              </Link>
            ))}
          </div>
        </section>

        {/* ── Live data ────────────────────────────────────────────────────── */}
        <section className="pb-2">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
                Live job market
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Active listings tracked over the last 30 days.
              </p>
            </div>
            {!loading && activeCount !== null && (
              <div className="shrink-0 text-right">
                <p className="text-3xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                  {activeCount.toLocaleString()}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">active now</p>
              </div>
            )}
          </div>

          <Card>
            <CardBody>
              {loading ? (
                <Skeleton className="h-52 w-full rounded-lg" />
              ) : activeJobs.length > 0 ? (
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={activeJobs} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="homeActiveGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="rgb(99,102,241)" stopOpacity={0.18} />
                          <stop offset="95%" stopColor="rgb(99,102,241)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgb(226,232,240)" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={formatDate}
                        fontSize={11}
                        tick={{ fill: 'rgb(148,163,184)' }}
                      />
                      <YAxis fontSize={11} tick={{ fill: 'rgb(148,163,184)' }} width={40} />
                      <Tooltip
                        formatter={(v: number) => [v.toLocaleString(), 'Active jobs']}
                        labelFormatter={formatDate}
                        contentStyle={{ fontSize: 12 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="active_count"
                        stroke="rgb(99,102,241)"
                        strokeWidth={2}
                        fill="url(#homeActiveGradient)"
                        dot={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex h-52 items-center justify-center text-sm text-slate-400">
                  No data available
                </div>
              )}
            </CardBody>
          </Card>
        </section>

      </div>
    </Layout>
  )
}
