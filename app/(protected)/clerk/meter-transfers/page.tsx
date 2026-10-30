'use client'

import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'

import { TablePagination } from '@/components/shared-ui/pagination'
import { PageHeading } from '@/components/shared-ui/page-heading'

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Search,
  MapPin,
  ArrowRightLeft,
  User,
  SlidersHorizontal,
  ChevronDown,
  X,
  MoreHorizontal,
  Eye,
  Ban,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import CreateMeterTransferForm from '@/components/admin-ui/meter-transfer/TransferMeterAccountForm'
import { ViewMeterTransferDetailsDialog } from '@/components/admin-ui/meter-transfer/ViewMeterTransferHistoryDialog'
import { CancelMeterTransferDialog } from '@/components/admin-ui/meter-transfer/CancelMeterTransferDialog'
import {
  getAllMeterTransfers, type MeterTransferRecord,
} from '@/lib/actions/meter-transfers/meter-transfer.actions'
import { toast } from 'sonner'

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

const typeStyles: Record<string, string> = {
  'OWNERSHIP': 'bg-violet-50 text-violet-700 border-violet-200',
  'RELOCATION': 'bg-blue-50 text-blue-700 border-blue-200',
}
const typeDotStyles: Record<string, string> = {
  'OWNERSHIP': 'bg-violet-500',
  'RELOCATION': 'bg-blue-500',
}
const typeLabels: Record<string, string> = {
  'OWNERSHIP': 'Ownership',
  'RELOCATION': 'Relocation',
}

// ── Transfer status badge ──
function TransferStatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase()
  const styles: Record<string, { wrap: string; dot: string }> = {
    pending:   { wrap: 'bg-amber-50 text-amber-700 border-amber-200',     dot: 'bg-amber-500' },
    completed: { wrap: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
    cancelled: { wrap: 'bg-slate-100 text-slate-500 border-slate-200',     dot: 'bg-slate-400' },
  }
  const v = styles[s] ?? styles.pending
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold border', v.wrap)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', v.dot)} />
      {status}
    </span>
  )
}

