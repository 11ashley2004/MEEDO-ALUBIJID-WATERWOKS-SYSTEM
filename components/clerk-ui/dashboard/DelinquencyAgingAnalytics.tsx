'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts'
import {
  AlertTriangle,
  CalendarClock,
  Eye,
  FileWarning,
  Filter,
  RefreshCw,
  Users,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import {
  getClerkDelinquencyAnalytics,
  type AgingBucket,
  type DelinquencyAnalytics,
  type DelinquentAccountRow,
} from '@/lib/actions/dashboard/clerk-delinquency.actions'

// ─── Formatters ───────────────────────────────────────────────────────────────

const formatPHP = (v: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(v)

const BUCKET_COLORS: Record<AgingBucket, string> = {
  '0-30': '#c4b5fd',
  '31-60': '#a78bfa',
  '61-90': '#8b5cf6',
  '90+': '#e11d48',
}

const agingChartConfig = {
  count: { label: 'Accounts', color: '#8b5cf6' },
  '0-30': { label: '0–30 days', color: BUCKET_COLORS['0-30'] },
  '31-60': { label: '31–60 days', color: BUCKET_COLORS['31-60'] },
  '61-90': { label: '61–90 days', color: BUCKET_COLORS['61-90'] },
  '90+': { label: '90+ days', color: BUCKET_COLORS['90+'] },
  averageUnpaidDays: { label: 'Avg unpaid days', color: '#7c3aed' },
} satisfies ChartConfig

function bucketBadgeClass(bucket: AgingBucket) {
  switch (bucket) {
    case '90+':
      return 'bg-rose-50 text-rose-700 border-rose-200'
    case '61-90':
      return 'bg-violet-50 text-violet-700 border-violet-200'
    case '31-60':
      return 'bg-purple-50 text-purple-700 border-purple-200'
    default:
      return 'bg-slate-50 text-slate-600 border-slate-200'
  }
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  accent,
  delay,
}: {
  label: string
  value: string
  hint: string
  icon: React.ElementType
  accent: 'primary' | 'violet' | 'indigo' | 'rose'
  delay: number
}) {
  const styles = {
    primary: {
      wrap: 'bg-gradient-to-br from-purple-600 to-violet-700 border-purple-500 text-white',
      icon: 'bg-white/20 border-white/30 text-white',
      hint: 'text-purple-100',
      label: 'text-purple-100',
    },
    violet: {
      wrap: 'bg-white border-violet-200',
      icon: 'bg-violet-50 border-violet-100 text-violet-600',
      hint: 'text-muted-foreground',
      label: 'text-muted-foreground',
    },
    indigo: {
      wrap: 'bg-white border-indigo-200',
      icon: 'bg-indigo-50 border-indigo-100 text-indigo-600',
      hint: 'text-muted-foreground',
      label: 'text-muted-foreground',
    },
    rose: {
      wrap: 'bg-white border-rose-200',
      icon: 'bg-rose-50 border-rose-100 text-rose-600',
      hint: 'text-muted-foreground',
      label: 'text-muted-foreground',
    },
  }[accent]

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      className={cn('rounded-lg border p-5 overflow-hidden relative', styles.wrap)}
    >
      <div className="flex items-start justify-between gap-3 relative z-10">
        <div className="min-w-0">
          <p className={cn('text-[10px] font-bold tracking-[0.14em] uppercase', styles.label)}>
            {label}
          </p>
          <p
            className={cn(
              'mt-2 font-extrabold tracking-tight tabular-nums leading-none',
              accent === 'primary' ? 'text-2xl text-white' : 'text-2xl text-foreground',
            )}
          >
            {value}
          </p>
          <p className={cn('text-xs mt-1.5', styles.hint)}>{hint}</p>
        </div>
        <div
          className={cn(
            'h-9 w-9 rounded-xl border flex items-center justify-center shrink-0',
            styles.icon,
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </motion.div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DelinquencyAgingAnalytics() {
  const router = useRouter()
  const [data, setData] = useState<DelinquencyAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [barangay, setBarangay] = useState<string>('all')
  const [zone, setZone] = useState<string>('all')
  const [bucket, setBucket] = useState<string>('all')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await getClerkDelinquencyAnalytics()
    if (res.status === 'success' && res.data) {
      setData(res.data)
    } else {
      toast.error(res.message ?? 'Failed to load delinquency analytics')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filteredAccounts: DelinquentAccountRow[] = useMemo(() => {
    if (!data) return []
    return data.accounts.filter((a) => {
      if (barangay !== 'all' && a.barangay_name !== barangay) return false
      if (zone !== 'all' && a.zone_name !== zone) return false
      if (bucket !== 'all' && a.aging_bucket !== bucket) return false
      return true
    })
  }, [data, barangay, zone, bucket])

  const filteredKpis = useMemo(() => {
    const list = filteredAccounts
    const totalUnpaidAccounts = list.length
    const totalOverdueBalance =
      Math.round(list.reduce((s, a) => s + a.outstanding_balance, 0) * 100) / 100
    const averageUnpaidDays =
      totalUnpaidAccounts === 0
        ? 0
        : Math.round((list.reduce((s, a) => s + a.unpaid_days, 0) / totalUnpaidAccounts) * 10) / 10
    const highRiskAccounts = list.filter((a) => a.unpaid_days >= 90).length
    return { totalUnpaidAccounts, totalOverdueBalance, averageUnpaidDays, highRiskAccounts }
  }, [filteredAccounts])

  const filteredAging = useMemo(() => {
    const buckets: AgingBucket[] = ['0-30', '31-60', '61-90', '90+']
    const labels: Record<AgingBucket, string> = {
      '0-30': 'Current (0–30)',
      '31-60': '31–60 days',
      '61-90': '61–90 days',
      '90+': '90+ days',
    }
    return buckets.map((b) => {
      const rows = filteredAccounts.filter((a) => a.aging_bucket === b)
      return {
        bucket: b,
        label: labels[b],
        count: rows.length,
        balance: Math.round(rows.reduce((s, a) => s + a.outstanding_balance, 0) * 100) / 100,
      }
    })
  }, [filteredAccounts])

  const filteredZoneAging = useMemo(() => {
    if (!data) return []
    const map = new Map<
      string,
      {
        label: string
        '0-30': number
        '31-60': number
        '61-90': number
        '90+': number
        total: number
      }
    >()
    for (const a of filteredAccounts) {
      const label = a.barangay_name !== '—' ? a.barangay_name : a.zone_name
      if (!map.has(label)) {
        map.set(label, { label, '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0, total: 0 })
      }
      const row = map.get(label)!
      row[a.aging_bucket] += 1
      row.total += 1
    }
    return Array.from(map.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
  }, [data, filteredAccounts])

  const clearFilters = () => {
    setBarangay('all')
    setZone('all')
    setBucket('all')
  }

  const hasFilters = barangay !== 'all' || zone !== 'all' || bucket !== 'all'

  return (
    <div className="space-y-5">
      {/* Section header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-rose-500 to-violet-700 flex items-center justify-center shrink-0 shadow-sm">
            <CalendarClock className="h-4 w-4 text-white" />
          </div>
          <div>
            <h2 className="text-base font-extrabold tracking-tight text-foreground">
              Meter Account Unpaid Days &amp; Delinquency Aging
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Monitor overdue accounts and prioritize collection or disconnection notices
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 rounded-md text-xs gap-1.5"
          onClick={load}
          disabled={loading}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {loading || !data ? (
          [...Array(4)].map((_, i) => (
            <div key={i} className="rounded-lg border bg-white p-5 space-y-3">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-3 w-40" />
            </div>
          ))
        ) : (
          <>
            <KpiCard
              label="Total Unpaid Accounts"
              value={filteredKpis.totalUnpaidAccounts.toLocaleString()}
              hint="Open unpaid / partial current bills"
              icon={Users}
              accent="primary"
              delay={0.04}
            />
            <KpiCard
              label="Total Overdue Balance"
              value={formatPHP(filteredKpis.totalOverdueBalance)}
              hint="Sum of remaining balances past due"
              icon={Wallet}
              accent="violet"
              delay={0.1}
            />
            <KpiCard
              label="Average Unpaid Days"
              value={`${filteredKpis.averageUnpaidDays}`}
              hint="Mean days past due across delinquents"
              icon={CalendarClock}
              accent="indigo"
              delay={0.16}
            />
            <KpiCard
              label="High-Risk Accounts"
              value={filteredKpis.highRiskAccounts.toLocaleString()}
              hint="90+ days overdue"
              icon={AlertTriangle}
              accent="rose"
              delay={0.22}
            />
          </>
        )}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Aging distribution — donut */}
        <div className="rounded-lg border border-border bg-white overflow-hidden flex flex-col">
          <div className="px-5 pt-5 pb-3 border-b border-border">
            <h3 className="text-sm font-bold text-foreground">Delinquency Aging Distribution</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Accounts by days past due</p>
          </div>
          <div className="p-4 flex-1 min-h-[260px]">
            {loading || !data ? (
              <Skeleton className="h-full w-full rounded-lg" />
            ) : (
              <ChartContainer config={agingChartConfig} className="h-[240px] w-full aspect-auto">
                <PieChart>
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value, name) => (
                          <span className="font-semibold tabular-nums">
                            {value} acct · {String(name)}
                          </span>
                        )}
                      />
                    }
                  />
                  <Pie
                    data={filteredAging}
                    dataKey="count"
                    nameKey="label"
                    innerRadius={52}
                    outerRadius={82}
                    strokeWidth={2}
                    stroke="#fff"
                  >
                    {filteredAging.map((row) => (
                      <Cell key={row.bucket} fill={BUCKET_COLORS[row.bucket]} />
                    ))}
                  </Pie>
                  <ChartLegend content={<ChartLegendContent nameKey="label" />} />
                </PieChart>
              </ChartContainer>
            )}
          </div>
        </div>

        {/* Unpaid days trend — line */}
        <div className="rounded-lg border border-border bg-white overflow-hidden flex flex-col xl:col-span-2">
          <div className="px-5 pt-5 pb-3 border-b border-border">
            <h3 className="text-sm font-bold text-foreground">Unpaid Days Trend</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Average unpaid days — last 6 months
            </p>
          </div>
          <div className="p-4 flex-1 min-h-[260px]">
            {loading || !data ? (
              <Skeleton className="h-full w-full rounded-lg" />
            ) : (
              <ChartContainer config={agingChartConfig} className="h-[240px] w-full aspect-auto">
                <LineChart data={data.unpaidDaysTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="4 4" />
                  <XAxis
                    dataKey="month"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tickFormatter={(v) => String(v).slice(0, 3)}
                  />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line
                    type="monotone"
                    dataKey="averageUnpaidDays"
                    stroke="var(--color-averageUnpaidDays)"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: 'var(--color-averageUnpaidDays)' }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ChartContainer>
            )}
          </div>
        </div>
      </div>

      {/* Zone stacked bar */}
      <div className="rounded-lg border border-border bg-white overflow-hidden">
        <div className="px-5 pt-5 pb-3 border-b border-border">
          <h3 className="text-sm font-bold text-foreground">Unpaid Days by Zone / Barangay</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Overdue account concentration by aging bucket
          </p>
        </div>
        <div className="p-4 min-h-[280px]">
          {loading || !data ? (
            <Skeleton className="h-[240px] w-full rounded-lg" />
          ) : filteredZoneAging.length === 0 ? (
            <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground">
              No overdue accounts for the current filters
            </div>
          ) : (
            <ChartContainer config={agingChartConfig} className="h-[260px] w-full aspect-auto">
              <BarChart data={filteredZoneAging} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="4 4" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="0-30" stackId="a" fill="var(--color-0-30)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="31-60" stackId="a" fill="var(--color-31-60)" />
                <Bar dataKey="61-90" stackId="a" fill="var(--color-61-90)" />
                <Bar dataKey="90+" stackId="a" fill="var(--color-90+)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          )}
        </div>
      </div>

      {/* Filters + table */}
      <div className="rounded-lg border border-border bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
          <div>
            <h3 className="text-sm font-bold text-foreground">Delinquent Accounts</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {filteredAccounts.length} account{filteredAccounts.length !== 1 ? 's' : ''} matching filters
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Filter className="h-3.5 w-3.5" />
              Filters
            </div>

            <Select value={barangay} onValueChange={setBarangay}>
              <SelectTrigger className="h-8 w-[150px] text-xs rounded-md">
                <SelectValue placeholder="Barangay" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All barangays</SelectItem>
                {(data?.filters.barangays ?? []).map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={zone} onValueChange={setZone}>
              <SelectTrigger className="h-8 w-[140px] text-xs rounded-md">
                <SelectValue placeholder="Zone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All zones</SelectItem>
                {(data?.filters.zones ?? []).map((z) => (
                  <SelectItem key={z} value={z}>
                    {z}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={bucket} onValueChange={setBucket}>
              <SelectTrigger className="h-8 w-[150px] text-xs rounded-md">
                <SelectValue placeholder="Aging bucket" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All aging</SelectItem>
                <SelectItem value="0-30">Current (0–30)</SelectItem>
                <SelectItem value="31-60">31–60 days</SelectItem>
                <SelectItem value="61-90">61–90 days</SelectItem>
                <SelectItem value="90+">90+ days</SelectItem>
              </SelectContent>
            </Select>

            {hasFilters && (
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearFilters}>
                Clear
              </Button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                {[
                  'Contract No.',
                  'Consumer',
                  'Location',
                  'Unpaid Days',
                  'Outstanding',
                  'Aging',
                  'Actions',
                ].map((h) => (
                  <TableHead
                    key={h}
                    className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide whitespace-nowrap"
                  >
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(7)].map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filteredAccounts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-40 text-center text-sm text-muted-foreground">
                    No delinquent accounts found
                  </TableCell>
                </TableRow>
              ) : (
                filteredAccounts.slice(0, 50).map((a) => (
                  <TableRow key={a.billing_id} className="hover:bg-muted/30">
                    <TableCell>
                      <span className="font-mono text-xs font-bold text-purple-700 bg-purple-50 px-2 py-1 rounded-md">
                        {a.contract_no}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-semibold text-foreground">{a.consumer_name}</span>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs text-muted-foreground leading-tight">
                        <p className="font-medium text-slate-700">{a.barangay_name}</p>
                        <p>{a.zone_name}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-bold tabular-nums text-foreground">
                        {a.unpaid_days}
                      </span>
                      <span className="text-[11px] text-muted-foreground ml-1">days</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-bold tabular-nums">
                        {formatPHP(a.outstanding_balance)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn('text-[10px] font-semibold', bucketBadgeClass(a.aging_bucket))}
                      >
                        {a.aging_bucket === '0-30' ? '0–30' : a.aging_bucket}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-[11px] gap-1 rounded-md"
                          onClick={() =>
                            router.push(`/clerk/meter-account/${a.meter_account_id}`)
                          }
                          title="View bill / account"
                        >
                          <Eye className="h-3 w-3" />
                          Bill
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 px-2 text-[11px] gap-1 rounded-md bg-rose-600 hover:bg-rose-700 text-white"
                          onClick={() => router.push('/clerk/notice-disconnection')}
                          title="Issue notice"
                        >
                          <FileWarning className="h-3 w-3" />
                          Notice
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {!loading && filteredAccounts.length > 50 && (
          <div className="px-5 py-3 border-t border-border text-[11px] text-muted-foreground">
            Showing top 50 of {filteredAccounts.length} accounts (sorted by unpaid days)
          </div>
        )}
      </div>
    </div>
  )
}

export default DelinquencyAgingAnalytics
