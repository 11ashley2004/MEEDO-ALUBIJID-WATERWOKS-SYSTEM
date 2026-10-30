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
  CheckCircle2,
  X,
  TrendingUp,
  SlidersHorizontal,
  Plus,
  Receipt,
  ShieldAlert,
  WrenchIcon,
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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

import type { ReadingConsumer } from '@/lib/actions/meter-reading/meter-reading.actions'
import {
  getMeterReadingData,
  createNextReadingPeriod,
} from '@/lib/actions/meter-reading/meter-reading.actions'
import type { MeterReadingAdjustmentRecord } from '@/lib/actions/meter-reading/meter-reading-adjustment.actions'
import { getAdjustmentsByReadingIds } from '@/lib/actions/meter-reading/meter-reading-adjustment.actions'

import MeterReadingAdjustmentForm from '@/components/meter-reader-ui/meter-reading-adjusment/create-meter-reading-adjustment-form'
import { MeterReadingRecordDialog } from '@/components/meter-reader-ui/meter-reading-record-dialog'
import { fmt } from '@/lib/helper/date-helper'

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]
const SKELETON_ROW_COUNT = 8

const READING_STATUS_OPTIONS = {
  all:      'All Statuses',
  pending:  'Pending',
  recorded: 'Recorded',
  defective: 'Defective',
} as const

type ReadingStatusFilter = keyof typeof READING_STATUS_OPTIONS
const ZONE_FILTER_ALL = 'all'

function isIssueDrivenMeterStatus(meterStatusName: string | null): boolean {
  const s = (meterStatusName ?? '').toUpperCase()
  return s === 'DEFECTIVE' || s === 'STOLEN' || s.includes('LEAK')
}

function isIssueDrivenReadingStatus(readingStatusCode: string | null): boolean {
  const s = (readingStatusCode ?? '').toUpperCase()
  return s === 'DEFECTIVE' || s === 'STOLEN'
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
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

function MeterStatusBadge({ statusName }: { statusName: string | null }) {
  const s = (statusName ?? '').toUpperCase()

  if (s === 'ACTIVE')
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        <CheckCircle2 className="h-3 w-3" /> Active
      </span>
    )

  if (s === 'DEFECTIVE')
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
        <X className="h-3 w-3" /> Defective
      </span>
    )

  if (s === 'STOLEN')
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
        <ShieldAlert className="h-3 w-3" /> Stolen
      </span>
    )

  if (s.includes('LEAK'))
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-orange-50 text-orange-700 border border-orange-200">
        <WrenchIcon className="h-3 w-3" /> Leak
      </span>
    )

  if (s === 'REMOVED' || s === 'REPLACED')
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-slate-50 text-slate-600 border border-slate-200">
        <X className="h-3 w-3" /> {statusName}
      </span>
    )

  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-slate-50 text-slate-600 border border-slate-200">
      <Clock className="h-3 w-3" /> {statusName || 'Unknown'}
    </span>
  )
}

