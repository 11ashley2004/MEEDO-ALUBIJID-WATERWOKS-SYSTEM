'use client'

import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'


import { TablePagination } from '@/components/shared-ui/pagination'
import { PageHeading } from '@/components/shared-ui/page-heading'
import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Search,
  ClipboardList,
  ShieldCheck,
  XCircle,
  Eye,
  X,
  ChevronDown,
  SlidersHorizontal,
  MoreHorizontal,
  CheckCircle2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  getAllServiceReports,
  type ServiceReport,
} from '@/lib/actions/service-report/service-report.actions'
import { toast } from 'sonner'

import AdminViewServiceReportDialog from '@/components/admin-ui/service-report/admin-view-service-report-dialog'
import ApproveServiceReportDialog from '@/components/admin-ui/service-report/approve-service-report-dialog'
import RejectServiceReportDialog from '@/components/admin-ui/service-report/reject-service-report-dialog'
import ConfirmServiceReportDialog from '@/components/admin-ui/service-report/confirm-service-report-dialog'
import CreateServiceReportForm from '@/components/meter-reader-ui/service-report/create-service-report-form'

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]
const STATUS_FILTERS = ['all', 'pending', 'approved', 'rejected', 'cancelled'] as const

// ── Status Badge ─────────────────────────────────────────────────────────────

function ReportStatusBadge({ statusName, resolvedAt }: { statusName: string; resolvedAt: string | null }) {
  const s = statusName?.toLowerCase() || 'pending'

  if (s === 'approved' && resolvedAt) {
    return (
      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1.5 rounded-md">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Resolved
      </Badge>
    )
  }

  switch (s) {
    case 'approved':
      return (
        <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200 gap-1.5 rounded-md">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
          Approved
        </Badge>
      )
    case 'pending':
      return (
        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 gap-1.5 rounded-md">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          Pending
        </Badge>
      )
    case 'rejected':
      return (
        <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 gap-1.5 rounded-md">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
          Rejected
        </Badge>
      )
    case 'cancelled':
      return (
        <Badge variant="outline" className="bg-slate-100 text-slate-500 border-slate-200 gap-1.5 rounded-md">
          <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
          Cancelled
        </Badge>
      )
    default:
      return (
        <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200 gap-1.5 rounded-md">
          <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
          {statusName || 'Unknown'}
        </Badge>
      )
  }
}

// ── Filters Panel ────────────────────────────────────────────────────────────

