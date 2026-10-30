'use client'

import { PageHeading } from '@/components/shared-ui/page-heading'
import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { Area, AreaChart, CartesianGrid, XAxis } from 'recharts'
import {
  Wallet, Receipt, Droplets, Link2,
  TrendingUp, TrendingDown,
  RefreshCw,
} from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
} from '@/components/ui/card'
import {
  ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'

import {
  getConsumerDashboardStats,
  getConsumerRecentPayments,
  getMonthlyConsumption,
  type ConsumerDashboardStats,
  type ConsumerRecentPayment,
  type MonthlyConsumption,
} from '@/lib/actions/dashboard/consumer-dashboard.actions'

// ─── Constants ────────────────────────────────────────────────────────────────

const CHART_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)']

// ─── Formatters ───────────────────────────────────────────────────────────────

const formatPHP = (v: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency', currency: 'PHP', minimumFractionDigits: 2,
  }).format(v)

const formatDate = (d: string) =>
  d ? format(new Date(d), 'MMM dd, yyyy') : '—'

const formatDateTime = (d: string) =>
  d ? format(new Date(d), 'MMM dd, yyyy · h:mm a') : '—'

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

// ─── Stat Card — Purple theme (matching admin) ────────────────────────────────

type Accent = 'purple' | 'violet' | 'indigo' | 'lavender'

interface StatCardProps {
  label:       string
  value:       number
  isCurrency?: boolean
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
  label, value, isCurrency, description,
  icon: Icon, accent, trend, isPrimary, delay, animate, href,
}: StatCardProps) {
  const count = useCountUp(value, 1200, animate)
  const a = ACCENTS[accent]
  const display = isCurrency ? formatPHP(count) : count.toLocaleString()

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
            'font-extrabold tracking-tight tabular-nums leading-none',
            isCurrency ? 'text-2xl' : 'text-4xl',
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
              ? <TrendingUp className="h-3 w-3 text-purple-400" />
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
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-3 w-44" />
      </div>
      <div className="pt-3 border-t"><Skeleton className="h-3 w-24" /></div>
    </div>
  )
}

// ─── Consumption Chart ────────────────────────────────────────────────────────