function FiltersPanel({ typeFilter, onTypeChange }: { typeFilter: string; onTypeChange: (v: string) => void }) {
  const active = typeFilter !== 'all'
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={cn('h-9 gap-1.5 text-sm font-medium transition-all rounded-md', active && ['border-violet-400 bg-violet-50 text-violet-700', 'hover:bg-violet-100 hover:border-violet-500'])}>
          <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
          Filters
          {active && (
            <span className="inline-flex items-center justify-center h-[18px] min-w-[18px] px-1 rounded-full bg-violet-600 text-white text-[11px] font-semibold leading-none">1</span>
          )}
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 rounded-md p-1.5">
        <DropdownMenuLabel className="text-[9px] font-bold uppercase tracking-widest text-violet-400 px-2 py-1.5">Transfer Type</DropdownMenuLabel>
        <DropdownMenuSeparator className="mb-1" />
        <DropdownMenuRadioGroup value={typeFilter} onValueChange={onTypeChange}>
          {['all', 'OWNERSHIP', 'RELOCATION'].map((t) => (
            <DropdownMenuRadioItem key={t} value={t} className={cn('cursor-pointer rounded-md text-xs', typeFilter === t && 'text-violet-600 font-medium bg-violet-50')}>
              {t === 'all' ? 'All Types' : typeLabels[t]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default function MeterTransfersPage() {
  const [transfers, setTransfers] = useState<MeterTransferRecord[]>([])
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedSearch(search)
  const [searchFocused, setSearchFocused] = useState(false)
  const [typeFilter, setTypeFilter] = useState('all')
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const [viewingTransfer, setViewingTransfer] = useState<MeterTransferRecord | null>(null)

  const fetchTransfers = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await getAllMeterTransfers()
      if (result.status === 'success') setTransfers(result.data ?? [])
      else toast.error(result.message || 'Failed to load meter transfers')
    } catch {
      toast.error('Failed to load meter transfers')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchTransfers() }, [fetchTransfers])

  const clearAll = useCallback(() => { setSearch(''); setTypeFilter('all'); setPage(1) }, [])

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    return transfers.filter((t) => {
      if (q && !(
        (t.meter_serial_no ?? '').toLowerCase().includes(q) ||
        (t.previous_consumer_name ?? '').toLowerCase().includes(q) ||
        (t.new_consumer_name ?? '').toLowerCase().includes(q)
      )) return false
      if (typeFilter !== 'all' && t.transfer_type !== typeFilter) return false
      return true
    })
  }, [transfers, debouncedSearch, typeFilter])

  useEffect(() => { setPage(1) }, [filtered.length])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginated = useMemo(() => filtered.slice((safePage - 1) * pageSize, safePage * pageSize), [filtered, safePage, pageSize])

  const hasActiveFilters = debouncedSearch.trim().length > 0 || typeFilter !== 'all'
  const isSearchActive = debouncedSearch.trim().length > 0 || searchFocused


  return (
    <div className="w-full space-y-5">
      <PageHeading title="Meter Transfers" description="Ownership changes and relocations of meter accounts" />
<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1">
          <div className="relative w-full min-w-0 sm:w-auto sm:flex-1 sm:max-w-sm">
            <Search className={cn('absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 transition-colors', isSearchActive ? 'text-violet-400' : 'text-slate-300')} />
            <Input
              placeholder="Search transfers..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              className={cn('pl-9 h-8 rounded-md text-xs bg-white border-slate-200 text-slate-700', 'placeholder:text-slate-300 focus-visible:ring-0 focus-visible:ring-offset-0 transition-colors', isSearchActive ? 'border-violet-400 ring-2 ring-violet-100' : 'hover:border-violet-200')}
            />
            {search && (
              <button onClick={() => { setSearch(''); setPage(1) }} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-slate-100">
                <X className="h-3 w-3 text-slate-400" />
              </button>
            )}
          </div>
          <div className="hidden sm:block h-4 w-px bg-slate-200" />
          <FiltersPanel typeFilter={typeFilter} onTypeChange={(v) => { setTypeFilter(v); setPage(1) }} />
          {hasActiveFilters && (
            <button onClick={clearAll} className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-xs text-slate-400 hover:text-violet-600 hover:bg-violet-50">
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>
        <CreateMeterTransferForm onSuccess={fetchTransfers} />
      </div>

      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-violet-100 border border-violet-200 flex items-center justify-center">
              <ArrowRightLeft className="h-3 w-3 text-violet-500" />
            </div>
            <p className="text-xs text-slate-500">
              {isLoading ? (
                <span className="inline-block h-3 w-24 bg-slate-100 animate-pulse rounded-full" />
              ) : (
                <>
                  <span className="font-semibold text-slate-700">{filtered.length}</span>{' '}
                  transfer{filtered.length !== 1 ? 's' : ''}
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
                  <SelectItem key={s} value={String(s)} className="text-xs cursor-pointer focus:bg-violet-50 focus:text-violet-700 dark:focus:bg-accent dark:focus:text-accent-foreground">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/40">
              <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Serial No.</TableHead>
              <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Type</TableHead>
              <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Status</TableHead>
              <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Change</TableHead>
              <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Transferred By</TableHead>
              <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Date</TableHead>
              <TableHead className="w-12"><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && [...Array(5)].map((_, i) => (
              <TableRow key={i}>
                <TableCell><div className="h-3.5 w-24 bg-slate-100 animate-pulse rounded-full" /></TableCell>
                <TableCell><div className="h-6 w-20 bg-slate-100 animate-pulse rounded-full" /></TableCell>
                <TableCell><div className="h-6 w-20 bg-slate-100 animate-pulse rounded-full" /></TableCell>
                <TableCell><div className="h-3.5 w-40 bg-slate-100 animate-pulse rounded-full" /></TableCell>
                <TableCell><div className="h-3.5 w-24 bg-slate-100 animate-pulse rounded-full" /></TableCell>
                <TableCell><div className="h-3.5 w-20 bg-slate-100 animate-pulse rounded-full" /></TableCell>
                <TableCell><div className="h-7 w-7 bg-slate-100 animate-pulse rounded-md" /></TableCell>
              </TableRow>
            ))}

            {!isLoading && transfers.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-72 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-12 w-12 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center">
                      <ArrowRightLeft className="h-5 w-5 text-violet-300" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-600">No transfers yet</p>
                      <p className="text-xs text-slate-400 mt-1">Create one to change a meter account's owner or zone.</p>
                    </div>
                    <CreateMeterTransferForm onSuccess={fetchTransfers} />
                  </div>
                </TableCell>
              </TableRow>
            )}

            {!isLoading && transfers.length > 0 && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-64 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-12 w-12 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center">
                      <Search className="h-5 w-5 text-violet-300" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-600">No results</p>
                      <p className="text-xs text-slate-400 mt-1">No transfers match your filters.</p>
                    </div>
                    <button onClick={clearAll} className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-xs font-medium text-violet-600 bg-violet-50 border border-violet-200 hover:bg-violet-100">
                      Clear filters
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            )}

            {!isLoading && paginated.map((t) => {
              const isOwnership = t.transfer_type === 'OWNERSHIP'
              const fromLabel = isOwnership ? (t.previous_consumer_name ?? '—') : (t.old_zone_name ?? '—')
              const toLabel = isOwnership ? (t.new_consumer_name ?? '—') : (t.new_zone_name ?? '—')

              // Cancel is only valid for a Pending RELOCATION
              const isPending = (t.transfer_status_name ?? '').toLowerCase() === 'pending'
              const canCancel = isPending && t.transfer_type === 'RELOCATION'

              return (
                <TableRow key={t.transfer_id} className="border-t border-slate-100 hover:bg-violet-50/40 transition-colors">
                  <TableCell className="py-3">
                    <span className="text-[12px] font-mono font-bold text-slate-700">{t.meter_serial_no}</span>
                  </TableCell>
                  <TableCell className="py-3">
                    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold border', typeStyles[t.transfer_type] ?? 'bg-slate-50 text-slate-400 border-slate-200')}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', typeDotStyles[t.transfer_type] ?? 'bg-slate-300')} />
                      {typeLabels[t.transfer_type] ?? t.transfer_type}
                    </span>
                  </TableCell>
                  <TableCell className="py-3">
                    <TransferStatusBadge status={t.transfer_status_name ?? 'Pending'} />
                  </TableCell>
                  <TableCell className="py-3">
                    <span className="inline-flex items-center gap-1.5 text-[11.5px] text-slate-500 max-w-[260px]">
                      {isOwnership ? <User className="h-2.5 w-2.5 shrink-0" /> : <MapPin className="h-2.5 w-2.5 shrink-0" />}
                      <span className="truncate">{fromLabel}</span>
                      <span className="text-slate-300 shrink-0">→</span>
                      <span className="truncate text-slate-700 font-medium">{toLabel}</span>
                    </span>
                  </TableCell>
                  <TableCell className="py-3 text-[12px] text-slate-600">{t.transferred_by_name}</TableCell>
                  <TableCell className="py-3 text-[11.5px] text-slate-500">
                    {new Date(t.transfer_date).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </TableCell>
                  <TableCell className="py-3">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md text-slate-400 hover:text-violet-600 hover:bg-violet-50">
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48 rounded-md p-1.5">
                        <DropdownMenuLabel className="text-[9px] font-bold uppercase tracking-widest text-violet-400 px-2 py-1.5">Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator className="mb-1" />

                        <DropdownMenuItem
                          onClick={() => setViewingTransfer(t)}
                          className="cursor-pointer rounded-md text-xs text-slate-500 focus:bg-violet-50 focus:text-violet-700 dark:focus:bg-accent dark:focus:text-accent-foreground gap-2"
                        >
                          <Eye className="h-3.5 w-3.5" /> View Details
                        </DropdownMenuItem>

                        {canCancel && (
                          <>
                            <DropdownMenuSeparator className="bg-slate-100 my-1" />
                            <CancelMeterTransferDialog
                              transferId={t.transfer_id}
                              meterSerialNo={t.meter_serial_no ?? ''}
                              onDone={fetchTransfers}
                            >
                              <DropdownMenuItem
                                onSelect={(e) => e.preventDefault()}
                                className="cursor-pointer rounded-md text-xs text-rose-600 focus:bg-rose-50 focus:text-rose-700 gap-2"
                              >
                                <Ban className="h-3.5 w-3.5" /> Cancel Transfer
                              </DropdownMenuItem>
                            </CancelMeterTransferDialog>
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

      {!isLoading && (
        <TablePagination
          page={safePage}
          pageSize={pageSize}
          total={filtered.length}
          onPageChange={setPage}
        />
      )}

      <ViewMeterTransferDetailsDialog
        transfer={viewingTransfer}
        onOpenChange={(open) => { if (!open) setViewingTransfer(null) }}
      />
    </div>
  )
}