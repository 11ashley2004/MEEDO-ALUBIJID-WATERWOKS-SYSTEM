'use client'

import { PageHeading } from '@/components/shared-ui/page-heading'
import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  MapPin, Link2, AlertTriangle,
  TrendingUp, Wrench,
  Clock, RefreshCw, CheckCircle,
} from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
} from '@/components/ui/card'
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from '@/components/ui/chart'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'

import {
  getMeterReaderStats,
  getMeterReaderZoneAccounts,
  getRecentJobOrders,
  type MeterReaderStats,
  type ZoneAccountStat,
  type RecentJobOrder,
} from '@/lib/actions/dashboard/meter-reader-dashboard.actions'

// ─── Formatters ───────────────────────────────────────────────────────────────

const formatDate = (dateStr: string) =>
  dateStr ? format(new Date(dateStr), 'MMM dd, yyyy') : '—'

// ─── Counter animation ────────────────────────────────────────────────────────

function useCountUp(target: number, duration = 1200, enabled = false) {
  const [value, setValue] = useState(0)
  const raf = useRef<number | null>(null)
  
  useEffect(() => {
    if (!enabled) return
    const safeTarget = isNaN(target) ? 0 : target
    if (safeTarget === 0) { setValue(0); return }
    
    const t0 = performance.now()
    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1)
      setValue(Math.round((1 - Math.pow(1 - p, 3)) * safeTarget))
      if (p < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => { if (raf.current) cancelAnimationFrame(raf.current) }
  }, [target, duration, enabled])
  
  return value
}

// ─── Stat Card — Purple theme ─────────────────────────────────────────────────

type Accent = 'purple' | 'violet' | 'indigo' | 'lavender' | 'emerald'

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
  emerald:  { ring: 'border-emerald-200', icon: 'bg-emerald-50 border-emerald-100', iconColor: 'text-emerald-600', val: 'text-emerald-700', blob: 'bg-emerald-50' },
}

function StatCard({
  label, value, description,
  icon: Icon, accent, trend, isPrimary, delay, animate, href,
}: StatCardProps) {
  const safeValue = isNaN(value) ? 0 : value
  const count = useCountUp(safeValue, 1200, animate)
  const a = ACCENTS[accent]
  const display = isNaN(count) ? '0' : count.toLocaleString()

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
            'font-extrabold tracking-tight tabular-nums leading-none text-4xl',
            isPrimary ? 'text-white' : a.val,
          )}>
            {display}
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
              ? <TrendingUp className="h-3 w-3" />
              : <TrendingDown className="h-3 w-3" />}
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

// ─── TrendingDown icon for stat card ─────────────────────────────────────────

function TrendingDown({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
      <polyline points="17 18 23 18 23 12" />
    </svg>
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
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-3 w-44" />
      </div>
      <div className="pt-3 border-t"><Skeleton className="h-3 w-24" /></div>
    </div>
  )
}

function TableRowSkeleton({ cols }: { cols: number }) {
  return (
    <TableRow>
      {[...Array(cols)].map((_, i) => (
        <TableCell key={i} className="py-3.5"><Skeleton className="h-4 w-full" /></TableCell>
      ))}
    </TableRow>
  )
}

const zoneChartConfig = {
  accounts: { label: 'Accounts', color: 'var(--chart-1)' },
} satisfies ChartConfig

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase()
  let badgeClass = ''
  if (s === 'pending') badgeClass = 'bg-amber-50 text-amber-700 border-amber-200'
  else if (s === 'in_progress') badgeClass = 'bg-violet-50 text-violet-700 border-violet-200'
  else if (s === 'completed') badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200'
  else if (s === 'assigned') badgeClass = 'bg-purple-50 text-purple-700 border-purple-200'
  else badgeClass = 'bg-slate-100 text-slate-600 border-slate-200'

  const label = s === 'in_progress' ? 'In Progress' : s.charAt(0).toUpperCase() + s.slice(1)

  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-md text-[10px] font-semibold ring-1', badgeClass)}>
      {label}
    </span>
  )
}

// ─── Zone Accounts Chart ───────────────────────────────────────────────────

