'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { BarChart2, Scale, Briefcase, ArrowRight } from 'lucide-react'
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
    title: 'Dashboard',
    description: 'Explore market trends, salary distributions, hiring by category and seniority.',
    href: '/dashboard',
    auth: false,
  },
  {
    icon: Scale,
    title: 'Lowball Checker',
    description: 'Paste a job description and salary offer to see where it sits in the market.',
    href: '/lowball',
    auth: false,
  },
  {
    icon: Briefcase,
    title: 'Resume Matching',
    description: 'Upload your resume to get roles ranked by relevance and build a taste profile.',
    href: '/matches',
    auth: true,
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
      <div className="flex flex-col gap-8">

        {/* Title */}
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">MCF Job Matcher</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Singapore job market intelligence — explore trends, check offers, or match your resume.
          </p>
        </div>

        {/* Tool cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          {tools.map(({ icon: Icon, title, description, href, auth }) => (
            <Link key={href} href={href} className="group block">
              <Card className="h-full border-slate-200 transition-shadow hover:shadow-md dark:border-slate-700">
                <CardBody className="flex flex-col gap-3 p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex size-8 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700">
                      <Icon className="size-4 text-slate-600 dark:text-slate-300" />
                    </div>
                    <ArrowRight className="size-4 text-slate-300 transition-colors group-hover:text-slate-600 dark:text-slate-600 dark:group-hover:text-slate-300" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{description}</p>
                  </div>
                  {auth && isSupabaseConfigured && (
                    <p className="text-xs text-slate-400 dark:text-slate-500">Sign in required</p>
                  )}
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>

        {/* Active jobs chart */}
        <Card className="border-slate-200 dark:border-slate-700">
          <CardBody className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Active jobs — last 30 days
              </p>
              {activeCount !== null && (
                <span className="text-sm tabular-nums text-slate-500 dark:text-slate-400">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {activeCount.toLocaleString()}
                  </span>{' '}
                  active now
                </span>
              )}
            </div>
            {loading ? (
              <Skeleton className="h-44 w-full rounded-lg" />
            ) : activeJobs.length > 0 ? (
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={activeJobs} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="homeActiveGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="rgb(99,102,241)" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="rgb(99,102,241)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(226,232,240)" />
                    <XAxis dataKey="date" tickFormatter={formatDate} fontSize={11} tick={{ fill: 'rgb(148,163,184)' }} />
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
                      strokeWidth={1.5}
                      fill="url(#homeActiveGradient)"
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-44 items-center justify-center text-sm text-slate-400">
                No data available
              </div>
            )}
          </CardBody>
        </Card>

      </div>
    </Layout>
  )
}
