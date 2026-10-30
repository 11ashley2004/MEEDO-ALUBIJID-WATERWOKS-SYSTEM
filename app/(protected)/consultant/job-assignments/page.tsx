'use client'

import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'

import { TablePagination } from '@/components/shared-ui/pagination'
import { PageHeading } from '@/components/shared-ui/page-heading'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  Search,
  SlidersHorizontal,
  ChevronDown,
  X,
  Eye,
  Users2,
  ClipboardList,
  MoreHorizontal,
  PenSquare,
  Printer,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'

import {
  getJobAssignments,
  type JobAssignmentListItem,
} from '@/lib/actions/job-assignment/job-assignment.actions'
import { ViewJobAssignmentDetailsDialog } from '@/components/admin-ui/assign-job-order/ViewJobAssignmentDetailsDialog'
import { UpdateJobAssignmentDialog } from '@/components/admin-ui/assign-job-order/UpdateJobAssignmentDialog'
import CreateJobAssignmentForm from '@/components/admin-ui/assign-job-order/CreateJobAssignmentForm'
import {
  JobOrderPdfExporter,
  type JobOrderPdfExporterHandle,
} from '@/components/admin-ui/assign-job-order/JobOrderPdfExporter'
import type { JobAssignmentJobOrder } from '@/lib/actions/job-assignment/job-assignment.actions'


export type TripStatus = 'Scheduled' | 'On Progress' | 'Completed' | 'Cancelled'

export function overallStatus(orders: JobAssignmentJobOrder[]): TripStatus {
  if (orders.length === 0) return 'Scheduled'
  const active = orders.filter((o) => o.status_code !== 'CANCELLED')
  if (active.length === 0) return 'Cancelled'
  if (active.every((o) => o.status_code === 'COMPLETED')) return 'Completed'
  const anyStarted = active.some(
    (o) => o.status_code === 'ONPROGRESS' || o.status_code === 'COMPLETED',
  )
  if (anyStarted) return 'On Progress'
  return 'Scheduled'
}

export const tripStatusStyles: Record<TripStatus, string> = {
  Scheduled: 'bg-amber-50 text-amber-700 border-amber-200',
  'On Progress': 'bg-blue-50 text-blue-700 border-blue-200',
  Completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Cancelled: 'bg-slate-50 text-slate-400 border-slate-200',
}

export const tripStatusDotStyles: Record<TripStatus, string> = {
  Scheduled: 'bg-amber-500',
  'On Progress': 'bg-blue-500',
  Completed: 'bg-emerald-500',
  Cancelled: 'bg-slate-300',
}

export function progressLabel(orders: JobAssignmentJobOrder[]): string {
  const cancelled = orders.filter((o) => o.status_code === 'CANCELLED').length
  const done = orders.filter((o) => o.status_code === 'COMPLETED').length
  const active = orders.length - cancelled
  return `${done}/${active || orders.length} done`
}

// A trip can only be edited (worker / helpers / schedule) while it still has
// at least one line item that isn't finished — matches the guard in
// updateJobAssignment on the server.
function isEditable(orders: JobAssignmentJobOrder[]): boolean {
  const status = overallStatus(orders)
  return status !== 'Completed' && status !== 'Cancelled'
}

// Date-only schedule, always shown in Manila time so a UTC server/browser
// can't shift it back a day.
function formatScheduledDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric',
  })
}


const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]
const STATUS_FILTERS = ['all', 'Scheduled', 'On Progress', 'Completed', 'Cancelled'] as const

function initials(fullName: string) {
  return fullName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
}

