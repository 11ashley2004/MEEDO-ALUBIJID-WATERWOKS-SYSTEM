'use client'

import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'


import { TablePagination } from '@/components/shared-ui/pagination'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search,
  Receipt,
  MoreHorizontal,
  Eye,
  Calendar,
  SlidersHorizontal,
  ChevronDown,
  X,
  FileText,
  Users,
  TrendingUp,
  TrendingDown,
  ArrowRight,
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
  getReadingPeriodsSummary,
  getBillingFilterOptions,
  type ReadingPeriodSummary,
  type FilterOption,
} from '@/lib/actions/billing/all-billing.actions'
import { ReportButton  } from '@/components/admin-ui/billing-history/billing-history-report-button'

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

function formatPeriod(periodStart: string): string {
  if (!periodStart) return '—'
  const [y, m] = periodStart.split('-').map(Number)
  return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function getStatusBadgeClass(status: string): string {
  switch (status.toLowerCase()) {
    case 'paid': return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    case 'partial': return 'bg-blue-50 text-blue-700 border-blue-200'
    case 'forwarded': return 'bg-violet-50 text-violet-700 border-violet-200'
    default: return 'bg-amber-50 text-amber-700 border-amber-200'
  }
}

// ─── Filters Panel ────────────────────────────────────────────────────────────

function FiltersPanel({
  onClear,
  hasFilters,
}: {
  onClear: () => void
  hasFilters: boolean
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-9 gap-1.5 text-sm font-medium transition-all rounded-md',
            hasFilters && [
              'border-violet-400 bg-violet-50 text-violet-700',
              'hover:bg-violet-100 hover:border-violet-500',
            ],
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
          Filters
          {hasFilters && (
            <span className="inline-flex items-center justify-center h-[18px] min-w-[18px] px-1 rounded-full bg-violet-600 text-white text-[11px] font-semibold leading-none">
              1
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-48 rounded-md p-1.5">
        <DropdownMenuLabel className="text-[9px] font-bold uppercase tracking-widest text-violet-400 px-2 py-1.5">
          Filters
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="mb-1" />
        <DropdownMenuItem
          className="cursor-pointer rounded-md text-xs text-slate-500 focus:bg-violet-50 focus:text-violet-700 dark:focus:bg-accent dark:focus:text-accent-foreground gap-2"
          onClick={onClear}
        >
          <X className="h-3 w-3" />
          Clear All
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─── Skeleton Row ─────────────────────────────────────────────────────────────

function formatM3(v: number): string {
  return `${new Intl.NumberFormat('en-PH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(v)} m³`
}

function SkeletonRow() {
  return (
    <TableRow>
      {[...Array(9)].map((_, i) => (
        <TableCell key={i} className="py-3">
          <div className="h-3.5 w-full bg-slate-100 animate-pulse rounded-full" />
        </TableCell>
      ))}
    </TableRow>
  )
}

interface CurrentBillingPageProps {
  basePath?: string
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

const BillingPeriodsPage = ({ basePath = '/admin' }: CurrentBillingPageProps) => {
  const router = useRouter()
  const [periods, setPeriods] = useState<ReadingPeriodSummary[]>([])
  const [barangays, setBarangays] = useState<FilterOption[]>([])
  const [classifications, setClassifications] = useState<FilterOption[]>([])
  const [statuses, setStatuses] = useState<FilterOption[]>([])
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedSearch(search)
  const [searchFocused, setSearchFocused] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // ── Load data ──────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [periodsRes, filterRes] = await Promise.all([
        getReadingPeriodsSummary(),
        getBillingFilterOptions(),
      ])

      setPeriods(periodsRes)

      if (filterRes.status === 'success' && filterRes.data) {
        setBarangays(filterRes.data.barangays)
        setClassifications(filterRes.data.classifications)
        setStatuses(filterRes.data.statuses)
      }
    } catch {
      toast.error('Failed to load data')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Client-side filtering ──────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    if (!q) return periods
    return periods.filter((p) =>
      p.label.toLowerCase().includes(q) ||
      formatDate(p.period_start).toLowerCase().includes(q)
    )
  }, [periods, debouncedSearch])

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

  // ─── Handle View Details ──────────────────────────────────────────────────

  const handleViewDetails = (periodId: string) => {
    router.push(`${basePath}/billing/history/${periodId}`)
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

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
              placeholder="Search period..."
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
            hasFilters={hasActiveFilters}
            onClear={clearFilters}
          />

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-xs text-slate-400 hover:text-violet-600 hover:bg-violet-50"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>

          <ReportButton 
              periods={periods}
              statuses={statuses}
              barangays={barangays}
            />
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
                  {' period'}{filtered.length !== 1 ? 's' : ''}
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
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Period</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Due Date</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Accounts</TableHead>
                <TableHead className="text-right text-[9px] font-bold text-slate-400 uppercase tracking-wider">Consumption</TableHead>
                <TableHead className="text-right text-[9px] font-bold text-slate-400 uppercase tracking-wider">Billed Consumption</TableHead>
                <TableHead className="text-right text-[9px] font-bold text-slate-400 uppercase tracking-wider">Total Billed</TableHead>
                <TableHead className="text-right text-[9px] font-bold text-slate-400 uppercase tracking-wider">Total Paid</TableHead>
                <TableHead className="text-right text-[9px] font-bold text-slate-400 uppercase tracking-wider">Total Unpaid</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>

              {/* Loading skeletons */}
              {isLoading && [...Array(5)].map((_, i) => <SkeletonRow key={i} />)}

              {/* Empty — no periods */}
              {!isLoading && periods.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="h-72 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-12 w-12 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center">
                        <Receipt className="h-5 w-5 text-violet-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-600">No billing periods found</p>
                        <p className="text-xs text-slate-400 mt-1">Billing periods will appear here once billings are generated.</p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {/* Empty — no results */}
              {!isLoading && periods.length > 0 && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="h-64 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-12 w-12 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center">
                        <Search className="h-5 w-5 text-violet-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-600">No results</p>
                        <p className="text-xs text-slate-400 mt-1">No periods match your search.</p>
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

              {/* Data rows */}
              {!isLoading && paginated.map((period) => {
                const isFullyPaid = period.total_remaining === 0
                const totalPaid = period.total_billed - period.total_remaining

                return (
                  <TableRow
                    key={period.reading_period_id}
                    className="border-t border-slate-100 hover:bg-violet-50/40 transition-colors"
                  >
                    <TableCell className="py-3">
                      <div>
                        <p className="text-[12.5px] font-semibold text-slate-800">
                          {period.label}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {formatDate(period.period_start)} — {formatDate(period.period_end)}
                        </p>
                      </div>
                    </TableCell>

                    <TableCell className="py-3">
                      <span className="text-[12.5px] text-slate-500">
                        {formatDate(period.due_date)}
                      </span>
                    </TableCell>

                    <TableCell className="py-3">
                      <div className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-slate-400" />
                        <span className="text-[12.5px] font-semibold text-slate-700">
                          {period.total_accounts}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          account{period.total_accounts !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell className="py-3 text-right">
                      <span className="text-[12.5px] font-semibold tabular-nums text-slate-800">
                        {formatM3(period.total_consumption)}
                      </span>
                    </TableCell>

                    <TableCell className="py-3 text-right">
                      <span className="text-[12.5px] font-semibold tabular-nums text-violet-700">
                        {formatM3(period.total_billed_consumption)}
                      </span>
                    </TableCell>

                    <TableCell className="py-3 text-right">
                      <span className="text-[12.5px] font-semibold tabular-nums text-slate-800">
                        {formatPeso(period.total_billed)}
                      </span>
                    </TableCell>

                    <TableCell className="py-3 text-right">
                      <span className="text-[12.5px] font-semibold tabular-nums text-emerald-700">
                        {formatPeso(totalPaid)}
                      </span>
                    </TableCell>

                    <TableCell className="py-3 text-right">
                      <span className={cn(
                        'text-[12.5px] font-semibold tabular-nums',
                        period.total_remaining > 0 ? 'text-rose-600' : 'text-emerald-600'
                      )}>
                        {formatPeso(period.total_remaining)}
                      </span>
                    </TableCell>

                    <TableCell className="py-3">
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

                          <DropdownMenuItem
                            className="cursor-pointer rounded-md text-xs text-slate-500 focus:bg-violet-50 focus:text-violet-700 dark:focus:bg-accent dark:focus:text-accent-foreground py-2 gap-2"
                            onClick={() => handleViewDetails(period.reading_period_id)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>View Details</span>
                          </DropdownMenuItem>
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

export default BillingPeriodsPage