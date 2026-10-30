'use client'

import { PageHeading } from '@/components/shared-ui/page-heading'
import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { CartesianGrid, Line, LineChart, XAxis } from 'recharts'
import { Wallet, CalendarDays, Target, Users, TrendingUp, RefreshCw, ReceiptText, Download } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, CardAction,
} from '@/components/ui/card'
import {
  ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'

import {
  getTreasurerStats,
  getMonthlyCollections,
  getRecentPayments,
  getTreasurerCollectionExport,
  type TreasurerStats,
  type MonthlyCollection,
  type RecentPayment,
} from '@/lib/actions/dashboard/treasurer-dashboard.actions'
import { exportCollectionRowsExcel } from '@/components/treasurer-ui/dashboard/collection-excel-export'

// ─── Formatters ───────────────────────────────────────────────────────────────

const formatPeso = (n: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency', currency: 'PHP', minimumFractionDigits: 2,
  }).format(n)

const formatDate = (d: string) =>
  d ? format(new Date(d), 'MMM dd, yyyy') : '—'

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

// ─── Stat Card ────────────────────────────────────────────────────────────────

type Accent = 'rose' | 'emerald' | 'violet' | 'indigo'

const ACCENTS: Record<Accent, {
  ring: string; icon: string; iconColor: string; val: string; blob: string
}> = {
  rose:     { ring: 'border-rose-200', icon: 'bg-rose-50 border-rose-100', iconColor: 'text-rose-600', val: 'text-rose-700', blob: 'bg-rose-50' },
  emerald:  { ring: 'border-emerald-200', icon: 'bg-emerald-50 border-emerald-100', iconColor: 'text-emerald-600', val: 'text-emerald-700', blob: 'bg-emerald-50' },
  violet:   { ring: 'border-violet-200', icon: 'bg-violet-50 border-violet-100', iconColor: 'text-violet-600', val: 'text-violet-700', blob: 'bg-violet-50' },
  indigo:   { ring: 'border-indigo-200', icon: 'bg-indigo-50 border-indigo-100', iconColor: 'text-indigo-600', val: 'text-indigo-700', blob: 'bg-indigo-50' },
}

