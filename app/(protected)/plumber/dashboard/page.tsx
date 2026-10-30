// app/(plumber)/dashboard/page.tsx

'use client'

import { PageHeading } from '@/components/shared-ui/page-heading'
import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ClipboardList, CheckCircle2, Clock, PlayCircle,
  Wrench, MapPin, RefreshCw, Users, User,
  TrendingUp, TrendingDown,
} from 'lucide-react'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  getPlumberCardStats,
  getPlumberRecentJobOrders,
  type PlumberCardStats,
  type PlumberJobOrder,
} from '@/lib/actions/dashboard/plumber-dashboard.actions'

// ─── Formatters ───────────────────────────────────────────────────────────────

const formatDate = (d: string) => format(new Date(d), 'MMM dd, yyyy')

const formatStatus = (s: string) =>
  s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

// ─── Counter animation ────────────────────────────────────────────────────────

function useCountUp(target: number, duration = 1200, enabled = false) {
  const [value, setValue] = useState(0)
  const raf = useRef<number | null>(null)
  useEffect(() => {
    if (!enabled) return
    if (target === 0) { setValue(0); return }
    const t0 = performance.now()
    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1)
      setValue(Math.round((1 - Math.pow(1 - p, 3)) * target))
      if (p < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => { if (raf.current) cancelAnimationFrame(raf.current) }
  }, [target, duration, enabled])
  return value
}

// ─── Stat Card — Purple theme ─────────────────────────────────────────────────

type Accent = 'purple' | 'violet' | 'indigo' | 'lavender'

interface StatCardProps {
  label:       string
  value:       number
  description: string
  icon:        React.ElementType
  accent:      Accent
  trend?:      { label: string; up: boolean }
  isPrimary?:  boolean
  delay:       number
  animate:     boolean
  href?:       string
}

const ACCENTS: Record<Accent, {
  ring: string; icon: string; iconColor: string; val: string; blob: string
}> = {
  purple:   { ring: 'border-purple-200', icon: 'bg-purple-50 border-purple-100', iconColor: 'text-purple-600', val: 'text-purple-700', blob: 'bg-purple-50' },
  violet:   { ring: 'border-violet-200', icon: 'bg-violet-50 border-violet-100', iconColor: 'text-violet-600', val: 'text-violet-700', blob: 'bg-violet-50' },
  indigo:   { ring: 'border-indigo-200', icon: 'bg-indigo-50 border-indigo-100', iconColor: 'text-indigo-600', val: 'text-indigo-700', blob: 'bg-indigo-50' },
  lavender: { ring: 'border-lavender-200', icon: 'bg-lavender-50 border-lavender-100', iconColor: 'text-lavender-600', val: 'text-lavender-700', blob: 'bg-lavender-50' },
}

