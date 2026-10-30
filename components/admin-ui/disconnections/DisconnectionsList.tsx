'use client'

import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'


import { TablePagination } from '@/components/shared-ui/pagination'
import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Search,
  PowerOff,
  MoreHorizontal,
  Eye,
  CheckCircle2,
  XCircle,
  SlidersHorizontal,
  ChevronDown,
  X,
  Calendar,
  User,
  MapPin,
  Building2,
  Power,
  Pencil,
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
} from '@/components/ui/dropdown-menu'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

import {
  getDisconnections,
  getDisconnectionStatuses,
  cancelDisconnection,
  type DisconnectionRecord,
  type DisconnectionStatus,
} from '@/lib/actions/disconnection/disconnection.actions'
import { CreateDisconnectionForm } from '@/components/admin-ui/disconnections/CreateDisconnectionForm'
import { UpdateDisconnectionForm } from '@/components/admin-ui/disconnections/UpdateDisconnectionForm'

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]
const STATUS_FILTER_OPTIONS = ['all', 'pending', 'disconnected', 'cancelled']
const TYPE_FILTER_OPTIONS = ['all', 'voluntary', 'involuntary']

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

function getStatusBadgeClass(status: string): string {
  const s = status.toLowerCase()
  switch (s) {
    case 'disconnected': return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    case 'cancelled': return 'bg-rose-50 text-rose-600 border-rose-200'
    default: return 'bg-amber-50 text-amber-700 border-amber-200'
  }
}

function getStatusDotClass(status: string): string {
  const s = status.toLowerCase()
  switch (s) {
    case 'disconnected': return 'bg-emerald-500'
    case 'cancelled': return 'bg-rose-500'
    default: return 'bg-amber-400'
  }
}

function formatStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

// ─── Filters Panel ──────────────────────────────────────────────────────────