function MeterReadingTableSkeletonRow() {
  return (
    <TableRow className="border-t border-slate-100 hover:bg-transparent">
      <TableCell className="py-3">
        <Skeleton className="h-7 w-7 rounded-md" />
      </TableCell>
      <TableCell className="py-3">
        <Skeleton className="h-3 w-28 rounded-md mb-1.5" />
        <Skeleton className="h-2.5 w-16 rounded-md" />
      </TableCell>
      <TableCell className="py-3">
        <Skeleton className="h-3 w-24 rounded-md mb-1.5" />
        <Skeleton className="h-2.5 w-16 rounded-md" />
      </TableCell>
      <TableCell className="py-3">
        <Skeleton className="h-3 w-20 rounded-md" />
      </TableCell>
      <TableCell className="py-3">
        <Skeleton className="h-3 w-14 rounded-md ml-auto" />
      </TableCell>
      <TableCell className="py-3">
        <Skeleton className="h-3 w-14 rounded-md ml-auto" />
      </TableCell>
      <TableCell className="py-3">
        <Skeleton className="h-3 w-20 rounded-md" />
      </TableCell>
      <TableCell className="py-3">
        <Skeleton className="h-3 w-14 rounded-md ml-auto" />
      </TableCell>
      <TableCell className="py-3">
        <Skeleton className="h-5 w-16 rounded-md" />
      </TableCell>
      <TableCell className="py-3">
        <Skeleton className="h-5 w-16 rounded-md" />
      </TableCell>
      <TableCell className="py-3">
        <Skeleton className="h-7 w-20 rounded-md mx-auto" />
      </TableCell>
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
      <TableCell colSpan={11} className="py-8 px-4">
        <Empty className="rounded-md border border-dashed border-slate-200 bg-slate-50/40 py-10 mx-auto text-center">
          <EmptyHeader>
            <EmptyMedia
              variant="icon"
              className="rounded-md border border-violet-200 bg-violet-50 text-violet-500 mx-auto"
            >
              {hasActiveFilters ? <Search className="h-5 w-5" /> : <Gauge className="h-5 w-5" />}
            </EmptyMedia>
            <EmptyTitle className="text-sm font-semibold text-slate-700">
              {hasActiveFilters ? 'No matching accounts' : 'No meter accounts to show'}
            </EmptyTitle>
            <EmptyDescription className="text-xs text-slate-400 max-w-sm mx-auto">
              {hasActiveFilters
                ? 'Try adjusting your search or filters — nothing matches the current criteria.'
                : "You don't have any assigned accounts for this reading period yet."}
            </EmptyDescription>
          </EmptyHeader>
          {hasActiveFilters && onClearFilters && (
            <EmptyContent>
              <Button
                size="sm"
                variant="outline"
                onClick={onClearFilters}
                className="h-7 text-[11px] rounded-md border-violet-200 text-violet-600 hover:bg-violet-50 hover:border-violet-300"
              >
                <X className="h-3 w-3 mr-1" /> Clear filters
              </Button>
            </EmptyContent>
          )}
        </Empty>
      </TableCell>
    </TableRow>
  )
}

function WindowBanner({
  period,
  completedCount,
  totalCount,
  defectiveCount,
  isComplete,
  onStartNextPeriod,
  isStartingNextPeriod,
}: {
  period: any
  completedCount: number
  totalCount:    number
  defectiveCount: number
  isComplete: boolean
  onStartNextPeriod: () => void
  isStartingNextPeriod: boolean
}) {
  if (!period) return null

  const periodLabel = new Date(period.period_start).toLocaleDateString('en-PH', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  })

  if (isComplete)
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border shrink-0 bg-emerald-50 border-emerald-200">
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="h-3 w-3" /> Complete
        </span>
        <span className="text-[11px] text-emerald-700 whitespace-nowrap">{periodLabel}</span>
        <Button
          size="sm"
          onClick={onStartNextPeriod}
          disabled={isStartingNextPeriod}
          className="h-7 text-[11px] rounded-md bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60"
        >
          {isStartingNextPeriod ? 'Starting…' : 'Start Next Period'}
        </Button>
      </div>
    )

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border shrink-0 bg-violet-50 border-violet-200">
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-violet-100 text-violet-700 border border-violet-200">
        <Gauge className="h-3 w-3" /> Reading
      </span>
      <span className="text-[11px] text-violet-700 whitespace-nowrap">
        {periodLabel} · {completedCount}/{totalCount} recorded
        {defectiveCount > 0 && ` · ${defectiveCount} defective`}
      </span>
    </div>
  )
}