function FiltersPanel({
  statusFilter,
  onStatusChange,
}: {
  statusFilter: string
  onStatusChange: (v: string) => void
}) {
  const active = statusFilter !== 'all'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-9 gap-1.5 text-sm font-medium transition-all rounded-md',
            active && ['border-violet-400 bg-violet-50 text-violet-700', 'hover:bg-violet-100 hover:border-violet-500'],
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
          Filters
          {active && (
            <span className="inline-flex items-center justify-center h-[18px] min-w-[18px] px-1 rounded-full bg-violet-600 text-white text-[11px] font-semibold leading-none">1</span>
          )}
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 rounded-md p-1.5">
        <DropdownMenuLabel className="text-[9px] font-bold uppercase tracking-widest text-violet-400 px-2 py-1.5">
          Report Status
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="mb-1" />
        <DropdownMenuRadioGroup value={statusFilter} onValueChange={onStatusChange}>
          {STATUS_FILTERS.map((s) => (
            <DropdownMenuRadioItem
              key={s}
              value={s}
              className={cn(
                'cursor-pointer rounded-md text-xs capitalize',
                statusFilter === s && 'text-violet-600 font-medium bg-violet-50',
              )}
            >
              {s === 'all' ? 'All Statuses' : s}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminServiceReportList() {
  const [reports, setReports] = useState<ServiceReport[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedSearch(search)
  const [searchFocused, setSearchFocused] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'cancel'>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const [viewTarget, setViewTarget] = useState<ServiceReport | null>(null)
  const [approveTarget, setApproveTarget] = useState<ServiceReport | null>(null)
  const [rejectTarget, setRejectTarget] = useState<ServiceReport | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<ServiceReport | null>(null)

  const fetchReports = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await getAllServiceReports()
      setReports(data)
    } catch {
      toast.error('Failed to load service reports')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchReports() }, [fetchReports])

  const clearAll = useCallback(() => {
    setSearch('')
    setStatusFilter('all')
    setPage(1)
  }, [])

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    return reports.filter((r) => {
      if (q &&
        !(r.meter_serial_no?.toLowerCase().includes(q)) &&
        !(r.consumer_name?.toLowerCase().includes(q)) &&
        !(r.zone_name?.toLowerCase().includes(q)) &&
        !(r.reference_no?.toLowerCase().includes(q)) &&
        !r.issue_name.toLowerCase().includes(q)
      ) return false
      if (statusFilter !== 'all' && r.report_status_name.toLowerCase() !== statusFilter) return false
      return true
    })
  }, [reports, debouncedSearch, statusFilter])

  useEffect(() => { setPage(1) }, [filtered.length])

  const pendingCount = useMemo(
    () => reports.filter((r) => r.report_status_name.toLowerCase() === 'pending').length,
    [reports],
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginated = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  )

  const hasActiveFilters = debouncedSearch.trim().length > 0 || statusFilter !== 'all'
  const isSearchActive = debouncedSearch.trim().length > 0 || searchFocused


  return (
    <>
      <PageHeading
        title="Service Reports"
        description={
          pendingCount > 0
            ? `${pendingCount} report${pendingCount !== 1 ? 's' : ''} awaiting your review`
            : 'All caught up — no reports awaiting review'
        }
      />

      {/* ── Toolbar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 flex-1">
          <div className="relative w-full min-w-0 sm:w-auto sm:flex-1 sm:max-w-xs">
            <Search
              className={cn(
                'absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 transition-colors pointer-events-none',
                isSearchActive ? 'text-violet-400' : 'text-slate-300',
              )}
            />
            <Input
              placeholder="Search account, consumer, zone, ref no..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              className={cn(
                'pl-9 h-8 rounded-lg text-xs bg-white border-slate-200 text-slate-700',
                'placeholder:text-slate-300 focus-visible:ring-0 focus-visible:ring-offset-0 transition-colors',
                isSearchActive ? 'border-violet-400 ring-2 ring-violet-100' : 'hover:border-violet-200',
              )}
            />
            {search && (
              <button
                onClick={() => { setSearch(''); setPage(1) }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-slate-100 transition-colors"
              >
                <X className="h-3 w-3 text-slate-400" />
              </button>
            )}
          </div>

          <div className="hidden sm:block h-4 w-px bg-slate-200 shrink-0" />

          <FiltersPanel
            statusFilter={statusFilter}
            onStatusChange={(v) => { setStatusFilter(v as any); setPage(1) }}
          />

          {hasActiveFilters && (
            <button
              onClick={clearAll}
              className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-xs text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>

        <div className="shrink-0 flex items-center gap-2">
          <CreateServiceReportForm onSuccess={fetchReports} />
        </div>
      </div>

      {/* ── Table panel ── */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">

        <div className="px-5 py-3 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-lg bg-violet-100 border border-violet-200 flex items-center justify-center">
              <ClipboardList className="h-3 w-3 text-violet-500" />
            </div>
            <p className="text-xs text-slate-500">
              {isLoading ? (
                <span className="inline-block h-3 w-24 bg-slate-100 animate-pulse rounded-full" />
              ) : (
                <>
                  <span className="font-semibold text-slate-700">{filtered.length}</span>
                  {' '}report{filtered.length !== 1 ? 's' : ''}
                  {hasActiveFilters && <span className="text-slate-400"> · filtered</span>}
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <span className="hidden sm:inline">Rows per page</span>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1) }}>
              <SelectTrigger
                className={cn(
                  'h-7 w-[58px] rounded-md text-[11px] bg-white border-slate-200 text-slate-500',
                  'focus:ring-0 focus:ring-offset-0 hover:border-violet-300',
                  pageSize !== 10 && 'border-violet-300 text-violet-600',
                )}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white border border-slate-200 rounded-lg">
                {PAGE_SIZE_OPTIONS.map((s) => (
                  <SelectItem
                    key={s}
                    value={String(s)}
                    className="text-xs text-slate-600 focus:bg-violet-50 focus:text-violet-700 dark:focus:bg-accent dark:focus:text-accent-foreground cursor-pointer"
                  >
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                {['Target', 'Issue Type', 'Reference', 'Reported By', 'Status', ''].map((h, i) => (
                  <th
                    key={i}
                    className={cn(
                      'px-5 py-2.5 text-left text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap',
                      i === 5 && 'w-[44px]',
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>

              {isLoading && [...Array(6)].map((_, i) => (
                <tr key={i} className="border-t border-slate-100">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <td key={j} className="px-5 py-3.5">
                      <div className="h-3 w-20 bg-slate-100 animate-pulse rounded-full" />
                    </td>
                  ))}
                  <td className="px-5 py-3.5">
                    <div className="h-7 w-7 bg-slate-100 animate-pulse rounded-lg" />
                  </td>
                </tr>
              ))}

              {!isLoading && reports.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-12 w-12 rounded-lg bg-violet-50 border border-violet-100 flex items-center justify-center">
                        <ClipboardList className="h-5 w-5 text-violet-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-600">No service reports yet</p>
                        <p className="text-xs text-slate-400 mt-1">Filed reports will appear here.</p>
                      </div>
                    </div>
                  </td>
                </tr>
              )}

              {!isLoading && reports.length > 0 && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-14 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-12 w-12 rounded-lg bg-violet-50 border border-violet-100 flex items-center justify-center">
                        <Search className="h-5 w-5 text-violet-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-600">No results</p>
                        <p className="text-xs text-slate-400 mt-1">No reports match your filters.</p>
                      </div>
                      <button
                        onClick={clearAll}
                        className="inline-flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium text-violet-600 bg-violet-50 border border-violet-200 hover:bg-violet-100 transition-colors"
                      >
                        Clear filters
                      </button>
                    </div>
                  </td>
                </tr>
              )}

              {!isLoading && paginated.map((r) => {
                const isPending = r.report_status_name.toLowerCase() === 'pending'

                return (
                  <tr
                    key={r.report_id}
                    className="border-t border-slate-100 hover:bg-violet-50/40 transition-colors cursor-pointer"
                    onClick={() => setViewTarget(r)}
                  >
                    <td className="px-5 py-3">
                      {r.meter_serial_no ? (
                        <>
                          <div className="text-[12px] font-mono font-medium text-slate-600">{r.meter_serial_no}</div>
                          <div className="text-[11px] text-slate-400 truncate">{r.consumer_name}</div>
                        </>
                      ) : (
                        <>
                          <div className="text-[12.5px] font-medium text-slate-700">{r.zone_name}</div>
                          <div className="text-[11px] text-slate-400">{r.barangay_name}</div>
                        </>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="text-[12.5px] font-medium text-slate-700">{r.issue_name}</div>
                      <div className="mt-1">
                        {r.affects_billing ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] rounded-md bg-amber-50 text-amber-700 border-amber-200"
                          >
                            Affects billing
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-[10px] rounded-md bg-slate-50 text-slate-500 border-slate-200"
                          >
                            No billing impact
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">
                      {r.reference_no || <span className="text-[10px] text-slate-400 italic">—</span>}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">{r.report_by_name}</td>
                    <td className="px-5 py-3">
                      <ReportStatusBadge statusName={r.report_status_name} resolvedAt={r.resolved_at} />
                    </td>
                    <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="h-7 w-7 rounded-md flex items-center justify-center bg-white border border-slate-200 text-slate-400 hover:text-violet-600 hover:border-violet-300 hover:bg-violet-50 transition-colors">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 bg-white border border-slate-200 rounded-lg p-1.5">
                          <DropdownMenuLabel className="text-[9px] font-bold uppercase tracking-widest text-violet-400 px-2 py-1.5">
                            Actions
                          </DropdownMenuLabel>
                          <DropdownMenuSeparator className="bg-slate-100 mb-1" />

                          <DropdownMenuItem onClick={() => setViewTarget(r)} className="cursor-pointer rounded-lg gap-2.5 py-2 group">
                            <div className="h-6 w-6 rounded-md flex items-center justify-center shrink-0 transition-colors bg-slate-100 group-hover:bg-violet-100">
                              <Eye className="h-3 w-3 text-slate-500 group-hover:text-violet-600 transition-colors" />
                            </div>
                            <span className="text-xs font-medium text-slate-500 group-hover:text-violet-600 transition-colors">
                              View details
                            </span>
                          </DropdownMenuItem>

                          {isPending ? (
                            <>
                              <DropdownMenuSeparator className="bg-slate-100 my-1" />
                              <DropdownMenuItem onClick={() => setApproveTarget(r)} className="cursor-pointer rounded-lg gap-2.5 py-2 group">
                                <div className="h-6 w-6 rounded-md flex items-center justify-center shrink-0 bg-emerald-100">
                                  <ShieldCheck className="h-3 w-3 text-emerald-600" />
                                </div>
                                <span className="text-xs font-medium text-emerald-600">
                                  Review &amp; accept
                                </span>
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setRejectTarget(r)} className="cursor-pointer rounded-lg gap-2.5 py-2 group">
                                <div className="h-6 w-6 rounded-md flex items-center justify-center shrink-0 bg-rose-100">
                                  <XCircle className="h-3 w-3 text-rose-600" />
                                </div>
                                <span className="text-xs font-medium text-rose-600">
                                  Reject
                                </span>
                              </DropdownMenuItem>
                            </>
                          ) : r.report_status_name.toLowerCase() === 'approved' &&
                            r.field_completed_at &&
                            !r.resolved_at &&
                            r.issue_name !== 'Leak After Meter' ? (
                            <>
                              <DropdownMenuSeparator className="bg-slate-100 my-1" />
                              <DropdownMenuItem
                                onClick={() => setConfirmTarget(r)}
                                className="cursor-pointer rounded-lg gap-2.5 py-2 group"
                              >
                                <div className="h-6 w-6 rounded-md flex items-center justify-center shrink-0 bg-violet-100">
                                  <CheckCircle2 className="h-3 w-3 text-violet-600" />
                                </div>
                                <span className="text-xs font-medium text-violet-600">
                                  Confirm completion
                                </span>
                              </DropdownMenuItem>
                            </>
                          ) : (
                            <DropdownMenuLabel className="text-[10px] font-normal text-slate-300 italic px-2 py-1.5">
                              No action needed
                            </DropdownMenuLabel>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Pagination ── */}
      {!isLoading && (
        <TablePagination
          page={safePage}
          pageSize={pageSize}
          total={filtered.length}
          onPageChange={setPage}
        />
      )}

      {/* ── Dialogs ── */}
      <AdminViewServiceReportDialog
        report={viewTarget}
        open={!!viewTarget}
        onOpenChange={(v) => { if (!v) setViewTarget(null) }}
        onApprove={(r) => { setViewTarget(null); setApproveTarget(r) }}
        onReject={(r) => { setViewTarget(null); setRejectTarget(r) }}
      />
      <ApproveServiceReportDialog
        report={approveTarget}
        open={!!approveTarget}
        onOpenChange={(v) => { if (!v) setApproveTarget(null) }}
        onDone={fetchReports}
      />
      <RejectServiceReportDialog
        report={rejectTarget}
        open={!!rejectTarget}
        onOpenChange={(v) => { if (!v) setRejectTarget(null) }}
        onDone={fetchReports}
      />
      <ConfirmServiceReportDialog
        open={!!confirmTarget}
        onOpenChange={(v) => { if (!v) setConfirmTarget(null) }}
        reportId={confirmTarget?.report_id ?? ''}
        referenceNo={confirmTarget?.reference_no}
        issueName={confirmTarget?.issue_name}
        onSuccess={fetchReports}
      />
    </>
  )
}