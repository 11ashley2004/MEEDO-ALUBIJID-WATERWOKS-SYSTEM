'use client'

import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'

import { TablePagination } from '@/components/shared-ui/pagination'
import { PageHeading } from '@/components/shared-ui/page-heading'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Search,
  MapPin,
  Gauge,
  Clock,
  ChevronDown,
  ChevronsUpDown,
  Check,
  CheckCircle2,
  X,
  TrendingUp,
  SlidersHorizontal,
  Eye,
  PlusCircle,
  ShieldAlert,
  WrenchIcon,
  CalendarDays,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent,
} from '@/components/ui/empty'
import {
  DropdownMenu, DropdownMenuContent,
  DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command, CommandEmpty, CommandGroup, CommandItem, CommandList,
} from '@/components/ui/command'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

import {
  getAllMeterReadings,
  getReadingPeriodOptions,
  type ReadingConsumer,
  type ReadingPeriodOption,
} from '@/lib/actions/meter-reading/list-meter-reading.action'
import type { MeterReadingAdjustmentRecord } from '@/lib/actions/meter-reading/meter-reading-adjustment.actions'
import { getAdjustmentsByReadingIds } from '@/lib/actions/meter-reading/meter-reading-adjustment.actions'

import MeterReadingAdjustmentForm from '@/components/admin-ui/reading-adjustment/MeterReadingAdjustmentForm'
import { fmt } from '@/lib/helper/date-helper'

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]
const SKELETON_ROW_COUNT = 8

// Every distinct reading status the list can filter by. Each is its own
// option — Defective, Stolen, and Leak After Meter are no longer lumped
// under one filter.
const READING_STATUS_OPTIONS = {
  all:        'All Statuses',
  pending:    'Pending',
  recorded:   'Recorded',
  defective:  'Defective',
  stolen:     'Stolen',
  water_leak: 'Leak After Meter',
} as const

type ReadingStatusFilter = keyof typeof READING_STATUS_OPTIONS
const BARANGAY_FILTER_ALL = 'all'

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function fmtPeriodLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function getInitials(accountName: string): string {
  const parts = accountName.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  if (parts.length === 2) return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase()
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase()
}

function ReadingStatusBadge({ statusCode }: { statusCode: string | null }) {
  if (statusCode === 'RECORDED')
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        <CheckCircle2 className="h-3 w-3" /> Recorded
      </span>
    )
  if (statusCode === 'STOLEN')
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
        <ShieldAlert className="h-3 w-3" /> Stolen
      </span>
    )
  if (statusCode === 'LEAK_AFTER_METER')
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-orange-50 text-orange-700 border border-orange-200">
        <WrenchIcon className="h-3 w-3" /> Leak After Meter
      </span>
    )
  if (statusCode === 'DEFECTIVE')
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
        <X className="h-3 w-3" /> Defective
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
      <Clock className="h-3 w-3" /> Pending
    </span>
  )
}

function MeterReadingTableSkeletonRow() {
  return (
    <TableRow className="border-t border-slate-100 hover:bg-transparent">
      <TableCell className="py-3"><Skeleton className="h-7 w-7 rounded-md" /></TableCell>
      <TableCell className="py-3"><Skeleton className="h-3 w-28 rounded-md mb-1.5" /><Skeleton className="h-2.5 w-16 rounded-md" /></TableCell>
      <TableCell className="py-3"><Skeleton className="h-3 w-24 rounded-md mb-1.5" /><Skeleton className="h-2.5 w-16 rounded-md" /></TableCell>
      <TableCell className="py-3"><Skeleton className="h-3 w-20 rounded-md" /></TableCell>
      <TableCell className="py-3"><Skeleton className="h-3 w-14 rounded-md ml-auto" /></TableCell>
      <TableCell className="py-3"><Skeleton className="h-3 w-14 rounded-md ml-auto" /></TableCell>
      <TableCell className="py-3"><Skeleton className="h-3 w-20 rounded-md" /></TableCell>
      <TableCell className="py-3"><Skeleton className="h-3 w-14 rounded-md ml-auto" /></TableCell>
      <TableCell className="py-3"><Skeleton className="h-5 w-16 rounded-md" /></TableCell>
      <TableCell className="py-3"><Skeleton className="h-7 w-20 rounded-md mx-auto" /></TableCell>
    </TableRow>
  )
}

