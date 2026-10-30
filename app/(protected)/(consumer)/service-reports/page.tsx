'use client'

import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'


import { TablePagination } from '@/components/shared-ui/pagination'
// app/consumer/service-reports/page.tsx
import { PageHeading } from '@/components/shared-ui/page-heading'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Search,
  MoreHorizontal,
  Eye,
  X,
  ClipboardList,
  Gauge,
  Ban,
  Pencil,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

import {
  getMyServiceReports,
  type ServiceReport,
} from '@/lib/actions/service-report/service-report.actions'
import ConsumerServiceReportForm from '@/components/consumer-ui/service-report/create-service-report-form'
import EditServiceReportForm from '@/components/consumer-ui/service-report/edit-service-report-form'
import ViewServiceReportDialog from '@/components/meter-reader-ui/service-report/view-service-report-dialog'
import CancelServiceReportDialog from '@/components/consumer-ui/service-report/cancel-service-report-dialog'

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

function getStatusBadge(statusName: string, resolvedAt: string | null) {
  const s = statusName?.toLowerCase() || 'pending'

  if (s === 'approved' && resolvedAt) {
    return { label: 'Resolved', className: 'rounded-md bg-emerald-50 text-emerald-700 border-emerald-200' }
  }
  switch (s) {
    case 'approved':
      return { label: 'Approved', className: 'rounded-md bg-sky-50 text-sky-700 border-sky-200' }
    case 'pending':
      return { label: 'Pending', className: 'rounded-md bg-amber-50 text-amber-700 border-amber-200' }
    case 'rejected':
      return { label: 'Rejected', className: 'rounded-md bg-rose-50 text-rose-700 border-rose-200' }
    case 'cancel':
      return { label: 'Cancelled', className: 'rounded-md bg-slate-100 text-slate-500 border-slate-200' }
    default:
      return { label: statusName || 'Unknown', className: 'rounded-md bg-slate-50 text-slate-500 border-slate-200' }
  }
}

