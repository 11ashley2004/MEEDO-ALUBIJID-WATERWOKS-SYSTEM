'use client'

import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'

import { TablePagination } from '@/components/shared-ui/pagination'
import { PageHeading } from '@/components/shared-ui/page-heading'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Search, Gauge, Eye, MoreHorizontal, ChevronDown, X, Clock, CheckCircle2, XCircle, Edit, SlidersHorizontal, Ban } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  getMyReadingAdjustments,
  type MyAdjustmentRecord,
} from '@/lib/actions/meter-reading/meter-reading-adjustment.actions'
import { MeterReadingAdjustmentViewDialog } from '@/components/meter-reader-ui/meter-reading-adjusment/meter-reading-adjustment-view-dialog'
import UpdateMeterReadingAdjustmentForm from '@/components/meter-reader-ui/meter-reading-adjusment/update-meter-reading-adjustment-form'
import CancelAdjustmentDialog from '@/components/meter-reader-ui/meter-reading-adjusment/cancel-adjustment-dialog'

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

const STATUS_STYLES: Record<string, string> = {
  pending:   'bg-amber-50 text-amber-700 border-amber-200',
  approved:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected:  'bg-rose-50 text-rose-700 border-rose-200',
  cancelled: 'bg-stone-100 text-stone-500 border-stone-200',
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  pending:   <Clock className="h-3 w-3" />,
  approved:  <CheckCircle2 className="h-3 w-3" />,
  rejected:  <XCircle className="h-3 w-3" />,
  cancelled: <Ban className="h-3 w-3" />,
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ─── Format period range ──────────────────────────────────────────────────────

function formatPeriodRange(periodStart: string, periodEnd: string): string {
  const start = new Date(periodStart)
  const end = new Date(periodEnd)
  
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 'Invalid Period'
  
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()
  const month = end.toLocaleDateString('en-US', { month: 'short' })
  const year = end.getFullYear()
  
  if (sameMonth) {
    return `${month} ${start.getDate()}–${end.getDate()}, ${year}`
  }
  
  const startMonth = start.toLocaleDateString('en-US', { month: 'short' })
  return `${startMonth} ${start.getDate()} – ${month} ${end.getDate()}, ${year}`
}

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status.toLowerCase()] ?? 'bg-slate-50 text-slate-500 border-slate-200'
  const icon = STATUS_ICONS[status.toLowerCase()]

  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold border',
      style
    )}>
      {icon}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

// ─── Filters Panel ────────────────────────────────────────────────────────────

