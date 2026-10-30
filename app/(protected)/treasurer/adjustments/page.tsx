'use client'

import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'

import { TablePagination } from '@/components/shared-ui/pagination'
import { PageHeading } from '@/components/shared-ui/page-heading'

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Search,
  ClipboardList,
  Eye,
  MoreHorizontal,
  AlertCircle,
  CheckCircle2,
  XCircle,
  FilePenLine,
  Ban,
  X,
  ChevronDown,
  SlidersHorizontal,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import {
  getAllAdjustmentRequests,
  type AdjustmentRequestTableRow,
} from '@/lib/actions/adjustment/payment.adjustment.actions'
import { CreatePaymentAdjustmentForm } from '@/components/treasurer-ui/payment-adjustment/create-payment-adjustment-form'
import { UpdatePaymentAdjustmentForm } from '@/components/treasurer-ui/payment-adjustment/update-payment-adjustment-form'
import { AdjustmentRequestViewModal } from '@/components/treasurer-ui/payment-adjustment/adjustment.request.view.modal'
import CancelPaymentAdjustmentDialog from '@/components/treasurer-ui/payment-adjustment/cancel-payment-adjustment-dialog'

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

const STATUS_CONFIG = {
  pending: {
    label: 'Pending',
    icon: AlertCircle,
    className: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  approved: {
    label: 'Approved',
    icon: CheckCircle2,
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  rejected: {
    label: 'Rejected',
    icon: XCircle,
    className: 'bg-rose-50 text-rose-700 border-rose-200',
  },
  cancelled: {
    label: 'Cancelled',
    icon: Ban,
    className: 'bg-slate-50 text-slate-500 border-slate-200',
  },
}

const STATUS_FILTER_OPTIONS = ['all', 'Pending', 'Approved', 'Rejected', 'Cancelled']

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatPeso = (amount: number): string => {
  return new Intl.NumberFormat('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

const formatDateTime = (dateStr: string): string => {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const getInitials = (fullName: string): string => {
  const parts = fullName.split(' ')
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }
  return fullName.slice(0, 2).toUpperCase()
}

// ─── Status Badge Component ──────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] || {
    label: status,
    icon: AlertCircle,
    className: 'bg-slate-50 text-slate-700 border-slate-200',
  }
  const Icon = config.icon

  return (
    <Badge variant="outline" className={cn('rounded-md gap-1.5 px-2.5 py-1 text-[10px] font-semibold', config.className)}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  )
}

// ─── Diff Badge Component ─────────────────────────────────────────────────────

function DiffBadge({ diff }: { diff: number }) {
  if (diff === 0) {
    return <span className="text-slate-400 text-[11px]">—</span>
  }

  const isPositive = diff > 0
  return (
    <Badge
      variant="outline"
      className={cn(
        'rounded-md text-[10px] font-semibold',
        isPositive
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
          : 'bg-rose-50 text-rose-700 border-rose-200',
      )}
    >
      {isPositive ? '+' : ''}₱{formatPeso(Math.abs(diff))}
    </Badge>
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
  const activeCount = active ? 1 : 0

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-9 gap-1.5 text-sm font-medium transition-all rounded-lg',
            active && ['border-violet-400 bg-violet-50 text-violet-700', 'hover:bg-violet-100 hover:border-violet-500']
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
          Filters
          {active && (
            <span className="inline-flex items-center justify-center h-[18px] min-w-[18px] px-1 rounded-full bg-violet-600 text-white text-[11px] font-semibold leading-none">{activeCount}</span>
          )}
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 rounded-lg p-1.5">
        <DropdownMenuLabel className="text-[9px] font-bold uppercase tracking-widest text-violet-400 px-2 py-1.5">
          Request Status
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="mb-1" />
        <DropdownMenuRadioGroup value={statusFilter} onValueChange={onStatusChange}>
          {STATUS_FILTER_OPTIONS.map((s) => (
            <DropdownMenuRadioItem
              key={s}
              value={s}
              className={cn(
                'cursor-pointer rounded-md text-xs',
                statusFilter === s && 'text-violet-600 font-medium bg-violet-50'
              )}
            >
              {s === 'all' ? 'All Statuses' : s}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function AdjustmentRequestsPage() {
  const [requests, setRequests] = useState<AdjustmentRequestTableRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedSearch(search)
  const [searchFocused, setSearchFocused] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [viewRecord, setViewRecord] = useState<AdjustmentRequestTableRow | null>(null)
  const [viewOpen, setViewOpen] = useState(false)

  // ── Cancel state ────────────────────────────────────────────────────────────
  const [cancelTarget, setCancelTarget] = useState<AdjustmentRequestTableRow | null>(null)

  const fetchRequests = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await getAllAdjustmentRequests()
      if (res.status === 'success' && res.data) {
        setRequests(res.data)
      } else {
        toast.error(res.message ?? 'Failed to load adjustment requests')
      }
    } catch {
      toast.error('Failed to load data')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchRequests() }, [fetchRequests])

  const clearAll = useCallback(() => {
    setSearch('')
    setStatusFilter('all')
    setPage(1)
  }, [])

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    return requests.filter((r) => {
      if (q &&
        !r.consumer_name.toLowerCase().includes(q) &&
        !r.receipt_number.toLowerCase().includes(q) &&
        !(r.meter_serial_no ?? '').toLowerCase().includes(q)
      ) return false
      if (statusFilter !== 'all' && r.adjustment_status.toLowerCase() !== statusFilter.toLowerCase()) return false
      return true
    })
  }, [requests, debouncedSearch, statusFilter])

  useEffect(() => { setPage(1) }, [filtered.length])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginated = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  )

  const hasActiveFilters = debouncedSearch.trim().length > 0 || statusFilter !== 'all'
  const isSearchActive = debouncedSearch.trim().length > 0 || searchFocused


  const handleView = (record: AdjustmentRequestTableRow) => {
    setViewRecord(record)
    setViewOpen(true)
  }

  const handleCancelDone = () => {
    setCancelTarget(null)
    fetchRequests()
  }

  return (
    <div className="w-full space-y-5">

      {/* Header */}
      <PageHeading title="Payment Adjustments" description="Review and process payment correction requests" />
{/* ── Toolbar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">

        {/* Left Group: Search + Filter */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 flex-1">
          <div className="relative w-full min-w-0 sm:w-auto sm:flex-1 sm:max-w-xs">
            <Search
              className={cn(
                'absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 transition-colors pointer-events-none',
                isSearchActive ? 'text-violet-400' : 'text-slate-300',
              )}
            />
            <Input
              placeholder="Search consumer, receipt, serial no.…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              className={cn(
                'pl-9 h-8 rounded-lg text-xs bg-white border-slate-200 text-slate-700',
                'placeholder:text-slate-300 focus-visible:ring-0 focus-visible:ring-offset-0 transition-colors',
                isSearchActive
                  ? 'border-violet-400 ring-2 ring-violet-100'
                  : 'hover:border-violet-200',
              )}
            />
            {search && (
              <button
                onClick={() => { setSearch(''); setPage(1) }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-slate-100 transition-colors"
              >
                <X className="h-3 w-3 text-slate-400" />
              </button>
            )}
          </div>

          <div className="hidden sm:block h-4 w-px bg-slate-200 shrink-0" />

          <FiltersPanel
            statusFilter={statusFilter}
            onStatusChange={(v) => { setStatusFilter(v); setPage(1) }}
          />

          {hasActiveFilters && (
            <button
              onClick={clearAll}
              className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-xs text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>

        {/* Right Group: Create button */}
        <div className="shrink-0">
          <CreatePaymentAdjustmentForm onSuccess={fetchRequests}>
            <Button className="h-9 gap-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-semibold shadow-sm">
              <FilePenLine className="h-3.5 w-3.5" /> Request Adjustment
            </Button>
          </CreatePaymentAdjustmentForm>
        </div>
      </div>

      {/* ── Table panel ── */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">

        {/* Table bar */}
        <div className="px-5 py-3 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-lg bg-violet-100 border border-violet-200 flex items-center justify-center">
              <ClipboardList className="h-3 w-3 text-violet-500" />
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
                  pageSize !== 10 && 'border-violet-300 text-violet-600',
                )}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white border border-slate-200 rounded-lg">
                {PAGE_SIZE_OPTIONS.map((s) => (
                  <SelectItem
                    key={s}
                    value={String(s)}
                    className="text-xs text-slate-600 focus:bg-violet-50 focus:text-violet-700 dark:focus:bg-accent dark:focus:text-accent-foreground cursor-pointer"
                  >
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                {['Consumer', 'Receipt No.', 'Original Amount', 'Adjusted Amount', 'Variance', 'Status', 'Requested At', ''].map((h, i) => (
                  <th
                    key={i}
                    className={cn(
                      'px-5 py-2.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap',
                      (i === 2 || i === 3 || i === 4) ? 'text-right' : 'text-left',
                      i === 7 && 'w-[44px]',
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>

              {/* Loading skeletons */}
              {isLoading && [...Array(6)].map((_, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-5 py-3.5">
                    <div className="h-3 w-28 bg-slate-100 animate-pulse rounded-full" />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="h-3 w-20 bg-slate-100 animate-pulse rounded-full" />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="h-3 w-16 bg-slate-100 animate-pulse rounded-full ml-auto" />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="h-3 w-16 bg-slate-100 animate-pulse rounded-full ml-auto" />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="h-5 w-14 bg-slate-100 animate-pulse rounded-full ml-auto" />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="h-6 w-20 bg-slate-100 animate-pulse rounded-full" />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="h-3 w-24 bg-slate-100 animate-pulse rounded-full" />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="h-7 w-7 bg-slate-100 animate-pulse rounded-lg" />
                  </td>
                </tr>
              ))}

              {/* Empty — no requests */}
              {!isLoading && requests.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-12 w-12 rounded-lg bg-violet-50 border border-violet-100 flex items-center justify-center">
                        <ClipboardList className="h-5 w-5 text-violet-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-600">No adjustment requests</p>
                        <p className="text-xs text-slate-400 mt-1">No payment adjustment requests have been submitted yet.</p>
                      </div>
                    </div>
                  </td>
                </tr>
              )}

              {/* Empty — filtered */}
              {!isLoading && requests.length > 0 && filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-14 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-12 w-12 rounded-lg bg-violet-50 border border-violet-100 flex items-center justify-center">
                        <Search className="h-5 w-5 text-violet-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-600">No results</p>
                        <p className="text-xs text-slate-400 mt-1">No requests match your filters.</p>
                      </div>
                      <button
                        onClick={clearAll}
                        className="inline-flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium text-violet-600 bg-violet-50 border border-violet-200 hover:bg-violet-100 transition-colors"
                      >
                        Clear filters
                      </button>
                    </div>
                  </td>
                </tr>
              )}

              {/* Data rows */}
              {!isLoading && paginated.map((request) => {
                const diff = request.adjusted_amount - request.original_amount
                const isPending = request.adjustment_status.toLowerCase() === 'pending'

                return (
                  <tr
                    key={request.adjustment_id}
                    className={cn(
                      'border-t border-slate-100 hover:bg-violet-50/40 transition-colors cursor-pointer',
                      isPending && 'bg-amber-50/20',
                    )}
                    onClick={() => handleView(request)}
                  >
                    {/* Consumer */}
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-md bg-violet-100 flex items-center justify-center text-[11px] font-bold text-violet-600 shrink-0">
                          {getInitials(request.consumer_name)}
                        </div>
                        <div>
                          <p className="text-[12.5px] font-medium text-slate-800">{request.consumer_name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{request.meter_serial_no}</p>
                        </div>
                      </div>
                    </td>

                    {/* Receipt */}
                    <td className="px-5 py-3">
                      <span className="font-mono text-[12.5px] font-semibold text-violet-600">
                        {request.receipt_number}
                      </span>
                    </td>

                    {/* Original */}
                    <td className="px-5 py-3 text-right">
                      <span className="text-[12.5px] font-medium text-slate-600">
                        ₱{formatPeso(request.original_amount)}
                      </span>
                    </td>

                    {/* Adjusted */}
                    <td className="px-5 py-3 text-right">
                      <span className="text-[12.5px] font-semibold text-slate-800">
                        ₱{formatPeso(request.adjusted_amount)}
                      </span>
                    </td>

                    {/* Diff */}
                    <td className="px-5 py-3 text-right">
                      <DiffBadge diff={diff} />
                    </td>

                    {/* Status */}
                    <td className="px-5 py-3">
                      <StatusBadge status={request.adjustment_status} />
                    </td>

                    {/* Requested At */}
                    <td className="px-5 py-3">
                      <span className="text-[12.5px] text-slate-500">
                        {formatDateTime(request.requested_at)}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="h-7 w-7 rounded-md flex items-center justify-center bg-white border border-slate-200 text-slate-400 hover:text-violet-600 hover:border-violet-300 hover:bg-violet-50 transition-colors">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 bg-white border border-slate-200 rounded-lg p-1.5">
                          <DropdownMenuLabel className="text-[9px] font-bold uppercase tracking-widest text-violet-400 px-2 py-1.5">
                            Actions
                          </DropdownMenuLabel>
                          <DropdownMenuSeparator className="bg-slate-100 mb-1" />

                          <DropdownMenuItem
                            className="cursor-pointer rounded-lg text-xs text-slate-500 focus:bg-violet-50 focus:text-violet-700 dark:focus:bg-accent dark:focus:text-accent-foreground p-0"
                            onSelect={(e) => e.preventDefault()}
                          >
                            <AdjustmentRequestViewModal adjustmentId={request.adjustment_id} onSuccess={fetchRequests}>
                              <div className="flex items-center gap-2.5 w-full px-2 py-2 group">
                                <div className="h-6 w-6 rounded-md flex items-center justify-center shrink-0 transition-colors bg-slate-100 group-hover:bg-blue-100">
                                  <Eye className="h-3 w-3 text-slate-500 group-hover:text-blue-600 transition-colors" />
                                </div>
                                <span className="text-xs font-medium text-slate-500 group-hover:text-blue-600 transition-colors">
                                  View details
                                </span>
                              </div>
                            </AdjustmentRequestViewModal>
                          </DropdownMenuItem>

                          {/* Update — only pending */}
                          {isPending && (
                            <DropdownMenuItem
                              className="cursor-pointer rounded-lg text-xs text-slate-500 focus:bg-violet-50 focus:text-violet-700 dark:focus:bg-accent dark:focus:text-accent-foreground p-0"
                              onSelect={(e) => e.preventDefault()}
                            >
                              <UpdatePaymentAdjustmentForm adjustmentId={request.adjustment_id} onSuccess={fetchRequests}>
                                <div className="flex items-center gap-2.5 w-full px-2 py-2 group">
                                  <div className="h-6 w-6 rounded-md flex items-center justify-center shrink-0 transition-colors bg-amber-100">
                                    <FilePenLine className="h-3 w-3 text-amber-600" />
                                  </div>
                                  <span className="text-xs font-medium text-amber-700">
                                    Update request
                                  </span>
                                </div>
                              </UpdatePaymentAdjustmentForm>
                            </DropdownMenuItem>
                          )}

                          {/* Cancel — only pending */}
                          {isPending && (
                            <>
                              <DropdownMenuSeparator className="bg-slate-100 my-1" />
                              <DropdownMenuItem
                                onClick={() => setCancelTarget(request)}
                                className="cursor-pointer rounded-lg gap-2.5 py-2 group"
                              >
                                <div className="h-6 w-6 rounded-md flex items-center justify-center shrink-0 transition-colors bg-slate-100 group-hover:bg-rose-100">
                                  <Ban className="h-3 w-3 text-slate-500 group-hover:text-rose-600 transition-colors" />
                                </div>
                                <span className="text-xs font-medium text-slate-500 group-hover:text-rose-600 transition-colors">
                                  Cancel request
                                </span>
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Pagination ── */}
      {!isLoading && (
        <TablePagination
          page={safePage}
          pageSize={pageSize}
          total={filtered.length}
          onPageChange={setPage}
        />
      )}

      {/* View Modal */}
      {viewRecord && (
        <AdjustmentRequestViewModal
          adjustmentId={viewRecord.adjustment_id}
          onSuccess={fetchRequests}
          open={viewOpen}
          onOpenChange={setViewOpen}
        />
      )}

      {/* Cancel Dialog */}
      <CancelPaymentAdjustmentDialog
        request={cancelTarget}
        open={!!cancelTarget}
        onOpenChange={(open) => { if (!open) setCancelTarget(null) }}
        onDone={handleCancelDone}
      />
    </div>
  )
}