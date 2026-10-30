'use client'

import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'


import { TablePagination } from '@/components/shared-ui/pagination'
import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Search,
  Receipt,
  MoreHorizontal,
  Eye,
  Gauge,
  Droplets,
  Calendar,
  AlertCircle,
  AlertTriangle,
  SlidersHorizontal,
  ChevronDown,
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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from '@/components/ui/dropdown-menu'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import {
  getBillingsByPeriod,
  getCurrentBillingPeriod,
  getBillingFilterOptions,
  type BillingTableRow,
  type FilterOption,
  type CurrentPeriodMeta,
} from '@/lib/actions/billing/billing.actions'
import { toast } from 'sonner'

import { BillingPdfExportButton } from '@/components/admin-ui/billing/BillingPdfExportButton'
import { BillingViewDialog } from '@/components/admin-ui/billing/BillingViewDialog'
import { BillingDisconnectionNoticeModal } from '@/components/admin-ui/disconnection-notice/BillingDisconnectionNoticeModal'

// ─── Types ────────────────────────────────────────────────────────────────────

interface FilterState {
  // REMOVED: type field - no longer needed since meter_type is removed
  status:         string
  barangay:       string
  classification: string
}

const DEFAULT_FILTERS: FilterState = {
  status:         'all',
  barangay:       'all',
  classification: 'all',
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function formatPeriod(period: string): string {
  const [yearStr, monthStr] = period.split('-')
  const year = parseInt(yearStr)
  const month = parseInt(monthStr) - 1
  const lastDay = new Date(year, month + 1, 0).getDate()
  const name = new Date(year, month).toLocaleDateString('en-US', { month: 'long' })
  return `${name} 1–${lastDay}, ${year}`
}

function formatPeriodShort(period: string): string {
  const [y, m] = period.split('-').map(Number)
  return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

function formatPeso(amount: number): string {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount)
}

function formatM3(v: number): string {
  return new Intl.NumberFormat('en-PH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(v)
}

function getStatusBadgeClass(status: string): string {
  switch (status.toLowerCase()) {
    case 'paid': return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
    case 'partial': return 'bg-blue-50 text-blue-700 ring-blue-200'
    case 'forwarded': return 'bg-violet-50 text-violet-700 ring-violet-200'
    default: return 'bg-yellow-50 text-yellow-700 ring-yellow-200'
  }
}

function getJobStatusBadgeClass(status: string): string {
  switch (status.toLowerCase()) {
    case 'open': return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
    case 'extended': return 'bg-blue-50 text-blue-700 ring-blue-200'
    case 'closed': return 'bg-slate-100 text-slate-600 ring-slate-200'
    default: return 'bg-yellow-50 text-yellow-700 ring-yellow-200'
  }
}

// ─── Filters Panel ──────────────────────────────────────────────────────────

function FiltersPanel({
  filters, barangays, classifications, statuses, onChange,
}: {
  filters: FilterState
  barangays: FilterOption[]
  classifications: FilterOption[]
  statuses: FilterOption[]
  onChange: (key: keyof FilterState, val: string) => void
}) {
  const [barangaySearch, setBarangaySearch] = useState('')
  const debouncedBarangaySearch = useDebouncedSearch(barangaySearch)

  const activeCount = [
    filters.status !== 'all',
    filters.barangay !== 'all',
    filters.classification !== 'all',
  ].filter(Boolean).length

  const filteredBarangays = debouncedBarangaySearch
    ? barangays.filter((b) => b.name.toLowerCase().includes(debouncedBarangaySearch.toLowerCase()))
    : barangays

  return (
    <DropdownMenu onOpenChange={() => setBarangaySearch('')}>
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

      <DropdownMenuContent align="end" className="w-56 rounded-md p-1.5">
        {/* REMOVED: Type filter - meter_type no longer exists */}

        {/* Barangay */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="text-[9px] font-bold uppercase tracking-widest text-violet-400 px-2 py-1.5">
            Barangay
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent className="w-60 p-2 rounded-md">
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
                <Input
                  value={barangaySearch}
                  onChange={(e) => setBarangaySearch(e.target.value)}
                  placeholder="Search barangay"
                  className="h-7 pl-7 text-xs rounded-md"
                />
              </div>
              <ScrollArea className="max-h-48">
                <DropdownMenuRadioGroup value={filters.barangay} onValueChange={(v) => onChange('barangay', v)}>
                  <DropdownMenuRadioItem value="all" className="cursor-pointer rounded-md text-xs">
                    All Barangays
                  </DropdownMenuRadioItem>
                  {filteredBarangays.map((b) => (
                    <DropdownMenuRadioItem key={b.id} value={b.id} className="cursor-pointer rounded-md text-xs">
                      {b.name}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </ScrollArea>
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>

        <DropdownMenuSeparator className="my-1" />

        {/* Classification */}
        <DropdownMenuLabel className="text-[9px] font-bold uppercase tracking-widest text-violet-400 px-2 py-1.5">
          Classification
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={filters.classification} onValueChange={(v) => onChange('classification', v)}>
          <DropdownMenuRadioItem value="all" className="cursor-pointer rounded-md text-xs">
            All Classifications
          </DropdownMenuRadioItem>
          {classifications.map((c) => (
            <DropdownMenuRadioItem key={c.id} value={c.id} className="cursor-pointer rounded-md text-xs">
              {c.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator className="my-1" />

        {/* Status */}
        <DropdownMenuLabel className="text-[9px] font-bold uppercase tracking-widest text-violet-400 px-2 py-1.5">
          Status
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={filters.status} onValueChange={(v) => onChange('status', v)}>
          <DropdownMenuRadioItem value="all" className="cursor-pointer rounded-md text-xs">
            All Statuses
          </DropdownMenuRadioItem>
          {statuses.map((s) => (
            <DropdownMenuRadioItem key={s.id} value={s.id} className="cursor-pointer rounded-md text-xs">
              {s.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const CurrentBillingPage = () => {
  const [records, setRecords] = useState<BillingTableRow[]>([])
  const [currentPeriod, setCurrentPeriod] = useState<CurrentPeriodMeta | null>(null)
  const [barangays, setBarangays] = useState<FilterOption[]>([])
  const [classifications, setClassifications] = useState<FilterOption[]>([])
  const [statuses, setStatuses] = useState<FilterOption[]>([])
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedSearch(search)
  const [searchFocused, setSearchFocused] = useState(false)
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [isLoading, setIsLoading] = useState(true)
  const [viewBillingId, setViewBillingId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // ── Filter setters ────────────────────────────────────────
  const setFilter = useCallback((key: keyof FilterState, val: string) => {
    setFilters((prev) => ({ ...prev, [key]: val }))
    setPage(1)
  }, [])

  const clearAll = useCallback(() => {
    setFilters(DEFAULT_FILTERS)
    setSearch('')
    setPage(1)
  }, [])

  // ── Load filter options ───────────────────────────────────
  useEffect(() => {
    getBillingFilterOptions().then((res) => {
      if (res.status === 'success' && res.data) {
        setBarangays(res.data.barangays)
        setClassifications(res.data.classifications)
        setStatuses(res.data.statuses)
      }
    })
  }, [])

  // ── Load current period billings ──────────────────────────
  const fetchBillings = useCallback(async () => {
    setIsLoading(true)
    try {
      const period = await getCurrentBillingPeriod()
      setCurrentPeriod(period)
      if (!period) { setRecords([]); return }

      const res = await getBillingsByPeriod(period.reading_period_id)
      if (res.status === 'success' && res.data) {
        setRecords(res.data)
      } else {
        toast.error('Failed to load billing records')
      }
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchBillings() }, [fetchBillings])

  // ── Client-side filtering ─────────────────────────────────
  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    return records.filter((r) => {
      if (q && !r.consumer_name.toLowerCase().includes(q) && !(r.meter_serial_no ?? '').toLowerCase().includes(q)) {
        return false
      }
      if (filters.barangay !== 'all') {
        const barangayName = barangays.find(b => b.id === filters.barangay)?.name
        if (barangayName && !r.address.includes(barangayName)) return false
      }
      if (filters.classification !== 'all') {
        const classificationName = classifications.find(c => c.id === filters.classification)?.name
        if (classificationName && r.classification !== classificationName) return false
      }
      // REMOVED: meter_type filter - no longer needed
      return true
    })
  }, [records, filters, debouncedSearch, barangays, classifications])

  useEffect(() => { setPage(1) }, [filtered.length])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginated = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  )

  const hasActiveFilters = debouncedSearch.trim().length > 0 ||
    filters.status !== 'all' ||
    filters.barangay !== 'all' ||
    filters.classification !== 'all'

  const isSearchActive = debouncedSearch.trim().length > 0 || searchFocused
  const isNonDefaultPageSize = pageSize !== 10
  const periodLabel = currentPeriod ? currentPeriod.period_label : ''


  return (
    <div className="w-full space-y-5">

      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">

        {/* Left: search + filters */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1 min-w-0">
          <div className="relative w-full min-w-0 sm:w-auto sm:flex-1 sm:max-w-sm">
            <Search
              className={cn(
                'absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 transition-colors',
                isSearchActive ? 'text-violet-400' : 'text-slate-300',
              )}
            />
            <Input
              placeholder="Search consumer or serial no..."
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
            filters={filters}
            barangays={barangays}
            classifications={classifications}
            statuses={statuses}
            onChange={setFilter}
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

        {/* Right: period badge + actions */}
        <div className="flex items-center gap-2 shrink-0">
          {isLoading ? (
            <>
              <div className="h-9 w-32 rounded-md bg-slate-100 animate-pulse" />
              <div className="h-9 w-28 rounded-md bg-slate-100 animate-pulse" />
              <div className="h-9 w-44 rounded-md bg-slate-100 animate-pulse" />
            </>
          ) : currentPeriod ? (
            <>
              <div className="flex items-center gap-2 h-9 px-3 rounded-md bg-gradient-to-r from-violet-50 to-white border border-slate-200">
                <Calendar className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                <span className="text-[11px] font-medium text-slate-700 whitespace-nowrap">
                  {currentPeriod.period_label}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <BillingPdfExportButton label="Export PDF" />
                <BillingDisconnectionNoticeModal onSuccess={fetchBillings} />
              </div>
            </>
          ) : null}
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
                  {' '}record{filtered.length !== 1 ? 's' : ''}
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
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Classification</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Due Date</TableHead>
                <TableHead className="text-right text-[9px] font-bold text-slate-400 uppercase tracking-wider">Previous</TableHead>
                <TableHead className="text-right text-[9px] font-bold text-slate-400 uppercase tracking-wider">Present</TableHead>
                <TableHead className="text-right text-[9px] font-bold text-slate-400 uppercase tracking-wider">Consumption</TableHead>
                <TableHead className="text-right text-[9px] font-bold text-slate-400 uppercase tracking-wider">Billed Consumption</TableHead>
                <TableHead className="text-right text-[9px] font-bold text-slate-400 uppercase tracking-wider">Current Bill</TableHead>
                <TableHead className="text-right text-[9px] font-bold text-slate-400 uppercase tracking-wider">Total Bill</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>

              {/* Loading skeletons */}
              {isLoading && [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell className="py-3"><div className="h-3.5 w-32 bg-slate-100 animate-pulse rounded-full" /></TableCell>
                  <TableCell className="py-3"><div className="h-3.5 w-20 bg-slate-100 animate-pulse rounded-full" /></TableCell>
                  <TableCell className="py-3"><div className="h-6 w-20 bg-slate-100 animate-pulse rounded-full" /></TableCell>
                  <TableCell className="py-3"><div className="h-3.5 w-24 bg-slate-100 animate-pulse rounded-full" /></TableCell>
                  <TableCell className="py-3"><div className="h-3.5 w-14 bg-slate-100 animate-pulse rounded-full ml-auto" /></TableCell>
                  <TableCell className="py-3"><div className="h-3.5 w-14 bg-slate-100 animate-pulse rounded-full ml-auto" /></TableCell>
                  <TableCell className="py-3"><div className="h-3.5 w-14 bg-slate-100 animate-pulse rounded-full ml-auto" /></TableCell>
                  <TableCell className="py-3"><div className="h-3.5 w-14 bg-slate-100 animate-pulse rounded-full ml-auto" /></TableCell>
                  <TableCell className="py-3"><div className="h-3.5 w-16 bg-slate-100 animate-pulse rounded-full ml-auto" /></TableCell>
                  <TableCell className="py-3"><div className="h-3.5 w-16 bg-slate-100 animate-pulse rounded-full ml-auto" /></TableCell>
                  <TableCell className="py-3"><div className="h-7 w-7 bg-slate-100 animate-pulse rounded-md" /></TableCell>
                </TableRow>
              ))}

              {/* Empty — no records */}
              {!isLoading && records.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="h-72 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-12 w-12 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center">
                        <Receipt className="h-5 w-5 text-violet-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-600">No billing records for this period</p>
                        <p className="text-xs text-slate-400 mt-1">Records appear once meter readings are submitted or non-metered billing is triggered.</p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {/* Empty — no results */}
              {!isLoading && records.length > 0 && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="h-64 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-12 w-12 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center">
                        <Search className="h-5 w-5 text-violet-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-600">No results</p>
                        <p className="text-xs text-slate-400 mt-1">No records match your filters.</p>
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
              {!isLoading && paginated.map((record) => (
                <TableRow key={record.billing_id} className="border-t border-slate-100 hover:bg-violet-50/40 transition-colors">
                  <TableCell className="py-3">
                    <div>
                      <p className="text-[12.5px] font-medium text-slate-800">{record.consumer_name}</p>
                      <p className="text-[10px] text-slate-400">{record.address}</p>
                    </div>
                  </TableCell>
                  <TableCell className="py-3 text-[12.5px] font-mono text-slate-600">
                    {record.meter_serial_no || '—'}
                  </TableCell>
                  <TableCell className="py-3">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                      {record.classification}
                    </span>
                  </TableCell>
                  <TableCell className="py-3 text-[12.5px] text-slate-500">
                    {formatDate(record.due_date)}
                  </TableCell>
                  <TableCell className="py-3 text-right">
                    <span className="text-[12.5px] tabular-nums text-slate-700">
                      {formatM3(record.previous_reading)}
                    </span>
                  </TableCell>
                  <TableCell className="py-3 text-right">
                    <span className="text-[12.5px] tabular-nums text-slate-700">
                      {formatM3(record.present_reading)}
                    </span>
                  </TableCell>
                  <TableCell className="py-3 text-right">
                    <span className="text-[12.5px] font-semibold tabular-nums text-slate-800">
                      {formatM3(record.consumption)}
                    </span>
                  </TableCell>
                  <TableCell className="py-3 text-right">
                    <span className="text-[12.5px] font-semibold tabular-nums text-violet-700">
                      {formatM3(record.billed_consumption)}
                    </span>
                  </TableCell>
                  <TableCell className="py-3 text-right text-[12.5px] tabular-nums text-slate-600">
                    {formatPeso(record.current_billing)}
                  </TableCell>
                  <TableCell className="py-3 text-right">
                    <p className="text-[12.5px] font-bold text-slate-800 tabular-nums">{formatPeso(record.total_billing)}</p>
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

                        <DropdownMenuItem className="cursor-pointer rounded-md text-xs text-slate-500 focus:bg-violet-50 focus:text-violet-700 dark:focus:bg-accent dark:focus:text-accent-foreground py-2 gap-2" onSelect={(e) => e.preventDefault()}>
                         <BillingPdfExportButton
                            billingId={record.billing_id}
                             label="Export PDF"
                            variant="dropdown-item"
                          />
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

export default CurrentBillingPage