function FiltersPanel({
  statusFilter,
  onStatusChange,
}: {
  statusFilter: string
  onStatusChange: (v: string) => void
}) {
  const active = statusFilter !== 'all'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-9 gap-1.5 text-sm font-medium transition-all rounded-md',
            active && [
              'border-violet-400 bg-violet-50 text-violet-700',
              'hover:bg-violet-100 hover:border-violet-500',
            ],
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
          Filters
          {active && (
            <span className="inline-flex items-center justify-center h-[18px] min-w-[18px] px-1 rounded-full bg-violet-600 text-white text-[11px] font-semibold leading-none">
              1
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-44 rounded-md p-1.5">
        <DropdownMenuLabel className="text-[9px] font-bold uppercase tracking-widest text-violet-400 px-2 py-1.5">
          Status
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="mb-1" />
        <DropdownMenuRadioGroup value={statusFilter} onValueChange={onStatusChange}>
          {STATUS_OPTIONS.map(({ value, label }) => (
            <DropdownMenuRadioItem
              key={value}
              value={value}
              className={cn(
                'cursor-pointer rounded-md text-xs',
                statusFilter === value && 'text-violet-600 font-medium bg-violet-50',
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

// ─── Skeleton Row ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <TableRow>
      <TableCell><div className="h-3.5 w-32 bg-slate-100 animate-pulse rounded-full" /></TableCell>
      <TableCell><div className="h-3.5 w-40 bg-slate-100 animate-pulse rounded-full" /></TableCell>
      <TableCell><div className="h-3.5 w-28 bg-slate-100 animate-pulse rounded-full" /></TableCell>
      <TableCell><div className="h-3.5 w-24 bg-slate-100 animate-pulse rounded-full" /></TableCell>
      <TableCell><div className="h-3.5 w-24 bg-slate-100 animate-pulse rounded-full" /></TableCell>
      <TableCell><div className="h-3.5 w-24 bg-slate-100 animate-pulse rounded-full" /></TableCell>
      <TableCell><div className="h-6 w-20 bg-slate-100 animate-pulse rounded-full" /></TableCell>
      <TableCell><div className="h-7 w-7 bg-slate-100 animate-pulse rounded-md" /></TableCell>
    </TableRow>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const MeterReadingAdjustmentPage = () => {
  const [adjustments, setAdjustments] = useState<MyAdjustmentRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedSearch(search)
  const [searchFocused, setSearchFocused] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [selectedAdjustment, setSelectedAdjustment] = useState<MyAdjustmentRecord | null>(null)
  const [isViewOpen, setIsViewOpen] = useState(false)

  // ── Cancel state ────────────────────────────────────────────────────────────
  const [cancelTarget, setCancelTarget] = useState<MyAdjustmentRecord | null>(null)

  // ── Fetch adjustments ───────────────────────────────────────────────────────
  const fetchAdjustments = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await getMyReadingAdjustments()
      if (result.status === 'success' && result.data) {
        setAdjustments(result.data)
      } else {
        toast.error(result.message || 'Failed to load adjustments')
      }
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchAdjustments() }, [fetchAdjustments])

  // ── Filtering ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    return adjustments.filter((adj) => {
      if (statusFilter !== 'all' && adj.status_name?.toLowerCase() !== statusFilter) return false
      if (q) {
        const consumerName = adj.consumer_name?.toLowerCase() || ''
        const meterSerialNo = adj.meter_serial_no?.toLowerCase() || ''
        if (!consumerName.includes(q) && !meterSerialNo.includes(q)) return false
      }
      return true
    })
  }, [adjustments, debouncedSearch, statusFilter])

  useEffect(() => { setPage(1) }, [filtered.length])

  // ── Pagination ─────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginated = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  )


  const hasActiveFilters = debouncedSearch.trim().length > 0 || statusFilter !== 'all'
  const isSearchActive = debouncedSearch.trim().length > 0 || searchFocused
  const isNonDefaultPageSize = pageSize !== 10

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleView = (adjustment: MyAdjustmentRecord) => {
    setSelectedAdjustment(adjustment)
    setIsViewOpen(true)
  }

  const handleEditSuccess = () => {
    fetchAdjustments()
  }

  const handleCancelRequest = (adjustment: MyAdjustmentRecord) => {
    setCancelTarget(adjustment)
  }

  const handleCancelDone = () => {
    setCancelTarget(null)
    fetchAdjustments()
  }

  return (
    <div className="w-full space-y-5">

      {/* Page header */}
      <PageHeading title="My Reading Adjustments" description="Track and manage your meter reading adjustment requests" />
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
              placeholder="Search by consumer or serial no.…"
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
            onStatusChange={(v) => { setStatusFilter(v); setPage(1) }}
          />

          {hasActiveFilters && (
            <button
              onClick={() => { setSearch(''); setStatusFilter('all'); setPage(1) }}
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
                  {' '}adjustment{filtered.length !== 1 ? 's' : ''}
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
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Serial No.</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Period</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Original Reading</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Adjusted Reading</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Requested</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Status</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>

              {/* Loading skeletons */}
              {isLoading && [...Array(5)].map((_, i) => <SkeletonRow key={i} />)}

              {/* Empty — no adjustments */}
              {!isLoading && adjustments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="h-72 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-12 w-12 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center">
                        <Gauge className="h-5 w-5 text-violet-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-600">No adjustment requests</p>
                        <p className="text-xs text-slate-400 mt-1">You haven't submitted any reading adjustment requests yet.</p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {/* Empty — no results */}
              {!isLoading && adjustments.length > 0 && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="h-64 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-12 w-12 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center">
                        <Search className="h-5 w-5 text-violet-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-600">No results</p>
                        <p className="text-xs text-slate-400 mt-1">No adjustments match your filters.</p>
                      </div>
                      <button
                        onClick={() => { setSearch(''); setStatusFilter('all'); setPage(1) }}
                        className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-xs font-medium text-violet-600 bg-violet-50 border border-violet-200 hover:bg-violet-100"
                      >
                        Clear filters
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {/* Data rows */}
              {!isLoading && paginated.map((adj) => {
                const isPending = adj.status_name?.toLowerCase() === 'pending'
                const isApproved = adj.status_name?.toLowerCase() === 'approved'
                const isRejected = adj.status_name?.toLowerCase() === 'rejected'
                const isCancelled = adj.status_name?.toLowerCase() === 'cancelled'

                const periodLabel = adj.reading_period_start && adj.reading_period_end
                  ? formatPeriodRange(adj.reading_period_start, adj.reading_period_end)
                  : 'Invalid Period'

                return (
                  <TableRow
                    key={adj.reading_adjustment_id}
                    className="border-t border-slate-100 hover:bg-violet-50/40 transition-colors cursor-pointer"
                    onClick={() => handleView(adj)}
                  >
                    <TableCell className="py-3">
                      <p className="text-[12.5px] font-medium text-slate-800">
                        {adj.consumer_name || '—'}
                      </p>
                    </TableCell>
                    <TableCell className="py-3">
                      <span className="text-[12.5px] font-mono text-slate-600">
                        {adj.meter_serial_no || '—'}
                      </span>
                    </TableCell>
                    <TableCell className="py-3">
                      <span className="text-[12.5px] text-slate-600">
                        {periodLabel}
                      </span>
                    </TableCell>
                    <TableCell className="py-3">
                      <span className="text-[12.5px] font-mono text-slate-600">
                        {adj.original_reading} m³
                      </span>
                    </TableCell>
                    <TableCell className="py-3">
                      <span className="text-[12.5px] font-mono font-semibold text-violet-700">
                        {adj.adjusted_reading} m³
                      </span>
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="flex flex-col">
                        <span className="text-[12.5px] text-slate-700">{formatDate(adj.requested_date)}</span>
                        <span className="text-[10px] text-slate-400">{formatDateTime(adj.requested_date).split(',')[1]}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      <StatusBadge status={adj.status_name || 'pending'} />
                    </TableCell>
                    <TableCell className="py-3" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-md text-slate-400 hover:text-violet-600 hover:bg-violet-50"
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44 rounded-md p-1.5">
                          <DropdownMenuLabel className="text-[9px] font-bold uppercase tracking-widest text-violet-400 px-2 py-1.5">
                            Actions
                          </DropdownMenuLabel>
                          <DropdownMenuSeparator className="mb-1" />

                          {/* View details */}
                          <DropdownMenuItem
                            className="cursor-pointer rounded-md text-xs text-slate-500 focus:bg-violet-50 focus:text-violet-700 dark:focus:bg-accent dark:focus:text-accent-foreground py-2 gap-2"
                            onClick={() => handleView(adj)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            View details
                          </DropdownMenuItem>

                          {/* Edit request - only for pending */}
                          {isPending && (
                            <DropdownMenuItem
                              className="cursor-pointer rounded-md text-xs text-slate-500 focus:bg-violet-50 focus:text-violet-700 dark:focus:bg-accent dark:focus:text-accent-foreground p-0"
                              onSelect={(e) => e.preventDefault()}
                            >
                              <UpdateMeterReadingAdjustmentForm
                                adjustmentId={adj.reading_adjustment_id}
                                onSuccess={fetchAdjustments}
                              >
                                <div className="flex items-center gap-2 w-full px-2 py-2">
                                  <div className="h-6 w-6 rounded-md bg-slate-100 flex items-center justify-center group-hover:bg-violet-100 transition-colors">
                                    <Edit className="h-3 w-3 text-slate-500 group-hover:text-violet-600 transition-colors" />
                                  </div>
                                  <span>Edit request</span>
                                </div>
                              </UpdateMeterReadingAdjustmentForm>
                            </DropdownMenuItem>
                          )}

                          {/* Cancel request - only for pending */}
                          {isPending && (
                            <DropdownMenuItem
                              className="cursor-pointer rounded-md text-xs text-rose-600 focus:bg-rose-50 focus:text-rose-700 py-2 gap-2"
                              onClick={() => handleCancelRequest(adj)}
                            >
                              <Ban className="h-3.5 w-3.5" />
                              Cancel request
                            </DropdownMenuItem>
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

      {/* View Dialog */}
      {selectedAdjustment && (
        <MeterReadingAdjustmentViewDialog
          open={isViewOpen}
          onOpenChange={setIsViewOpen}
          adjustment={selectedAdjustment}
        />
      )}

      {/* Cancel Dialog */}
      <CancelAdjustmentDialog
        adjustment={cancelTarget}
        open={!!cancelTarget}
        onOpenChange={(open) => { if (!open) setCancelTarget(null) }}
        onDone={handleCancelDone}
      />
    </div>
  )
}

export default MeterReadingAdjustmentPage