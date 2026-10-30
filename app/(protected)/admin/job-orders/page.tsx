'use client'

import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'

import { TablePagination } from '@/components/shared-ui/pagination'
import { PageHeading } from '@/components/shared-ui/page-heading'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Search, ClipboardList, SlidersHorizontal, ChevronDown, X, MoreHorizontal, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'

import {
  getAllJobOrders,
  getJobTypesForFilter,
  type JobOrder,
  type JobTypeOption,
} from '@/lib/actions/job-order/job-order.actions'
import { ViewJobOrderDetailsDialog } from '@/components/admin-ui/job-orders/ViewJobOrderDetailsDialog'
import RequestJobOrderForm from '@/components/admin-ui/service-report/RequestJobOrderForm'

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]
const STATUSES = ['all', 'Pending', 'Assigned', 'Completed', 'Cancelled']

// Badge colors keyed on job_type_code. Anything not listed falls back to a
// neutral slate badge, so a new job type shows up immediately without a
// code change. Matches the codes in the job_types table:
//   AFTER_METER, BEFORE_METER, METER_REPLACEMENT, METER_INSTALLATION,
//   DISCONNECTION, RECONNECTION, METER_RELOCATION
const jobTypeStyles: Record<string, string> = {
  METER_INSTALLATION: 'bg-violet-50 text-violet-700 border-violet-200',
  METER_REPLACEMENT:  'bg-violet-50 text-violet-700 border-violet-200',
  METER_RELOCATION:   'bg-indigo-50 text-indigo-700 border-indigo-200',
  RECONNECTION:       'bg-sky-50 text-sky-700 border-sky-200',
  DISCONNECTION:      'bg-orange-50 text-orange-700 border-orange-200',
  AFTER_METER:        'bg-teal-50 text-teal-700 border-teal-200',
  BEFORE_METER:       'bg-cyan-50 text-cyan-700 border-cyan-200',
}

const statusStyles: Record<string, string> = {
  Pending:   'bg-amber-50 text-amber-700 border-amber-200',
  Assigned:  'bg-blue-50 text-blue-700 border-blue-200',
  Completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Cancelled: 'bg-slate-50 text-slate-400 border-slate-200',
}
const statusDotStyles: Record<string, string> = {
  Pending:   'bg-amber-500',
  Assigned:  'bg-blue-500',
  Completed: 'bg-emerald-500',
  Cancelled: 'bg-slate-300',
}

