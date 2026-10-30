// app/(app)/treasurer/transactions/page.tsx
'use client'

import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'


import { TablePagination } from '@/components/shared-ui/pagination'
import { PageHeading } from '@/components/shared-ui/page-heading'
import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  Search,
  X,
  ChevronDown,
  SlidersHorizontal,
  Receipt,
  Wallet,
  Zap,
  Droplet,
  Hash,
  Printer,
} from 'lucide-react'
import { format } from 'date-fns'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu, DropdownMenuContent,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
  DropdownMenuRadioGroup, DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { getAllTransactions, type TransactionRecord } from '@/lib/actions/payment/transaction.actions'
import { ReportGeneratorButton } from '@/components/treasurer-ui/transactions/report-generator-dialog'
import { printTransactionReceipt } from '@/components/treasurer-ui/transactions/print-transaction-receipt'

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

const PAYMENT_TYPE_OPTIONS = [
  { val: 'all', label: 'All Types' },
  { val: 'billing', label: 'Billing' },
  { val: 'connection_fee', label: 'Connection Fee' },
  { val: 'reconnection', label: 'Reconnection' },
] as const

type PaymentTypeFilter = typeof PAYMENT_TYPE_OPTIONS[number]['val']

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatPeso = (amount: number) => {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(amount)
}

const formatDate = (dateString: string) => {
  return format(new Date(dateString), 'MMM dd, yyyy')
}

const formatDateTime = (dateString: string) => {
  return format(new Date(dateString), 'MMM dd, yyyy h:mm a')
}

function getPaymentTypeIcon(typeName: string) {
  const name = typeName.toLowerCase()
  if (name.includes('billing')) return <Droplet className="h-3.5 w-3.5" />
  if (name.includes('connection_fee') || name.includes('connection fee')) return <Zap className="h-3.5 w-3.5" />
  if (name.includes('reconnection')) return <Wallet className="h-3.5 w-3.5" />
  return <Receipt className="h-3.5 w-3.5" />
}

function getPaymentTypeColor(typeName: string) {
  const name = typeName.toLowerCase()
  if (name.includes('billing')) return 'bg-blue-50 text-blue-700 border-blue-200'
  if (name.includes('connection_fee') || name.includes('connection fee')) return 'bg-violet-50 text-violet-700 border-violet-200'
  if (name.includes('reconnection')) return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-slate-50 text-slate-600 border-slate-200'
}

function PaymentTypeBadge({ typeName }: { typeName: string }) {
  const label = typeName.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold border',
      getPaymentTypeColor(typeName)
    )}>
      {getPaymentTypeIcon(typeName)}
      {label}
    </span>
  )
}

// ─── Filters Panel ────────────────────────────────────────────────────────────

