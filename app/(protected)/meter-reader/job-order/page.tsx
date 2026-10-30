'use client'

import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'


import { TablePagination } from '@/components/shared-ui/pagination'
// worker ui
import { PageHeading } from '@/components/shared-ui/page-heading'

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Search,
  Eye,
  Wrench,
  Gauge,
  SlidersHorizontal,
  ChevronDown,
  X,
} from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel,
  DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { getMyJobAssignments, type WorkerJobAssignment } from '@/lib/actions/job-assignment/worker-job-order.actions'
import { JobDetailDialog } from '@/components/meter-reader-ui/job-orders/job-detail-dialog'

// ─── Constants ────────────────────────────────────────────────────────────────
// Status here is the TRIP-level status (WorkerJobAssignment.assignment_status),
// derived from all the job orders on that trip — not any single job order's
// own status. See computeAssignmentStatus in worker-job-order.actions.ts.
// One row in this table = one trip (job_assignment), which can carry
// multiple job orders (meter accounts).

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]
const STATUSES          = ['all', 'SCHEDULED', 'ONPROGRESS', 'COMPLETED', 'CANCELLED'] as const

const STATUS_STYLE: Record<string, string> = {
  SCHEDULED:  'bg-amber-50 text-amber-700 border-amber-200',
  ONPROGRESS: 'bg-purple-50 text-purple-700 border-purple-200',
  COMPLETED:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  CANCELLED:  'bg-rose-50 text-rose-600 border-rose-200',
}

const STATUS_DOT: Record<string, string> = {
  SCHEDULED:  'bg-amber-400',
  ONPROGRESS: 'bg-purple-500',
  COMPLETED:  'bg-emerald-500',
  CANCELLED:  'bg-rose-500',
}

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED:  'Scheduled',
  ONPROGRESS: 'In Progress',
  COMPLETED:  'Completed',
  CANCELLED:  'Cancelled',
}

const formatDate = (d: string) => format(new Date(d), 'MMM dd, yyyy')

// ─── Filters Panel ────────────────────────────────────────────────────────────

