'use client'

import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'


import { PageHeading } from '@/components/shared-ui/page-heading'
import { TablePagination } from '@/components/shared-ui/pagination'

import { useEffect, useState, useMemo, useRef } from 'react'
import {
  Search, Droplets, AlertTriangle, Calendar,
  X, Gauge, Eye, Download, MoreHorizontal, SlidersHorizontal, ChevronDown,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

import { getAllConsumerBillings, type ConsumerBillingRecord } from '@/lib/actions/billing/consumer-billing.actions'
import { BillingViewDialog } from '@/components/consumer-ui/billing/ConsumerBillingViewDialog'
import { BillPdfExporter, type BillPdfExporterHandle } from '@/components/consumer-ui/billing/BillPdfExporter'

// ─── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE_OPTIONS = [5, 10, 25] as const
const STATUS_FILTERS = ['all', 'paid', 'partial', 'unpaid', 'forwarded'] as const
type StatusFilter = typeof STATUS_FILTERS[number]

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatPeso(n: number) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n)
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatPeriodShort(periodStart: string): string {
  if (!periodStart) return '—'
  const [y, m] = periodStart.split('-').map(Number)
  return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function getStatusBadgeClass(status: string): string {
  switch (status.toLowerCase()) {
    case 'paid':      return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    case 'partial':   return 'bg-blue-50 text-blue-700 border-blue-200'
    case 'forwarded': return 'bg-violet-50 text-violet-700 border-violet-200'
    default:        return 'bg-amber-50 text-amber-700 border-amber-200'
  }
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
  const activeCount = statusFilter !== 'all' ? 1 : 0

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-9 gap-1.5 text-sm font-medium transition-all rounded-md',
            active && 'border-violet-400 bg-violet-50 text-violet-700 hover:bg-violet-100 hover:border-violet-500',
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
          Filters
          {active && (
            <span className="inline-flex items-center justify-center h-[18px] min-w-[18px] px-1 rounded-full bg-violet-600 text-white text-[11px] font-semibold leading-none">
              {activeCount}
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-44 rounded-md p-1.5">
        <DropdownMenuLabel className="text-[9px] font-bold uppercase tracking-widest text-violet-400 px-2 py-1.5">
          Billing Status
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="mb-1" />
        <DropdownMenuRadioGroup value={statusFilter} onValueChange={onStatusChange}>
          {STATUS_FILTERS.map((s) => (
            <DropdownMenuRadioItem
              key={s}
              value={s}
              className={cn(
                'cursor-pointer rounded-md text-xs',
                statusFilter === s && 'text-violet-600 font-medium bg-violet-50',
              )}
            >
              {s === 'all' ? 'All Statuses' : s.charAt(0).toUpperCase() + s.slice(1)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─── Skeleton rows ─────────────────────────────────────────────────────────────

function SkeletonRows() {
  return (
    <>
      {[...Array(5)].map((_, i) => (
        <TableRow key={i}>
          {[...Array(10)].map((_, j) => (
            <TableCell key={j}><div className="h-4 bg-slate-100 animate-pulse rounded-md w-full" /></TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function ConsumerBillingPage() {
  const [records, setRecords] = useState<ConsumerBillingRecord[]>([])
  const pdfExporterRef = useRef<BillPdfExporterHandle>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedSearch(search)
  const [searchFocused, setSearchFocused] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(5)

  // ── Load all billings ──────────────────────────────────────────────────────
  useEffect(() => {
    setIsLoading(true)
    getAllConsumerBillings()
      .then((res) => {
        if (res.status === 'success' && res.data) {
          setRecords(res.data)
        } else if (res.status === 'unauthenticated') {
          toast.error('Please log in to view your bills.')
        } else {
          toast.error(res.message ?? 'Could not load your bills.')
        }
      })
      .catch(() => toast.error('An unexpected error occurred.'))
      .finally(() => setIsLoading(false))
  }, [])

  // ── Filtering ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => records.filter((r) => {
    if (statusFilter !== 'all' && r.billing_status.billing_status_name.toLowerCase() !== statusFilter) return false
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.trim().toLowerCase()
      const period = r.period_start
        ? formatPeriodShort(r.period_start).toLowerCase()
        : ''
      const meterNo = r.meter_account?.meter_serial_no?.toLowerCase() || ''
      if (!period.includes(q) && !r.billing_status.billing_status_name.toLowerCase().includes(q) && !meterNo.includes(q)) return false
    }
    return true
  }), [records, statusFilter, debouncedSearch])

  useEffect(() => { setPage(1) }, [filtered.length, statusFilter, debouncedSearch])

  // ── Pagination ─────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginated = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  )

  const isSearchActive = search.length > 0 || searchFocused
  const hasActiveFilters = debouncedSearch.trim().length > 0 || statusFilter !== 'all'

  const clearAll = () => {
    setSearch('')
    setStatusFilter('all')
    setPage(1)
  }

  return (
    <div className="w-full space-y-5 lg:mb-0 mb-10">
      <BillPdfExporter ref={pdfExporterRef} />

      {/* Header */}
      <PageHeading title="My Billing" description="Your complete water billing history across all connections" />
{/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1 flex-wrap">
          <div className="relative w-full min-w-0 sm:w-auto sm:flex-1 sm:max-w-sm">
            <Search className={cn(
              'absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 transition-colors',
              isSearchActive ? 'text-violet-400' : 'text-slate-300',
            )} />
            <Input
              placeholder="Search by period, serial no., or status…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
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
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 hover:bg-slate-100"
              >
                <X className="h-3 w-3 text-slate-400" />
              </button>
            )}
          </div>

          <div className="hidden sm:block h-4 w-px bg-slate-200 shrink-0" />

          <FiltersPanel
            statusFilter={statusFilter}
            onStatusChange={(v) => { setStatusFilter(v as StatusFilter); setPage(1) }}
          />

          {hasActiveFilters && (
            <button
              onClick={clearAll}
              className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-xs text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-violet-100 border border-violet-200 flex items-center justify-center">
              <Droplets className="h-3 w-3 text-violet-500" />
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
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1) }}>
              <SelectTrigger className={cn(
                'h-7 w-[58px] rounded-md text-[11px] bg-white border-slate-200 text-slate-500',
                'focus:ring-0 focus:ring-offset-0 hover:border-violet-300',
                pageSize !== 5 && 'border-violet-300 text-violet-600',
              )}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white border border-slate-200 rounded-md">
                {PAGE_SIZE_OPTIONS.map((s) => (
                  <SelectItem key={s} value={String(s)} className="text-xs cursor-pointer focus:bg-violet-50 focus:text-violet-700 dark:focus:bg-accent dark:focus:text-accent-foreground">
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
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Meter Serial</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Contract No.</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Billing period</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Due date</TableHead>
                <TableHead className="text-right text-[9px] font-bold text-slate-400 uppercase tracking-wider">Current bill</TableHead>
                <TableHead className="text-right text-[9px] font-bold text-slate-400 uppercase tracking-wider">Previous balance</TableHead>
                <TableHead className="text-right text-[9px] font-bold text-slate-400 uppercase tracking-wider">Penalty</TableHead>
                <TableHead className="text-right text-[9px] font-bold text-slate-400 uppercase tracking-wider">Total bill</TableHead>
                <TableHead className="text-center text-[9px] font-bold text-slate-400 uppercase tracking-wider">Status</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <SkeletonRows />
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="h-64 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-12 w-12 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center">
                        <Droplets className="h-5 w-5 text-violet-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-600">No billing records found</p>
                        <p className="text-xs text-slate-400 mt-1">
                          {search || statusFilter !== 'all' ? 'Try adjusting your filters.' : 'No billing history yet.'}
                        </p>
                      </div>
                      {hasActiveFilters && (
                        <button
                          onClick={clearAll}
                          className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-xs font-medium text-violet-600 bg-violet-50 border border-violet-200 hover:bg-violet-100 transition-colors"
                        >
                          Clear filters
                        </button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((record) => {
                  const periodStart = record.period_start
                  const status = record.billing_status.billing_status_name
                  const previousBalance = Number(record.previous_balance ?? 0)
                  const penaltyAmount = Number(record.penalty_amount ?? 0)
                  const isOverdue =
                    Number(record.remaining_balance ?? 0) > 0 &&
                    !!record.due_date &&
                    new Date(record.due_date) < new Date()

                  const meterSerialNo = record.meter_account?.meter_serial_no || '—'

                  return (
                    <TableRow key={record.billing_id} className="border-t border-slate-100 hover:bg-violet-50/30 transition-colors">
                      <TableCell className="py-3">
                        <span className="font-mono text-[12.5px] font-medium text-slate-700">
                          {meterSerialNo}
                        </span>
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[12.5px] font-medium text-slate-700">
                            {record.meter_account?.consumer?.contract_no
                              ?? record.consumer?.contract_no
                              ?? '—'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="text-[12.5px] text-slate-700">
                            {periodStart ? formatPeriodShort(periodStart) : '—'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-3 text-[12.5px] text-slate-600">
                        {formatDate(record.due_date)}
                      </TableCell>
                      <TableCell className="py-3 text-right">
                        <span className="text-[12.5px] tabular-nums text-slate-700">
                          {formatPeso(record.current_billing)}
                        </span>
                      </TableCell>
                      <TableCell className="py-3 text-right">
                        <span
                          className={cn(
                            'text-[12.5px] tabular-nums',
                            previousBalance > 0 ? 'font-semibold text-red-600' : 'text-slate-400',
                          )}
                        >
                          {formatPeso(previousBalance)}
                        </span>
                      </TableCell>
                      <TableCell className="py-3 text-right">
                        <span
                          className={cn(
                            'text-[12.5px] tabular-nums',
                            penaltyAmount > 0 ? 'font-semibold text-red-600' : 'text-slate-400',
                          )}
                        >
                          {formatPeso(penaltyAmount)}
                        </span>
                      </TableCell>
                      <TableCell className="py-3 text-right">
                        <span className="text-[13px] font-bold text-slate-800 tabular-nums">
                          {formatPeso(record.total_billing)}
                        </span>
                      </TableCell>
                      <TableCell className="py-3 text-center">
                        <div className="flex flex-col gap-1 items-center">
                          <Badge variant="outline" className={cn('rounded-full px-2.5 py-0.5 text-[10px] font-semibold', getStatusBadgeClass(status))}>
                            {status.charAt(0).toUpperCase() + status.slice(1)}
                          </Badge>
                          {isOverdue && previousBalance > 0 && (
                            <Badge variant="outline" className="rounded-full bg-red-50 text-red-700 border-red-200 text-[10px] gap-1">
                              <AlertTriangle className="h-2.5 w-2.5" /> Overdue
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md border border-slate-200 text-slate-400 hover:text-violet-600 hover:border-violet-300 hover:bg-violet-50">
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44 rounded-md border-slate-200 bg-white p-1.5">
                            <DropdownMenuLabel className="text-[9px] font-bold uppercase tracking-widest text-violet-400 px-2 py-1.5">
                              Actions
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator className="bg-slate-100 mb-1" />
                            <BillingViewDialog
                              billingId={record.billing_id}
                              onDownload={(id) => pdfExporterRef.current?.download(id)}
                            >
                              <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="cursor-pointer rounded-md text-xs text-slate-500 focus:bg-violet-50 focus:text-violet-700 dark:focus:bg-accent dark:focus:text-accent-foreground py-2 gap-2">
                                <Eye className="h-3.5 w-3.5" />
                                View details
                              </DropdownMenuItem>
                            </BillingViewDialog>

                            <DropdownMenuItem
                              className="cursor-pointer rounded-md text-xs text-slate-500 focus:bg-violet-50 focus:text-violet-700 dark:focus:bg-accent dark:focus:text-accent-foreground py-2 gap-2"
                              onSelect={() => pdfExporterRef.current?.download(record.billing_id)}
                            >
                              <Download className="h-3.5 w-3.5" />
                              Download bill
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

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