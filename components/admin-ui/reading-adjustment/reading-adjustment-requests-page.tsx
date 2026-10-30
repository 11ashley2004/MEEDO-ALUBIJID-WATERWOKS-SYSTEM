'use client'

import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'


import { TablePagination } from '@/components/shared-ui/pagination'
import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  Search,
  MoreHorizontal,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
  X,
  ChevronDown,
  SlidersHorizontal,
  TrendingUp,
  TrendingDown,
  Gauge,
} from 'lucide-react'
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
  DropdownMenuRadioGroup, DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  getAllReadingAdjustmentRequests,
  type MeterReadingAdjustmentRecord,
} from '@/lib/actions/meter-reading/meter-reading-adjustment.actions'
import { ApproveReadingAdjustmentDialog } from '@/components/admin-ui/reading-adjustment/approve-reading-adjustment-dialog'
import { RejectReadingAdjustmentDialog } from '@/components/admin-ui/reading-adjustment/reject-reading-adjustment-dialog'
import { MeterReadingAdjustmentViewDialog } from '@/components/admin-ui/reading-adjustment/reading-adjustment-view-modal'

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

const STATUS_OPTIONS = [
  { val: 'all', label: 'All Statuses' },
  { val: 'pending', label: 'Pending' },
  { val: 'approved', label: 'Approved' },
  { val: 'rejected', label: 'Rejected' },
] as const

const DATE_OPTIONS = [
  { val: 'all', label: 'All Time' },
  { val: 'today', label: 'Today' },
  { val: 'this_month', label: 'This Month' },
  { val: 'this_year', label: 'This Year' },
] as const

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatNum = (n: number) => n.toLocaleString('en-PH')
const formatDateTime = (d: string) => format(new Date(d), 'MMM dd, yyyy h:mm a')

// FIXED: Get initials from account_name
function getInitials(accountName: string) {
  if (!accountName) return '?'
  const parts = accountName.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  if (parts.length === 2) return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase()
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase()
}

// FIXED: Format consumer name from account_name
function formatConsumerName(accountName: string) {
  if (!accountName) return 'Unknown Consumer'
  return accountName
}

function StatusBadge({ status }: { status: string }) {
  switch (status.toLowerCase()) {
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
          <Clock className="h-3 w-3" />
          Pending
        </span>
      )
    case 'approved':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="h-3 w-3" />
          Approved
        </span>
      )
    case 'rejected':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
          <XCircle className="h-3 w-3" />
          Rejected
        </span>
      )
    default:
      return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-slate-50 text-slate-500 border border-slate-200">{status}</span>
  }
}

function DiffChip({ oldReading, newReading }: { oldReading: number; newReading: number }) {
  const diff = newReading - oldReading
  if (Math.abs(diff) < 0.01) return <span className="text-slate-400 text-[10px]">no change</span>
  const up = diff > 0
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-[11px] font-semibold', up ? 'text-emerald-700' : 'text-rose-600')}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? '+' : ''}{formatNum(diff)} m³
    </span>
  )
}

// ─── Filters Panel ────────────────────────────────────────────────────────────

