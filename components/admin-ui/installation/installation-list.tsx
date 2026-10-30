'use client'

import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'


import { TablePagination } from '@/components/shared-ui/pagination'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { Search, Wrench, MoreHorizontal, CheckCircle2, XCircle, X, ChevronDown, SlidersHorizontal } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  getAllInstallations,
  cancelInstallation,
  completeInstallation,
  type Installation,
} from '@/lib/actions/installation/installation.actions'
import { toast } from 'sonner'

import CreateInstallationForm from '@/components/admin-ui/installation/create-installation-form'

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

// ── Installation Status Badge ────────────────────────────────────────────────

function InstallationStatusBadge({ statusName }: { statusName: string }) {
  const s = statusName?.toUpperCase() || 'PENDING'

  switch (s) {
    case 'COMPLETED':
      return (
        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1.5 rounded-md">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Completed
        </Badge>
      )
    case 'PENDING':
      return (
        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 gap-1.5 rounded-md">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          Pending
        </Badge>
      )
    case 'CANCELLED':
      return (
        <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 gap-1.5 rounded-md">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
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
            active && ['border-violet-400 bg-violet-50 text-violet-700', 'hover:bg-violet-100 hover:border-violet-500']
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
          Installation Status
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="mb-1" />
        <DropdownMenuRadioGroup value={statusFilter} onValueChange={onStatusChange}>
          {['all', 'Pending', 'Completed', 'Cancelled'].map((s) => (
            <DropdownMenuRadioItem
              key={s}
              value={s}
              className={cn(
                'cursor-pointer rounded-md text-xs',
                statusFilter === s && 'text-violet-600 font-medium bg-violet-50'
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

// ── Complete Dialog ──────────────────────────────────────────────────────────

function CompleteDialog({
  installation,
  open,
  onOpenChange,
  onDone,
}: {
  installation: Installation | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onDone: () => void
}) {
  const [serial, setSerial] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => { if (!open) setSerial('') }, [open])

  const handleSubmit = async () => {
    if (!installation) return
    if (!serial.trim()) {
      toast.error('Meter serial number is required')
      return
    }
    setSubmitting(true)
    try {
      const res = await completeInstallation(installation.installation_id, serial.trim())
      if (res.status === 'success') {
        toast.success(res.message || 'Installation completed')
        onOpenChange(false)
        onDone()
      } else {
        toast.error(res.message || 'Failed to complete installation')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-white rounded-lg">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-bold text-slate-900">Complete Installation</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-[12.5px] text-slate-500">
            Activating meter for{' '}
            <span className="font-semibold text-slate-700">{installation?.meter_serial_no}</span>.
            This will set the meter status to Active and close the linked job order.
          </p>
          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
              Meter Serial No. <span className="text-red-500">*</span>
            </Label>
            <Input
              value={serial}
              onChange={(e) => setSerial(e.target.value)}
              placeholder="e.g. MTR-2026-00123"
              className="h-10 rounded-md text-[13px] border-slate-200"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <Button variant="outline" className="rounded-md h-9 text-[13px]" disabled={submitting}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            className="rounded-md h-9 text-[13px] bg-violet-600 hover:bg-violet-700 text-white font-semibold gap-2"
            disabled={submitting}
            onClick={handleSubmit}
          >
            {submitting ? <><Spinner /> Completing…</> : 'Mark Completed'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Cancel Dialog ────────────────────────────────────────────────────────────

function CancelDialog({
  installation,
  open,
  onOpenChange,
  onDone,
}: {
  installation: Installation | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onDone: () => void
}) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => { if (!open) setReason('') }, [open])

  const handleSubmit = async () => {
    if (!installation) return
    if (!reason.trim()) {
      toast.error('Cancellation reason is required')
      return
    }
    setSubmitting(true)
    try {
      const res = await cancelInstallation(installation.installation_id, reason.trim())
      if (res.status === 'success') {
        toast.success(res.message || 'Installation cancelled')
        onOpenChange(false)
        onDone()
      } else {
        toast.error(res.message || 'Failed to cancel installation')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-white rounded-lg">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-bold text-slate-900">Cancel Installation</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-[12.5px] text-slate-500">
            Cancelling installation for{' '}
            <span className="font-semibold text-slate-700">{installation?.meter_serial_no}</span>.
            This will also cancel its open job order, if any.
          </p>
          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
              Reason <span className="text-red-500">*</span>
            </Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this installation being cancelled?"
              className="rounded-md text-[13px] border-slate-200 min-h-[80px]"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <Button variant="outline" className="rounded-md h-9 text-[13px]" disabled={submitting}>
              Back
            </Button>
          </DialogClose>
          <Button
            className="rounded-md h-9 text-[13px] bg-rose-600 hover:bg-rose-700 text-white font-semibold gap-2"
            disabled={submitting}
            onClick={handleSubmit}
          >
            {submitting ? <><Spinner /> Cancelling…</> : 'Cancel Installation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function InstallationList() {
  const [installations, setInstallations] = useState<Installation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedSearch(search)
  const [searchFocused, setSearchFocused] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const [completeTarget, setCompleteTarget] = useState<Installation | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Installation | null>(null)

  const fetchInstallations = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await getAllInstallations()
      setInstallations(data)
    } catch {
      toast.error('Failed to load installations')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchInstallations() }, [fetchInstallations])

  const clearAll = useCallback(() => {
    setSearch('')
    setStatusFilter('all')
    setPage(1)
  }, [])

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    return installations.filter((i) => {
      if (q &&
        !i.consumer_name.toLowerCase().includes(q) &&
        !(i.meter_serial_no ?? '').toLowerCase().includes(q) &&
        !i.barangay_name.toLowerCase().includes(q) &&
        !i.zone_name.toLowerCase().includes(q)
      ) return false
      if (statusFilter !== 'all' && i.installation_status_name !== statusFilter) return false
      return true
    })
  }, [installations, debouncedSearch, statusFilter])

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
    <>
      {/* ── Toolbar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-4">

        {/* Left Group: Search + Filter */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 flex-1">
          <div className="relative w-full min-w-0 sm:w-auto sm:flex-1 sm:max-w-xs">
            <Search
              className={cn(
                'absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 transition-colors pointer-events-none',
                isSearchActive ? 'text-violet-400' : 'text-slate-300',
              )}
            />
            <Input
              placeholder="Search Contract No., consumer, barangay..."
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
            onStatusChange={(v) => { setStatusFilter(v); setPage(1) }}
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

        {/* Right Group: Create button */}
        <div className="shrink-0">
          <CreateInstallationForm onSuccess={fetchInstallations} />
        </div>
      </div>

      {/* ── Table panel ── */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">

        {/* Table bar */}
        <div className="px-5 py-3 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-lg bg-violet-100 border border-violet-200 flex items-center justify-center">
              <Wrench className="h-3 w-3 text-violet-500" />
            </div>
            <p className="text-xs text-slate-500">
              {isLoading ? (
                <span className="inline-block h-3 w-24 bg-slate-100 animate-pulse rounded-full" />
              ) : (
                <>
                  <span className="font-semibold text-slate-700">{filtered.length}</span>
                  {' '}installation{filtered.length !== 1 ? 's' : ''}
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

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                {['Serial No.', 'Consumer', 'Barangay', 'Zone', 'Requested By', 'Job Order', 'Status', ''].map((h, i) => (
                  <th
                    key={i}
                    className={cn(
                      'px-5 py-2.5 text-left text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap',
                      i === 7 && 'w-[44px]',
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
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-5 py-3.5">
                      <div className="h-3 w-20 bg-slate-100 animate-pulse rounded-full" />
                    </td>
                  ))}
                  <td className="px-5 py-3.5">
                    <div className="h-7 w-7 bg-slate-100 animate-pulse rounded-lg" />
                  </td>
                </tr>
              ))}

              {!isLoading && installations.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-12 w-12 rounded-lg bg-violet-50 border border-violet-100 flex items-center justify-center">
                        <Wrench className="h-5 w-5 text-violet-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-600">No installations yet</p>
                        <p className="text-xs text-slate-400 mt-1">Requested installations will appear here.</p>
                      </div>
                    </div>
                  </td>
                </tr>
              )}

              {!isLoading && installations.length > 0 && filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-14 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-12 w-12 rounded-lg bg-violet-50 border border-violet-100 flex items-center justify-center">
                        <Search className="h-5 w-5 text-violet-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-600">No results</p>
                        <p className="text-xs text-slate-400 mt-1">No installations match your filters.</p>
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

              {!isLoading && paginated.map((inst) => {
                const isOpen = inst.installation_status_name === 'Pending'
                return (
                  <tr key={inst.installation_id} className="border-t border-slate-100 hover:bg-violet-50/40 transition-colors">
                    <td className="px-5 py-3">
                      <span className="text-[12px] font-mono font-medium text-slate-600">{inst.meter_serial_no}</span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="text-[12.5px] font-medium text-slate-700 leading-tight">{inst.consumer_name}</div>
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">{inst.barangay_name}</td>
                    <td className="px-5 py-3 text-xs text-slate-500">{inst.zone_name}</td>
                    <td className="px-5 py-3 text-xs text-slate-500">{inst.requested_by_name}</td>
                    <td className="px-5 py-3">
                      {inst.job_order_no ? (
                        <span className="text-[11px] font-mono text-slate-600">{inst.job_order_no}</span>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <InstallationStatusBadge statusName={inst.installation_status_name} />
                    </td>
                    <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                      {isOpen ? (
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
                            {/* <DropdownMenuItem
                              onClick={() => setCompleteTarget(inst)}
                              className="cursor-pointer rounded-lg gap-2.5 py-2 group"
                            >
                              <div className="h-6 w-6 rounded-md flex items-center justify-center shrink-0 transition-colors bg-slate-100 group-hover:bg-emerald-100">
                                <CheckCircle2 className="h-3 w-3 text-slate-500 group-hover:text-emerald-600 transition-colors" />
                              </div>
                              <span className="text-xs font-medium text-slate-500 group-hover:text-emerald-600 transition-colors">
                                Mark completed
                              </span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setCancelTarget(inst)}
                              className="cursor-pointer rounded-lg gap-2.5 py-2 group"
                            >
                              <div className="h-6 w-6 rounded-md flex items-center justify-center shrink-0 transition-colors bg-slate-100 group-hover:bg-rose-100">
                                <XCircle className="h-3 w-3 text-slate-500 group-hover:text-rose-600 transition-colors" />
                              </div>
                              <span className="text-xs font-medium text-slate-500 group-hover:text-rose-600 transition-colors">
                                Cancel installation
                              </span>
                            </DropdownMenuItem> */}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <span className="text-[10px] text-slate-300 italic">—</span>
                      )}
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

      {/* ── Action dialogs ── */}
      <CompleteDialog
        installation={completeTarget}
        open={!!completeTarget}
        onOpenChange={(v) => { if (!v) setCompleteTarget(null) }}
        onDone={fetchInstallations}
      />
      <CancelDialog
        installation={cancelTarget}
        open={!!cancelTarget}
        onOpenChange={(v) => { if (!v) setCancelTarget(null) }}
        onDone={fetchInstallations}
      />
    </>
  )
}