// ─── Skeleton Row ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <TableRow>
      {[...Array(6)].map((_, i) => (
        <TableCell key={i} className="py-3">
          <div className="h-3.5 w-full bg-slate-100 animate-pulse rounded-full" />
        </TableCell>
      ))}
    </TableRow>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function MyServiceReportsPage() {
  const [reports, setReports] = useState<ServiceReport[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedSearch(search)
  const [searchFocused, setSearchFocused] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [viewTarget, setViewTarget] = useState<ServiceReport | null>(null)

  // ── Edit state ──
  const [editTarget, setEditTarget] = useState<ServiceReport | null>(null)
  const [editOpen, setEditOpen] = useState(false)

  // ── Cancel state ──
  const [cancelTarget, setCancelTarget] = useState<ServiceReport | null>(null)

  const fetchReports = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await getMyServiceReports()
      setReports(data)
    } catch {
      toast.error('Failed to load your service reports')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchReports() }, [fetchReports])

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    if (!q) return reports
    return reports.filter((r) =>
      r.meter_serial_no?.toLowerCase().includes(q) ||
      r.zone_name?.toLowerCase().includes(q) ||
      r.reference_no?.toLowerCase().includes(q) ||
      r.issue_name.toLowerCase().includes(q),
    )
  }, [reports, debouncedSearch])

  useEffect(() => { setPage(1) }, [filtered.length])

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

  const handleEditDone = () => {
    setEditTarget(null)
    setEditOpen(false)
    fetchReports()
  }

  const handleCancelDone = () => {
    setCancelTarget(null)
    fetchReports()
  }

  // Check if report is pending (can be edited or cancelled)
  const isPending = (report: ServiceReport) => {
    return report.report_status_name?.toLowerCase() === 'pending'
  }

  // Get the target display for the table (meter account or zone)
  const getTargetDisplay = (report: ServiceReport) => {
    if (report.meter_serial_no) {
      return report.meter_serial_no
    }
    if (report.zone_name) {
      return `Zone: ${report.zone_name}`
    }
    return '—'
  }

  const getTargetSubDisplay = (report: ServiceReport) => {
    if (report.consumer_name) {
      return report.consumer_name
    }
    if (report.barangay_name) {
      return report.barangay_name
    }
    return null
  }

  return (
    <div className="w-full space-y-5">

      {/* Header */}
      <PageHeading title="My Service Reports" description="Issues you've reported on your own meter account or zone" />
{/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1">

          <div className="relative w-full min-w-0 sm:w-auto sm:flex-1 sm:max-w-sm">
            <Search
              className={cn(
                'absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 transition-colors',
                isSearchActive ? 'text-violet-400' : 'text-slate-300',
              )}
            />
            <Input
              placeholder="Search issue, account, zone, ref no..."
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

        <ConsumerServiceReportForm onSuccess={fetchReports} />
      </div>

      {/* Table */}
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
                  <span className="font-semibold text-slate-700">{filtered.length}</span>
                  {' report'}{filtered.length !== 1 ? 's' : ''}
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
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Target</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Issue Type</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Reference</TableHead>
                <TableHead className="text-center text-[9px] font-bold text-slate-400 uppercase tracking-wider">Status</TableHead>
                <TableHead className="text-right text-[9px] font-bold text-slate-400 uppercase tracking-wider">Filed</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>

              {isLoading && [...Array(5)].map((_, i) => <SkeletonRow key={i} />)}

              {!isLoading && reports.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-72 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-12 w-12 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center">
                        <ClipboardList className="h-5 w-5 text-violet-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-600">No reports yet</p>
                        <p className="text-xs text-slate-400 mt-1">Reports you file will appear here.</p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {!isLoading && reports.length > 0 && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-64 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-12 w-12 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center">
                        <Search className="h-5 w-5 text-violet-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-600">No results</p>
                        <p className="text-xs text-slate-400 mt-1">No reports match your search.</p>
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

              {!isLoading && paginated.map((r) => {
                const statusBadge = getStatusBadge(r.report_status_name, r.resolved_at)
                const isPendingReport = isPending(r)
                const targetDisplay = getTargetDisplay(r)
                const targetSubDisplay = getTargetSubDisplay(r)

                return (
                  <TableRow
                    key={r.report_id}
                    className="border-t border-slate-100 hover:bg-violet-50/40 transition-colors cursor-pointer"
                    onClick={() => setViewTarget(r)}
                  >
                    <TableCell className="py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-md bg-violet-100 flex items-center justify-center shrink-0">
                          {r.meter_serial_no ? (
                            <Gauge className="h-3.5 w-3.5 text-violet-600" />
                          ) : (
                            <div className="h-3.5 w-3.5 rounded-full bg-violet-300 flex items-center justify-center text-[8px] font-bold text-white">
                              Z
                            </div>
                          )}
                        </div>
                        <div>
                          <span className="text-[12.5px] font-mono font-medium text-slate-800">
                            {targetDisplay}
                          </span>
                          {targetSubDisplay && (
                            <span className="text-[10px] text-slate-400 block">
                              {targetSubDisplay}
                            </span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-3 text-[12.5px] text-slate-600">
                      {r.issue_name}
                    </TableCell>
                    <TableCell className="py-3 text-[12.5px] text-slate-500">
                      {r.reference_no || <span className="text-[10px] text-slate-400 italic">—</span>}
                    </TableCell>
                    <TableCell className="py-3 text-center">
                      <Badge variant="outline" className={cn('text-[10px] font-semibold', statusBadge.className)}>
                        {statusBadge.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3 text-right text-[12px] text-slate-500">
                      {formatDate(r.created_at)}
                    </TableCell>
                    <TableCell className="py-3" onClick={(e) => e.stopPropagation()}>
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

                          {/* View details - always available */}
                          <DropdownMenuItem
                            className="cursor-pointer rounded-md text-xs text-slate-500 focus:bg-violet-50 focus:text-violet-700 dark:focus:bg-accent dark:focus:text-accent-foreground py-2 gap-2"
                            onClick={() => setViewTarget(r)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>View details</span>
                          </DropdownMenuItem>

                            {/* Edit - only for pending reports */}
                            {isPendingReport && (
                              <EditServiceReportForm
                                report={r}
                                onSuccess={handleEditDone}
                              >
                                <DropdownMenuItem
                                  className="cursor-pointer rounded-lg gap-2.5 py-2 group"
                                  onSelect={(e) => e.preventDefault()}
                                >
                                  <div className="h-6 w-6 rounded-md flex items-center justify-center shrink-0 transition-colors bg-slate-100 group-hover:bg-amber-100">
                                    <Pencil className="h-3 w-3 text-slate-500 group-hover:text-amber-600 transition-colors" />
                                  </div>
                                  <span className="text-xs font-medium text-slate-500 group-hover:text-amber-600 transition-colors">
                                    Edit report
                                  </span>
                                </DropdownMenuItem>
                              </EditServiceReportForm>
                            )}

                          {/* Cancel - only for pending reports */}
                          {isPendingReport && (
                            <>
                              <DropdownMenuSeparator className="my-1" />
                              <DropdownMenuItem
                                className="cursor-pointer rounded-md text-xs text-rose-600 focus:bg-rose-50 focus:text-rose-700 py-2 gap-2"
                                onClick={() => setCancelTarget(r)}
                              >
                                <Ban className="h-3.5 w-3.5" />
                                <span>Cancel report</span>
                              </DropdownMenuItem>
                            </>
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

      {/* View Details Dialog */}
      <ViewServiceReportDialog
        report={viewTarget}
        open={!!viewTarget}
        onOpenChange={(v) => { if (!v) setViewTarget(null) }}
      />

      {/* Cancel Dialog */}
      <CancelServiceReportDialog
        report={cancelTarget}
        open={!!cancelTarget}
        onOpenChange={(open) => { if (!open) setCancelTarget(null) }}
        onDone={handleCancelDone}
      />
    </div>
  )
}