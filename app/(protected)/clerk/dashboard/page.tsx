'use client'

import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'


import { TablePagination } from '@/components/shared-ui/pagination'
import { PageHeading } from '@/components/shared-ui/page-heading'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts'
import {
  AlertTriangle,
  Droplets,
  Gauge,
  Search,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
} from '@/components/ui/card'
import {
  ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  getClerkDashboardData,
  type ClerkDashboardData,
  type UnpaidAccountRow,
} from '@/lib/actions/dashboard/clerk-dashboard.actions'

// ─── Formatters ───────────────────────────────────────────────────────────────

const formatPHP = (v: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(v)

const formatM3 = (v: number) =>
  `${new Intl.NumberFormat('en-PH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(v)} m³`

const formatDate = (d: string | null) =>
  d
    ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : '—'

const PAGE_SIZE = 10

const consumptionChartConfig = {
  consumption: { label: 'Source (m³)', color: 'var(--chart-1)' },
  billedConsumption: { label: 'Billed (m³)', color: 'var(--chart-3)' },
} satisfies ChartConfig

const moneyChartConfig = {
  billed: { label: 'Billed (₱)', color: 'var(--chart-1)' },
  collected: { label: 'Collected (₱)', color: 'var(--chart-3)' },
} satisfies ChartConfig

function monthTick(value: string) {
  return String(value).slice(0, 3)
}

// ─── Counter animation ────────────────────────────────────────────────────────

function useCountUp(target: number, duration = 1100, enabled = false) {
  const [value, setValue] = useState(0)
  const raf = useRef<number | null>(null)
  useEffect(() => {
    if (!enabled) return
    if (target === 0) {
      setValue(0)
      return
    }
    const t0 = performance.now()
    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1)
      setValue((1 - Math.pow(1 - p, 3)) * target)
      if (p < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current)
    }
  }, [target, duration, enabled])
  return value
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

type Accent = 'purple' | 'violet' | 'indigo' | 'lavender'

const ACCENTS: Record<
  Accent,
  { ring: string; icon: string; iconColor: string; val: string; blob: string }
> = {
  purple: {
    ring: 'border-purple-200',
    icon: 'bg-purple-50 border-purple-100',
    iconColor: 'text-purple-600',
    val: 'text-purple-700',
    blob: 'bg-purple-50',
  },
  violet: {
    ring: 'border-violet-200',
    icon: 'bg-violet-50 border-violet-100',
    iconColor: 'text-violet-600',
    val: 'text-violet-700',
    blob: 'bg-violet-50',
  },
  indigo: {
    ring: 'border-indigo-200',
    icon: 'bg-indigo-50 border-indigo-100',
    iconColor: 'text-indigo-600',
    val: 'text-indigo-700',
    blob: 'bg-indigo-50',
  },
  lavender: {
    ring: 'border-purple-100',
    icon: 'bg-purple-50/80 border-purple-100',
    iconColor: 'text-purple-500',
    val: 'text-purple-700',
    blob: 'bg-purple-50',
  },
}

function StatCard({
  label,
  value,
  displayValue,
  description,
  icon: Icon,
  accent,
  isPrimary,
  delay,
  animate,
  href,
}: {
  label: string
  value: number
  displayValue?: string
  description: string
  icon: React.ElementType
  accent: Accent
  isPrimary?: boolean
  delay: number
  animate: boolean
  href?: string
}) {
  const count = useCountUp(value, 1100, animate && !displayValue)
  const a = ACCENTS[accent]
  const display =
    displayValue ??
    (Number.isInteger(value)
      ? Math.round(count).toLocaleString()
      : count.toLocaleString(undefined, { maximumFractionDigits: 2 }))

  const card = (
    <div
      className={cn(
        'relative h-full rounded-md border overflow-hidden transition-shadow duration-300',
        href && 'hover:shadow-md cursor-pointer',
        isPrimary
          ? 'bg-gradient-to-br from-purple-600 to-violet-700 border-purple-500'
          : `bg-white ${a.ring}`,
      )}
    >
      <div
        className={cn(
          'absolute -top-10 -right-8 w-28 h-28 rounded-full opacity-25',
          isPrimary ? 'bg-white/20' : a.blob,
        )}
      />

      <div className="relative z-10 p-4 sm:p-5 flex flex-col gap-3 h-full min-h-[132px]">
        <div className="flex items-start justify-between gap-2">
          <p
            className={cn(
              'text-[10px] font-bold tracking-[0.12em] uppercase leading-snug pr-1',
              isPrimary ? 'text-purple-100' : 'text-muted-foreground',
            )}
          >
            {label}
          </p>
          <div
            className={cn(
              'h-8 w-8 rounded-md flex items-center justify-center shrink-0 border',
              isPrimary ? 'bg-white/20 border-white/30' : a.icon,
            )}
          >
            <Icon className={cn('h-4 w-4', isPrimary ? 'text-white' : a.iconColor)} />
          </div>
        </div>

        <div className="mt-auto">
          <p
            className={cn(
              'font-extrabold tracking-tight tabular-nums leading-none break-all',
              (displayValue ?? '').length > 16 ? 'text-lg sm:text-xl' : 'text-xl sm:text-2xl',
              isPrimary ? 'text-white' : a.val,
            )}
          >
            {display}
          </p>
          <p
            className={cn(
              'text-xs mt-2 leading-snug',
              isPrimary ? 'text-purple-100/90' : 'text-muted-foreground',
            )}
          >
            {description}
          </p>
        </div>
      </div>
    </div>
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      className="h-full"
    >
      {href ? (
        <Link href={href} className="block h-full rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
          {card}
        </Link>
      ) : card}
    </motion.div>
  )
}

