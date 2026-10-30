'use client'

import { PageHeading } from '@/components/shared-ui/page-heading'
import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, XAxis,
} from 'recharts'
import {
  Wifi, WifiOff, Map, Building2,
  TrendingUp, TrendingDown, CreditCard,
  Zap, PlugZap, Receipt, RefreshCw,
  Wallet, Droplets, Gauge,
} from 'lucide-react'
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
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'

import {
  getDashboardStats,
  getMonthlyOverdueBilling,
  getMonthlyBillingStatus,
  getRecentPayments,
  getMonthlyRevenue,
  type DashboardStats,
  type MonthlyOverdue,
  type MonthlyBillingStatus,
  type RecentPayment,
  type PaymentKind,
  type MonthlyRevenue,
} from '@/lib/actions/dashboard/dashboard.actions'

// ─── Formatters ───────────────────────────────────────────────────────────────

const formatPHP = (v: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency', currency: 'PHP', minimumFractionDigits: 2,
  }).format(v)

const formatM3 = (v: number) =>
  `${new Intl.NumberFormat('en-PH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(v)} m³`

const formatDate = (d: string) =>
  d ? new Date(d).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  }) : '—'

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
  label:         string
  value:         number
  isCurrency?:   boolean
  displayValue?: string
  description:   string
  icon:          React.ElementType
  accent:        Accent
  trend?:        { label: string; up: boolean }
  isPrimary?:    boolean
  delay:         number
  animate:       boolean
  href?:         string
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
  label, value, isCurrency, displayValue, description,
  icon: Icon, accent, trend, isPrimary, delay, animate, href,
}: StatCardProps) {
  const count   = useCountUp(value, 1200, animate && !displayValue)
  const a       = ACCENTS[accent]
  const display = displayValue
    ?? (isCurrency ? formatPHP(count) : count.toLocaleString())

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
        <div className="flex items-center justify-between gap-2">
          <p className={cn('text-[10px] font-bold tracking-[0.14em] uppercase leading-snug', isPrimary ? 'text-purple-100' : 'text-muted-foreground')}>
            {label}
          </p>
          <div className={cn('h-8 w-8 rounded-xl flex items-center justify-center shrink-0 border', isPrimary ? 'bg-white/20 border-white/30' : a.icon)}>
            <Icon className={cn('h-4 w-4', isPrimary ? 'text-white' : a.iconColor)} />
          </div>
        </div>

        <div>
          <p className={cn(
            'font-extrabold tracking-tight tabular-nums leading-none',
            displayValue || isCurrency ? 'text-xl sm:text-2xl' : 'text-4xl',
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

const overdueChartConfig = {
  count: { label: 'Overdue', color: 'var(--chart-1)' },
} satisfies ChartConfig

const billingChartConfig = {
  unpaid: { label: 'Unpaid', color: 'var(--chart-1)' },
  partial: { label: 'Partial', color: 'var(--chart-2)' },
  paid: { label: 'Paid', color: 'var(--chart-3)' },
  forwarded: { label: 'Forwarded', color: 'var(--chart-4)' },
} satisfies ChartConfig

const revenueChartConfig = {
  amount: { label: 'Collected', color: 'var(--chart-1)' },
} satisfies ChartConfig

function monthTick(value: string) {
  return String(value).slice(0, 3)
}

// ─── Monthly Overdue Billing (Line Chart) ─────────────────────────────────────

function OverdueBillingChart() {
  const [data,    setData]    = useState<MonthlyOverdue[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await getMonthlyOverdueBilling(5)
    if (res) setData(res)
    else toast.error('Failed to load overdue data')
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <Card className="h-full rounded-md">
      <CardHeader>
        <CardTitle>Monthly Overdue Billing</CardTitle>
        <CardDescription>Overdue bill count — last 5 reading periods</CardDescription>
        <CardAction>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={load} disabled={loading}>
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="aspect-video rounded-lg bg-muted animate-pulse" />
        ) : (
          <ChartContainer config={overdueChartConfig}>
            <LineChart accessibilityLayer data={data} margin={{ top: 20, left: 12, right: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={monthTick} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
              <Line dataKey="count" type="natural" stroke="var(--color-count)" strokeWidth={2} dot={{ fill: 'var(--color-count)' }} activeDot={{ r: 6 }}>
                <LabelList position="top" offset={12} className="fill-foreground" fontSize={12} />
              </Line>
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
      <CardFooter className="flex-col items-start gap-2 text-sm">
        <div className="flex gap-2 leading-none font-medium">
          Overdue bills by reading period <TrendingUp className="h-4 w-4" />
        </div>
        <div className="leading-none text-muted-foreground">
          Last 5 reading periods
        </div>
      </CardFooter>
    </Card>
  )
}

// ─── Monthly Billing Status (Stacked Bar) ─────────────────────────────────────

function BillingStatusChart() {
  const [data,    setData]    = useState<MonthlyBillingStatus[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await getMonthlyBillingStatus(5)
    if (res) setData(res)
    else toast.error('Failed to load billing status data')
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <Card className="h-full rounded-md">
      <CardHeader>
        <CardTitle>Monthly Billing Status</CardTitle>
        <CardDescription>Unpaid, partial, paid, and forwarded — last 5 reading periods</CardDescription>
        <CardAction>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={load} disabled={loading}>
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="aspect-video rounded-lg bg-muted animate-pulse" />
        ) : (
          <ChartContainer config={billingChartConfig}>
            <BarChart accessibilityLayer data={data}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="month" tickLine={false} tickMargin={10} axisLine={false} tickFormatter={monthTick} />
              <ChartTooltip content={<ChartTooltipContent hideLabel />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="unpaid" stackId="a" fill="var(--color-unpaid)" radius={[0, 0, 4, 4]} />
              <Bar dataKey="partial" stackId="a" fill="var(--color-partial)" radius={[0, 0, 0, 0]} />
              <Bar dataKey="paid" stackId="a" fill="var(--color-paid)" radius={[0, 0, 0, 0]} />
              <Bar dataKey="forwarded" stackId="a" fill="var(--color-forwarded)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
      <CardFooter className="flex-col items-start gap-2 text-sm">
        <div className="flex gap-2 leading-none font-medium">
          Billing status by reading period <TrendingUp className="h-4 w-4" />
        </div>
        <div className="leading-none text-muted-foreground">
          Last 5 reading periods
        </div>
      </CardFooter>
    </Card>
  )
}

// ─── Monthly Revenue (Area Chart) ─────────────────────────────────────────────

function RevenueTrendChart() {
  const [data,    setData]    = useState<MonthlyRevenue[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await getMonthlyRevenue(6)
    if (res) setData(res)
    else toast.error('Failed to load revenue data')
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const total = data.reduce((acc, d) => acc + d.amount, 0)

  return (
    <Card className="h-full rounded-md">
      <CardHeader>
        <CardTitle>Monthly Revenue</CardTitle>
        <CardDescription>
          {loading ? 'MEEDO total collections' : `${formatPHP(total)} total collected`}
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
          <div className="flex aspect-video flex-col items-center justify-center gap-2">
            <Wallet className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No transactions yet</p>
          </div>
        ) : (
          <ChartContainer config={revenueChartConfig}>
            <AreaChart accessibilityLayer data={data} margin={{ left: 12, right: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value) => String(value).split(' ')[0]}
              />
              <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
              <Area
                dataKey="amount"
                type="natural"
                fill="var(--color-amount)"
                fillOpacity={0.4}
                stroke="var(--color-amount)"
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
      <CardFooter className="flex-col items-start gap-2 text-sm">
        <div className="flex gap-2 leading-none font-medium">
          Collections by reading period <TrendingUp className="h-4 w-4" />
        </div>
        <div className="leading-none text-muted-foreground">
          {loading ? 'MEEDO total collections' : `${formatPHP(total)} total collected`}
        </div>
      </CardFooter>
    </Card>
  )
}

// ─── Payment kind config ──────────────────────────────────────────────────────

const KIND_CONFIG: Record<PaymentKind, {
  label: string; bg: string; textColor: string; icon: React.ElementType
}> = {
  billing:        { label: 'Billing',        bg: 'bg-purple-50 border border-purple-100', textColor: 'text-purple-700', icon: CreditCard },
  connection_fee: { label: 'Connection Fee', bg: 'bg-indigo-50 border border-indigo-100', textColor: 'text-indigo-700', icon: Zap     },
  reconnection:   { label: 'Reconnection',   bg: 'bg-lavender-50 border border-lavender-100', textColor: 'text-lavender-700', icon: PlugZap  },
}

function KindBadge({ kind }: { kind: PaymentKind }) {
  const { label, bg, textColor, icon: Icon } = KIND_CONFIG[kind]
  return (
    <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full', bg, textColor)}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  )
}

// ─── Recent Transactions Table ────────────────────────────────────────────────

function RecentTransactionsTable() {
  const [data,    setData]    = useState<RecentPayment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getRecentPayments().then((res) => {
      if (res) setData(res)
      else toast.error('Failed to load transactions')
      setLoading(false)
    })
  }, [])

  const COLS = ['OR No.', 'Consumer', 'Type', 'Amount', 'Date']

  return (
    <div className="rounded-lg border border-border bg-white overflow-hidden flex flex-col">
      <div className="px-5 pt-5 pb-4 border-b border-border flex items-start justify-between gap-3 shrink-0">
        <div>
          <h3 className="text-sm font-bold text-foreground">Recent Transactions</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Latest payments across all payment types
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {(Object.keys(KIND_CONFIG) as PaymentKind[]).map((k) => {
            const { label, bg, textColor, icon: Icon } = KIND_CONFIG[k]
            return (
              <span key={k} className={cn(
                'hidden sm:inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full',
                bg, textColor,
              )}>
                <Icon className="h-2.5 w-2.5" />
                {label}
              </span>
            )
          })}
          <div className="h-8 w-8 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center shrink-0">
            <Receipt className="h-3.5 w-3.5 text-purple-600" />
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
              [...Array(5)].map((_, i) => <TableRowSkeleton key={i} cols={COLS.length} />)
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={COLS.length} className="h-52 text-center">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                      <Receipt className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">No transactions yet</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              <AnimatePresence>
                {data.map((p, i) => (
                  <motion.tr
                    key={p.id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.22, delay: 0.05 + i * 0.04 }}
                    className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <TableCell className="py-3.5 pl-5">
                      <span className="font-mono text-xs font-bold text-purple-700 bg-purple-50 px-2 py-1 rounded-md">
                        {p.receipt_number}
                      </span>
                    </TableCell>

                    <TableCell className="py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold text-white bg-gradient-to-br from-purple-500 to-violet-600">
                          {p.consumer_name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm font-semibold text-foreground leading-none">
                          {p.consumer_name}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell className="py-3.5">
                      <KindBadge kind={p.kind} />
                    </TableCell>

                    <TableCell className="py-3.5">
                      <span className="font-bold text-sm text-foreground tabular-nums">
                        {formatPHP(p.amount)}
                      </span>
                    </TableCell>

                    <TableCell className="py-3.5 pr-5">
                      <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                        {formatDate(p.payment_date)}
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

export default function DashboardPage() {
  const [stats,   setStats]   = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [animate, setAnimate] = useState(false)

  useEffect(() => {
    getDashboardStats().then((res) => {
      if (res) setStats(res)
      else toast.error('Failed to load stats')
      setLoading(false)
      setTimeout(() => setAnimate(true), 180)
    })
  }, [])

  return (
    <div className="w-full space-y-6 lg:mb-0 mb-10">

      <PageHeading
        title="Dashboard"
        description="Overview of consumption (m³), meter accounts, billing & transactions"
      />

      {/* ── Total consumption across all reading periods ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {loading || !stats ? (
          [...Array(2)].map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard
              label="MEEDO Water Source Consumption (m³)"
              value={stats.totalConsumption}
              displayValue={formatM3(stats.totalConsumption)}
              description="Total across all reading periods"
              icon={Droplets}
              accent="purple"
              isPrimary
              delay={0.04}
              animate={animate}
              href="/admin/billing?tab=history"
            />
            <StatCard
              label="Consumer Usage — Billed (m³)"
              value={stats.totalBilledConsumption}
              displayValue={formatM3(stats.totalBilledConsumption)}
              description="Total across all reading periods"
              icon={Gauge}
              accent="violet"
              delay={0.08}
              animate={animate}
              href="/admin/billing?tab=history"
            />
          </>
        )}
      </div>

      {/* ── Stat Cards (2x2) + Monthly Revenue (right) — even 50/50 split ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-stretch">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {loading || !stats ? (
            [...Array(4)].map((_, i) => <StatCardSkeleton key={i} />)
          ) : (
            <>
              <StatCard
                label="Active Meter Accounts"
                value={stats.activeConnections}
                description="Meter accounts with Active meter"
                icon={Wifi}
                accent="purple"
                isPrimary
                trend={{ label: 'Currently active', up: true }}
                delay={0.05}
                animate={animate}
                href="/admin/meter-account"
              />
              <StatCard
                label="Total Disconnections"
                value={stats.totalDisconnections}
                description="Meter accounts with Disconnected meter"
                icon={WifiOff}
                accent="violet"
                trend={{ label: 'All-time total', up: false }}
                delay={0.12}
                animate={animate}
                href="/admin/notice-disconnection"
              />
              <StatCard
                label="Total Zones"
                value={stats.totalZones}
                description="Active service zones"
                icon={Map}
                accent="indigo"
                trend={{ label: 'Service coverage', up: true }}
                delay={0.19}
                animate={animate}
                href="/admin/location"
              />
              <StatCard
                label="Total Barangays"
                value={stats.totalBarangays}
                description="Covered barangays"
                icon={Building2}
                accent="lavender"
                trend={{ label: 'Coverage area', up: true }}
                delay={0.26}
                animate={animate}
                href="/admin/location"
              />
            </>
          )}
        </div>

        <div>
          <RevenueTrendChart />
        </div>
      </div>

      {/* ── Overdue / Billing Status Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <OverdueBillingChart />
        <BillingStatusChart />
      </div>

      {/* ── Recent Transactions ── */}
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.48, ease: [0.22, 1, 0.36, 1] }}
      >
        <RecentTransactionsTable />
      </motion.div>

    </div>
  )
}