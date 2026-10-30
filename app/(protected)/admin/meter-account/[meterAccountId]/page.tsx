'use client'

import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'


import { TablePagination } from '@/components/shared-ui/pagination'
import { PageHeading } from '@/components/shared-ui/page-heading'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  Search,
  Receipt,
  MoreHorizontal,
  Eye,
  Gauge,
  Droplets,
  ArrowLeft,
  X,
  Building2,
  MapPin,
  Wallet,
  CheckCircle2,
  Clock,
  UserRound,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  getBillingsByMeterAccount,
  type BillingRecord,
} from '@/lib/actions/billing/all-billing.actions'
import {
  getMeterAccountDetails,
  type MeterAccountDetails,
} from '@/lib/actions/consumer/consumer.actions'
import { BillingViewDialog } from '@/components/admin-ui/billing/BillingViewDialog'

// ─── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]
const PANEL = 'bg-white border border-slate-200 rounded-md'
const TABLE_COLUMN_COUNT = 10 // Period, Prev, Present, Consumption, Reading Date, Meter Reader, Due Date, Total Bill, Status, Actions

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatPeso(amount: number): string {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount)
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

function getStatusBadgeClass(status: string): string {
  switch (status.toLowerCase()) {
    case 'paid': return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    case 'partial': return 'bg-blue-50 text-blue-700 border-blue-200'
    case 'forwarded': return 'bg-violet-50 text-violet-700 border-violet-200'
    default: return 'bg-amber-50 text-amber-700 border-amber-200'
  }
}

function getPeriodLabel(periodStart: string): string {
  if (!periodStart) return '-'
  const [y, m] = periodStart.split('-').map(Number)
  return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

// ─── Skeleton Row ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <TableRow>
      {[...Array(TABLE_COLUMN_COUNT)].map((_, i) => (
        <TableCell key={i} className="py-3">
          <div className="h-3.5 w-full bg-slate-100 animate-pulse rounded-full" />
        </TableCell>
      ))}
    </TableRow>
  )
}

// ─── Header Skeleton ──────────────────────────────────────────────────────────

function HeaderSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded-md" />
        <Skeleton className="h-6 w-48 rounded-md" />
      </div>
      <Skeleton className="h-24 w-full rounded-md" />
      <div className="grid grid-cols-3 gap-3">
        <Skeleton className="h-20 rounded-md" />
        <Skeleton className="h-20 rounded-md" />
        <Skeleton className="h-20 rounded-md" />
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