function StatCard({
  label, value, description,
  icon: Icon, accent, trend, isPrimary, delay, animate, href,
}: StatCardProps) {
  const count = useCountUp(value, 1200, animate)
  const a     = ACCENTS[accent]

  const card = (
    <div className={cn(
      'relative h-full rounded-lg border overflow-hidden transition-shadow duration-300',
      href && 'hover:shadow-md cursor-pointer',
      isPrimary
        ? 'bg-gradient-to-br from-purple-600 to-violet-700 border-purple-500'
        : `bg-white ${a.ring}`,
    )}>
      <div className={cn('absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-30', isPrimary ? 'bg-white/20' : a.blob)} />
      <div className={cn('absolute -bottom-6 -left-6 w-24 h-24 rounded-full opacity-20', isPrimary ? 'bg-white/10' : a.blob)} />

      <div className="relative z-10 p-5 flex flex-col gap-3 h-full">
        <div className="flex items-center justify-between">
          <p className={cn('text-[10px] font-bold tracking-[0.14em] uppercase', isPrimary ? 'text-purple-100' : 'text-muted-foreground')}>
            {label}
          </p>
          <div className={cn('h-8 w-8 rounded-xl flex items-center justify-center shrink-0 border', isPrimary ? 'bg-white/20 border-white/30' : a.icon)}>
            <Icon className={cn('h-4 w-4', isPrimary ? 'text-white' : a.iconColor)} />
          </div>
        </div>

        <div>
          <p className={cn(
            'text-4xl font-extrabold tracking-tight tabular-nums leading-none',
            isPrimary ? 'text-white' : a.val,
          )}>
            {count.toLocaleString()}
          </p>
          <p className={cn('text-xs mt-1.5', isPrimary ? 'text-purple-100' : 'text-muted-foreground')}>
            {description}
          </p>
        </div>

        {trend && (
          <div className={cn(
            'flex items-center gap-1.5 text-[11px] font-medium mt-auto pt-3 border-t',
            isPrimary ? 'border-white/20 text-purple-100' : 'border-border text-muted-foreground',
          )}>
            {trend.up
              ? <TrendingUp   className="h-3 w-3 text-purple-400" />
              : <TrendingDown className="h-3 w-3 text-rose-400" />}
            {trend.label}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      className="h-full"
    >
      {href ? (
        <Link href={href} className="block h-full rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
          {card}
        </Link>
      ) : card}
    </motion.div>
  )
}

// ─── Skeletons ────────────────────────────────────────────────────────────────

function StatCardSkeleton() {
  return (
    <div className="rounded-lg border bg-white p-5 space-y-4">
      <div className="flex justify-between items-center">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-8 w-8 rounded-xl" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-3 w-44" />
      </div>
      <div className="pt-3 border-t"><Skeleton className="h-3 w-24" /></div>
    </div>
  )
}

function TableRowSkeleton() {
  return (
    <TableRow>
      {[...Array(6)].map((_, i) => (
        <TableCell key={i} className="py-3.5">
          <Skeleton className="h-4 w-full" />
        </TableCell>
      ))}
    </TableRow>
  )
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { badge: string; dot: string }> = {
  assigned:    { badge: 'bg-blue-50 text-blue-700 border-blue-200',     dot: 'bg-blue-500'    },
  in_progress: { badge: 'bg-violet-50 text-violet-700 border-violet-200', dot: 'bg-violet-500' },
  pending:     { badge: 'bg-amber-50 text-amber-700 border-amber-200',   dot: 'bg-amber-400'   },
  completed:   { badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  cancelled:   { badge: 'bg-red-50 text-red-600 border-red-200',         dot: 'bg-red-500'     },
}

function StatusBadge({ status }: { status: string }) {
  const s   = status.toLowerCase()
  const cfg = STATUS_STYLE[s] ?? { badge: 'bg-muted text-muted-foreground border-border', dot: 'bg-muted-foreground' }
  return (
    <Badge variant="outline" className={cn('rounded-full text-[11px] font-semibold px-2.5 py-0.5', cfg.badge)}>
      <span className={cn('h-1.5 w-1.5 rounded-full inline-block mr-1.5', cfg.dot)} />
      {formatStatus(status)}
    </Badge>
  )
}

function RoleBadge({ role }: { role: 'leader' | 'helper' }) {
  if (role === 'leader') {
    return (
      <Badge variant="outline" className="rounded-full bg-purple-50 text-purple-700 border-purple-200 text-[10px]">
        <Users className="h-2.5 w-2.5 mr-1" />
        Leader
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="rounded-full bg-slate-50 text-slate-600 border-slate-200 text-[10px]">
      <User className="h-2.5 w-2.5 mr-1" />
      Helper
    </Badge>
  )
}

// ─── Recent Job Orders Table ──────────────────────────────────────────────────

function RecentJobOrdersTable({
  jobs, loading, onRefresh,
}: {
  jobs: PlumberJobOrder[]
  loading: boolean
  onRefresh: () => void
}) {
  const COLS = ['JO No.', 'Role', 'Job Type', 'Location', 'Status', 'Request Date']

  return (
    <div className="rounded-lg border border-border bg-white overflow-hidden flex flex-col">
      <div className="px-5 pt-5 pb-4 border-b border-border flex items-start justify-between gap-3 shrink-0">
        <div>
          <h3 className="text-sm font-bold text-foreground">Recent Job Orders</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Last 5 assignments</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
            onClick={onRefresh}
            disabled={loading}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </Button>
          <div className="h-8 w-8 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center shrink-0">
            <Wrench className="h-3.5 w-3.5 text-purple-600" />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              {COLS.map((h, i) => (
                <TableHead
                  key={h}
                  className={cn(
                    'text-[11px] font-bold text-muted-foreground uppercase tracking-wide whitespace-nowrap',
                    i === 0 && 'pl-5',
                    i === COLS.length - 1 && 'pr-5',
                  )}
                >
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>

          <TableBody>
            {loading ? (
              [...Array(5)].map((_, i) => <TableRowSkeleton key={i} />)
            ) : jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={COLS.length} className="h-52 text-center">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                      <Wrench className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">No job orders assigned yet</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              <AnimatePresence>
                {jobs.map((job, i) => (
                  <motion.tr
                    key={job.job_order_id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.22, delay: 0.05 + i * 0.04 }}
                    className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <TableCell className="py-3.5 pl-5">
                      <span className="font-mono text-xs font-bold text-purple-700 bg-purple-50 px-2 py-1 rounded-md">
                        {job.job_order_no}
                      </span>
                    </TableCell>

                    <TableCell className="py-3.5">
                      <RoleBadge role={job.role} />
                    </TableCell>

                    <TableCell className="py-3.5">
                      <span className="text-sm text-foreground">{job.job_type_name}</span>
                    </TableCell>

                    <TableCell className="py-3.5">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="text-sm text-muted-foreground whitespace-nowrap">
                          {job.barangay_name} · Zone {job.zone_name}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell className="py-3.5">
                      <StatusBadge status={job.job_status_name} />
                    </TableCell>

                    <TableCell className="py-3.5 pr-5">
                      <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                        {formatDate(job.request_date)}
                      </span>
                    </TableCell>
                  </motion.tr>
                ))}
              </AnimatePresence>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function PlumberDashboard() {
  const [stats,   setStats]   = useState<PlumberCardStats | null>(null)
  const [jobs,    setJobs]    = useState<PlumberJobOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [animate, setAnimate] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [statsRes, jobsRes] = await Promise.all([
        getPlumberCardStats(),
        getPlumberRecentJobOrders(5),
      ])

      if (statsRes.status === 'success' && statsRes.data) setStats(statsRes.data)
      else toast.error(statsRes.message ?? 'Failed to load stats')

      if (jobsRes.status === 'success' && jobsRes.data) setJobs(jobsRes.data)
      else toast.error(jobsRes.message ?? 'Failed to load job orders')
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setLoading(false)
      setTimeout(() => setAnimate(true), 180)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div className="w-full space-y-6">

      <PageHeading
        title="Dashboard"
        description="Overview of your assigned job orders & progress"
      />

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {loading || !stats ? (
          [...Array(4)].map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard
              label="Total Jobs"
              value={stats.totalJobOrders}
              description="All assigned job orders"
              icon={ClipboardList}
              accent="purple"
              isPrimary
              trend={{ label: 'All time assignments', up: true }}
              delay={0.05}
              animate={animate}
              href="/plumber/job-order"
            />
            <StatCard
              label="Assigned"
              value={stats.assignedJobOrders}
              description="Awaiting action"
              icon={Clock}
              accent="violet"
              trend={{ label: 'Pending start', up: true }}
              delay={0.12}
              animate={animate}
              href="/plumber/job-order"
            />
            <StatCard
              label="In Progress"
              value={stats.inProgressJobOrders}
              description="Currently working on"
              icon={PlayCircle}
              accent="indigo"
              trend={{ label: 'Active jobs', up: true }}
              delay={0.19}
              animate={animate}
              href="/plumber/job-order"
            />
            <StatCard
              label="Completed"
              value={stats.completedJobOrders}
              description="Successfully finished"
              icon={CheckCircle2}
              accent="lavender"
              trend={{ label: 'Jobs done', up: true }}
              delay={0.26}
              animate={animate}
              href="/plumber/job-order"
            />
          </>
        )}
      </div>

      {/* ── Recent Job Orders Table ── */}
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        <RecentJobOrdersTable
          jobs={jobs}
          loading={loading}
          onRefresh={fetchData}
        />
      </motion.div>

    </div>
  )
}