'use client'

import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'


import { TablePagination } from '@/components/shared-ui/pagination'
import { PageHeading } from '@/components/shared-ui/page-heading'
import { useEffect, useState, useMemo, useCallback } from 'react'
import { Search, MoreHorizontal, CheckCircle2, XCircle, Clock, X, ChevronDown, SlidersHorizontal, Gauge, Receipt, Banknote, Printer } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { format } from 'date-fns'
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
  getAllBillingsForLatestReadingOrder,
  getBillingForPrint,
  type BillingRecord,
} from '@/lib/actions/payment/billing-payment.actions'
import { PayBillDialog } from '@/components/treasurer-ui/payment-billing/pay-bill-dialog'
import { printReceipt } from '@/components/treasurer-ui/payment-billing/print-receipt'

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

const STATUS_OPTIONS = [
  { val: 'all', label: 'All Statuses' },
  { val: 'unpaid', label: 'Unpaid' },
  { val: 'partial', label: 'Partial' },
  { val: 'paid', label: 'Paid' },
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

const formatDate = (dateString: string) => {
  if (!dateString) return '—'
  return format(new Date(dateString), 'MMM dd, yyyy')
}

function StatusBadge({ status }: { status: string }) {
  switch (status.toLowerCase()) {
    case 'unpaid':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
          <Clock className="h-3 w-3" />
          Unpaid
        </span>
      )
    case 'partial':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
          <Clock className="h-3 w-3" />
          Partial
        </span>
      )
    case 'paid':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="h-3 w-3" />
          Paid
        </span>
      )
    case 'forwarded':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-violet-50 text-violet-700 border border-violet-200">
          Forwarded
        </span>
      )
    default:
      return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-slate-50 text-slate-500 border border-slate-200">{status}</span>
  }
}

// ─── Filters Panel ────────────────────────────────────────────────────────────