function StatCardSkeleton() {
  return (
    <div className="rounded-md border bg-white p-5 space-y-4 min-h-[132px]">
      <div className="flex justify-between items-center">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-8 w-8 rounded-md" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-3 w-40" />
      </div>
    </div>
  )
}

function TableRowSkeleton({ cols }: { cols: number }) {
  return (
    <TableRow>
      {[...Array(cols)].map((_, i) => (
        <TableCell key={i} className="py-3.5">
          <Skeleton className="h-4 w-full rounded-md" />
        </TableCell>
      ))}
    </TableRow>
  )
}


// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [data, setData] = useState<ClerkDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [animate, setAnimate] = useState(false)

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedSearch(search)
  const [page, setPage] = useState(1)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await getClerkDashboardData()
    if (res.status === 'success' && res.data) {
      setData(res.data)
      setAnimate(false)
      setTimeout(() => setAnimate(true), 100)
    } else {
      toast.error(res.message ?? 'Failed to load dashboard')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch])

  const filteredUnpaid: UnpaidAccountRow[] = useMemo(() => {
    if (!data) return []
    const q = debouncedSearch.trim().toLowerCase()
    if (!q) return data.unpaidAccounts
    return data.unpaidAccounts.filter(
      (a) =>
        a.contract_no.toLowerCase().includes(q) ||
        a.account_name.toLowerCase().includes(q) ||
        a.zone_name.toLowerCase().includes(q) ||
        a.barangay_name.toLowerCase().includes(q) ||
        a.classification_name.toLowerCase().includes(q),
    )
  }, [data, debouncedSearch])

  const totalPages = Math.max(1, Math.ceil(filteredUnpaid.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pagedUnpaid = filteredUnpaid.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  )

  const kpis = data?.kpis
  const TABLE_COLS = [
    'Contract No.',
    'Account Name',
    'Zone / Barangay',
    'Classification',
    'Oldest Unpaid Period',
    'Due Date',
    'Unpaid Days',
    'Months Unpaid',
    'Outstanding (₱)',
  ]

  return (
    <div className="w-full space-y-4 lg:space-y-5 lg:mb-0 mb-15">
      <PageHeading
        title="Dashboard"
        description={
          kpis
            ? `Consumption, billing & collections · ${kpis.periodLabel}`
            : 'Consumption, billing & collections'
        }
      />
      {/* ── KPI cards — 4 metrics ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {loading || !kpis ? (
          [...Array(4)].map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard
              label="MEEDO Water Source Consumption (m³)"
              value={kpis.totalConsumption}
              displayValue={formatM3(kpis.totalConsumption)}
              description="Total metered consumption"
              icon={Droplets}
              accent="purple"
              isPrimary
              delay={0.04}
              animate={animate}
              href="/clerk/billing"
            />
            <StatCard
              label="Consumer Usage — Billed (m³)"
              value={kpis.totalBilledConsumption}
              displayValue={formatM3(kpis.totalBilledConsumption)}
              description="Total billed consumption"
              icon={Gauge}
              accent="violet"
              delay={0.08}
              animate={animate}
              href="/clerk/billing"
            />
            <StatCard
              label="Total Collected (₱)"
              value={kpis.totalCollected}
              displayValue={formatPHP(kpis.totalCollected)}
              description="Payments on consumer bills"
              icon={Wallet}
              accent="lavender"
              delay={0.12}
              animate={animate}
              href="/clerk/billing?tab=history"
            />
            <StatCard
              label="Total Collectibles (₱)"
              value={kpis.totalOutstanding}
              displayValue={formatPHP(kpis.totalOutstanding)}
              description="Unpaid & partial balances still to collect"
              icon={AlertTriangle}
              accent="violet"
              delay={0.16}
              animate={animate}
              href="/clerk/billing?tab=history"
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-stretch">
        <Card className="h-full rounded-md">
          <CardHeader>
            <CardTitle>Consumption vs Billed Consumption</CardTitle>
            <CardDescription>Per reading period (m³) — last 12 periods</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="aspect-video rounded-lg bg-muted animate-pulse" />
            ) : !data?.consumptionByPeriod.length ? (
              <div className="flex aspect-video items-center justify-center text-sm text-muted-foreground">
                No consumption data yet
              </div>
            ) : (
              <ChartContainer config={consumptionChartConfig}>
                <BarChart accessibilityLayer data={data.consumptionByPeriod}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="month" tickLine={false} tickMargin={10} axisLine={false} tickFormatter={monthTick} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar dataKey="consumption" fill="var(--color-consumption)" radius={4} />
                  <Bar dataKey="billedConsumption" fill="var(--color-billedConsumption)" radius={4} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
          <CardFooter className="flex-col items-start gap-2 text-sm">
            <div className="flex gap-2 leading-none font-medium">
              Source and billed consumption <TrendingUp className="h-4 w-4" />
            </div>
            <div className="leading-none text-muted-foreground">Last 12 reading periods</div>
          </CardFooter>
        </Card>

        <Card className="h-full rounded-md">
          <CardHeader>
            <CardTitle>Billed vs Collected</CardTitle>
            <CardDescription>Amount (₱) per reading period — last 12</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="aspect-video rounded-lg bg-muted animate-pulse" />
            ) : !data?.billedVsCollected.length ? (
              <div className="flex aspect-video items-center justify-center text-sm text-muted-foreground">
                No billed / collected data
              </div>
            ) : (
              <ChartContainer config={moneyChartConfig}>
                <BarChart accessibilityLayer data={data.billedVsCollected}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="month" tickLine={false} tickMargin={10} axisLine={false} tickFormatter={monthTick} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar dataKey="billed" fill="var(--color-billed)" radius={4} />
                  <Bar dataKey="collected" fill="var(--color-collected)" radius={4} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
          <CardFooter className="flex-col items-start gap-2 text-sm">
            <div className="flex gap-2 leading-none font-medium">
              Billed and collected amounts <TrendingUp className="h-4 w-4" />
            </div>
            <div className="leading-none text-muted-foreground">Last 12 reading periods</div>
          </CardFooter>
        </Card>
      </div>

      {/* ── Unpaid days table ── */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-md border border-border bg-white overflow-hidden flex flex-col shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
      >
        <div className="px-4 sm:px-5 py-4 border-b border-border/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-purple-50/40 to-transparent">
          <div className="flex items-start gap-3 min-w-0">
            <div className="h-8 w-8 rounded-md bg-purple-50 border border-purple-100 flex items-center justify-center shrink-0">
              <Users className="h-3.5 w-3.5 text-purple-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">
                Total Unpaid Days per Meter Account
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Fully unpaid accounts only (excludes partial &amp; paid) — highest days first
              </p>
            </div>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search account, zone, class…"
              className="h-8 pl-8 text-xs rounded-md"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                {TABLE_COLS.map((h, i) => (
                  <TableHead
                    key={h}
                    className={cn(
                      'text-[11px] font-bold text-muted-foreground uppercase tracking-wide whitespace-nowrap',
                      i === 0 && 'pl-5',
                      i === TABLE_COLS.length - 1 && 'pr-5',
                    )}
                  >
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <TableRowSkeleton key={i} cols={TABLE_COLS.length} />
                ))
              ) : pagedUnpaid.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={TABLE_COLS.length} className="h-48 text-center">
                    <div className="flex flex-col items-center justify-center gap-2 py-6">
                      <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center">
                        <Users className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        No unpaid meter accounts
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                <AnimatePresence>
                  {pagedUnpaid.map((a, i) => (
                    <motion.tr
                      key={a.meter_account_id}
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2, delay: 0.02 + i * 0.025 }}
                      className="border-b border-border last:border-0 hover:bg-purple-50/40 transition-colors"
                    >
                      <TableCell className="py-3.5 pl-5">
                        <span className="font-mono text-xs font-bold text-purple-700 bg-purple-50 px-2 py-1 rounded-md border border-purple-100">
                          {a.contract_no}
                        </span>
                      </TableCell>
                      <TableCell className="py-3.5">
                        <span className="text-sm font-semibold text-foreground">
                          {a.account_name}
                        </span>
                      </TableCell>
                      <TableCell className="py-3.5">
                        <div className="text-xs leading-tight">
                          <p className="font-medium text-foreground">{a.zone_name}</p>
                          <p className="text-muted-foreground">{a.barangay_name}</p>
                        </div>
                      </TableCell>
                      <TableCell className="py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                        {a.classification_name}
                      </TableCell>
                      <TableCell className="py-3.5 text-xs font-medium whitespace-nowrap">
                        {a.oldest_unpaid_period}
                      </TableCell>
                      <TableCell className="py-3.5 text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                        {formatDate(a.due_date)}
                      </TableCell>
                      <TableCell className="py-3.5 text-xs font-bold tabular-nums">
                        {a.unpaid_days}
                      </TableCell>
                      <TableCell className="py-3.5 text-xs font-semibold tabular-nums">
                        {a.months_unpaid}
                      </TableCell>
                      <TableCell className="py-3.5 pr-5 text-sm font-bold tabular-nums whitespace-nowrap">
                        {formatPHP(a.outstanding_balance)}
                      </TableCell>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              )}
            </TableBody>
          </Table>
        </div>

        {!loading && (
          <TablePagination
            page={safePage}
            pageSize={PAGE_SIZE}
            total={filteredUnpaid.length}
            onPageChange={setPage}
          />
        )}
      </motion.div>
    </div>
  )
}