function StatCard({
  label, value, isCurrency, suffix, description,
  icon: Icon, accent, isPrimary, delay, animate, footer, href,
}: {
  label: string
  value: number
  isCurrency?: boolean
  suffix?: string
  description: string
  icon: React.ElementType
  accent: Accent
  isPrimary?: boolean
  delay: number
  animate: boolean
  footer?: React.ReactNode
  href?: string
}) {
  const count = useCountUp(value, 1200, animate)
  const a = ACCENTS[accent]
  const display = isCurrency
    ? formatPeso(count)
    : `${count.toLocaleString()}${suffix ?? ''}`

  const card = (
    <div className={cn(
      'relative h-full rounded-lg border overflow-hidden transition-shadow duration-300',
      href && 'hover:shadow-md cursor-pointer',
      isPrimary
        ? accent === 'rose'
          ? 'bg-gradient-to-br from-rose-600 to-rose-700 border-rose-500'
          : 'bg-gradient-to-br from-emerald-600 to-emerald-700 border-emerald-500'
        : `bg-white ${a.ring}`,
    )}>
      <div className={cn('absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-30', isPrimary ? 'bg-white/20' : a.blob)} />
      <div className="relative z-10 p-5 flex flex-col gap-3 h-full">
        <div className="flex items-center justify-between">
          <p className={cn('text-[10px] font-bold tracking-[0.14em] uppercase', isPrimary ? 'text-white/80' : 'text-muted-foreground')}>
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
          <p className={cn('text-xs mt-1.5', isPrimary ? 'text-white/80' : 'text-muted-foreground')}>
            {description}
          </p>
        </div>

        {footer && (
          <div className={cn('mt-auto pt-3 border-t', isPrimary ? 'border-white/20' : 'border-border')}>
            {footer}
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

const collectionChartConfig = {
  needToCollect: { label: 'Not collected', color: 'var(--chart-2)' },
  collected: { label: 'Already collected', color: 'var(--chart-4)' },
  overallTotal: { label: 'Total billing', color: 'var(--chart-1)' },
} satisfies ChartConfig

function monthOptionLabel(key: string) {
  const [y, m] = key.split('-').map(Number)
  if (!y || !m) return key
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

function buildEndMonthOptions(firstMonth: string | null, lastMonth: string | null): string[] {
  if (!firstMonth || !lastMonth) return []
  const out: string[] = []
  let [y, m] = firstMonth.split('-').map(Number)
  const [ey, em] = lastMonth.split('-').map(Number)
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m += 1
    if (m > 12) { m = 1; y += 1 }
    if (out.length > 120) break
  }
  return out
}

function CollectionsChart() {
  const [data, setData] = useState<MonthlyCollection[]>([])
  const [loading, setLoading] = useState(true)
  const [endMonth, setEndMonth] = useState<string>('')
  const [monthOptions, setMonthOptions] = useState<string[]>([])
  const [totals, setTotals] = useState({ needToCollect: 0, collected: 0, overallTotal: 0 })

  const load = useCallback(async (end?: string) => {
    setLoading(true)
    const res = await getMonthlyCollections({
      limit: 5,
      endMonth: end || null,
    })
    if (res.status === 'success') {
      setData(res.data ?? [])
      setTotals(
        res.totals ?? {
          needToCollect: (res.data ?? []).reduce((a, d) => a + d.needToCollect, 0),
          collected: (res.data ?? []).reduce((a, d) => a + d.collected, 0),
          overallTotal: res.data?.length ? res.data[res.data.length - 1].overallTotal : 0,
        },
      )
      const opts = buildEndMonthOptions(res.firstMonth ?? null, res.lastMonth ?? null)
      setMonthOptions(opts)
      if (!end && res.lastMonth) setEndMonth(res.lastMonth)
    } else {
      toast.error(res.message ?? 'Failed to load chart data')
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const sumNeed = totals.needToCollect
  const sumCollected = totals.collected
  // Sum of total_billing across visible reading periods
  const overall = data.reduce((a, d) => a + d.overallTotal, 0) || totals.overallTotal

  return (
    <Card className="h-full rounded-md">
      <CardHeader>
        <CardTitle>Collection Analytics</CardTitle>
        <CardDescription>Collected vs not collected by reading period — up to 5 periods</CardDescription>
        <CardAction>
          <div className="flex items-center gap-1.5">
            <Select
              value={endMonth || undefined}
              onValueChange={(v) => {
                setEndMonth(v)
                load(v)
              }}
              disabled={loading || monthOptions.length === 0}
            >
              <SelectTrigger className="h-8 w-[160px] text-xs">
                <SelectValue placeholder="End month" />
              </SelectTrigger>
              <SelectContent>
                {[...monthOptions].reverse().map((key) => (
                  <SelectItem key={key} value={key} className="text-xs">
                    {monthOptionLabel(key)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => load(endMonth || undefined)} disabled={loading}>
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            </Button>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="aspect-video rounded-lg bg-muted animate-pulse" />
        ) : data.length === 0 ? (
          <div className="flex aspect-video items-center justify-center text-sm text-muted-foreground">
            No collection history yet
          </div>
        ) : (
          <ChartContainer config={collectionChartConfig}>
            <LineChart accessibilityLayer data={data} margin={{ top: 20, left: 12, right: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={(value) => String(value).slice(0, 3)} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Line dataKey="needToCollect" type="natural" stroke="var(--color-needToCollect)" strokeWidth={2} dot={{ fill: 'var(--color-needToCollect)' }} activeDot={{ r: 6 }} />
              <Line dataKey="collected" type="natural" stroke="var(--color-collected)" strokeWidth={2} dot={{ fill: 'var(--color-collected)' }} activeDot={{ r: 6 }} />
              <Line dataKey="overallTotal" type="natural" stroke="var(--color-overallTotal)" strokeWidth={2} dot={{ fill: 'var(--color-overallTotal)' }} activeDot={{ r: 6 }} />
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
      <CardFooter className="flex-col items-start gap-2 text-sm">
        <div className="flex gap-2 leading-none font-medium">
          Not collected {formatPeso(sumNeed)} · Collected {formatPeso(sumCollected)} <TrendingUp className="h-4 w-4" />
        </div>
        <div className="leading-none text-muted-foreground">
          Total billing {formatPeso(overall)}
        </div>
      </CardFooter>
    </Card>
  )
}

function RecentTransactionsTable() {
  const [data, setData] = useState<RecentPayment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getRecentPayments(5).then((res) => {
      if (res.status === 'success') setData(res.data ?? [])
      else toast.error(res.message ?? 'Failed to load transactions')
      setLoading(false)
    })
  }, [])

  const COLS = ['Receipt No.', 'Consumer', 'Meter Serial', 'Amount', 'Date']

  return (
    <div className="rounded-lg border border-border bg-white overflow-hidden flex flex-col h-full">
      <div className="px-5 pt-5 pb-4 border-b border-border flex items-start justify-between gap-3 shrink-0">
        <div>
          <h3 className="text-sm font-bold text-foreground">Recent Billing Payments</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Latest water bill collections</p>
        </div>
        <div className="h-8 w-8 rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center shrink-0">
          <ReceiptText className="h-3.5 w-3.5 text-violet-600" />
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
                <TableCell colSpan={COLS.length} className="h-52 text-center text-sm text-muted-foreground">
                  No billing payments yet
                </TableCell>
              </TableRow>
            ) : (
              <AnimatePresence>
                {data.map((pay, i) => (
                  <motion.tr
                    key={pay.receipt_id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.22, delay: 0.05 + i * 0.04 }}
                    className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <TableCell className="py-3.5 pl-5">
                      <span className="font-mono text-xs font-bold text-violet-700 bg-violet-50 px-2 py-1 rounded-md">
                        {pay.receipt_number}
                      </span>
                    </TableCell>
                    <TableCell className="py-3.5">
                      <p className="text-sm font-semibold text-foreground leading-none">{pay.consumer_name}</p>
                    </TableCell>
                    <TableCell className="py-3.5">
                      <span className="text-xs font-mono text-muted-foreground">{pay.meter_serial_no ?? '—'}</span>
                    </TableCell>
                    <TableCell className="py-3.5">
                      <span className="font-bold text-sm tabular-nums">{formatPeso(pay.amount)}</span>
                    </TableCell>
                    <TableCell className="py-3.5 pr-5">
                      <span className="text-xs text-muted-foreground tabular-nums">{formatDate(pay.payment_date)}</span>
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

export default function TreasurerDashboard() {
  const [stats, setStats] = useState<TreasurerStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [animate, setAnimate] = useState(false)
  const [exporting, setExporting] = useState<'outstanding' | 'collected' | null>(null)

  const loadStats = useCallback(async () => {
    setLoading(true)
    const res = await getTreasurerStats()
    if (res.status === 'success') setStats(res.data ?? null)
    else toast.error(res.message ?? 'Failed to load stats')
    setLoading(false)
    setTimeout(() => setAnimate(true), 180)
  }, [])

  useEffect(() => { loadStats() }, [loadStats])

  const handleExport = async (kind: 'outstanding' | 'collected') => {
    setExporting(kind)
    try {
      const res = await getTreasurerCollectionExport(kind)
      if (res.status === 'error' || !res.data) {
        toast.error(res.message ?? 'Failed to export')
        return
      }
      if (res.data.length === 0) {
        toast.message(
          kind === 'outstanding'
            ? 'No outstanding bills to export for this reading period'
            : 'No collections for this reading period to export',
        )
        return
      }
      exportCollectionRowsExcel({
        kind,
        periodLabel: res.periodLabel ?? stats?.periodLabel ?? 'Reading period',
        rows: res.data,
      })
      toast.success(`Exported ${res.data.length} row(s)`)
    } catch {
      toast.error('Export failed')
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="w-full space-y-6">
      <PageHeading
        title="Treasurer Dashboard"
        description={`Current meter bills (${stats?.periodLabel ?? '—'}) — need, collected & total`}
      />
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="flex items-start justify-between gap-3 flex-wrap"
      >
        <div className="flex items-center gap-2 flex-wrap ml-auto">
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-md text-xs gap-1.5 border-rose-200 text-rose-700 hover:bg-rose-50"
            disabled={!!exporting}
            onClick={() => handleExport('outstanding')}
          >
            {exporting === 'outstanding' ? <Spinner /> : <Download className="h-3.5 w-3.5" />}
            Export need to collect
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-md text-xs gap-1.5 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
            disabled={!!exporting}
            onClick={() => handleExport('collected')}
          >
            {exporting === 'collected' ? <Spinner /> : <Download className="h-3.5 w-3.5" />}
            Export collected
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg"
            onClick={loadStats}
            disabled={loading}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </Button>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {loading || !stats ? (
          [...Array(4)].map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard
              label="Need to Collect"
              value={stats.needToCollectThisMonth}
              isCurrency
              description="Outstanding remaining on current meter bills"
              icon={Target}
              accent="rose"
              isPrimary
              delay={0.05}
              animate={animate}
              href="/treasurer/payment-billing"
              footer={
                <p className="text-[11px] text-white/85 flex items-center gap-1.5">
                  <Users className="h-3 w-3" />
                  {stats.outstandingAccounts} account{stats.outstandingAccounts !== 1 ? 's' : ''} still unpaid
                </p>
              }
            />
            <StatCard
              label="Already Collected"
              value={stats.collectedThisMonth}
              isCurrency
              description="Payments applied to current meter bills"
              icon={Wallet}
              accent="emerald"
              isPrimary
              delay={0.12}
              animate={animate}
              href="/treasurer/transactions"
              footer={
                <p className="text-[11px] text-white/85 flex items-center gap-1.5">
                  <TrendingUp className="h-3 w-3" />
                  {stats.paidAccountsThisMonth} account{stats.paidAccountsThisMonth !== 1 ? 's' : ''} paid
                </p>
              }
            />
            <StatCard
              label="Outstanding Accounts"
              value={stats.outstandingAccounts}
              description="Meter accounts with unpaid/partial current bills"
              icon={Users}
              accent="violet"
              delay={0.19}
              animate={animate}
              href="/treasurer/payment-billing"
            />
            <StatCard
              label="Total Amount"
              value={stats.totalBillingAmount}
              isCurrency
              description="Total billing on current meter-account bills"
              icon={CalendarDays}
              accent="indigo"
              delay={0.26}
              animate={animate}
              href="/treasurer/payment-billing"
              footer={
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  {formatPeso(stats.collectedThisMonth)} collected · {formatPeso(stats.needToCollectThisMonth)} need to collect
                </p>
              }
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
        <CollectionsChart />
        <RecentTransactionsTable />
      </div>
    </div>
  )
}