function MeterReadingTableEmpty({
  hasActiveFilters,
  onClearFilters,
}: {
  hasActiveFilters: boolean
  onClearFilters?: () => void
}) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={10} className="py-8 px-4">
        <Empty className="rounded-md border border-dashed border-slate-200 bg-slate-50/40 py-10 mx-auto text-center">
          <EmptyHeader>
            <EmptyMedia variant="icon" className="rounded-md border border-violet-200 bg-violet-50 text-violet-500 mx-auto">
              {hasActiveFilters ? <Search className="h-5 w-5" /> : <Gauge className="h-5 w-5" />}
            </EmptyMedia>
            <EmptyTitle className="text-sm font-semibold text-slate-700">
              {hasActiveFilters ? 'No matching accounts' : 'No meter readings to show'}
            </EmptyTitle>
            <EmptyDescription className="text-xs text-slate-400 max-w-sm mx-auto">
              {hasActiveFilters
                ? 'Try adjusting your search or filters — nothing matches the current criteria.'
                : 'No meter readings are on record yet for this period.'}
            </EmptyDescription>
          </EmptyHeader>
          {hasActiveFilters && onClearFilters && (
            <EmptyContent>
              <Button size="sm" variant="outline" onClick={onClearFilters}
                className="h-7 text-[11px] rounded-md border-violet-200 text-violet-600 hover:bg-violet-50 hover:border-violet-300">
                <X className="h-3 w-3 mr-1" /> Clear filters
              </Button>
            </EmptyContent>
          )}
        </Empty>
      </TableCell>
    </TableRow>
  )
}