const MeterAccountDetailPage = () => {
  const params = useParams()
  const router = useRouter()
  
  // Updated to match the dynamic route parameter name
  const meterAccountId = params?.meterAccountId as string | undefined

  const [meterAccount, setMeterAccount] = useState<MeterAccountDetails | null>(null)
  const [records, setRecords] = useState<BillingRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedSearch(search)
  const [searchFocused, setSearchFocused] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // ── Fetch data ──────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    // Guard: without this, a missing/mismatched route param would leave the
    // page stuck on the skeleton forever, since isLoading would never flip.
    if (!meterAccountId) {
      setIsLoading(false)
      setNotFound(true)
      return
    }

    setIsLoading(true)
    setNotFound(false)

    try {
      const [detailsRes, billingsRes] = await Promise.all([
        getMeterAccountDetails(meterAccountId),
        getBillingsByMeterAccount(meterAccountId),
      ])

      if (!detailsRes) {
        setNotFound(true)
        setMeterAccount(null)
        setRecords([])
        return
      }
      setMeterAccount(detailsRes)

      if (billingsRes.status === 'success' && billingsRes.data) {
        // Server already sorts by reading period (latest first); keep as-is.
        setRecords(billingsRes.data)
      } else {
        setRecords([])
        toast.error('Failed to load billing records')
      }
    } catch (err) {
      console.error('[MeterAccountDetailPage] fetchData error:', err)
      toast.error('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }, [meterAccountId])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Client-side filtering ──────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    if (!q) return records
    return records.filter((r) => getPeriodLabel(r.period_start).toLowerCase().includes(q))
  }, [records, debouncedSearch])

  useEffect(() => { setPage(1) }, [filtered.length])

  // ── Pagination ─────────────────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginated = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  )


  const clearFilters = useCallback(() => {
    setSearch('')
    setPage(1)
  }, [])

  const hasActiveFilters = debouncedSearch.trim().length > 0
  const isSearchActive = debouncedSearch.trim().length > 0 || searchFocused
  const isNonDefaultPageSize = pageSize !== 10

  // ── Aggregates ─────────────────────────────────────────────────────────────
  // Stat cards reflect ONLY the latest reading period's billing - not summed
  // across history. Summing total_billing/remaining_balance across periods
  // would double-count amounts, since an unpaid balance from an older period
  // is carried forward into the next period's previous_balance/remaining_balance.
  // `records` is sorted latest-period-first by the server, so records[0] is it.
  const latestRecord = records.length > 0 ? records[0] : null

  const totalBilled = latestRecord?.total_billing ?? 0
  const totalPaid = latestRecord ? latestRecord.total_billing - latestRecord.remaining_balance : 0
  const totalRemaining = latestRecord?.remaining_balance ?? 0

  // ─── Not found ──────────────────────────────────────────────────────────────

  if (!isLoading && notFound) {
    return (
      <div className="w-full py-16 text-center">
        <p className="text-slate-500 text-sm">Meter account not found.</p>
        <Button variant="outline" size="sm" className="mt-4 rounded-md" onClick={() => router.back()}>
          Go back
        </Button>
      </div>
    )
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="w-full space-y-5">
      <PageHeading
        title={isLoading ? 'Meter Account' : (meterAccount?.meter_serial_no || 'No serial number')}
        description="Meter reading & billing history"
      />

      {isLoading ? (
        <HeaderSkeleton />
      ) : (
        <>
          {/* Header */}
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-md border border-slate-200 hover:border-violet-300 hover:bg-violet-50"
              onClick={() => router.back()}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </div>

          {/* Meter account summary panel */}
          {meterAccount && (
            <div className={cn(PANEL, 'p-4 flex flex-col sm:flex-row sm:items-center gap-4 justify-between')}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-11 w-11 rounded-md bg-violet-50 border border-violet-200 flex items-center justify-center shrink-0">
                  <Gauge className="h-5 w-5 text-violet-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-slate-800">
                    {meterAccount.consumer?.account_name ?? '-'}
                  </p>
                  {meterAccount.consumer?.contract_no && (
                    <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                      {meterAccount.consumer.contract_no}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                      <Building2 className="h-3 w-3" />
                      {meterAccount.classification?.classification_name ?? '-'}
                    </span>
                    <span className="text-slate-300 font-bold">·</span>
                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                      <MapPin className="h-3 w-3" />
                      {meterAccount.zone
                        ? `Zone ${meterAccount.zone.zone_name}, ${meterAccount.zone.barangay?.barangay_name ?? ''}`
                        : '-'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {meterAccount.meter_serial_no && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-mono font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    S/N {meterAccount.meter_serial_no}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Stat cards - reflect the latest billing period only */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className={cn(PANEL, 'p-4 flex items-center justify-between')}>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Total Billed
                  {latestRecord && (
                    <span className="ml-1.5 normal-case font-medium text-slate-300">
                      · {getPeriodLabel(latestRecord.period_start)}
                    </span>
                  )}
                </p>
                <p className="text-lg font-bold text-slate-800 mt-1">{formatPeso(totalBilled)}</p>
              </div>
              <div className="h-9 w-9 rounded-md bg-violet-50 border border-violet-200 flex items-center justify-center">
                <Wallet className="h-4 w-4 text-violet-600" />
              </div>
            </div>
            <div className={cn(PANEL, 'p-4 flex items-center justify-between')}>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Total Paid
                  {latestRecord && (
                    <span className="ml-1.5 normal-case font-medium text-slate-300">
                      · {getPeriodLabel(latestRecord.period_start)}
                    </span>
                  )}
                </p>
                <p className="text-lg font-bold text-emerald-600 mt-1">{formatPeso(totalPaid)}</p>
              </div>
              <div className="h-9 w-9 rounded-md bg-emerald-50 border border-emerald-200 flex items-center justify-center">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              </div>
            </div>
            <div className={cn(PANEL, 'p-4 flex items-center justify-between')}>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Outstanding
                  {latestRecord && (
                    <span className="ml-1.5 normal-case font-medium text-slate-300">
                      · {getPeriodLabel(latestRecord.period_start)}
                    </span>
                  )}
                </p>
                <p className="text-lg font-bold text-amber-600 mt-1">{formatPeso(totalRemaining)}</p>
              </div>
              <div className="h-9 w-9 rounded-md bg-amber-50 border border-amber-200 flex items-center justify-center">
                <Clock className="h-4 w-4 text-amber-600" />
              </div>
            </div>
          </div>
        </>
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative w-full min-w-0 sm:w-auto sm:flex-1 sm:max-w-sm">
          <Search
            className={cn(
              'absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 transition-colors',
              isSearchActive ? 'text-violet-400' : 'text-slate-300',
            )}
          />
          <Input
            placeholder="Search by reading period..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            className={cn(
              'pl-9 h-8 rounded-md text-xs bg-white border-slate-200 text-slate-700',
              'placeholder:text-slate-300 focus-visible:ring-0 focus-visible:ring-offset-0 transition-colors',
              isSearchActive
                ? 'border-violet-400 ring-2 ring-violet-100'
                : 'hover:border-violet-200',
            )}
          />
          {search && (
            <button
              onClick={() => { setSearch(''); setPage(1) }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-slate-100"
            >
              <X className="h-3 w-3 text-slate-400" />
            </button>
          )}
        </div>

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-xs text-slate-400 hover:text-violet-600 hover:bg-violet-50"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">

        <div className="px-5 py-3 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-violet-100 border border-violet-200 flex items-center justify-center">
              <Receipt className="h-3 w-3 text-violet-500" />
            </div>
            <p className="text-xs text-slate-500">
              {isLoading ? (
                <span className="inline-block h-3 w-24 bg-slate-100 animate-pulse rounded-full" />
              ) : (
                <>
                  <span className="font-semibold text-slate-700">{filtered.length}</span>
                  {' record'}{filtered.length !== 1 ? 's' : ''}
                  {hasActiveFilters && <span className="text-slate-400"> · filtered</span>}
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <span className="hidden sm:inline">Rows per page</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => { setPageSize(Number(v)); setPage(1) }}
            >
              <SelectTrigger
                className={cn(
                  'h-7 w-[58px] rounded-md text-[11px] bg-white border-slate-200 text-slate-500',
                  'focus:ring-0 focus:ring-offset-0 hover:border-violet-300',
                  isNonDefaultPageSize && 'border-violet-300 text-violet-600',
                )}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white border border-slate-200 rounded-md">
                {PAGE_SIZE_OPTIONS.map((s) => (
                  <SelectItem
                    key={s}
                    value={String(s)}
                    className="text-xs cursor-pointer focus:bg-violet-50 focus:text-violet-700 dark:focus:bg-accent dark:focus:text-accent-foreground"
                  >
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/40">
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Period</TableHead>
                <TableHead className="text-right text-[9px] font-bold text-slate-400 uppercase tracking-wider">Previous Reading</TableHead>
                <TableHead className="text-right text-[9px] font-bold text-slate-400 uppercase tracking-wider">Present Reading</TableHead>
                <TableHead className="text-right text-[9px] font-bold text-slate-400 uppercase tracking-wider">Consumption</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Reading Date</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Meter Reader</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Due Date</TableHead>
                <TableHead className="text-right text-[9px] font-bold text-slate-400 uppercase tracking-wider">Total Bill</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Status</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>

              {isLoading && [...Array(5)].map((_, i) => <SkeletonRow key={i} />)}

              {!isLoading && records.length === 0 && (
                <TableRow>
                  <TableCell colSpan={TABLE_COLUMN_COUNT} className="h-72 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-12 w-12 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center">
                        <Receipt className="h-5 w-5 text-violet-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-600">No billing records</p>
                        <p className="text-xs text-slate-400 mt-1">This meter account has no billing history yet.</p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {!isLoading && records.length > 0 && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={TABLE_COLUMN_COUNT} className="h-64 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-12 w-12 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center">
                        <Search className="h-5 w-5 text-violet-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-600">No results</p>
                        <p className="text-xs text-slate-400 mt-1">No records match your search.</p>
                      </div>
                      <button
                        onClick={clearFilters}
                        className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-xs font-medium text-violet-600 bg-violet-50 border border-violet-200 hover:bg-violet-100"
                      >
                        Clear filters
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {!isLoading && paginated.map((record) => (
                <TableRow key={record.billing_id} className="border-t border-slate-100 hover:bg-violet-50/40 transition-colors">
                  <TableCell className="py-3">
                    <p className="text-[12.5px] font-medium text-slate-800">
                      {getPeriodLabel(record.period_start)}
                    </p>
                  </TableCell>
                  <TableCell className="py-3 text-right">
                    <p className="text-[12.5px] font-mono text-slate-600 tabular-nums">
                      {record.consumption.previous_reading}
                    </p>
                  </TableCell>
                  <TableCell className="py-3 text-right">
                    <p className="text-[12.5px] font-mono text-slate-600 tabular-nums">
                      {record.consumption.present_reading}
                    </p>
                  </TableCell>
                  <TableCell className="py-3 text-right">
                    <p className="text-[12.5px] font-mono text-slate-700 tabular-nums">
                      {record.consumption.consumption} m³
                    </p>
                  </TableCell>
                  <TableCell className="py-3 text-[12.5px] text-slate-500">
                    {formatDate(record.reading_date)}
                  </TableCell>
                  <TableCell className="py-3">
                    {record.meter_reader ? (
                      <span className="inline-flex items-center gap-1.5 text-[12.5px] text-slate-600">
                        <UserRound className="h-3 w-3 text-slate-400" />
                        {record.meter_reader.name || '-'}
                      </span>
                    ) : (
                      <span className="text-[12.5px] text-slate-300">-</span>
                    )}
                  </TableCell>
                  <TableCell className="py-3 text-[12.5px] text-slate-500">
                    {formatDate(record.due_date)}
                  </TableCell>
                  <TableCell className="py-3 text-right">
                    <p className="text-[12.5px] font-bold text-slate-800 tabular-nums">{formatPeso(record.total_billing)}</p>
                  </TableCell>
                  <TableCell className="py-3">
                    <span className={cn(
                      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold border',
                      getStatusBadgeClass(record.billing_status.billing_status_name)
                    )}>
                      {record.billing_status.billing_status_name}
                    </span>
                  </TableCell>
                  <TableCell className="py-3">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md text-slate-400 hover:text-violet-600 hover:bg-violet-50">
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44 rounded-md p-1.5">
                        <DropdownMenuLabel className="text-[9px] font-bold uppercase tracking-widest text-violet-400 px-2 py-1.5">
                          Actions
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator className="mb-1" />

                        <DropdownMenuItem className="cursor-pointer rounded-md text-xs text-slate-500 focus:bg-violet-50 focus:text-violet-700 dark:focus:bg-accent dark:focus:text-accent-foreground py-2 gap-2" onSelect={(e) => e.preventDefault()}>
                          <BillingViewDialog billingId={record.billing_id}>
                            <div className="flex items-center gap-2 w-full">
                              <div className="h-6 w-6 rounded-md bg-slate-100 flex items-center justify-center">
                                <Eye className="h-3 w-3 text-slate-500" />
                              </div>
                              <span>View details</span>
                            </div>
                          </BillingViewDialog>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination */}
      {!isLoading && (
        <TablePagination
          page={safePage}
          pageSize={pageSize}
          total={filtered.length}
          onPageChange={setPage}
        />
      )}
    </div>
  )
}

export default MeterAccountDetailPage