function FiltersPanel({
  statusFilter,
  typeFilter,
  onStatusChange,
  onTypeChange,
}: {
  statusFilter: string
  typeFilter: string
  onStatusChange: (v: string) => void
  onTypeChange: (v: string) => void
}) {
  const activeCount = [
    statusFilter !== 'all',
    typeFilter !== 'all',
  ].filter(Boolean).length

  return (
    <DropdownMenu>
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

      <DropdownMenuContent align="end" className="w-48 rounded-md p-1.5">
        <DropdownMenuLabel className="text-[9px] font-bold uppercase tracking-widest text-violet-400 px-2 py-1.5">
          Status
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={statusFilter} onValueChange={onStatusChange}>
          {STATUS_FILTER_OPTIONS.map((s) => (
            <DropdownMenuRadioItem
              key={s}
              value={s}
              className={cn(
                'cursor-pointer rounded-md text-xs',
                statusFilter === s && 'text-violet-600 font-medium bg-violet-50',
              )}
            >
              {s === 'all' ? 'All Statuses' : formatStatus(s)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator className="my-1" />

        <DropdownMenuLabel className="text-[9px] font-bold uppercase tracking-widest text-violet-400 px-2 py-1.5">
          Type
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={typeFilter} onValueChange={onTypeChange}>
          {TYPE_FILTER_OPTIONS.map((t) => (
            <DropdownMenuRadioItem
              key={t}
              value={t}
              className={cn(
                'cursor-pointer rounded-md text-xs',
                typeFilter === t && 'text-violet-600 font-medium bg-violet-50',
              )}
            >
              {t === 'all' ? 'All Types' : t === 'voluntary' ? 'Voluntary' : 'Involuntary (Notice)'}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─── Skeleton Row ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <TableRow>
      <TableCell><div className="h-3.5 w-32 bg-slate-100 animate-pulse rounded-full" /></TableCell>
      <TableCell><div className="h-3.5 w-20 bg-slate-100 animate-pulse rounded-full" /></TableCell>
      <TableCell><div className="h-6 w-24 bg-slate-100 animate-pulse rounded-full" /></TableCell>
      <TableCell><div className="h-6 w-20 bg-slate-100 animate-pulse rounded-full" /></TableCell>
      <TableCell><div className="h-3.5 w-24 bg-slate-100 animate-pulse rounded-full" /></TableCell>
      <TableCell><div className="h-3.5 w-28 bg-slate-100 animate-pulse rounded-full" /></TableCell>
      <TableCell><div className="h-7 w-7 bg-slate-100 animate-pulse rounded-md ml-auto" /></TableCell>
    </TableRow>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DisconnectionsPage() {
  const [records, setRecords] = useState<DisconnectionRecord[]>([])
  const [statuses, setStatuses] = useState<DisconnectionStatus[]>([])
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedSearch(search)
  const [searchFocused, setSearchFocused] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Controlled edit dialog — rendered once at the page level (outside the
  // DropdownMenu tree), same pattern used for reconnections.
  const [editingId, setEditingId] = useState<string | null>(null)

  // ── Load data ──────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [recordsRes, statusesRes] = await Promise.all([
        getDisconnections(),
        getDisconnectionStatuses(),
      ])

      if (recordsRes.success && recordsRes.data) {
        setRecords(recordsRes.data)
      } else {
        toast.error(recordsRes.error || 'Failed to load disconnections')
      }

      if (statusesRes.success && statusesRes.data) {
        setStatuses(statusesRes.data)
      }
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Client-side filtering ──────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    return records.filter((r) => {
      if (q && !r.consumer_name.toLowerCase().includes(q) && !(r.meter_serial_no ?? '').toLowerCase().includes(q)) {
        return false
      }
      if (statusFilter !== 'all' && r.status_name.toLowerCase() !== statusFilter.toLowerCase()) return false
      if (typeFilter === 'voluntary' && !r.is_voluntary) return false
      if (typeFilter === 'involuntary' && r.is_voluntary) return false
      return true
    })
  }, [records, debouncedSearch, statusFilter, typeFilter])

  useEffect(() => { setPage(1) }, [filtered.length])

  // ── Pagination ─────────────────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginated = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  )


  // ── Actions ────────────────────────────────────────────────────────────────

  const handleCancel = async (id: string) => {
    setActionLoading(id)
    try {
      const result = await cancelDisconnection(id)
      if (result.success) {
        toast.success('Disconnection cancelled')
        fetchData()
      } else {
        toast.error(result.error || 'Failed to cancel disconnection')
      }
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setActionLoading(null)
    }
  }

  const clearFilters = useCallback(() => {
    setSearch('')
    setStatusFilter('all')
    setTypeFilter('all')
    setPage(1)
  }, [])

  const hasActiveFilters = debouncedSearch.trim().length > 0 || statusFilter !== 'all' || typeFilter !== 'all'
  const isSearchActive = debouncedSearch.trim().length > 0 || searchFocused
  const isNonDefaultPageSize = pageSize !== 10

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

          <div className="hidden sm:block h-4 w-px bg-slate-200" />

          <FiltersPanel
            statusFilter={statusFilter}
            typeFilter={typeFilter}
            onStatusChange={setStatusFilter}
            onTypeChange={setTypeFilter}
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

        <CreateDisconnectionForm onSuccess={fetchData} />
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">

        <div className="px-5 py-3 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-violet-100 border border-violet-200 flex items-center justify-center">
              <PowerOff className="h-3 w-3 text-violet-500" />
            </div>
            <p className="text-xs text-slate-500">
              {isLoading ? (
                <span className="inline-block h-3 w-24 bg-slate-100 animate-pulse rounded-full" />
              ) : (
                <>
                  <span className="font-semibold text-slate-700">{filtered.length}</span>
                  {' '}disconnection{filtered.length !== 1 ? 's' : ''}
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
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Type</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Status</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Location</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Requested</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>

              {isLoading && Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}

              {!isLoading && records.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="h-72 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-12 w-12 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center">
                        <PowerOff className="h-5 w-5 text-violet-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-600">No disconnection records</p>
                        <p className="text-xs text-slate-400 mt-1">Disconnection requests will appear here.</p>
                      </div>
                      <CreateDisconnectionForm onSuccess={fetchData} />
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {!isLoading && records.length > 0 && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="h-64 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-12 w-12 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center">
                        <Search className="h-5 w-5 text-violet-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-600">No results</p>
                        <p className="text-xs text-slate-400 mt-1">No records match your filters.</p>
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

              {!isLoading && paginated.map((record) => {
                // Normalize status for comparison
                const normalizedStatus = record.status_name?.toLowerCase() || 'pending'
                const isPending = normalizedStatus === 'pending'
                const isDisconnected = normalizedStatus === 'disconnected'
                const isCancelled = normalizedStatus === 'cancelled'

                // Map status for display
                const displayStatus = normalizedStatus === 'completed' ? 'disconnected' : record.status_name

                return (
                  <TableRow key={record.disconnection_id} className="border-t border-slate-100 hover:bg-violet-50/40 transition-colors">
                    <TableCell className="py-3">
                      <div>
                        <p className="text-[12.5px] font-medium text-slate-800">{record.consumer_name}</p>
                      </div>
                    </TableCell>
                    <TableCell className="py-3 text-[12.5px] font-mono text-slate-600">
                      {record.meter_serial_no}
                    </TableCell>
                    <TableCell className="py-3">
                        <Badge variant="outline" className={cn(
                          'text-[10px] font-semibold border rounded-md',
                          record.is_voluntary
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-red-50 text-red-700 border-red-200'
                        )}>
                          {record.is_voluntary ? 'Voluntary' : 'Notice-based'}
                        </Badge>
                      </TableCell>
                    <TableCell className="py-3">
                      <span className={cn(
                        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold border',
                        getStatusBadgeClass(displayStatus),
                      )}>
                        <span className={cn('h-1.5 w-1.5 rounded-full', getStatusDotClass(displayStatus))} />
                        {formatStatus(displayStatus)}
                      </span>
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="flex flex-col">
                        <span className="text-[11px] text-slate-600">{record.barangay_name}</span>
                        <span className="text-[10px] text-slate-400">Zone {record.zone_name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      <span className="text-[12.5px] text-slate-500">{formatDate(record.requested_date)}</span>
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

                          {/* Edit - only for pending */}
                          {isPending && (
                            <DropdownMenuItem
                              className="cursor-pointer rounded-md text-xs text-slate-500 focus:bg-violet-50 focus:text-violet-700 dark:focus:bg-accent dark:focus:text-accent-foreground py-2 gap-2"
                              onClick={() => setEditingId(record.disconnection_id)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              <span>Edit</span>
                            </DropdownMenuItem>
                          )}

                          {/* Cancel - only for pending */}
                          {isPending && (
                            <DropdownMenuItem
                              className="cursor-pointer rounded-md text-xs text-rose-700 focus:bg-rose-50 py-2 gap-2"
                              onClick={() => handleCancel(record.disconnection_id)}
                              disabled={actionLoading === record.disconnection_id}
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              <span>Cancel</span>
                            </DropdownMenuItem>
                          )}
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

      {/* Controlled edit dialog — rendered once here, outside the DropdownMenu tree */}
      <UpdateDisconnectionForm
        disconnectionId={editingId}
        onOpenChange={(open) => { if (!open) setEditingId(null) }}
        onSuccess={fetchData}
      />
    </div>
  )
}