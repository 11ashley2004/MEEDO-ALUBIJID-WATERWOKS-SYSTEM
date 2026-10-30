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
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
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
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  getAllBillingsAcrossPeriods,
  type BillingRecord,
} from '@/lib/actions/billing/all-billing.actions'
import { BillingViewDialog } from '@/components/admin-ui/billing/BillingViewDialog'

// ─── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatPeso(amount: number): string {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount)
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—'
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

function getConsumerName(record: BillingRecord): string {
  return record.meter_account.consumer.account_name
}

function getPeriodLabel(periodStart: string): string {
  if (!periodStart) return '—'
  const [y, m] = periodStart.split('-').map(Number)
  return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

// ─── Skeleton Row ─────────────────────────────────────────────────────────────

function formatM3(v: number): string {
  return new Intl.NumberFormat('en-PH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(v)
}

function SkeletonRow() {
  return (
    <TableRow>
      {[...Array(12)].map((_, i) => (
        <TableCell key={i} className="py-3">
          <div className="h-3.5 w-full bg-slate-100 animate-pulse rounded-full" />
        </TableCell>
      ))}
    </TableRow>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

const BillingPeriodDetailPage = () => {
  const params = useParams()
  const router = useRouter()
  const periodId = params?.id as string

  const [records, setRecords] = useState<BillingRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedSearch(search)
  const [searchFocused, setSearchFocused] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [periodLabel, setPeriodLabel] = useState('')

  // ── Fetch data ──────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    if (!periodId) return
    setIsLoading(true)
    try {
      const res = await getAllBillingsAcrossPeriods(periodId)
      if (res.status === 'success' && res.data) {
        setRecords(res.data)
        if (res.data.length > 0 && res.data[0].period_start) {
          setPeriodLabel(getPeriodLabel(res.data[0].period_start))
        }
      } else {
        toast.error('Failed to load billing records')
      }
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }, [periodId])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Client-side filtering ──────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    return records.filter((r) => {
      if (q && !getConsumerName(r).toLowerCase().includes(q) &&
          !(r.meter_serial_no || r.meter_account.meter_serial_no || '').toLowerCase().includes(q)) {
        return false
      }
      return true
    })
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

  const totalBilled = records.reduce((sum, r) => sum + r.total_billing, 0)
  const totalPaid = records.reduce((sum, r) => {
    const st = r.billing_status.billing_status_name.toLowerCase()
    // Forwarded bills were not settled — balance moved to a newer period.
    if (st === 'forwarded') return sum
    return sum + (r.total_billing - r.remaining_balance)
  }, 0)
  const totalRemaining = records.reduce((sum, r) => {
    const st = r.billing_status.billing_status_name.toLowerCase()
    if (st === 'unpaid' || st === 'partial') return sum + r.remaining_balance
    return sum
  }, 0)

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="w-full space-y-5">
      <PageHeading
        title={isLoading ? 'Billing History' : periodLabel}
        description="Bills recorded for this reading period"
      />

      {/* Header with back button */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-md border border-slate-200 hover:border-violet-300 hover:bg-violet-50"
          onClick={() => router.push('/clerk/billing')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
      </div>

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
            placeholder="Search consumer or serial no.…"
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
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Consumer</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Serial No.</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Classification</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Due Date</TableHead>
                <TableHead className="text-right text-[9px] font-bold text-slate-400 uppercase tracking-wider">Previous</TableHead>
                <TableHead className="text-right text-[9px] font-bold text-slate-400 uppercase tracking-wider">Present</TableHead>
                <TableHead className="text-right text-[9px] font-bold text-slate-400 uppercase tracking-wider">Consumption</TableHead>
                <TableHead className="text-right text-[9px] font-bold text-slate-400 uppercase tracking-wider">Billed Consumption</TableHead>
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
                  <TableCell colSpan={12} className="h-72 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-12 w-12 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center">
                        <Receipt className="h-5 w-5 text-violet-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-600">No billing records</p>
                        <p className="text-xs text-slate-400 mt-1">No records exist for this period.</p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {!isLoading && records.length > 0 && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={12} className="h-64 text-center">
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
                    <div>
                      <p className="text-[12.5px] font-medium text-slate-800">{getConsumerName(record)}</p>
                      <p className="text-[10px] text-slate-400">
                        {record.meter_account.zone.barangay.barangay_name} · Zone {record.meter_account.zone.zone_name}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="py-3 text-[12.5px] font-mono text-slate-600">
                    {record.meter_serial_no || record.meter_account.meter_serial_no || '—'}
                  </TableCell>
                  <TableCell className="py-3">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                      {record.meter_account.classification.classification_name}
                    </span>
                  </TableCell>
                  <TableCell className="py-3 text-[12.5px] text-slate-500">
                    {formatDate(record.due_date)}
                  </TableCell>
                  <TableCell className="py-3 text-right">
                    <span className="text-[12.5px] tabular-nums text-slate-700">
                      {formatM3(Number(record.consumption?.previous_reading ?? 0))}
                    </span>
                  </TableCell>
                  <TableCell className="py-3 text-right">
                    <span className="text-[12.5px] tabular-nums text-slate-700">
                      {formatM3(Number(record.consumption?.present_reading ?? 0))}
                    </span>
                  </TableCell>
                  <TableCell className="py-3 text-right">
                    <span className="text-[12.5px] font-semibold tabular-nums text-slate-800">
                      {formatM3(Number(record.consumption?.consumption ?? 0))}
                    </span>
                  </TableCell>
                  <TableCell className="py-3 text-right">
                    <span className="text-[12.5px] font-semibold tabular-nums text-violet-700">
                      {formatM3(Number(
                        record.consumption?.billed_consumption
                        ?? record.consumption?.consumption
                        ?? 0,
                      ))}
                    </span>
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

export default BillingPeriodDetailPage