function BillingFiltersPanel({
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
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─── Main Page Component ──────────────────────────────────────────────────────

const BillingPage = () => {
  const [billings, setBillings] = useState<BillingRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedSearch(search)
  const [searchFocused, setSearchFocused] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [reprintLoading, setReprintLoading] = useState<Set<string>>(new Set())

  // ── Fetch ──────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await getAllBillingsForLatestReadingOrder()
      if (res.status === 'success') {
        setBillings(res.data ?? [])
      } else {
        toast.error(res.message ?? 'Failed to load billings')
      }
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Clear all filters ──────────────────────────────────────
  const clearAll = useCallback(() => {
    setSearch('')
    setStatusFilter('all')
    setPage(1)
  }, [])

  // ── Client-side filtering ──────────────────────────────────
  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    return billings.filter((b) => {
      if (q) {
        const consumer = b.meter_account.consumer.account_name.toLowerCase()
        const meterSerialNo = (b.meter_account.meter_serial_no ?? '').toLowerCase()
        const zone = `${b.meter_account.zone.zone_name} ${b.meter_account.zone.barangay.barangay_name}`.toLowerCase()
        if (!consumer.includes(q) && !meterSerialNo.includes(q) && !zone.includes(q)) return false
      }
      if (statusFilter !== 'all' && b.billing_status.toLowerCase() !== statusFilter) return false
      return true
    })
  }, [billings, debouncedSearch, statusFilter])

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

  // ── Export rows (respects current search + filters) ───────
  const exportRows = useMemo(
    () =>
      filtered.map((b) => ({
        meter_serial_no: b.meter_account.meter_serial_no,
        consumer_name: b.meter_account.consumer.account_name,
        zone_name: b.meter_account.zone.zone_name,
        barangay_name: b.meter_account.zone.barangay.barangay_name,
        classification_name: b.meter_account.classification.classification_name,
        due_date: formatDate(b.due_date),
        total_billing: b.total_billing,
        amount_paid: b.amount_paid_total,
        remaining: b.amount_due,
        status: b.billing_status,
      })),
    [filtered],
  )

  // ── Reprint ───────────────────────────────────────────────
  const handleReprint = async (billingId: string, payment: {
    billing_payment_id: string
    receipt_number: string
    amount_paid: number
    payment_date: string
    processed_by_name: string
  }) => {
    setReprintLoading((prev) => new Set(prev).add(payment.billing_payment_id))
    try {
      const res = await getBillingForPrint(billingId)
      if (res.status !== 'success' || !res.data) {
        toast.error('Failed to fetch billing data for print')
        return
      }
      printReceipt({
        bill: res.data,
        billingPaymentId: payment.billing_payment_id,
        receiptNumber: payment.receipt_number,
        amountPaid: payment.amount_paid,
        paymentDate: payment.payment_date,
        remainingBalance: res.data.amount_due,
        processedByName: payment.processed_by_name,
      })
    } catch {
      toast.error('An unexpected error occurred while preparing the receipt')
    } finally {
      setReprintLoading((prev) => {
        const n = new Set(prev)
        n.delete(payment.billing_payment_id)
        return n
      })
    }
  }

  // ── Skeleton ───────────────────────────────────────────────
  const renderSkeleton = () =>
    [...Array(5)].map((_, i) => (
      <TableRow key={i} className="border-t border-slate-100">
        {[...Array(10)].map((_, j) => (
          <TableCell key={j} className="py-3">
            <div className="h-3.5 w-full bg-slate-100 animate-pulse rounded-full" />
          </TableCell>
        ))}
      </TableRow>
    ))

  // ─── Render ────────────────────────────────────────────────
  return (
    <div className="w-full space-y-5">

      <PageHeading title="Billing Payment" description="Showing each meter account's current billing" />

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

          <BillingFiltersPanel
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
              <Receipt className="h-3 w-3 text-violet-500" />
            </div>
            <p className="text-xs text-slate-500">
              {isLoading ? (
                <span className="inline-block h-3 w-24 bg-slate-100 animate-pulse rounded-full" />
              ) : (
                <>
                  <span className="font-semibold text-slate-700">{filtered.length}</span>
                  {' '}billing{filtered.length !== 1 ? 's' : ''}
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
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">S/N</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Consumer</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Zone / Barangay</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Classification</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Due Date</TableHead>
                <TableHead className="text-right text-[9px] font-bold text-slate-400 uppercase tracking-wider">Total Billing</TableHead>
                <TableHead className="text-right text-[9px] font-bold text-slate-400 uppercase tracking-wider">Amount Paid</TableHead>
                <TableHead className="text-right text-[9px] font-bold text-slate-400 uppercase tracking-wider">Remaining</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Status</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>

              {/* Loading skeletons */}
              {isLoading && renderSkeleton()}

              {/* Empty — no billings */}
              {!isLoading && billings.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="h-72 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-12 w-12 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center">
                        <Receipt className="h-5 w-5 text-violet-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-600">No current billings</p>
                        <p className="text-xs text-slate-400 mt-1">No meter accounts have a current billing record yet.</p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {/* Empty — no results */}
              {!isLoading && billings.length > 0 && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="h-64 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-12 w-12 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center">
                        <Search className="h-5 w-5 text-violet-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-600">No results</p>
                        <p className="text-xs text-slate-400 mt-1">No billings match your filters.</p>
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
              {!isLoading && paginated.map((bill) => {
                const isFullyPaid = bill.billing_status.toLowerCase() === 'paid'
                const lastPayment = bill.payments.length > 0 ? bill.payments[0] : null

                return (
                  <TableRow
                    key={bill.billing_id}
                    className={cn(
                      'border-t border-slate-100 hover:bg-violet-50/40 transition-colors',
                      !isFullyPaid && bill.amount_due > 0 && 'bg-amber-50/20',
                    )}
                  >
                    <TableCell className="py-3">
                      <span className="text-[12.5px] font-mono text-slate-600">{bill.meter_account.meter_serial_no}</span>
                    </TableCell>

                    <TableCell className="py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-md bg-violet-100 flex items-center justify-center text-[11px] font-bold text-violet-600 shrink-0">
                          {bill.meter_account.consumer.account_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-[12.5px] font-medium text-slate-800">
                            {bill.meter_account.consumer.account_name}
                          </p>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell className="py-3">
                      <div className='flex items-center gap-1.5'>
                        <p className="text-[12.5px] font-medium text-slate-700">{bill.meter_account.zone.zone_name}</p>
                        <p className="text-[10px] text-slate-400">{bill.meter_account.zone.barangay.barangay_name}</p>
                      </div>
                    </TableCell>

                    <TableCell className="py-3">
                      <span className="text-[12.5px] text-slate-600">{bill.meter_account.classification.classification_name}</span>
                    </TableCell>

                    <TableCell className="py-3">
                      <span className="text-[12.5px] text-slate-500 whitespace-nowrap">{formatDate(bill.due_date)}</span>
                    </TableCell>

                    <TableCell className="text-right py-3">
                      <span className="text-[12.5px] font-semibold tabular-nums text-slate-800">{formatPeso(bill.total_billing)}</span>
                    </TableCell>

                    <TableCell className="text-right py-3">
                      <span className="text-[12.5px] tabular-nums text-emerald-700">
                        {formatPeso(bill.amount_paid_total)}
                      </span>
                    </TableCell>

                    <TableCell className="text-right py-3">
                      {bill.amount_due > 0 ? (
                        <span className="text-[12.5px] font-semibold tabular-nums text-rose-600">{formatPeso(bill.amount_due)}</span>
                      ) : (
                        <span className="text-[12.5px] text-emerald-600">{formatPeso(0)}</span>
                      )}
                    </TableCell>

                    <TableCell className="py-3">
                      <StatusBadge status={bill.billing_status} />
                    </TableCell>

                    <TableCell className="py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {lastPayment && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-[11px] rounded-md border-slate-200 text-slate-500 hover:border-violet-300 hover:text-violet-600 gap-1"
                            onClick={() => handleReprint(bill.billing_id, lastPayment)}
                            disabled={reprintLoading.has(lastPayment.billing_payment_id)}
                          >
                            {reprintLoading.has(lastPayment.billing_payment_id)
                              ? <Spinner />
                              : <Printer className="h-3 w-3" />
                            }
                          </Button>
                        )}

                        {!isFullyPaid && (
                          <PayBillDialog billingId={bill.billing_id} onSuccess={fetchData}>
                            <Button
                              size="sm"
                              className="h-7 text-[11px] rounded-md bg-violet-600 hover:bg-violet-600 text-white gap-1"
                            >
                              <Banknote className="h-3 w-3" />
                              Pay
                            </Button>
                          </PayBillDialog>
                        )}

                        {isFullyPaid && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-600 border border-emerald-200">
                            <CheckCircle2 className="h-3 w-3" /> Settled
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

export default BillingPage