function ConsumptionChart() {
  const [data, setData] = useState<MonthlyConsumption[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await getMonthlyConsumption()
    if (res.status === 'success' && res.data) setData(res.data)
    else toast.error('Failed to load consumption data')
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const meterSerialNos = data.length > 0
    ? Object.keys(data[0]).filter(k => k !== 'month' && k !== 'period')
    : []
  const hasMultiple = meterSerialNos.length > 1
  const chartConfig: ChartConfig = Object.fromEntries(
    meterSerialNos.map((meterNo, i) => [
      meterNo,
      { label: meterNo, color: CHART_COLORS[i % CHART_COLORS.length] },
    ]),
  )

  return (
    <Card className="h-full rounded-md">
      <CardHeader>
        <CardTitle>Monthly Consumption</CardTitle>
        <CardDescription>
          {hasMultiple ? 'Per meter account · last 8 billing periods (m³)' : 'Your water usage per billing period (m³)'}
        </CardDescription>
        <CardAction>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={load} disabled={loading}>
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="aspect-video rounded-lg bg-muted animate-pulse" />
        ) : data.length === 0 ? (
          <div className="flex aspect-video flex-col items-center justify-center gap-2 text-muted-foreground">
            <Droplets className="h-5 w-5" />
            <p className="text-sm">No consumption data yet</p>
          </div>
        ) : (
          <ChartContainer config={chartConfig}>
            <AreaChart accessibilityLayer data={data} margin={{ left: 12, right: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={(value) => String(value).slice(0, 3)} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
              {hasMultiple ? <ChartLegend content={<ChartLegendContent />} /> : null}
              {meterSerialNos.map((meterNo) => (
                <Area
                  key={meterNo}
                  dataKey={meterNo}
                  type="natural"
                  fill={`var(--color-${meterNo})`}
                  fillOpacity={0.4}
                  stroke={`var(--color-${meterNo})`}
                />
              ))}
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
      <CardFooter className="flex-col items-start gap-2 text-sm">
        <div className="flex gap-2 leading-none font-medium">
          Water usage by billing period <TrendingUp className="h-4 w-4" />
        </div>
        <div className="leading-none text-muted-foreground">
          {hasMultiple ? 'One line per meter account' : 'Last 8 billing periods'}
        </div>
      </CardFooter>
    </Card>
  )
}

// ─── Recent Payments ──────────────────────────────────────────────────────────

function RecentPayments() {
  const [data, setData] = useState<ConsumerRecentPayment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getConsumerRecentPayments(5).then((res) => {
      if (res.status === 'success' && res.data) setData(res.data)
      else if (res.status !== 'unauthenticated') toast.error('Failed to load transactions')
      setLoading(false)
    })
  }, [])

  return (
    <div className="rounded-lg border border-border bg-white overflow-hidden flex flex-col h-full">
      <div className="px-5 pt-5 pb-4 border-b border-border flex items-start justify-between gap-3 shrink-0">
        <div>
          <h3 className="text-sm font-bold text-foreground">Recent Payments</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Your last 5 transactions</p>
        </div>
        <div className="h-8 w-8 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center shrink-0">
          <Receipt className="h-3.5 w-3.5 text-purple-600" />
        </div>
      </div>

      <div className="overflow-x-auto flex-1">
        <div className="divide-y divide-border">
          {loading ? (
            [...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center justify-between py-4 px-5">
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Skeleton className="h-5 w-20 rounded-md" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
            ))
          ) : data.length === 0 ? (
            <div className="h-52 flex flex-col items-center justify-center gap-2">
              <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center">
                <Receipt className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">No payments yet</p>
            </div>
          ) : (
            <AnimatePresence>
              {data.map((p, i) => (
                <motion.div
                  key={p.receipt_id}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, delay: 0.05 + i * 0.04 }}
                  className="flex items-center justify-between py-4 px-5 hover:bg-muted/30 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md inline-block">
                      {p.receipt_number}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 font-mono">{p.meter_serial_no}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 ml-3 shrink-0">
                    <span className="text-xs font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md">
                      {p.payment_type === 'billing' ? 'Water Bill' : p.payment_type === 'connection_fee' ? 'Connection Fee' : 'Reconnection'}
                    </span>
                    <span className="text-sm font-bold text-foreground tabular-nums">
                      {formatPHP(p.amount)}
                    </span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function ConsumerDashboard() {
  const [stats, setStats] = useState<ConsumerDashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [animate, setAnimate] = useState(false)

  useEffect(() => {
    getConsumerDashboardStats().then((res) => {
      if (res.status === 'success' && res.data) setStats(res.data)
      else if (res.status === 'unauthenticated') toast.error('Please log in.')
      else toast.error(res.message ?? 'Failed to load dashboard.')
      setLoading(false)
      setTimeout(() => setAnimate(true), 180)
    })
  }, [])

  return (
    <div className="w-full space-y-6">

      <PageHeading
        title={loading ? 'Dashboard' : `Good day, ${stats?.consumerName?.split(' ')[0] ?? 'Consumer'}`}
        description="Overview of your meter accounts, billing & recent transactions"
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {loading || !stats ? (
          [...Array(4)].map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard
              label="Outstanding Balance"
              value={stats.outstandingBalance}
              isCurrency
              description={stats.currentPeriodLabel ? `${stats.currentPeriodLabel} · Total due` : 'Total amount due'}
              icon={Wallet}
              accent="purple"
              isPrimary
              trend={{ label: 'Total amount due', up: false }}
              delay={0.05}
              animate={animate}
              href="/billing"
            />
            <StatCard
              label="Total Billing"
              value={stats.totalBilling}
              isCurrency
              description={stats.currentPeriodLabel || 'Current period'}
              icon={Receipt}
              accent="violet"
              trend={{ label: 'Current period', up: true }}
              delay={0.12}
              animate={animate}
              href="/billing"
            />
            <StatCard
              label="Latest Consumption"
              value={stats.latestConsumption ?? 0}
              description={stats.latestConsumptionDate ? `As of ${formatDate(stats.latestConsumptionDate)}` : 'No consumption recorded'}
              icon={Droplets}
              accent="indigo"
              trend={{ label: 'Cubic meters (m³)', up: true }}
              delay={0.19}
              animate={animate}
              href="/billing"
            />
            <StatCard
              label="Active Meter Accounts"
              value={stats.activeConnectionsCount}
              description="Meter accounts"
              icon={Link2}
              accent="lavender"
              trend={{ label: 'Active accounts', up: true }}
              delay={0.26}
              animate={animate}
              href="/meter-accounts"
            />
          </>
        )}
      </div>

      {/* Chart + Payments */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <ConsumptionChart />
        <RecentPayments />
      </div>

    </div>
  )
}