function FiltersPanel({
  jobTypes,
  jobTypeFilter,
  onJobTypeChange,
  statusFilter,
  onStatusChange,
}: {
  jobTypes: JobTypeOption[]
  jobTypeFilter: string
  onJobTypeChange: (v: string) => void
  statusFilter: string
  onStatusChange: (v: string) => void
}) {
  const activeCount = (jobTypeFilter !== 'all' ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0)

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
      <DropdownMenuContent align="end" className="w-56 rounded-md p-1.5">
        <DropdownMenuLabel className="text-[9px] font-bold uppercase tracking-widest text-violet-400 px-2 py-1.5">
          Job Type
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="mb-1" />
        <DropdownMenuRadioGroup value={jobTypeFilter} onValueChange={onJobTypeChange}>
          <DropdownMenuRadioItem
            value="all"
            className={cn('cursor-pointer rounded-md text-xs', jobTypeFilter === 'all' && 'text-violet-600 font-medium bg-violet-50')}
          >
            All Types
          </DropdownMenuRadioItem>
          {jobTypes.map((t) => (
            <DropdownMenuRadioItem
              key={t.job_type_id}
              value={t.job_type_id}
              className={cn('cursor-pointer rounded-md text-xs', jobTypeFilter === t.job_type_id && 'text-violet-600 font-medium bg-violet-50')}
            >
              {t.job_type_name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator className="my-1" />

        <DropdownMenuLabel className="text-[9px] font-bold uppercase tracking-widest text-violet-400 px-2 py-1.5">
          Status
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="mb-1" />
        <DropdownMenuRadioGroup value={statusFilter} onValueChange={onStatusChange}>
          {STATUSES.map((s) => (
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

export default function JobOrderList() {
  const [jobOrders, setJobOrders] = useState<JobOrder[]>([])
  const [jobTypes, setJobTypes] = useState<JobTypeOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedSearch(search)
  const [searchFocused, setSearchFocused] = useState(false)
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [jobTypeFilter, setJobTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const fetchJobOrders = useCallback(async () => {
    setIsLoading(true)
    try {
      const [orders, types] = await Promise.all([
        getAllJobOrders(),
        getJobTypesForFilter(),
      ])
      setJobOrders(orders)
      setJobTypes(types)
    } catch {
      toast.error('Failed to load job orders')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchJobOrders() }, [fetchJobOrders])

  const clearAll = useCallback(() => {
    setSearch('')
    setJobTypeFilter('all')
    setStatusFilter('all')
    setPage(1)
  }, [])

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    return jobOrders.filter((jo) => {
      if (jobTypeFilter !== 'all' && jo.job_type_id !== jobTypeFilter) return false
      if (statusFilter !== 'all' && jo.job_status_name !== statusFilter) return false
      if (q &&
        !jo.job_order_no?.toLowerCase().includes(q) &&
        !(jo.meter_serial_no ?? '').toLowerCase().includes(q) &&
        !jo.consumer_name.toLowerCase().includes(q) &&
        !jo.barangay_name.toLowerCase().includes(q)
      ) return false
      return true
    })
  }, [jobOrders, debouncedSearch, jobTypeFilter, statusFilter])

  useEffect(() => { setPage(1) }, [filtered.length])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginated = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  )

  const hasActiveFilters = debouncedSearch.trim().length > 0 || jobTypeFilter !== 'all' || statusFilter !== 'all'
  const isSearchActive = debouncedSearch.trim().length > 0 || searchFocused


  return (
    <div className="w-full space-y-5">

      {/* Header */}
      <PageHeading title="Job Orders" description="All job orders in one place — installations, reconnections, disconnections, repairs, transfers, and service reports" />
{/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1">
          <div className="relative w-full min-w-0 sm:w-auto sm:flex-1 sm:max-w-sm">
            <Search className={cn('absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 transition-colors', isSearchActive ? 'text-violet-400' : 'text-slate-300')} />
            <Input
              placeholder="Search JO no., account, consumer, barangay…"
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
            jobTypes={jobTypes}
            jobTypeFilter={jobTypeFilter}
            onJobTypeChange={(v) => { setJobTypeFilter(v); setPage(1) }}
            statusFilter={statusFilter}
            onStatusChange={(v) => { setStatusFilter(v); setPage(1) }}
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

         <RequestJobOrderForm onSuccess={fetchJobOrders} />

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
                  job order{filtered.length !== 1 ? 's' : ''}
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
              <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">JO No.</TableHead>
              <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Job Type</TableHead>
              <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">S/N / Zone</TableHead>
              <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Consumer / User</TableHead>
              <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Barangay</TableHead>
              <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Requested By</TableHead>
              <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Status</TableHead>
              <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Requested</TableHead>
              <TableHead className="w-12"><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && [...Array(6)].map((_, i) => (
              <TableRow key={i}>
                <TableCell><div className="h-3.5 w-20 bg-slate-100 animate-pulse rounded-full" /></TableCell>
                <TableCell><div className="h-6 w-20 bg-slate-100 animate-pulse rounded-full" /></TableCell>
                <TableCell><div className="h-3.5 w-24 bg-slate-100 animate-pulse rounded-full" /></TableCell>
                <TableCell><div className="h-3.5 w-32 bg-slate-100 animate-pulse rounded-full" /></TableCell>
                <TableCell><div className="h-3.5 w-20 bg-slate-100 animate-pulse rounded-full" /></TableCell>
                <TableCell><div className="h-3.5 w-24 bg-slate-100 animate-pulse rounded-full" /></TableCell>
                <TableCell><div className="h-6 w-20 bg-slate-100 animate-pulse rounded-full" /></TableCell>
                <TableCell><div className="h-3.5 w-16 bg-slate-100 animate-pulse rounded-full" /></TableCell>
                <TableCell><div className="h-7 w-7 bg-slate-100 animate-pulse rounded-md" /></TableCell>
              </TableRow>
            ))}

            {!isLoading && jobOrders.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="h-72 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-12 w-12 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center">
                      <ClipboardList className="h-5 w-5 text-violet-300" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-600">No job orders yet</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Job orders from installations, reconnections, disconnections, service reports, and transfers will appear here.
                      </p>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            )}

            {!isLoading && jobOrders.length > 0 && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="h-64 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-12 w-12 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center">
                      <Search className="h-5 w-5 text-violet-300" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-600">No results</p>
                      <p className="text-xs text-slate-400 mt-1">No job orders match your filters.</p>
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

            {!isLoading && paginated.map((jo) => (
              <TableRow key={jo.job_order_id} className="border-t border-slate-100 hover:bg-violet-50/40 transition-colors">
                <TableCell className="py-3">
                  <span className="text-[12px] font-mono font-bold text-slate-700">{jo.job_order_no ?? '—'}</span>
                </TableCell>

                <TableCell className="py-3">
                  <span className={cn(
                    'inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-semibold border',
                    jobTypeStyles[jo.job_type_code] ?? 'bg-slate-50 text-slate-600 border-slate-200',
                  )}>
                    {jo.job_type_name}
                  </span>
                </TableCell>

                <TableCell className="py-3">
                  <span className="text-[11px] font-mono text-slate-500">
                    {jo.meter_serial_no !== '—' ? jo.meter_serial_no : (jo.zone_name !== '—' ? jo.zone_name : '—')}
                  </span>
                </TableCell>

                <TableCell className="py-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12.5px] font-medium text-slate-700">
                      {jo.consumer_name}
                    </span>
                  </div>
                </TableCell>

                <TableCell className="py-3 text-[11px] text-slate-500">{jo.barangay_name}</TableCell>
                <TableCell className="py-3 text-[11px] text-slate-500">{jo.created_by_name}</TableCell>

                <TableCell className="py-3">
                  <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold border', statusStyles[jo.job_status_name] ?? 'bg-slate-50 text-slate-400 border-slate-200')}>
                    <span className={cn('h-1.5 w-1.5 rounded-full', statusDotStyles[jo.job_status_name] ?? 'bg-slate-300')} />
                    {jo.job_status_name}
                  </span>
                </TableCell>

                <TableCell className="py-3 text-[11px] text-slate-500">
                  {jo.request_date ? new Date(jo.request_date).toLocaleDateString() : '—'}
                </TableCell>

                <TableCell className="py-3">
                  {jo.job_status_name !== 'Completed' && jo.job_status_name !== 'Cancelled' ? (
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
                        <DropdownMenuItem
                          onClick={() => setViewingId(jo.job_order_id)}
                          className="cursor-pointer rounded-md text-xs text-slate-500 focus:bg-violet-50 focus:text-violet-700 dark:focus:bg-accent dark:focus:text-accent-foreground gap-2"
                        >
                          <Eye className="h-3.5 w-3.5" /> View Details
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <button
                      onClick={() => setViewingId(jo.job_order_id)}
                      className="h-7 w-7 rounded-md flex items-center justify-center text-slate-400 hover:text-violet-600 hover:bg-violet-50"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                  )}
                </TableCell>
              </TableRow>
            ))}
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

      <ViewJobOrderDetailsDialog
        jobOrderId={viewingId}
        onOpenChange={(open) => { if (!open) setViewingId(null) }}
      />
    </div>
  )
}