function FiltersPanel({
  statusFilter, dateFilter, onStatusChange, onDateChange,
}: {
  statusFilter: string
  dateFilter: string
  onStatusChange: (v: string) => void
  onDateChange: (v: string) => void
}) {
  const activeCount = [statusFilter !== 'all', dateFilter !== 'all'].filter(Boolean).length

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-9 gap-1.5 text-sm font-medium transition-all rounded-md',
            activeCount > 0 && [
              'border-violet-400 bg-violet-50 text-violet-700',
              'hover:bg-violet-100 hover:border-violet-500',
            ],
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
          Filters
          {activeCount > 0 && (
            <span className="inline-flex items-center justify-center h-[18px] min-w-[18px] px-1 rounded-full bg-violet-600 text-white text-[11px] font-semibold leading-none">
              {activeCount}
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-48 rounded-md p-1.5">
        <DropdownMenuLabel className="text-[9px] font-bold uppercase tracking-widest text-violet-400 px-2 py-1.5">
          Status
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="mb-1" />
        <DropdownMenuRadioGroup value={statusFilter} onValueChange={onStatusChange}>
          {STATUS_OPTIONS.map(({ val, label }) => (
            <DropdownMenuRadioItem
              key={val}
              value={val}
              className={cn(
                'cursor-pointer rounded-md text-xs',
                statusFilter === val && 'text-violet-600 font-medium bg-violet-50',
              )}
            >
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator className="my-1" />

        <DropdownMenuLabel className="text-[9px] font-bold uppercase tracking-widest text-violet-400 px-2 py-1.5">
          Date Range
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={dateFilter} onValueChange={onDateChange}>
          {DATE_OPTIONS.map(({ val, label }) => (
            <DropdownMenuRadioItem
              key={val}
              value={val}
              className={cn(
                'cursor-pointer rounded-md text-xs',
                dateFilter === val && 'text-violet-600 font-medium bg-violet-50',
              )}
            >
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const ReadingAdjustmentRequestsPage = () => {
  const [requests, setRequests] = useState<MeterReadingAdjustmentRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedSearch(search)
  const [searchFocused, setSearchFocused] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // ── Fetch ──────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await getAllReadingAdjustmentRequests()
      if (res.status === 'success' && res.data) {
        setRequests(res.data)
      } else {
        toast.error(res.message ?? 'Failed to load reading adjustment requests')
      }
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Clear all ──────────────────────────────────────────────
  const clearAll = useCallback(() => {
    setSearch('')
    setStatusFilter('all')
    setDateFilter('all')
    setPage(1)
  }, [])

  // ── Client-side filtering ──────────────────────────────────
  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    const now = new Date()
    return requests.filter((r) => {
      if (q) {
        // FIXED: Use account_name instead of first_name/last_name
        const consumer = (r.meter_reading.meter.meter_account.consumer?.account_name || '').toLowerCase()
        const meterNo = (r.meter_reading.meter.meter_serial_no || '').toLowerCase()
        const meterSerialNo = (r.meter_reading.meter.meter_account.meter_serial_no ?? r.meter_reading.meter.meter_serial_no ?? '').toLowerCase()
        const reqBy = `${r.requested_by_user.first_name} ${r.requested_by_user.last_name}`.toLowerCase()
        const zone = `${r.meter_reading.meter.meter_account.zone.zone_name} ${r.meter_reading.meter.meter_account.zone.barangay.barangay_name}`.toLowerCase()
        if (!consumer.includes(q) && !meterNo.includes(q) && !meterSerialNo.includes(q) && !reqBy.includes(q) && !zone.includes(q)) return false
      }

      const statusName = r.adjustment_status?.status_name?.toLowerCase() ?? ''
      if (statusFilter !== 'all' && statusName !== statusFilter) return false

      if (dateFilter !== 'all') {
        if (!r.requested_date) return false
        const d = new Date(r.requested_date)
        if (dateFilter === 'today' && d.toDateString() !== now.toDateString()) return false
        if (dateFilter === 'this_month' && (d < startOfMonth(now) || d > endOfMonth(now))) return false
        if (dateFilter === 'this_year' && (d < startOfYear(now) || d > endOfYear(now))) return false
      }
      return true
    })
  }, [requests, debouncedSearch, statusFilter, dateFilter])

  useEffect(() => { setPage(1) }, [filtered.length])

  // ── Pagination ─────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginated = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  )


  // ── Derived flags ──────────────────────────────────────────
  const hasActiveFilters = debouncedSearch.trim().length > 0 || statusFilter !== 'all' || dateFilter !== 'all'
  const isSearchActive = debouncedSearch.trim().length > 0 || searchFocused
  const isNonDefaultPageSize = pageSize !== 10

  const handleApproveReject = () => {
    fetchData()
  }

  // ── Skeleton ───────────────────────────────────────────────
  const renderSkeleton = () =>
    [...Array(5)].map((_, i) => (
      <TableRow key={i} className="border-t border-slate-100">
        {[...Array(11)].map((_, j) => (
          <TableCell key={j} className="py-3">
            <div className="h-3.5 w-full bg-slate-100 animate-pulse rounded-full" />
          </TableCell>
        ))}
      </TableRow>
    ))

  // ─── Render ────────────────────────────────────────────────
  return (
    <div className="w-full space-y-5">

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1">

          {/* Search */}
          <div className="relative w-full min-w-0 sm:w-auto sm:flex-1 sm:max-w-sm">
            <Search
              className={cn(
                'absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 transition-colors',
                isSearchActive ? 'text-violet-400' : 'text-slate-300',
              )}
            />
            <Input
              placeholder="Search consumer, serial no., zone…"
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

          <div className="hidden sm:block h-4 w-px bg-slate-200" />

          <FiltersPanel
            statusFilter={statusFilter}
            dateFilter={dateFilter}
            onStatusChange={(v) => { setStatusFilter(v); setPage(1) }}
            onDateChange={(v) => { setDateFilter(v); setPage(1) }}
          />

          {hasActiveFilters && (
            <button
              onClick={clearAll}
              className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-xs text-slate-400 hover:text-violet-600 hover:bg-violet-50"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">

        {/* Table header bar */}
        <div className="px-5 py-3 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-violet-100 border border-violet-200 flex items-center justify-center">
              <Gauge className="h-3 w-3 text-violet-500" />
            </div>
            <p className="text-xs text-slate-500">
              {isLoading ? (
                <span className="inline-block h-3 w-24 bg-slate-100 animate-pulse rounded-full" />
              ) : (
                <>
                  <span className="font-semibold text-slate-700">{filtered.length}</span>
                  {' '}request{filtered.length !== 1 ? 's' : ''}
                  {hasActiveFilters && <span className="text-slate-400"> · filtered</span>}
                </>
              )}
            </p>
          </div>

          {/* Rows per page */}
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
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Consumer</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">S/N</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Meter No.</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Zone</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Requested By</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Requested At</TableHead>
                <TableHead className="text-right text-[9px] font-bold text-slate-400 uppercase tracking-wider">Old Reading</TableHead>
                <TableHead className="text-right text-[9px] font-bold text-slate-400 uppercase tracking-wider">New Reading</TableHead>
                <TableHead className="text-right text-[9px] font-bold text-slate-400 uppercase tracking-wider">Difference</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Status</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>

              {/* Loading skeletons */}
              {isLoading && renderSkeleton()}

              {/* Empty — no requests */}
              {!isLoading && requests.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="h-72 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-12 w-12 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center">
                        <Gauge className="h-5 w-5 text-violet-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-600">No reading adjustment requests</p>
                        <p className="text-xs text-slate-400 mt-1">No meter reading correction requests have been submitted yet.</p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {/* Empty — no results */}
              {!isLoading && requests.length > 0 && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="h-64 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-12 w-12 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center">
                        <Search className="h-5 w-5 text-violet-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-600">No results</p>
                        <p className="text-xs text-slate-400 mt-1">No requests match your filters.</p>
                      </div>
                      <button
                        onClick={clearAll}
                        className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-xs font-medium text-violet-600 bg-violet-50 border border-violet-200 hover:bg-violet-100"
                      >
                        Clear filters
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {/* Data rows */}
              {!isLoading && paginated.map((req) => {
                const meter = req.meter_reading.meter
                const meterAccount = meter.meter_account
                const consumer = meterAccount.consumer
                const zone = meterAccount.zone
                const status = req.adjustment_status?.status_name ?? 'unknown'
                const isPending = status.toLowerCase() === 'pending'

                // FIXED: Get consumer name from account_name
                const consumerName = consumer?.account_name || 'Unknown Consumer'

                return (
                  <TableRow
                    key={req.reading_adjustment_id}
                    className={cn(
                      'border-t border-slate-100 hover:bg-violet-50/40 transition-colors',
                      isPending && 'bg-amber-50/20',
                    )}
                  >
                    {/* Consumer */}
                    <TableCell className="py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-md bg-violet-100 flex items-center justify-center text-[11px] font-bold text-violet-600 shrink-0">
                          {getInitials(consumerName)}
                        </div>
                        <div>
                          <p className="text-[12.5px] font-medium text-slate-800">
                            {consumerName}
                          </p>
                        </div>
                      </div>
                    </TableCell>

                    {/* S/N */}
                    <TableCell className="py-3">
                      <span className="text-[12.5px] font-mono text-slate-600">{meterAccount.meter_serial_no ?? meter.meter_serial_no ?? '—'}</span>
                    </TableCell>

                    {/* Meter No. */}
                    <TableCell className="py-3">
                      <span className="text-[12.5px] font-mono text-slate-600">
                        {meter.meter_serial_no || '—'}
                      </span>
                    </TableCell>

                    {/* Zone */}
                    <TableCell className="py-3">
                      <div>
                        <p className="text-[12.5px] font-medium text-slate-700">{zone.zone_name}</p>
                        <p className="text-[10px] text-slate-400">{zone.barangay.barangay_name}</p>
                      </div>
                    </TableCell>

                    {/* Requested By */}
                    <TableCell className="py-3">
                      <span className="text-[12.5px] text-slate-600">
                        {req.requested_by_user.first_name} {req.requested_by_user.last_name}
                      </span>
                    </TableCell>

                    {/* Requested At */}
                    <TableCell className="py-3">
                      <span className="text-[12.5px] text-slate-500">
                        {req.requested_date ? formatDateTime(req.requested_date) : '—'}
                      </span>
                    </TableCell>

                    {/* Old Reading */}
                    <TableCell className="text-right py-3">
                      <span className="text-[12.5px] tabular-nums text-slate-600">{formatNum(req.original_reading)} m³</span>
                    </TableCell>

                    {/* New Reading */}
                    <TableCell className="text-right py-3">
                      <span className="text-[12.5px] font-semibold tabular-nums text-violet-700">{formatNum(req.adjusted_reading)} m³</span>
                    </TableCell>

                    {/* Difference */}
                    <TableCell className="text-right py-3">
                      <DiffChip oldReading={req.original_reading} newReading={req.adjusted_reading} />
                    </TableCell>

                    {/* Status */}
                    <TableCell className="py-3">
                      <StatusBadge status={status} />
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="py-3" onClick={(e) => e.stopPropagation()}>
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

                          <DropdownMenuItem className="cursor-pointer rounded-md text-xs text-slate-500 focus:bg-violet-50 focus:text-violet-700 dark:focus:bg-accent dark:focus:text-accent-foreground p-0" onSelect={(e) => e.preventDefault()}>
                            <MeterReadingAdjustmentViewDialog 
                              adjustmentId={req.reading_adjustment_id}
                              onApprove={handleApproveReject}
                              onReject={handleApproveReject}
                            >
                              <div className="flex items-center gap-2 w-full px-2 py-2">
                                <div className="h-6 w-6 rounded-md bg-slate-100 flex items-center justify-center">
                                  <Eye className="h-3 w-3 text-slate-500" />
                                </div>
                                <span>View details</span>
                              </div>
                            </MeterReadingAdjustmentViewDialog>
                          </DropdownMenuItem>

                          {isPending && (
                            <>
                              <DropdownMenuSeparator className="my-1" />
                              <DropdownMenuItem className="cursor-pointer rounded-md text-xs text-slate-500 focus:bg-violet-50 focus:text-violet-700 dark:focus:bg-accent dark:focus:text-accent-foreground p-0" onSelect={(e) => e.preventDefault()}>
                                <ApproveReadingAdjustmentDialog 
                                  adjustmentId={req.reading_adjustment_id} 
                                  onSuccess={fetchData}
                                >
                                  <div className="flex items-center gap-2 w-full px-2 py-2">
                                    <div className="h-6 w-6 rounded-md bg-emerald-100 flex items-center justify-center">
                                      <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                    </div>
                                    <span className="text-emerald-700">Approve</span>
                                  </div>
                                </ApproveReadingAdjustmentDialog>
                              </DropdownMenuItem>
                              <DropdownMenuItem className="cursor-pointer rounded-md text-xs text-slate-500 focus:bg-violet-50 focus:text-violet-700 dark:focus:bg-accent dark:focus:text-accent-foreground p-0" onSelect={(e) => e.preventDefault()}>
                                <RejectReadingAdjustmentDialog 
                                  adjustmentId={req.reading_adjustment_id} 
                                  onSuccess={fetchData}
                                >
                                  <div className="flex items-center gap-2 w-full px-2 py-2">
                                    <div className="h-6 w-6 rounded-md bg-rose-100 flex items-center justify-center">
                                      <XCircle className="h-3 w-3 text-rose-600" />
                                    </div>
                                    <span className="text-rose-700">Reject</span>
                                  </div>
                                </RejectReadingAdjustmentDialog>
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
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

export default ReadingAdjustmentRequestsPage