function FiltersPanel({
  statusFilter, zoneFilter, zones, onStatusChange, onZoneChange,
}: {
  statusFilter:   ReadingStatusFilter
  zoneFilter:     string
  zones:          any[]
  onStatusChange: (v: ReadingStatusFilter) => void
  onZoneChange:   (v: string) => void
}) {
  const activeCount = [statusFilter !== 'all', zoneFilter !== ZONE_FILTER_ALL].filter(Boolean).length

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

      <DropdownMenuContent align="end" className="w-48 rounded-md p-1.5">
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
        <DropdownMenuLabel className="text-[9px] font-bold uppercase tracking-widest text-violet-400 px-2 py-1.5">Zone</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={zoneFilter} onValueChange={onZoneChange}>
          <DropdownMenuRadioItem value={ZONE_FILTER_ALL}
            className={cn('cursor-pointer rounded-md text-xs', zoneFilter === ZONE_FILTER_ALL && 'text-violet-600 font-medium bg-violet-50')}>
            All Zones
          </DropdownMenuRadioItem>
          {zones.map((z) => (
            <DropdownMenuRadioItem key={z.zone_id} value={z.zone_id}
              className={cn('cursor-pointer rounded-md text-xs', zoneFilter === z.zone_id && 'text-violet-600 font-medium bg-violet-50')}>
              {z.zone_name} – {z.barangay.barangay_name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default function MeterReadingPage() {
  const [connections,    setConnections]    = useState<ReadingConsumer[]>([])
  const [zones,          setZones]          = useState<any[]>([])
  const [period,         setPeriod]         = useState<any | null>(null)
  const [targetPeriodId, setTargetPeriodId] = useState<string | null>(null)
  const [isLoading,      setIsLoading]      = useState(true)
  const [searchQuery,    setSearchQuery]    = useState('')
  const debouncedSearchQuery = useDebouncedSearch(searchQuery)
  const [searchFocused,  setSearchFocused]  = useState(false)
  const [selectedZone,   setSelectedZone]   = useState(ZONE_FILTER_ALL)
  const [selectedStatus, setSelectedStatus] = useState<ReadingStatusFilter>('all')
  const [page,     setPage]     = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [pendingAdjMap, setPendingAdjMap] = useState<Map<string, MeterReadingAdjustmentRecord>>(new Map())
  const [isStartingNextPeriod, setIsStartingNextPeriod] = useState(false)
  const [isPeriodComplete, setIsPeriodComplete] = useState(false)

  // Whether the pending-adjustments lookup has resolved for the CURRENT
  // set of connections. Starts true (unknown) so the very first render
  // never shows an "Adjust" button before we actually know whether a
  // pending adjustment exists — that's what was causing the flash from
  // Adjust → Pending on load.
  const [isAdjustmentsLoading, setIsAdjustmentsLoading] = useState(true)

  const isPeriodActive = targetPeriodId !== null

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    // A fresh main-data fetch invalidates whatever pending-adjustment map
    // we had (new/changed reading_ids incoming) — mark adjustments as
    // loading again so actions stay hidden behind the skeleton until the
    // adjustment lookup below re-resolves against the new connections.
    setIsAdjustmentsLoading(true)
    try {
      const result = await getMeterReadingData()
      if (result.status === 'success' && result.data) {
        setConnections(result.data.connections)
        setZones(result.data.zones)
        setPeriod(result.data.period)
        setTargetPeriodId(result.data.targetPeriodId)
        setIsPeriodComplete(result.data.isPeriodComplete)
      } else {
        toast.error(result.message ?? 'Failed to load data')
      }
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }, [])

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
    // Wait for the main data load to finish first — otherwise this runs
    // once against the initial empty `connections` array (0 reading ids →
    // immediately "loaded"), which is exactly what let the Adjust button
    // render before the real pending-adjustment data arrived.
    if (isLoading) return

    const ids = connections
      .filter((c) => c.reading_status_code === 'RECORDED' && c.reading_id)
      .map((c) => c.reading_id!)
    loadPendingAdjustments(ids)
  }, [connections, isLoading, loadPendingAdjustments])

  const handleStartNextPeriod = useCallback(async () => {
    setIsStartingNextPeriod(true)
    try {
      const res = await createNextReadingPeriod()
      if (res.status === 'success') {
        const autoBilled = res.data?.autoBilledCount ?? 0
        toast.success(
          res.data?.alreadyExisted
            ? 'Next reading period already exists'
            : autoBilled > 0
              ? `Next reading period started · ${autoBilled} defective/stolen account${autoBilled !== 1 ? 's' : ''} auto-billed`
              : 'Next reading period started'
        )
        fetchData()
      } else {
        toast.error(res.message ?? 'Failed to start next period')
      }
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setIsStartingNextPeriod(false)
    }
  }, [fetchData])

  const filtered = useMemo(() => {
    const result: ReadingConsumer[] = []
    for (const c of connections) {
      if (selectedStatus === 'pending' && c.reading_status_code === 'RECORDED') continue
      if (selectedStatus === 'pending' && (c.reading_status_code === 'DEFECTIVE' || c.reading_status_code === 'STOLEN' || c.reading_status_code === 'LEAK_AFTER_METER')) continue
      if (selectedStatus === 'recorded' && c.reading_status_code !== 'RECORDED') continue
      if (selectedStatus === 'defective' && (c.reading_status_code !== 'DEFECTIVE' && c.reading_status_code !== 'STOLEN' && c.reading_status_code !== 'LEAK_AFTER_METER')) continue

      if (selectedZone !== ZONE_FILTER_ALL && c.zone.zone_id !== selectedZone) continue

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
  }, [connections, selectedStatus, selectedZone, debouncedSearchQuery])

  useEffect(() => { setPage(1) }, [filtered.length])

  const completedCount = useMemo(
    () => connections.filter(c => c.reading_id !== null).length,
    [connections]
  )

  const defectiveCount = useMemo(
    () => connections.filter(c => c.reading_status_code === 'DEFECTIVE' || c.reading_status_code === 'STOLEN' || c.reading_status_code === 'LEAK_AFTER_METER').length,
    [connections]
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage   = Math.min(page, totalPages)
  const paginated  = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  )


  const hasActiveFilters     = debouncedSearchQuery.trim().length > 0 || selectedStatus !== 'all' || selectedZone !== ZONE_FILTER_ALL
  const isSearchActive       = debouncedSearchQuery.trim().length > 0 || searchFocused
  const isNonDefaultPageSize = pageSize !== 10
  const handleRecordSuccess  = useCallback(() => { fetchData() }, [fetchData])

  return (
    <div className="w-full space-y-5">

      <PageHeading title="Meter Reading" description="Record meter readings for your assigned consumers" />
<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1">
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

          <FiltersPanel
            statusFilter={selectedStatus} zoneFilter={selectedZone} zones={zones}
            onStatusChange={(v) => { setSelectedStatus(v); setPage(1) }}
            onZoneChange={(v) => { setSelectedZone(v); setPage(1) }}
          />

          {hasActiveFilters && (
            <button
              onClick={() => { setSearchQuery(''); setSelectedStatus('all'); setSelectedZone(ZONE_FILTER_ALL); setPage(1) }}
              className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-xs text-slate-400 hover:text-violet-600 hover:bg-violet-50"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>

        {period && (
          <WindowBanner
            period={period}
            completedCount={completedCount}
            totalCount={connections.length}
            defectiveCount={defectiveCount}
            isComplete={isPeriodComplete}
            onStartNextPeriod={handleStartNextPeriod}
            isStartingNextPeriod={isStartingNextPeriod}
          />
        )}
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
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Meter Status</TableHead>
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
                  onClearFilters={() => {
                    setSearchQuery('')
                    setSelectedStatus('all')
                    setSelectedZone(ZONE_FILTER_ALL)
                    setPage(1)
                  }}
                />
              ) : (
                paginated.map((consumer) => {
                  const isRecorded = consumer.reading_status_code === 'RECORDED'

                  const meterStatusUpper = (consumer.meter_status_name ?? '').toUpperCase()
                  const isDefectiveMeter = meterStatusUpper === 'DEFECTIVE'
                  const isStolenMeter = meterStatusUpper === 'STOLEN'
                  const blocksManualRecordByMeter = isDefectiveMeter || isStolenMeter

                  const readingStatusUpper = (consumer.reading_status_code ?? '').toUpperCase()
                  const isIssueDrivenReading = readingStatusUpper === 'DEFECTIVE' || readingStatusUpper === 'STOLEN'

                  const isIssueDriven = blocksManualRecordByMeter || isIssueDrivenReading

                  const isAwaitingAutoBilling = isIssueDriven && consumer.present_reading === null

                  const hasReading = isRecorded && consumer.present_reading !== null
                  const consumption = hasReading ? consumer.present_reading! - consumer.previous_reading : null
                  const pendingAdj = consumer.reading_id ? pendingAdjMap.get(consumer.reading_id) : undefined
                  const hasPending = Boolean(pendingAdj)

                  return (
                    <TableRow
                      key={consumer.reading_id ?? consumer.meter_account_id}
                      className="border-t border-slate-100 hover:bg-violet-50/40 transition-colors"
                    >
                      <TableCell className="py-3">
                        <div className="h-7 w-7 rounded-md bg-violet-100 flex items-center justify-center text-[11px] font-bold text-violet-600">
                          {getInitials(consumer.account_name)}
                        </div>
                      </TableCell>

                      <TableCell className="py-3">
                        <p className="text-[12.5px] font-medium leading-tight text-slate-800">
                          {consumer.account_name}
                        </p>
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
                        {consumer.consumption !== null && consumer.consumption >= 0 ? (
                          <div className="flex items-center justify-end gap-1">
                            <TrendingUp className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                            <span className="tabular-nums text-[12.5px] font-medium text-emerald-600">
                              {fmt.num(consumer.consumption)} m³
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[12.5px]">—</span>
                        )}
                      </TableCell>

                      <TableCell className="py-3">
                        <MeterStatusBadge statusName={consumer.meter_status_name} />
                      </TableCell>

                      <TableCell className="py-3">
                        <div className="flex flex-col gap-1">
                          <ReadingStatusBadge statusCode={consumer.reading_status_code} />
                        </div>
                      </TableCell>

                      <TableCell className="py-3">
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">

                          {!isRecorded && !isIssueDriven && consumer.present_reading === null && targetPeriodId && (
                            <MeterReadingRecordDialog
                              meterAccountId={consumer.meter_account_id}
                              readingPeriodId={targetPeriodId}
                              onSuccess={handleRecordSuccess}
                              isPeriodActive={isPeriodActive}
                            >
                              <Button size="sm" className="h-7 text-[11px] rounded-md bg-emerald-600 hover:bg-emerald-700 text-white">
                                <Gauge className="h-3 w-3 mr-1" /> Record
                              </Button>
                            </MeterReadingRecordDialog>
                          )}

                          {isAwaitingAutoBilling && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-medium bg-slate-50 text-slate-500 border border-slate-200">
                              <Clock className="h-3 w-3" /> Awaiting Billing
                            </span>
                          )}

                          {isIssueDriven && consumer.present_reading !== null && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-200">
                              <Receipt className="h-3 w-3" /> Billed
                            </span>
                          )}

                          {/* ─── Adjust / Pending Adjustment area ──────────────
                              Gated on isAdjustmentsLoading: until the pending-
                              adjustments lookup resolves for THIS set of
                              connections, show a skeleton instead of guessing.
                              Previously the Adjust button rendered immediately
                              (pendingAdjMap started empty), then flipped to
                              "Pending" a moment later once the lookup came
                              back — this is the fix for that flash. */}
                          {isRecorded && consumer.reading_id && (
                            isAdjustmentsLoading ? (
                              <Skeleton className="h-7 w-20 rounded-md" />
                            ) : hasPending ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-medium bg-amber-50 text-amber-600 border border-amber-200">
                                <Clock className="h-3 w-3" /> Pending Adjustment
                              </span>
                            ) : targetPeriodId ? (
                              <MeterReadingAdjustmentForm
                                readingPeriodId={targetPeriodId}
                                meterAccountId={consumer.meter_account_id}
                                onSuccess={handleRecordSuccess}
                              >
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-[11px] rounded-md border-violet-200 text-violet-600 hover:bg-violet-50 hover:border-violet-300"
                                >
                                  <Plus className="h-3 w-3 mr-1" /> Adjust
                                </Button>
                              </MeterReadingAdjustmentForm>
                            ) : null
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
    </div>
  )
}