function FiltersPanel({
  value,
  onChange,
}: {
  value:    string
  onChange: (v: string) => void
}) {
  const active = value !== 'all'
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-9 gap-1.5 text-sm font-medium transition-all rounded-md',
            active && [
              'border-violet-400 bg-violet-50 text-violet-700',
              'hover:bg-violet-100 hover:border-violet-500',
            ],
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
          Filters
          {active && (
            <span className="inline-flex items-center justify-center h-[18px] min-w-[18px] px-1 rounded-full bg-violet-600 text-white text-[11px] font-semibold leading-none">
              1
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 rounded-md p-1.5">
        <DropdownMenuLabel className="text-[9px] font-bold uppercase tracking-widest text-violet-400 px-2 py-1.5">
          Status
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="mb-1" />
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {STATUSES.map((s) => (
            <DropdownMenuRadioItem
              key={s}
              value={s}
              className={cn(
                'cursor-pointer rounded-md text-xs',
                value === s && 'text-violet-600 font-medium bg-violet-50',
              )}
            >
              {s === 'all' ? 'All statuses' : STATUS_LABEL[s]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─── Skeleton row ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <div className="h-7 w-7 rounded-md bg-slate-100 animate-pulse shrink-0" />
          <div className="h-3.5 w-28 bg-slate-100 animate-pulse rounded-full" />
        </div>
      </TableCell>
      <TableCell><div className="h-6 w-20 bg-slate-100 animate-pulse rounded-full" /></TableCell>
      <TableCell><div className="h-3.5 w-24 bg-slate-100 animate-pulse rounded-full" /></TableCell>
      <TableCell><div className="h-3.5 w-32 bg-slate-100 animate-pulse rounded-full" /></TableCell>
      <TableCell><div className="h-3.5 w-24 bg-slate-100 animate-pulse rounded-full" /></TableCell>
      <TableCell><div className="h-7 w-16 bg-slate-100 animate-pulse rounded-md" /></TableCell>
    </TableRow>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function JobOrdersPage() {
  const [assignments,   setAssignments]   = useState<WorkerJobAssignment[]>([])
  const [search,        setSearch]        = useState('')
  const debouncedSearch = useDebouncedSearch(search)
  const [searchFocused, setSearchFocused] = useState(false)
  const [statusFilter,  setStatusFilter]  = useState('all')
  const [isLoading,     setIsLoading]     = useState(true)
  const [page,          setPage]          = useState(1)
  const [pageSize,      setPageSize]      = useState(10)

  const fetchJobs = useCallback(async () => {
    setIsLoading(true)
    try {
      setAssignments(await getMyJobAssignments())
    } catch {
      toast.error('Failed to load job orders')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchJobs() }, [fetchJobs])

  const clearFilters = useCallback(() => {
    setSearch('')
    setStatusFilter('all')
    setPage(1)
  }, [])

  // ── Filtering ──────────────────────────────────────────────────────────
  // Search matches against ANY job order nested inside the trip; status
  // filters against the trip's aggregate assignment_status.

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    return assignments.filter((assignment) => {
      if (q) {
        const hay = assignment.job_orders
          .flatMap((jo) => [
            jo.job_type_name,
            jo.job_order_no,
            jo.barangay_name,
            jo.zone_name,
            jo.consumer_name,
            jo.meter_serial_no,
          ])
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (statusFilter !== 'all' && assignment.assignment_status !== statusFilter) return false
      return true
    })
  }, [assignments, debouncedSearch, statusFilter])

  useEffect(() => { setPage(1) }, [filtered.length])

  // ── Pagination ─────────────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage   = Math.min(page, totalPages)
  const paginated  = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  )


  const hasActiveFilters = debouncedSearch.trim().length > 0 || statusFilter !== 'all'
  const isSearchActive   = debouncedSearch.trim().length > 0 || searchFocused
  const isNonDefaultPageSize = pageSize !== 10

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="w-full space-y-5">

      {/* Page header */}
      <PageHeading title="My Job Orders" description="Trips assigned to you as leader or helper" />
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
              placeholder="Search job type, consumer, location…"
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

          <FiltersPanel value={statusFilter} onChange={setStatusFilter} />

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

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">

        {/* Table header bar */}
        <div className="px-5 py-3 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-violet-100 border border-violet-200 flex items-center justify-center">
              <Wrench className="h-3 w-3 text-violet-500" />
            </div>
            <p className="text-xs text-slate-500">
              {isLoading ? (
                <span className="inline-block h-3 w-24 bg-slate-100 animate-pulse rounded-full" />
              ) : (
                <>
                  <span className="font-semibold text-slate-700">{filtered.length}</span>
                  {' '}trip{filtered.length !== 1 ? 's' : ''}
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
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                  Job Type
                </TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                  Status
                </TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                  Meter Account
                </TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                  Location
                </TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                  Scheduled
                </TableHead>
                <TableHead className="w-16">
                  <span className="sr-only">View</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>

              {/* Loading skeletons */}
              {isLoading && Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}

              {/* Empty — no trips at all */}
              {!isLoading && assignments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-72 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-12 w-12 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center">
                        <Wrench className="h-5 w-5 text-violet-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-600">No job orders yet</p>
                        <p className="text-xs text-slate-400 mt-1">You have no assigned trips at the moment.</p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {/* Empty — no results */}
              {!isLoading && assignments.length > 0 && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-64 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-12 w-12 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center">
                        <Search className="h-5 w-5 text-violet-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-600">No results</p>
                        <p className="text-xs text-slate-400 mt-1">No job orders match your filters.</p>
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

              {/* Data rows — one row PER TRIP (job assignment), which may
                  bundle several job orders / meter accounts together */}
              {!isLoading && paginated.map((assignment) => {
                const total = assignment.job_orders.length
                const resolvedCount = assignment.job_orders.filter(
                  (jo) => jo.status_code === 'COMPLETED' || jo.status_code === 'CANCELLED',
                ).length
                const preview = assignment.job_orders[0]

                return (
                  <TableRow
                    key={assignment.job_assignment_id}
                    className="border-t border-slate-100 hover:bg-violet-50/40 transition-colors"
                  >

                    {/* Job Type — first job order's type, +N more if bundled */}
                    <TableCell className="py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-7 w-7 rounded-md bg-violet-100 flex items-center justify-center shrink-0">
                          <Wrench className="h-3.5 w-3.5 text-violet-600" />
                        </div>
                        <div>
                          <p className="text-[12.5px] font-medium text-slate-700">
                            {preview?.job_type_name ?? '—'}
                            {total > 1 && (
                              <span className="text-slate-400 font-normal"> +{total - 1} more</span>
                            )}
                          </p>
                          <p className="text-[10px] font-mono text-slate-400 mt-0.5">{preview?.job_order_no ?? '—'}</p>
                        </div>
                      </div>
                    </TableCell>

                    {/* Status — trip-level, aggregated across all job orders */}
                    <TableCell className="py-3">
                      <span className={cn(
                        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold border',
                        STATUS_STYLE[assignment.assignment_status] ?? 'bg-slate-50 text-slate-500 border-slate-200',
                      )}>
                        <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT[assignment.assignment_status] ?? 'bg-slate-400')} />
                        {STATUS_LABEL[assignment.assignment_status] ?? assignment.assignment_status}
                        {total > 1 && (
                          <span className="opacity-60">· {resolvedCount}/{total}</span>
                        )}
                      </span>
                    </TableCell>

                    {/* Meter Account — single account, or a count if bundled */}
                    <TableCell className="py-3">
                      {total > 0 ? (
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-md bg-slate-100 flex items-center justify-center shrink-0">
                            <Gauge className="h-3 w-3 text-slate-500" />
                          </div>
                          <div>
                            <p className="text-[12.5px] font-medium text-slate-700 truncate">
                              {total === 1 ? preview?.consumer_name : `${total} meter accounts`}
                            </p>
                            {total === 1 && (
                              <p className="text-[10px] font-mono text-slate-400">{preview?.meter_serial_no}</p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">—</span>
                      )}
                    </TableCell>

                    {/* Location */}
                    <TableCell className="py-3">
                      {assignment.barangay_name ? (
                        <div>
                          <p className="text-[12.5px] text-slate-700">{assignment.barangay_name}</p>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">—</span>
                      )}
                    </TableCell>

                    {/* Scheduled */}
                    <TableCell className="py-3">
                      {assignment.scheduled_at ? (
                        <span className="text-[12.5px] text-slate-600">{formatDate(assignment.scheduled_at)}</span>
                      ) : (
                        <span className="text-xs text-slate-400 italic">—</span>
                      )}
                    </TableCell>

                    {/* View — updating progress per job order happens inside the detail dialog */}
                    <TableCell className="py-3">
                      <JobDetailDialog assignment={assignment} onUpdated={fetchJobs}>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1.5 rounded-md text-[11px] font-medium border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-700 hover:bg-violet-50"
                        >
                          <Eye className="h-3 w-3" />
                          View
                        </Button>
                      </JobDetailDialog>
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