function FiltersPanel({
  statusFilter, barangayFilter, barangays, onStatusChange, onBarangayChange,
}: {
  statusFilter:     ReadingStatusFilter
  barangayFilter:   string
  barangays:        { barangay_id: string; barangay_name: string }[]
  onStatusChange:   (v: ReadingStatusFilter) => void
  onBarangayChange: (v: string) => void
}) {
  const activeCount = [statusFilter !== 'all', barangayFilter !== BARANGAY_FILTER_ALL].filter(Boolean).length

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline" size="sm"
          className={cn(
            'h-9 gap-1.5 text-sm font-medium transition-all rounded-md',
            activeCount > 0 && 'border-violet-400 bg-violet-50 text-violet-700 hover:bg-violet-100 hover:border-violet-500',
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

      <DropdownMenuContent align="end" className="w-52 rounded-md p-1.5">
        <DropdownMenuLabel className="text-[9px] font-bold uppercase tracking-widest text-violet-400 px-2 py-1.5">Reading Status</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={statusFilter} onValueChange={(v) => onStatusChange(v as ReadingStatusFilter)}>
          {(Object.keys(READING_STATUS_OPTIONS) as ReadingStatusFilter[]).map((key) => (
            <DropdownMenuRadioItem key={key} value={key}
              className={cn('cursor-pointer rounded-md text-xs', statusFilter === key && 'text-violet-600 font-medium bg-violet-50')}>
              {READING_STATUS_OPTIONS[key]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator className="my-1" />
        <DropdownMenuLabel className="text-[9px] font-bold uppercase tracking-widest text-violet-400 px-2 py-1.5">Barangay</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={barangayFilter} onValueChange={onBarangayChange}>
          <DropdownMenuRadioItem value={BARANGAY_FILTER_ALL}
            className={cn('cursor-pointer rounded-md text-xs', barangayFilter === BARANGAY_FILTER_ALL && 'text-violet-600 font-medium bg-violet-50')}>
            All Barangays
          </DropdownMenuRadioItem>
          {barangays.map((b) => (
            <DropdownMenuRadioItem key={b.barangay_id} value={b.barangay_id}
              className={cn('cursor-pointer rounded-md text-xs', barangayFilter === b.barangay_id && 'text-violet-600 font-medium bg-violet-50')}>
              {b.barangay_name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─── Reading period combobox ──────────────────────────────────────────────
// Plain single-select between real periods. No "All Periods" option — a
// period is always selected (the current/latest one by default). No search
// field, since the list is a short, ordered set.
function PeriodCombobox({
  periods,
  selectedPeriodId,
  isLoading,
  onSelect,
}: {
  periods: ReadingPeriodOption[]
  selectedPeriodId: string | null
  isLoading: boolean
  onSelect: (periodId: string) => void
}) {
  const [open, setOpen] = useState(false)

  const selected = periods.find((p) => p.reading_period_id === selectedPeriodId) ?? null

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={isLoading || periods.length === 0}
          className={cn(
            'h-9 justify-between gap-1.5 px-3 rounded-md text-xs font-medium bg-white border-slate-200 hover:border-violet-300 transition-all w-[170px]',
            selected ? 'border-violet-300 text-slate-700' : 'text-slate-400',
          )}
        >
          <span className="flex items-center gap-1.5 truncate">
            <CalendarDays className={cn(
              'h-3.5 w-3.5 shrink-0',
              selected ? 'text-violet-500' : 'text-slate-400'
            )} />
            <span className="truncate text-[11px]">
              {isLoading
                ? 'Loading…'
                : selected
                  ? fmtPeriodLabel(selected.period_start)
                  : 'No periods'}
            </span>
          </span>
          <ChevronsUpDown className="h-3 w-3 text-slate-400 shrink-0 ml-0.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0 bg-white border border-slate-200 rounded-md"
        align="start" sideOffset={6} collisionPadding={12} avoidCollisions side="bottom"
      >
        <Command shouldFilter={false}>
          <CommandList className="max-h-56">
            {periods.length === 0 ? (
              <CommandEmpty className="text-xs text-slate-400 py-4 text-center">
                No reading periods
              </CommandEmpty>
            ) : (
              <CommandGroup>
                {periods.map((p) => {
                  const isSelected = selectedPeriodId === p.reading_period_id
                  return (
                    <CommandItem
                      key={p.reading_period_id}
                      value={p.reading_period_id}
                      onSelect={() => { onSelect(p.reading_period_id); setOpen(false) }}
                      className="cursor-pointer text-xs py-2 gap-2"
                    >
                      <div className="h-6 w-6 rounded bg-violet-100 text-violet-600 border border-violet-200 flex items-center justify-center shrink-0">
                        <CalendarDays className="h-3 w-3" />
                      </div>
                      <span className={cn('font-medium', isSelected ? 'text-violet-600' : 'text-slate-700')}>
                        {fmtPeriodLabel(p.period_start)}
                      </span>
                      {isSelected && <Check className="h-3 w-3 text-violet-500 ml-auto" />}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// ─── Read-only pending-adjustment viewer ───────────────────────────────────
function AdjustmentViewDialog({
  adjustment,
  open,
  onOpenChange,
}: {
  adjustment: MeterReadingAdjustmentRecord | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  if (!adjustment) return null

  const requester = adjustment.requested_by_user
  const requesterName = requester
    ? [requester.first_name, requester.middle_name, requester.last_name].filter(Boolean).join(' ')
    : '—'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-md">
        <DialogHeader>
          <DialogTitle className="text-base">Pending Adjustment</DialogTitle>
          <DialogDescription className="text-xs">
            {adjustment.meter_reading.meter.meter_account.meter_serial_no ?? adjustment.meter_reading.meter.meter_serial_no ?? '—'} · read-only — this request hasn't been resolved yet.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-slate-200 bg-slate-50/60 p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Original</p>
              <p className="text-sm font-semibold text-slate-700 mt-0.5">{fmt.num(adjustment.original_reading)} m³</p>
            </div>
            <div className="rounded-md border border-violet-200 bg-violet-50/60 p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-400">Requested</p>
              <p className="text-sm font-semibold text-violet-700 mt-0.5">{fmt.num(adjustment.adjusted_reading)} m³</p>
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Reason</p>
            <p className="text-xs text-slate-600 mt-0.5">{adjustment.reason || '—'}</p>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-100">
            <span>Requested by {requesterName}</span>
            <span>{fmtDateTime(adjustment.requested_date)}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function MeterReadingListPage() {
  const [connections,   setConnections]   = useState<ReadingConsumer[]>([])
  const [zones,         setZones]         = useState<any[]>([])
  const [isLoading,     setIsLoading]     = useState(true)
  const [searchQuery,   setSearchQuery]   = useState('')
  const debouncedSearchQuery = useDebouncedSearch(searchQuery)
  const [searchFocused, setSearchFocused] = useState(false)
  const [selectedBarangay, setSelectedBarangay] = useState(BARANGAY_FILTER_ALL)
  const [selectedStatus,   setSelectedStatus]   = useState<ReadingStatusFilter>('all')
  const [page,     setPage]     = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [pendingAdjMap, setPendingAdjMap] = useState<Map<string, MeterReadingAdjustmentRecord>>(new Map())
  const [isAdjustmentsLoading, setIsAdjustmentsLoading] = useState(true)
  const [viewingAdjustment, setViewingAdjustment] = useState<MeterReadingAdjustmentRecord | null>(null)

  // ── Reading period filter ──
  const [periods, setPeriods] = useState<ReadingPeriodOption[]>([])
  const [periodsLoading, setPeriodsLoading] = useState(true)
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null)

  // Load reading periods, default to the latest (index 0).
  // `res.data` is `ReadingPeriodOption[] | undefined`, so we coerce it to
  // an empty array before touching anything on it.
  useEffect(() => {
    setPeriodsLoading(true)
    getReadingPeriodOptions()
      .then((res) => {
        if (res.status === 'success') {
          const list: ReadingPeriodOption[] = res.data ?? []
          setPeriods(list)
          if (list.length > 0) {
            setSelectedPeriodId((prev) => prev ?? list[0].reading_period_id)
          }
        } else if (res.message) {
          toast.error(res.message)
        }
      })
      .catch(() => toast.error('Failed to load reading periods'))
      .finally(() => setPeriodsLoading(false))
  }, [])

  const fetchData = useCallback(async () => {
    // Don't fetch until a period is chosen — otherwise we'd briefly load
    // every period's data and then immediately refetch for the default.
    if (!selectedPeriodId) return

    setIsLoading(true)
    setIsAdjustmentsLoading(true)
    try {
      const result = await getAllMeterReadings(selectedPeriodId)

      if (result.status === 'success' && result.data) {
        setConnections(result.data.connections)
        setZones(result.data.zones)
      } else {
        toast.error(result.message ?? 'Failed to load data')
      }
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }, [selectedPeriodId])

  useEffect(() => { fetchData() }, [fetchData])

  const loadPendingAdjustments = useCallback(async (readingIds: string[]) => {
    if (!readingIds.length) {
      setPendingAdjMap(new Map())
      setIsAdjustmentsLoading(false)
      return
    }
    try {
      const res = await getAdjustmentsByReadingIds(readingIds)
      if (res.status === 'success' && res.data) setPendingAdjMap(res.data)
    } catch (err) {
      console.error('Error loading pending adjustments:', err)
    } finally {
      setIsAdjustmentsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isLoading) return
    const ids = connections
      .filter((c) => c.reading_status_code === 'RECORDED' && c.reading_id)
      .map((c) => c.reading_id!)
    loadPendingAdjustments(ids)
  }, [connections, isLoading, loadPendingAdjustments])

  // Dedupe barangays out of the zones payload
  const barangays = useMemo(() => {
    const map = new Map<string, { barangay_id: string; barangay_name: string }>()
    for (const z of zones) {
      if (z.barangay && !map.has(z.barangay.barangay_id)) {
        map.set(z.barangay.barangay_id, z.barangay)
      }
    }
    return Array.from(map.values())
  }, [zones])

  // Filtering — each reading status is its own explicit filter.
  const filtered = useMemo(() => {
    const result: ReadingConsumer[] = []
    for (const c of connections) {
      const code = c.reading_status_code

      if (selectedStatus === 'pending'    && code !== 'PENDING')           continue
      if (selectedStatus === 'recorded'   && code !== 'RECORDED')          continue
      if (selectedStatus === 'defective'  && code !== 'DEFECTIVE')         continue
      if (selectedStatus === 'stolen'     && code !== 'STOLEN')            continue
      if (selectedStatus === 'water_leak' && code !== 'LEAK_AFTER_METER')  continue

      if (selectedBarangay !== BARANGAY_FILTER_ALL && c.zone.barangay.barangay_id !== selectedBarangay) continue

      if (debouncedSearchQuery) {
        const q = debouncedSearchQuery.toLowerCase()
        const match =
          c.account_name.toLowerCase().includes(q) ||
          (c.meter_serial_no ?? '').toLowerCase().includes(q) ||
          c.zone.barangay.barangay_name.toLowerCase().includes(q) ||
          c.zone.zone_name.toLowerCase().includes(q)
        if (!match) continue
      }
      result.push(c)
    }
    return result
  }, [connections, selectedStatus, selectedBarangay, debouncedSearchQuery])

  useEffect(() => { setPage(1) }, [filtered.length])

  // Is the currently-selected period the latest one? periods[0] is the
  // newest (server returns newest-first), so it's a simple identity check.
  const isLatestPeriodSelected = selectedPeriodId === periods[0]?.reading_period_id

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage   = Math.min(page, totalPages)
  const paginated  = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  )


  // A period is always selected, so it's never a "filter" — only search,
  // status, and barangay narrow the list.
  const hasActiveFilters =
    debouncedSearchQuery.trim().length > 0 ||
    selectedStatus !== 'all' ||
    selectedBarangay !== BARANGAY_FILTER_ALL

  const isSearchActive       = debouncedSearchQuery.trim().length > 0 || searchFocused
  const isNonDefaultPageSize = pageSize !== 10
  const handleAdjustSuccess  = useCallback(() => { fetchData() }, [fetchData])

  // Reset every filter *except* the period selection.
  const clearFilters = () => {
    setSearchQuery('')
    setSelectedStatus('all')
    setSelectedBarangay(BARANGAY_FILTER_ALL)
    setPage(1)
  }

  return (
    <div className="w-full space-y-5">

      <PageHeading title="Meter Reading List" description="Browse recorded readings and request corrections" />
<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1 flex-wrap">
          <div className="relative w-full min-w-0 sm:w-auto sm:flex-1 sm:max-w-sm">
            <Search className={cn('absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 transition-colors', isSearchActive ? 'text-violet-400' : 'text-slate-300')} />
            <Input
              placeholder="Search name, serial no., zone…"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1) }}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              className={cn(
                'pl-9 h-8 rounded-md text-xs bg-white border-slate-200 text-slate-700 placeholder:text-slate-300 focus-visible:ring-0 focus-visible:ring-offset-0 transition-colors',
                isSearchActive ? 'border-violet-400 ring-2 ring-violet-100' : 'hover:border-violet-200',
              )}
            />
            {searchQuery && (
              <button onClick={() => { setSearchQuery(''); setPage(1) }} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-slate-100">
                <X className="h-3 w-3 text-slate-400" />
              </button>
            )}
          </div>

          <div className="hidden sm:block h-4 w-px bg-slate-200" />

          <PeriodCombobox
            periods={periods}
            selectedPeriodId={selectedPeriodId}
            isLoading={periodsLoading}
            onSelect={(id) => { setSelectedPeriodId(id); setPage(1) }}
          />

          <FiltersPanel
            statusFilter={selectedStatus} barangayFilter={selectedBarangay} barangays={barangays}
            onStatusChange={(v) => { setSelectedStatus(v); setPage(1) }}
            onBarangayChange={(v) => { setSelectedBarangay(v); setPage(1) }}
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
      </div>

      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
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
                  {' '}meter account{filtered.length !== 1 ? 's' : ''}
                  {hasActiveFilters && <span className="text-slate-400"> · filtered</span>}
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <span className="hidden sm:inline">Rows per page</span>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1) }}>
              <SelectTrigger className={cn('h-7 w-[58px] rounded-md text-[11px] bg-white border-slate-200 text-slate-500 focus:ring-0 focus:ring-offset-0 hover:border-violet-300', isNonDefaultPageSize && 'border-violet-300 text-violet-600')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white border border-slate-200 rounded-md">
                {PAGE_SIZE_OPTIONS.map((s) => (
                  <SelectItem key={s} value={String(s)} className="text-xs cursor-pointer focus:bg-violet-50 focus:text-violet-700 dark:focus:bg-accent dark:focus:text-accent-foreground">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/40">
                <TableHead className="w-10" />
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Consumer</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Zone</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Serial No.</TableHead>
                <TableHead className="text-right text-[9px] font-bold text-slate-400 uppercase tracking-wider">Prev. Reading</TableHead>
                <TableHead className="text-right text-[9px] font-bold text-slate-400 uppercase tracking-wider">Pres. Reading</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Date</TableHead>
                <TableHead className="text-right text-[9px] font-bold text-slate-400 uppercase tracking-wider">Consumption</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Reading Status</TableHead>
                <TableHead className="w-40 text-center text-[9px] font-bold text-slate-400 uppercase tracking-wider">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {isLoading ? (
                Array.from({ length: SKELETON_ROW_COUNT }).map((_, i) => (
                  <MeterReadingTableSkeletonRow key={`skeleton-${i}`} />
                ))
              ) : paginated.length === 0 ? (
                <MeterReadingTableEmpty
                  hasActiveFilters={hasActiveFilters}
                  onClearFilters={clearFilters}
                />
              ) : (
                paginated.map((consumer) => {
                  const isRecorded = consumer.reading_status_code === 'RECORDED'

                  const meterStatusUpper = (consumer.meter_status_name ?? '').toUpperCase()
                  const isIssueDrivenMeter = meterStatusUpper === 'DEFECTIVE' || meterStatusUpper === 'STOLEN'
                  const readingStatusUpper = (consumer.reading_status_code ?? '').toUpperCase()
                  const isIssueDrivenReading = readingStatusUpper === 'DEFECTIVE' || readingStatusUpper === 'STOLEN'
                  const isIssueDriven = isIssueDrivenMeter || isIssueDrivenReading
                  const isAwaitingAutoBilling = isIssueDriven && consumer.present_reading === null

                  const consumption = isRecorded && consumer.present_reading !== null
                    ? consumer.present_reading! - consumer.previous_reading
                    : null

                  const pendingAdj = consumer.reading_id ? pendingAdjMap.get(consumer.reading_id) : undefined
                  const hasPending = Boolean(pendingAdj)
                  const rowKey = consumer.reading_id ?? consumer.meter_account_id

                  return (
                    <TableRow key={rowKey} className="border-t border-slate-100 hover:bg-violet-50/40 transition-colors">
                      <TableCell className="py-3">
                        <div className="h-7 w-7 rounded-md bg-violet-100 flex items-center justify-center text-[11px] font-bold text-violet-600">
                          {getInitials(consumer.account_name)}
                        </div>
                      </TableCell>

                      <TableCell className="py-3">
                        <p className="text-[12.5px] font-medium leading-tight text-slate-800">{consumer.account_name}</p>
                        <p className="text-[10px] text-slate-400">{consumer.classification.classification_name}</p>
                      </TableCell>

                      <TableCell className="py-3">
                        <div className="flex items-start gap-1">
                          <MapPin className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-[12.5px] font-medium leading-tight text-slate-700">{consumer.zone.barangay.barangay_name}</p>
                            <p className="text-[10px] text-slate-400">Zone {consumer.zone.zone_name}</p>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="py-3">
                        <span className="font-mono text-[12.5px] font-medium text-slate-600">
                          {consumer.meter_serial_no || '—'}
                        </span>
                      </TableCell>

                      <TableCell className="text-right py-3">
                        <span className="tabular-nums text-[12.5px] text-slate-500">{fmt.num(consumer.previous_reading)} m³</span>
                      </TableCell>

                      <TableCell className="text-right py-3">
                        {consumer.present_reading !== null && consumer.present_reading > 0 ? (
                          <span className="tabular-nums text-[12.5px] font-semibold text-emerald-700">
                            {fmt.num(consumer.present_reading!)} m³
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[12.5px]">—</span>
                        )}
                      </TableCell>

                      <TableCell className="py-3">
                        <p className="text-[12.5px] text-slate-500">{fmtDate(consumer.reading_date)}</p>
                      </TableCell>

                      <TableCell className="text-right py-3">
                        {consumption !== null && consumption >= 0 ? (
                          <div className="flex items-center justify-end gap-1">
                            <TrendingUp className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                            <span className="tabular-nums text-[12.5px] font-medium text-emerald-600">{fmt.num(consumption)} m³</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[12.5px]">—</span>
                        )}
                      </TableCell>

                      <TableCell className="py-3">
                        <div className="flex flex-col gap-1">
                          <ReadingStatusBadge statusCode={consumer.reading_status_code} />
                        </div>
                      </TableCell>

                      <TableCell className="py-3">
                        <div className="flex items-center justify-center">
                          {isRecorded && consumer.reading_id ? (
                            isAdjustmentsLoading ? (
                              <Skeleton className="h-7 w-20 rounded-md" />
                            ) : !isLatestPeriodSelected ? (
                              <span className="text-slate-300 text-xs">—</span>
                            ) : hasPending ? (
                              <div className="flex items-center gap-1.5">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-medium bg-amber-50 text-amber-600 border border-amber-200">
                                  <Clock className="h-3 w-3" /> Pending Adjustment
                                </span>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-[10px] rounded-md text-slate-400 hover:text-violet-600 hover:bg-violet-50"
                                  onClick={() => setViewingAdjustment(pendingAdj!)}
                                >
                                  <Eye className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : selectedPeriodId ? (
                              <MeterReadingAdjustmentForm
                                readingPeriodId={selectedPeriodId}
                                meterAccountId={consumer.meter_account_id}
                                onSuccess={handleAdjustSuccess}
                              >
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-[11px] rounded-md border-violet-200 text-violet-600 hover:bg-violet-50 hover:border-violet-300"
                                >
                                  <PlusCircle className="h-3 w-3 mr-1" /> Adjust
                                </Button>
                              </MeterReadingAdjustmentForm>
                            ) : null
                          ) : (
                            <span className="text-slate-300 text-xs">—</span>
                          )}
                        </div>
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

      <AdjustmentViewDialog
        adjustment={viewingAdjustment}
        open={Boolean(viewingAdjustment)}
        onOpenChange={(open) => { if (!open) setViewingAdjustment(null) }}
      />
    </div>
  )
}