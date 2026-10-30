// app/(app)/treasurer/reconnection-fees/page.tsx
'use client'

import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'


import { TablePagination } from '@/components/shared-ui/pagination'
import { PageHeading } from '@/components/shared-ui/page-heading'
import { useEffect, useState, useMemo, useCallback } from 'react'
import { Search, CheckCircle2, AlertCircle, Clock, X, ChevronDown, SlidersHorizontal, Banknote, Printer, Wallet } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuTrigger,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  getAllPendingReconnectionFees,
  type ReconnectionFeeRecord,
} from '@/lib/actions/payment/reconnection-payment.actions'
import { ReconnectionFeePayDialog } from '@/components/treasurer-ui/reconnection-payment/reconnection-payment'
import { printReconnectionReceipt } from '@/components/treasurer-ui/reconnection-payment/print-reconnection-receipt'

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

const STATUS_OPTIONS = [
  { val: 'all', label: 'All Statuses' },
  { val: 'unpaid', label: 'Unpaid' },
  { val: 'partial', label: 'Partial' },
  { val: 'paid', label: 'Paid' },
  { val: 'forwarded', label: 'Forwarded' },
] as const

type StatusFilter = typeof STATUS_OPTIONS[number]['val']

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatPeso = (amount: number) => {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(amount)
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.trim().toLowerCase()
  switch (normalized) {
    case 'paid':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="h-3 w-3" />
          Paid
        </span>
      )
    case 'partial':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
          <Clock className="h-3 w-3" />
          Partial
        </span>
      )
    case 'forwarded':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
          <CheckCircle2 className="h-3 w-3" />
          Forwarded
        </span>
      )
    case 'unpaid':
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
          <AlertCircle className="h-3 w-3" />
          Unpaid
        </span>
      )
  }
}

// ─── Filters Panel ────────────────────────────────────────────────────────────