function FiltersPanel({
  statusFilter, onStatusChange,
}: {
  statusFilter: string
  onStatusChange: (v: string) => void
}) {
  const activeCount = statusFilter !== 'all' ? 1 : 0

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-9 gap-1.5 text-sm font-medium transition-all rounded-md',
            activeCount > 0 && ['border-violet-400 bg-violet-50 text-violet-700', 'hover:bg-violet-100 hover:border-violet-500'],
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
        <DropdownMenuSeparator className="mb-1" />
        <DropdownMenuRadioGroup value={statusFilter} onValueChange={onStatusChange}>
          {STATUS_FILTERS.map((s) => (
            <DropdownMenuRadioItem
              key={s}
              value={s}
              className={cn('cursor-pointer rounded-md text-xs', statusFilter === s && 'text-violet-600 font-medium bg-violet-50')}
            >
              {s === 'all' ? 'All Statuses' : s}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default function JobAssignmentList() {
  const [assignments, setAssignments] = useState<JobAssignmentListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedSearch(search)
  const [searchFocused, setSearchFocused] = useState(false)
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [updatingAssignment, setUpdatingAssignment] = useState<JobAssignmentListItem | null>(null)
  const [statusFilter, setStatusFilter] = useState<typeof STATUS_FILTERS[number]>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const exporterRef = useRef<JobOrderPdfExporterHandle>(null)

  const fetchAssignments = useCallback(async () => {
    setIsLoading(true)
    try {
      setAssignments(await getJobAssignments())
    } catch {
      toast.error('Failed to load job assignments')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchAssignments() }, [fetchAssignments])

  const clearAll = useCallback(() => {
    setSearch('')
    setStatusFilter('all')
    setPage(1)
  }, [])

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    return assignments.filter((a) => {
      if (statusFilter !== 'all' && overallStatus(a.job_orders) !== statusFilter) return false
      if (q) {
        const haystack = [
          a.assigned_to_name,
          ...a.helpers.map((h) => h.full_name),
          ...a.job_orders.flatMap((jo) => [jo.job_order_no ?? '', jo.meter_serial_no, jo.consumer_name, jo.barangay_name]),
        ].join(' ').toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [assignments, debouncedSearch, statusFilter])

  useEffect(() => { setPage(1) }, [filtered.length])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginated = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  )

  const hasActiveFilters = debouncedSearch.trim().length > 0 || statusFilter !== 'all'
  const isSearchActive = debouncedSearch.trim().length > 0 || searchFocused


  return (
    <div className="w-full space-y-5">

      {/* Header */}
      <PageHeading title="Job Assignments" description="Trips assigned to field workers — open a trip to see its job orders" />
{/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1">
          <div className="relative w-full min-w-0 sm:w-auto sm:flex-1 sm:max-w-sm">
            <Search className={cn('absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 transition-colors', isSearchActive ? 'text-violet-400' : 'text-slate-300')} />
            <Input
              placeholder="Search worker, JO no., account, consumer…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              className={cn(
                'pl-9 h-8 rounded-md text-xs bg-white border-slate-200 text-slate-700',
                'placeholder:text-slate-300 focus-visible:ring-0 focus-visible:ring-offset-0 transition-colors',
                isSearchActive ? 'border-violet-400 ring-2 ring-violet-100' : 'hover:border-violet-200',
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
            onStatusChange={(v) => { setStatusFilter(v as typeof statusFilter); setPage(1) }}
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

        <CreateJobAssignmentForm onSuccess={fetchAssignments} />
      </div>

      {/* Table panel */}
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-violet-100 border border-violet-200 flex items-center justify-center">
              <ClipboardList className="h-3 w-3 text-violet-500" />
            </div>
            <p className="text-xs text-slate-500">
              {isLoading ? (
                <span className="inline-block h-3 w-24 bg-slate-100 animate-pulse rounded-full" />
              ) : (
                <>
                  <span className="font-semibold text-slate-700">{filtered.length}</span>{' '}
                  assignment{filtered.length !== 1 ? 's' : ''}
                  {hasActiveFilters && <span className="text-slate-400"> · filtered</span>}
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <span className="hidden sm:inline">Rows per page</span>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1) }}>
              <SelectTrigger className={cn('h-7 w-[58px] rounded-md text-[11px] bg-white border-slate-200 text-slate-500', 'focus:ring-0 focus:ring-offset-0 hover:border-violet-300', pageSize !== 10 && 'border-violet-300 text-violet-600')}>
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

        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/40">
              <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Assigned To</TableHead>
              <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Helpers</TableHead>
              <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Job Orders</TableHead>
              <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Progress</TableHead>
              <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Scheduled</TableHead>
              <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Assigned By</TableHead>
              <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Status</TableHead>
              <TableHead className="w-12"><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && [...Array(6)].map((_, i) => (
              <TableRow key={i}>
                <TableCell><div className="h-3.5 w-28 bg-slate-100 animate-pulse rounded-full" /></TableCell>
                <TableCell><div className="h-3.5 w-24 bg-slate-100 animate-pulse rounded-full" /></TableCell>
                <TableCell><div className="h-6 w-16 bg-slate-100 animate-pulse rounded-full" /></TableCell>
                <TableCell><div className="h-3.5 w-16 bg-slate-100 animate-pulse rounded-full" /></TableCell>
                <TableCell><div className="h-3.5 w-24 bg-slate-100 animate-pulse rounded-full" /></TableCell>
                <TableCell><div className="h-3.5 w-24 bg-slate-100 animate-pulse rounded-full" /></TableCell>
                <TableCell><div className="h-6 w-20 bg-slate-100 animate-pulse rounded-full" /></TableCell>
                <TableCell><div className="h-7 w-7 bg-slate-100 animate-pulse rounded-md" /></TableCell>
              </TableRow>
            ))}

            {!isLoading && assignments.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="h-72 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-12 w-12 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center">
                      <ClipboardList className="h-5 w-5 text-violet-300" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-600">No job assignments yet</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Assignments created from the job orders page will appear here.
                      </p>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            )}

            {!isLoading && assignments.length > 0 && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="h-64 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-12 w-12 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center">
                      <Search className="h-5 w-5 text-violet-300" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-600">No results</p>
                      <p className="text-xs text-slate-400 mt-1">No assignments match your filters.</p>
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

            {!isLoading && paginated.map((a) => {
              const status = overallStatus(a.job_orders)
              const editable = isEditable(a.job_orders)
              const exportable = a.job_orders.some((o) => o.status_code !== 'CANCELLED')
              return (
                <TableRow
                  key={a.job_assignment_id}
                  className="border-t border-slate-100 hover:bg-violet-50/40 transition-colors cursor-pointer"
                  onClick={() => setViewingId(a.job_assignment_id)}
                >
                  <TableCell className="py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="h-7 w-7 rounded-md bg-violet-100 text-violet-600 border border-violet-200 flex items-center justify-center text-[10px] font-bold shrink-0">
                        {initials(a.assigned_to_name)}
                      </div>
                      <span className="text-[12.5px] font-semibold text-slate-700 truncate">{a.assigned_to_name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-3">
                    {a.helpers.length > 0 ? (
                      <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
                        <Users2 className="h-3 w-3 text-slate-400" />
                        {a.helpers.length} helper{a.helpers.length !== 1 ? 's' : ''}
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-300">—</span>
                    )}
                  </TableCell>
                  <TableCell className="py-3">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10.5px] font-semibold border bg-slate-50 text-slate-600 border-slate-200">
                      {a.job_orders.length} order{a.job_orders.length !== 1 ? 's' : ''}
                    </span>
                  </TableCell>
                  <TableCell className="py-3 text-[11px] text-slate-500">
                    {progressLabel(a.job_orders)}
                  </TableCell>
                  <TableCell className="py-3 text-[11px] text-slate-500">
                    {formatScheduledDate(a.scheduled_at)}
                  </TableCell>
                  <TableCell className="py-3 text-[11px] text-slate-500">{a.assign_by_name}</TableCell>
                  <TableCell className="py-3">
                    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold border', tripStatusStyles[status])}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', tripStatusDotStyles[status])} />
                      {status}
                    </span>
                  </TableCell>
                  <TableCell className="py-3">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-md text-slate-400 hover:text-violet-600 hover:bg-violet-50"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48 rounded-md p-1.5">
                        <DropdownMenuLabel className="text-[9px] font-bold uppercase tracking-widest text-violet-400 px-2 py-1.5">
                          Actions
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator className="mb-1" />
                        <DropdownMenuItem
                          onClick={() => setViewingId(a.job_assignment_id)}
                          className="cursor-pointer rounded-md text-xs text-slate-500 focus:bg-violet-50 focus:text-violet-700 dark:focus:bg-accent dark:focus:text-accent-foreground gap-2"
                        >
                          <Eye className="h-3.5 w-3.5" /> View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={!exportable}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (exportable) exporterRef.current?.download(a)
                          }}
                          className={cn(
                            'cursor-pointer rounded-md text-xs gap-2',
                            exportable
                              ? 'text-slate-500 focus:bg-violet-50 focus:text-violet-700 dark:focus:bg-accent dark:focus:text-accent-foreground'
                              : 'text-slate-300 cursor-not-allowed',
                          )}
                        >
                          <Printer className="h-3.5 w-3.5" /> Export Job Orders
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={!editable}
                          onClick={(e) => {
                            e.stopPropagation() // Prevent row click from triggering
                            if (editable) setUpdatingAssignment(a)
                          }}
                          className={cn(
                            'cursor-pointer rounded-md text-xs gap-2',
                            editable
                              ? 'text-slate-500 focus:bg-violet-50 focus:text-violet-700 dark:focus:bg-accent dark:focus:text-accent-foreground'
                              : 'text-slate-300 cursor-not-allowed',
                          )}
                        >
                          <PenSquare className="h-3.5 w-3.5" /> Update Assignment
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

      {/* Pagination */}
      {!isLoading && (
        <TablePagination
          page={safePage}
          pageSize={pageSize}
          total={filtered.length}
          onPageChange={setPage}
        />
      )}

      <ViewJobAssignmentDetailsDialog
        jobAssignmentId={viewingId}
        onOpenChange={(open) => { if (!open) setViewingId(null) }}
        onStatusChanged={fetchAssignments}
      />

      <UpdateJobAssignmentDialog
        assignment={updatingAssignment}
        onOpenChange={(open) => { if (!open) setUpdatingAssignment(null) }}
        onUpdated={fetchAssignments}
      />

      {/* Renders nothing; just exposes download() for the Export action */}
      <JobOrderPdfExporter ref={exporterRef} />
    </div>
  )
}