function ZoneAccountsChart() {
  const [data, setData] = useState<ZoneAccountStat[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await getMeterReaderZoneAccounts()
    if (res.status === 'success') setData(res.data ?? [])
    else toast.error(res.message ?? 'Failed to load zone accounts')
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const activeZones = data.filter(z => z.accounts > 0)
  const chartData = activeZones.map(z => ({
    name: `${z.barangay_name} Zone ${z.zone_name}`,
    accounts: isNaN(z.accounts) ? 0 : z.accounts,
  }))
  const chartHeight = Math.max(200, Math.min(350, activeZones.length * 55 + 60))
  const total = data.reduce((a, b) => a + (isNaN(b.accounts) ? 0 : b.accounts), 0)

  return (
    <Card className="h-full rounded-md">
      <CardHeader>
        <CardTitle>Accounts per Zone</CardTitle>
        <CardDescription>Meter accounts across your assigned zones</CardDescription>
        <CardAction>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={load} disabled={loading}>
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="aspect-video rounded-lg bg-muted animate-pulse" />
        ) : activeZones.length === 0 ? (
          <div className="flex aspect-video flex-col items-center justify-center gap-2 text-muted-foreground">
            <MapPin className="h-5 w-5" />
            <p className="text-sm">
              {data.length === 0 ? 'No zones assigned yet' : 'No accounts in your zones'}
            </p>
          </div>
        ) : (
          <ChartContainer config={zoneChartConfig} className="aspect-auto w-full" style={{ height: chartHeight }}>
            <BarChart accessibilityLayer data={chartData} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid horizontal={false} />
              <XAxis type="number" dataKey="accounts" hide />
              <YAxis dataKey="name" type="category" tickLine={false} tickMargin={10} axisLine={false} width={140} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
              <Bar dataKey="accounts" fill="var(--color-accounts)" radius={5} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
      <CardFooter className="flex-col items-start gap-2 text-sm">
        <div className="flex gap-2 leading-none font-medium">
          {activeZones.length} active zones · {total} accounts <TrendingUp className="h-4 w-4" />
        </div>
        <div className="leading-none text-muted-foreground">
          {data.length} assigned zones
        </div>
      </CardFooter>
    </Card>
  )
}

// ─── Recent Job Orders Table ──────────────────────────────────────────────────

function RecentJobOrdersTable() {
  const [data, setData] = useState<RecentJobOrder[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getRecentJobOrders().then((res) => {
      if (res.status === 'success') setData(res.data ?? [])
      else toast.error(res.message ?? 'Failed to load recent job orders')
      setLoading(false)
    })
  }, [])

  const COLS = ['Job No.', 'Service', 'Barangay', 'Status', 'Requested']

  return (
    <div className="rounded-lg border border-border bg-white overflow-hidden flex flex-col h-full">
      <div className="px-5 pt-5 pb-4 border-b border-border flex items-start justify-between gap-3 shrink-0">
        <div>
          <h3 className="text-sm font-bold text-foreground">Recent Job Orders</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Latest job orders assigned to you
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          <div className="h-8 w-8 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center shrink-0">
            <Clock className="h-3.5 w-3.5 text-purple-600" />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto flex-1">
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
              [...Array(5)].map((_, i) => <TableRowSkeleton key={i} cols={COLS.length} />)
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={COLS.length} className="h-52 text-center">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                      <Wrench className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">No job orders yet</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              <AnimatePresence>
                {data.map((job, i) => (
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
                      <span className="text-sm font-semibold text-foreground">
                        {job.service_name}
                      </span>
                    </TableCell>

                    <TableCell className="py-3.5">
                      <span className="text-sm text-muted-foreground">
                        {job.zone_name}
                      </span>
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

export default function MeterReaderDashboard() {
  const [stats, setStats] = useState<MeterReaderStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [animate, setAnimate] = useState(false)

  useEffect(() => {
    getMeterReaderStats().then((res) => {
      if (res.status === 'success') setStats(res.data ?? null)
      else toast.error(res.message ?? 'Failed to load dashboard stats')
      setLoading(false)
      setTimeout(() => setAnimate(true), 180)
    })
  }, [])

  // Calculate rates correctly
  const totalOrders = stats ? stats.pendingOrders + stats.inProgressOrders + stats.completedOrders : 0
  
  const pendingRate = stats && totalOrders > 0
    ? ((stats.pendingOrders / totalOrders) * 100).toFixed(1)
    : '0'
  
  const completionRate = stats && totalOrders > 0
    ? ((stats.completedOrders / totalOrders) * 100).toFixed(1)
    : '0'

  return (
    <div className="w-full space-y-6">

      <PageHeading
        title="Meter Reader Dashboard"
        description="Your zones, accounts, and work orders"
      />

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {loading || !stats ? (
          [...Array(4)].map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard
              label="Assigned Zones"
              value={stats.totalZones}
              description="Active zone assignments"
              icon={MapPin}
              accent="purple"
              isPrimary
              trend={{ label: `${stats.totalZones} zones assigned`, up: true }}
              delay={0.05}
              animate={animate}
              href="/meter-reader/meter-readings"
            />
            <StatCard
              label="Meter Accounts"
              value={stats.totalAccounts}
              description="Active accounts in your zones"
              icon={Link2}
              accent="violet"
              trend={{ label: `${stats.totalAccounts} total accounts`, up: true }}
              delay={0.12}
              animate={animate}
              href="/meter-reader/consumers"
            />
            <StatCard
              label="Pending Orders"
              value={stats.pendingOrders}
              description="Awaiting action"
              icon={AlertTriangle}
              accent="indigo"
              trend={{ label: `${pendingRate}% of total`, up: false }}
              delay={0.19}
              animate={animate}
              href="/meter-reader/job-order"
            />
            <StatCard
              label="Completed"
              value={stats.completedOrders}
              description="Finished work orders"
              icon={CheckCircle}
              accent="emerald"
              trend={{ label: `${completionRate}% of total`, up: true }}
              delay={0.26}
              animate={animate}
              href="/meter-reader/job-order"
            />
          </>
        )}
      </div>

      {/* ── Zone Chart + Job Orders ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
        <ZoneAccountsChart />
        <RecentJobOrdersTable />
      </div>

    </div>
  )
}