function ReconnectionFiltersPanel({
  statusFilter,
  onStatusChange,
}: {
  statusFilter: string
  onStatusChange: (v: string) => void
}) {
  const activeCount = statusFilter !== 'all'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-9 gap-1.5 text-sm font-medium transition-all rounded-md',
            activeCount && [
              'border-violet-400 bg-violet-50 text-violet-700',
              'hover:bg-violet-100 hover:border-violet-500',
            ],
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
          Filters
          {activeCount && (
            <span className="inline-flex items-center justify-center h-[18px] min-w-[18px] px-1 rounded-full bg-violet-600 text-white text-[11px] font-semibold leading-none">
              1
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-48 rounded-md p-1.5">
        <DropdownMenuLabel className="text-[9px] font-bold uppercase tracking-widest text-violet-400 px-2 py-1.5">
          Payment Status
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
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─── Main Page Component ──────────────────────────────────────────────────────

const ReconnectionFeesPage = () => {
  const [reconnections, setReconnections] = useState<ReconnectionFeeRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [printingId, setPrintingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedSearch(search)
  const [searchFocused, setSearchFocused] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // ── Fetch ──────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await getAllPendingReconnectionFees()
      if (res.status === 'success') {
        setReconnections(res.data ?? [])
      } else {
        toast.error(res.message ?? 'Failed to load reconnection fees')
      }
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Print Receipt Handler ──────────────────────────────────
  // Always prints the LATEST payment only. If a reconnection was paid in two
  // installments, the receipt shows just the most recent one — its own
  // receipt number, date and amount — with the balance left after it.
  const handlePrint = async (record: ReconnectionFeeRecord) => {
    const latest = record.latest_payment
    if (!latest) {
      toast.error('No payment found for this reconnection')
      return
    }

    setPrintingId(record.reconnection_id)
    try {
      await printReconnectionReceipt({
        record,
        receiptNumber: latest.receipt_number,
        amountPaid: latest.amount_paid,
        paymentDate: latest.payment_date,
        // The latest payment is the last one made, so what's left on the
        // record right now is exactly the balance after this payment.
        remainingBalance: record.remaining_balance,
      })
    } catch {
      toast.error('Failed to generate print layout')
    } finally {
      setPrintingId(null)
    }
  }

  // ── Clear all filters ──────────────────────────────────────
  const clearAll = useCallback(() => {
    setSearch('')
    setStatusFilter('all')
    setPage(1)
  }, [])

  // ── Client-side filtering ──────────────────────────────────
  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    return reconnections.filter((r) => {
      if (q) {
        const consumer = r.meter_account.consumer.account_name.toLowerCase()
        const meterSerialNo = (r.meter_account.meter_serial_no ?? '').toLowerCase()
        const reconnNo = r.reconnection_no.toLowerCase()
        if (!consumer.includes(q) && !meterSerialNo.includes(q) && !reconnNo.includes(q)) return false
      }
      if (statusFilter !== 'all' && r.payment_status.toLowerCase() !== statusFilter.toLowerCase()) return false
      return true
    })
  }, [reconnections, debouncedSearch, statusFilter])

  useEffect(() => { setPage(1) }, [filtered.length])

  // ── Pagination ─────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginated = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  )


  const hasActiveFilters = debouncedSearch.trim().length > 0 || statusFilter !== 'all'
  const isSearchActive = debouncedSearch.trim().length > 0 || searchFocused
  const isNonDefaultPageSize = pageSize !== 10

  // ── Skeleton ───────────────────────────────────────────────
  const renderSkeleton = () =>
    [...Array(5)].map((_, i) => (
      <TableRow key={i} className="border-t border-slate-100">
        {[...Array(9)].map((_, j) => (
          <TableCell key={j} className="py-3">
            <div className="h-3.5 w-full bg-slate-100 animate-pulse rounded-full" />
          </TableCell>
        ))}
      </TableRow>
    ))

  // ─── Render ────────────────────────────────────────────────
  return (
    <div className="w-full space-y-5">

      <PageHeading
        title="Reconnection Payment"
        description="Manage reconnection fee payments for disconnected accounts"
      />

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
              placeholder="Search consumer, serial no., reconnection #…"
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

          <ReconnectionFiltersPanel
            statusFilter={statusFilter}
            onStatusChange={(v) => { setStatusFilter(v as StatusFilter); setPage(1) }}
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
              <Wallet className="h-3 w-3 text-violet-500" />
            </div>
            <p className="text-xs text-slate-500">
              {isLoading ? (
                <span className="inline-block h-3 w-24 bg-slate-100 animate-pulse rounded-full" />
              ) : (
                <>
                  <span className="font-semibold text-slate-700">{filtered.length}</span>
                  {' '}reconnection{filtered.length !== 1 ? 's' : ''}
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
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Reconnection #</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Consumer</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Serial No.</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Location</TableHead>
                <TableHead className="text-right text-[9px] font-bold text-slate-400 uppercase tracking-wider">Outstanding</TableHead>
                <TableHead className="text-right text-[9px] font-bold text-slate-400 uppercase tracking-wider">Total</TableHead>
                <TableHead className="text-right text-[9px] font-bold text-slate-400 uppercase tracking-wider">Remaining</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Payment Status</TableHead>
                <TableHead className="w-44 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>

              {/* Loading skeletons */}
              {isLoading && renderSkeleton()}

              {/* Empty — no reconnections */}
              {!isLoading && reconnections.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="h-72 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-12 w-12 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center">
                        <Wallet className="h-5 w-5 text-violet-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-600">No reconnection fees</p>
                        <p className="text-xs text-slate-400 mt-1">There are no reconnection fee records yet.</p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {/* Empty — no results */}
              {!isLoading && reconnections.length > 0 && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="h-64 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-12 w-12 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center">
                        <Search className="h-5 w-5 text-violet-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-600">No results</p>
                        <p className="text-xs text-slate-400 mt-1">No reconnection fees match your filters.</p>
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
              {!isLoading && paginated.map((record) => {
                const statusClean = record.payment_status.trim().toLowerCase()
                const isPaid = statusClean === 'paid'
                const isPartial = statusClean === 'partial'
                const isForwarded = statusClean === 'forwarded'
                const isUnpaid = statusClean === 'unpaid' || (!isPaid && !isPartial && !isForwarded)
                const isFullySettled = isPaid || isForwarded || record.remaining_balance <= 0
                const isPrinting = printingId === record.reconnection_id

                // Receipt shows once at least one payment exists (partial or paid).
                // Zero-balance / forwarded records have no payment, so no receipt.
                const canPrintReceipt = (isPartial || isPaid) && !!record.latest_payment

                return (
                  <TableRow
                    key={record.reconnection_id}
                    className={cn(
                      'border-t border-slate-100 hover:bg-violet-50/40 transition-colors',
                      isUnpaid && 'bg-amber-50/20',
                      isForwarded && 'bg-purple-50/20',
                    )}
                  >
                    <TableCell className="py-3">
                      <span className="text-[12.5px] font-mono font-bold text-slate-700">{record.reconnection_no}</span>
                    </TableCell>

                    <TableCell className="py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-md bg-violet-100 flex items-center justify-center text-[11px] font-bold text-violet-600 shrink-0">
                          {record.meter_account.consumer.account_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-[12.5px] font-medium text-slate-800 text-left">
                            {record.meter_account.consumer.account_name}
                          </p>
                          {record.meter_account.consumer.contact_number && (
                            <p className="text-[10px] text-slate-400 text-left">{record.meter_account.consumer.contact_number}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>

                    <TableCell className="py-3">
                      <span className="text-[12px] font-mono text-slate-600">{record.meter_account.meter_serial_no}</span>
                    </TableCell>

                    <TableCell className="py-3">
                      <div className="flex items-center gap-1.5">
                        <p className="text-[12px] text-slate-700">{record.meter_account.zone.zone_name}</p>
                        <p className="text-[10px] text-slate-400">{record.meter_account.zone.barangay.barangay_name}</p>
                      </div>
                    </TableCell>

                    <TableCell className="text-right py-3">
                      <span className="text-[12px] font-medium text-rose-600 tabular-nums">
                        {formatPeso(record.outstanding_balance)}
                      </span>
                    </TableCell>

                    <TableCell className="text-right py-3">
                      <span className="text-[12px] font-semibold tabular-nums text-slate-800">
                        {formatPeso(record.total_amount)}
                      </span>
                    </TableCell>

                    <TableCell className="text-right py-3">
                      {record.remaining_balance > 0 ? (
                        <span className="text-[12px] font-semibold tabular-nums text-rose-600">
                          {formatPeso(record.remaining_balance)}
                        </span>
                      ) : (
                        <span className="text-[12px] text-emerald-600">{formatPeso(0)}</span>
                      )}
                    </TableCell>

                    <TableCell className="py-3">
                      <StatusBadge status={record.payment_status} />
                    </TableCell>

                    <TableCell className="py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Receipt: partial or paid — prints the latest payment only */}
                        {canPrintReceipt && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handlePrint(record)}
                            disabled={isPrinting}
                            title={
                              isPartial
                                ? 'Print receipt for the latest payment'
                                : 'Print receipt'
                            }
                            className="h-7 px-2.5 text-[11px] rounded-md border-slate-200 text-slate-600 gap-1 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-600"
                          >
                            {isPrinting ? (
                              <Spinner />
                            ) : (
                              <Printer className="h-3 w-3" />
                            )}
                            Receipt
                          </Button>
                        )}

                        {/* Pay: unpaid or partial */}
                        {(isUnpaid || isPartial) && (
                          <ReconnectionFeePayDialog
                            reconnectionId={record.reconnection_id}
                            reconnectionNo={record.reconnection_no}
                            remainingBalance={record.remaining_balance}
                            paymentStatus={record.payment_status}
                            onSuccess={fetchData}
                          >
                            <Button
                              size="sm"
                              className="h-7 text-[11px] rounded-md bg-violet-600 hover:bg-violet-700 text-white gap-1"
                            >
                              <Banknote className="h-3 w-3" />
                              Pay
                            </Button>
                          </ReconnectionFeePayDialog>
                        )}

                        {/* Settled tag */}
                        {isFullySettled && !isPrinting && (
                          <span className="text-[10px] font-medium text-emerald-600 px-2 py-1 bg-emerald-50 rounded-md border border-emerald-200 whitespace-nowrap">
                            {isForwarded ? 'Forwarded' : 'Fully Settled'}
                          </span>
                        )}
                      </div>
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

export default ReconnectionFeesPage