function TransactionFiltersPanel({
  typeFilter,
  onTypeChange,
}: {
  typeFilter: string
  onTypeChange: (v: string) => void
}) {
  const activeCount = typeFilter !== 'all'

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
          Payment Type
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="mb-1" />
        <DropdownMenuRadioGroup value={typeFilter} onValueChange={onTypeChange}>
          {PAYMENT_TYPE_OPTIONS.map(({ val, label }) => (
            <DropdownMenuRadioItem
              key={val}
              value={val}
              className={cn(
                'cursor-pointer rounded-md text-xs',
                typeFilter === val && 'text-violet-600 font-medium bg-violet-50',
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

const TransactionsPage = () => {
  const [transactions, setTransactions] = useState<TransactionRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedSearch(search)
  const [searchFocused, setSearchFocused] = useState(false)
  const [typeFilter, setTypeFilter] = useState<PaymentTypeFilter>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // ── Fetch ──────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await getAllTransactions()
      if (res.status === 'success') {
        setTransactions(res.data ?? [])
      } else {
        toast.error(res.message ?? 'Failed to load transactions')
      }
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ── Print receipt ──────────────────────────────────────────
  const handlePrint = useCallback((transaction: TransactionRecord) => {
    const opened = printTransactionReceipt({ transaction })
    if (!opened) {
      toast.error('Popup was blocked. Please allow popups for this site and try again.')
    }
  }, [])

  // ── Clear all filters ──────────────────────────────────────
  const clearAll = useCallback(() => {
    setSearch('')
    setTypeFilter('all')
    setPage(1)
  }, [])

  // ── Client-side filtering ──────────────────────────────────
  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    return transactions.filter((t) => {
      if (q) {
        const receipt = t.receipt_number.toLowerCase()
        const type = t.payment_type_name.toLowerCase()
        const collector = `${t.collected_by.first_name} ${t.collected_by.last_name}`.toLowerCase()
        if (!receipt.includes(q) && !type.includes(q) && !collector.includes(q)) return false
      }
      if (typeFilter !== 'all' && t.payment_type_name.toLowerCase() !== typeFilter) return false
      return true
    })
  }, [transactions, debouncedSearch, typeFilter])

  useEffect(() => { setPage(1) }, [filtered.length])

  // ── Pagination ─────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginated = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  )


  const hasActiveFilters = debouncedSearch.trim().length > 0 || typeFilter !== 'all'
  const isSearchActive = debouncedSearch.trim().length > 0 || searchFocused
  const isNonDefaultPageSize = pageSize !== 10

  // ── Skeleton ───────────────────────────────────────────────
  const renderSkeleton = () =>
    [...Array(5)].map((_, i) => (
      <TableRow key={i} className="border-t border-slate-100">
        {[...Array(7)].map((_, j) => (
          <TableCell key={j} className="py-3">
            <div className="h-3.5 w-full bg-slate-100 animate-pulse rounded-full" />
          </TableCell>
        ))}
      </TableRow>
    ))

  // ── Get total summary ──────────────────────────────────────
  const totalAmount = useMemo(() => {
    return filtered.reduce((sum, t) => sum + t.amount, 0)
  }, [filtered])

  // ─── Render ────────────────────────────────────────────────
  return (
    <div className="w-full space-y-5">

      <PageHeading
        title="All Transactions"
        description="View all payment transactions across billing, connection fees, and reconnections"
      />

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">

        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          {/* Search */}
          <div className="relative w-full min-w-0 sm:w-auto sm:flex-1 sm:max-w-sm">
            <Search
              className={cn(
                'absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 transition-colors',
                isSearchActive ? 'text-violet-400' : 'text-slate-300',
              )}
            />
            <Input
              placeholder="Search receipt #, type, collector..."
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

          <TransactionFiltersPanel
            typeFilter={typeFilter}
            onTypeChange={(v) => { setTypeFilter(v as PaymentTypeFilter); setPage(1) }}
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

        <ReportGeneratorButton transactions={transactions} />
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
                  {' '}transaction{filtered.length !== 1 ? 's' : ''}
                  {hasActiveFilters && <span className="text-slate-400"> · filtered</span>}
                  {filtered.length > 0 && (
                    <span className="ml-2 text-slate-400">· Total: <span className="font-semibold text-slate-700">{formatPeso(totalAmount)}</span></span>
                  )}
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
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Receipt #</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Type</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Collector</TableHead>
                <TableHead className="text-right text-[9px] font-bold text-slate-400 uppercase tracking-wider">Amount</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Payment Date</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Created</TableHead>
                <TableHead className="w-14 text-right text-[9px] font-bold text-slate-400 uppercase tracking-wider">Print</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>

              {/* Loading skeletons */}
              {isLoading && renderSkeleton()}

              {/* Empty — no transactions */}
              {!isLoading && transactions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="h-72 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-12 w-12 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center">
                        <Receipt className="h-5 w-5 text-violet-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-600">No transactions</p>
                        <p className="text-xs text-slate-400 mt-1">No payments have been recorded yet.</p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {/* Empty — no results */}
              {!isLoading && transactions.length > 0 && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="h-64 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-12 w-12 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center">
                        <Search className="h-5 w-5 text-violet-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-600">No results</p>
                        <p className="text-xs text-slate-400 mt-1">No transactions match your filters.</p>
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
              {!isLoading && paginated.map((transaction) => (
                <TableRow
                  key={transaction.payment_id}
                  className="border-t border-slate-100 hover:bg-violet-50/40 transition-colors"
                >
                  <TableCell className="py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-md bg-violet-100 flex items-center justify-center shrink-0">
                        <Hash className="h-3 w-3 text-violet-600" />
                      </div>
                      <span className="text-[12px] font-mono font-bold text-slate-700">
                        {transaction.receipt_number}
                      </span>
                    </div>
                  </TableCell>

                  <TableCell className="py-3">
                    <PaymentTypeBadge typeName={transaction.payment_type_name} />
                  </TableCell>

                  <TableCell className="py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600 shrink-0">
                        {transaction.collected_by.first_name[0]}{transaction.collected_by.last_name[0]}
                      </div>
                      <div>
                        <p className="text-[12px] font-medium text-slate-700">
                          {transaction.collected_by.last_name}, {transaction.collected_by.first_name}
                        </p>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="text-right py-3">
                    <span className="text-[13px] font-semibold text-emerald-700 tabular-nums">
                      {formatPeso(transaction.amount)}
                    </span>
                  </TableCell>

                  <TableCell className="py-3">
                    <span className="text-[12px] text-slate-600">
                      {formatDate(transaction.payment_date)}
                    </span>
                  </TableCell>

                  <TableCell className="py-3">
                    <span className="text-[11px] text-slate-400">
                      {formatDateTime(transaction.created_at)}
                    </span>
                  </TableCell>

                  <TableCell className="py-3 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      title={`Print receipt ${transaction.receipt_number}`}
                      aria-label={`Print receipt ${transaction.receipt_number}`}
                      className="h-7 w-7 p-0 rounded-md border-slate-200 text-slate-500 hover:border-violet-300 hover:text-violet-600 hover:bg-violet-50"
                      onClick={() => handlePrint(transaction)}
                    >
                      <Printer className="h-3.5 w-3.5" />
                    </Button>
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

export default TransactionsPage