'use client'

import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'

import { TablePagination } from '@/components/shared-ui/pagination'
import { PageHeading } from '@/components/shared-ui/page-heading'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search,
  Gauge,
  MoreHorizontal,
  Eye,
  MapPin,
  X,
  ChevronDown,
  SlidersHorizontal,
  Hash,
  // NEW: Hash icon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getAllMeterAccounts, MeterAccount } from '@/lib/actions/meter-account/meter-accounts'
import { toast } from 'sonner'
import Link from 'next/link'
import CreateMeterAccountForm from '@/components/admin-ui/meter-account/create-meter-account.form'
import EditSerialNoDialog from '@/components/admin-ui/meter-account/edit-serial-no.dialog' // NEW

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]
const BARANGAY_FILTER_ALL = 'all'

// ── Meter Status Badge ─────────────────────────────────────────────────────────

function MeterStatusBadge({ statusName }: { statusName: string }) {
  const s = statusName?.toUpperCase() || 'PENDING'

  switch (s) {
    case 'ACTIVE':
      return (
        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1.5 rounded-md">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Active
        </Badge>
      )
    case 'PENDING':
      return (
        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 gap-1.5 rounded-md">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          Pending
        </Badge>
      )
    case 'DEFECTIVE':
      return (
        <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 gap-1.5 rounded-md">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
          Defective
        </Badge>
      )
    case 'DISCONNECTED':
      return (
        <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 gap-1.5 rounded-md">
          <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
          Disconnected
        </Badge>
      )
    case 'STOLEN':
      return (
        <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200 gap-1.5 rounded-md">
          <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
          STOLEN
        </Badge>
      )
    case 'WATERLEAK_AFTER_METER':
      return (
        <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200 gap-1.5 rounded-md">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
          Leak After Meter
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

// ── Payment Status Badge ────────────────────────────────────────────────────

function PaymentStatusBadge({ paid }: { paid: boolean }) {
  return paid ? (
    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1.5 rounded-md">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      Paid
    </Badge>
  ) : (
    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 gap-1.5 rounded-md">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      Unpaid
    </Badge>
  )
}

// ── Filters Panel (status + payment) ────────────────────────────────────────

function FiltersPanel({
  statusFilter,
  onStatusChange,
  paymentFilter,
  onPaymentChange,
}: {
  statusFilter: string
  onStatusChange: (v: string) => void
  paymentFilter: string
  onPaymentChange: (v: string) => void
}) {
  const active = statusFilter !== 'all' || paymentFilter !== 'all'
  const activeCount = (statusFilter !== 'all' ? 1 : 0) + (paymentFilter !== 'all' ? 1 : 0)

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
            <span className="inline-flex items-center justify-center h-[18px] min-w-[18px] px-1 rounded-full bg-violet-600 text-white text-[11px] font-semibold leading-none">{activeCount}</span>
          )}
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 rounded-md p-1.5">
        <DropdownMenuLabel className="text-[9px] font-bold uppercase tracking-widest text-violet-400 px-2 py-1.5">
          Meter Status
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="mb-1" />
        <DropdownMenuRadioGroup value={statusFilter} onValueChange={onStatusChange}>
          {['all', 'Active', 'Pending', 'Defective', 'Disconnected', 'Stolen', 'Waterleak_After_Meter'].map((s) => (
            <DropdownMenuRadioItem
              key={s}
              value={s}
              className={cn(
                'cursor-pointer rounded-md text-xs',
                statusFilter === s && 'text-violet-600 font-medium bg-violet-50'
              )}
            >
              {s === 'all' ? 'All Statuses' : s === 'Waterleak_After_Meter' ? 'Leak After Meter' : s}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuLabel className="text-[9px] font-bold uppercase tracking-widest text-violet-400 px-2 py-1.5 mt-1">
          Payment Status
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="mb-1" />
        <DropdownMenuRadioGroup value={paymentFilter} onValueChange={onPaymentChange}>
          {['all', 'Paid', 'Unpaid'].map((s) => (
            <DropdownMenuRadioItem
              key={s}
              value={s}
              className={cn(
                'cursor-pointer rounded-md text-xs',
                paymentFilter === s && 'text-violet-600 font-medium bg-violet-50'
              )}
            >
              {s === 'all' ? 'All Payments' : s}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ── Dedicated barangay filter button, separate from status/payment filters ──

function BarangayFilterButton({
  barangayFilter,
  barangays,
  onBarangayChange,
}: {
  barangayFilter: string
  barangays: string[]
  onBarangayChange: (v: string) => void
}) {
  const isActive = barangayFilter !== BARANGAY_FILTER_ALL

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-9 gap-1.5 text-sm font-medium transition-all rounded-md max-w-[180px]',
            isActive && 'border-violet-400 bg-violet-50 text-violet-700 hover:bg-violet-100 hover:border-violet-500',
          )}
        >
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{isActive ? barangayFilter : 'Barangay'}</span>
          {isActive && (
            <span className="inline-flex items-center justify-center h-[18px] min-w-[18px] px-1 rounded-full bg-violet-600 text-white text-[11px] font-semibold leading-none shrink-0">
              1
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-52 rounded-md p-1.5 max-h-72 overflow-y-auto">
        <DropdownMenuLabel className="text-[9px] font-bold uppercase tracking-widest text-violet-400 px-2 py-1.5">
          Barangay
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="mb-1" />
        <DropdownMenuRadioGroup value={barangayFilter} onValueChange={onBarangayChange}>
          <DropdownMenuRadioItem
            value={BARANGAY_FILTER_ALL}
            className={cn('cursor-pointer rounded-md text-xs', barangayFilter === BARANGAY_FILTER_ALL && 'text-violet-600 font-medium bg-violet-50')}
          >
            All Barangays
          </DropdownMenuRadioItem>
          {barangays.map((b) => (
            <DropdownMenuRadioItem
              key={b}
              value={b}
              className={cn('cursor-pointer rounded-md text-xs', barangayFilter === b && 'text-violet-600 font-medium bg-violet-50')}
            >
              {b}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface MeterAccountListProps {
  onRefreshTrigger?: number
  basePath?: string
}

export default function MeterAccountList({ onRefreshTrigger, basePath = "" }: MeterAccountListProps) {
  const router = useRouter()
  const [accounts, setAccounts] = useState<MeterAccount[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedSearch(search)
  const [searchFocused, setSearchFocused] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [paymentFilter, setPaymentFilter] = useState('all')
  const [barangayFilter, setBarangayFilter] = useState(BARANGAY_FILTER_ALL)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // NEW: serial-number modal state
  const [serialTarget, setSerialTarget] = useState<MeterAccount | null>(null)
  const [serialOpen, setSerialOpen] = useState(false)

  const fetchAccounts = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await getAllMeterAccounts()
      setAccounts(data)
    } catch {
      toast.error('Failed to load meter accounts')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchAccounts() }, [fetchAccounts, onRefreshTrigger])

  const clearAll = useCallback(() => {
    setSearch('')
    setStatusFilter('all')
    setPaymentFilter('all')
    setBarangayFilter(BARANGAY_FILTER_ALL)
    setPage(1)
  }, [])

  // Dedupe barangay names straight out of the accounts list — this page has
  // no separate zones payload like the meter reading list does, so the
  // filter's option set is derived from whatever barangays actually appear
  // among the loaded accounts.
  const barangays = useMemo(() => {
    const set = new Set<string>()
    for (const a of accounts) {
      if (a.barangay_name) set.add(a.barangay_name)
    }
    return Array.from(set).sort()
  }, [accounts])

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    return accounts.filter((a) => {
      if (q &&
        !a.consumer_name.toLowerCase().includes(q) &&
        !(a.contract_no ?? '').toLowerCase().includes(q) &&
        !(a.meter_serial_no ?? '').toLowerCase().includes(q) &&
        !a.barangay_name.toLowerCase().includes(q) &&
        !a.zone_name.toLowerCase().includes(q)
      ) return false
      if (statusFilter !== 'all' && a.meter_status_name !== statusFilter) return false
      if (paymentFilter === 'Paid' && !a.payment_status) return false
      if (paymentFilter === 'Unpaid' && a.payment_status) return false
      if (barangayFilter !== BARANGAY_FILTER_ALL && a.barangay_name !== barangayFilter) return false
      return true
    })
  }, [accounts, debouncedSearch, statusFilter, paymentFilter, barangayFilter])

  useEffect(() => { setPage(1) }, [filtered.length])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginated = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  )

  const hasActiveFilters = debouncedSearch.trim().length > 0 || statusFilter !== 'all' || paymentFilter !== 'all' || barangayFilter !== BARANGAY_FILTER_ALL
  const isSearchActive = debouncedSearch.trim().length > 0 || searchFocused


  const handleViewAccount = (meterAccountId: string) => {
    router.push(`meter-account/${meterAccountId}`)
  }

  return (
    <div className="w-full space-y-5 lg:mb-0 mb-10">
      {/* ── Header ── */}
      <PageHeading title="Meter Accounts" description="Manage all registered meter accounts and their current status" />
{/* ── Toolbar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">

        {/* Left Group: Search + Filter */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 flex-1 flex-wrap">
          <div className="relative w-full min-w-0 sm:w-auto sm:flex-1 sm:max-w-xs">
            <Search
              className={cn(
                'absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 transition-colors pointer-events-none',
                isSearchActive ? 'text-violet-400' : 'text-slate-300',
              )}
            />
            <Input
              placeholder="Search name, Contract No., serial..."
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
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-slate-100 transition-colors"
              >
                <X className="h-3 w-3 text-slate-400" />
              </button>
            )}
          </div>

          <div className="hidden sm:block h-4 w-px bg-slate-200 shrink-0" />

          <BarangayFilterButton
            barangayFilter={barangayFilter}
            barangays={barangays}
            onBarangayChange={(v) => { setBarangayFilter(v); setPage(1) }}
          />

          <FiltersPanel
            statusFilter={statusFilter}
            onStatusChange={(v) => { setStatusFilter(v); setPage(1) }}
            paymentFilter={paymentFilter}
            onPaymentChange={(v) => { setPaymentFilter(v); setPage(1) }}
          />

          {hasActiveFilters && (
            <button
              onClick={clearAll}
              className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-xs text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>

        {/* Right Group: Create button */}
        <div className="shrink-0">
          <CreateMeterAccountForm onSuccess={fetchAccounts} />
        </div>
      </div>

      {/* ── Table panel ── */}
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">

        {/* Table bar */}
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
                  pageSize !== 10 && 'border-violet-300 text-violet-600',
                )}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white border border-slate-200 rounded-md">
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
                {['Account Name', 'Contract No.', 'Barangay', 'Zone', 'Classification', 'Serial No.', 'Meter Status', 'Payment Status', ''].map((h, i) => (
                  <th
                    key={i}
                    className={cn(
                      'px-5 py-2.5 text-left text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap',
                      i === 8 && 'w-[44px]',
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>

              {/* Loading skeletons */}
              {isLoading && [...Array(6)].map((_, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-5 py-3.5">
                    <div className="h-3 w-28 bg-slate-100 animate-pulse rounded-full" />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="h-3 w-24 bg-slate-100 animate-pulse rounded-full" />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="h-3 w-20 bg-slate-100 animate-pulse rounded-full" />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="h-3 w-20 bg-slate-100 animate-pulse rounded-full" />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="h-3 w-24 bg-slate-100 animate-pulse rounded-full" />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="h-3 w-20 bg-slate-100 animate-pulse rounded-full" />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="h-6 w-20 bg-slate-100 animate-pulse rounded-full" />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="h-6 w-16 bg-slate-100 animate-pulse rounded-full" />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="h-7 w-7 bg-slate-100 animate-pulse rounded-md" />
                  </td>
                </tr>
              ))}

              {/* Empty — no accounts */}
              {!isLoading && accounts.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-12 w-12 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center">
                        <Gauge className="h-5 w-5 text-violet-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-600">No meter accounts yet</p>
                        <p className="text-xs text-slate-400 mt-1">Meter accounts will appear here after registration.</p>
                      </div>
                    </div>
                  </td>
                </tr>
              )}

              {/* Empty — filtered */}
              {!isLoading && accounts.length > 0 && filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-14 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-12 w-12 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center">
                        <Search className="h-5 w-5 text-violet-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-600">No results</p>
                        <p className="text-xs text-slate-400 mt-1">No meter accounts match your filters.</p>
                      </div>
                      <button
                        onClick={clearAll}
                        className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-xs font-medium text-violet-600 bg-violet-50 border border-violet-200 hover:bg-violet-100 transition-colors"
                      >
                        Clear filters
                      </button>
                    </div>
                  </td>
                </tr>
              )}

              {/* Data rows */}
              {!isLoading && paginated.map((account) => (
                <tr
                  key={account.meter_account_id}
                  className="border-t border-slate-100 hover:bg-violet-50/40 transition-colors"
                >
                  {/* Account Name */}
                  <td className="px-5 py-3">
                    <div className="text-[12.5px] font-medium text-slate-700 leading-tight">
                      {account.consumer_name}
                    </div>
                  </td>

                  {/* Contract No. */}
                  <td className="px-5 py-3">
                    <span className="text-[12px] font-mono font-medium text-slate-600">
                      {account.contract_no || '—'}
                    </span>
                  </td>

                  {/* Barangay */}
                  <td className="px-5 py-3 text-xs text-slate-500">
                    {account.barangay_name}
                  </td>

                  {/* Zone */}
                  <td className="px-5 py-3 text-xs text-slate-500">
                    {account.zone_name}
                  </td>

                  {/* Classification */}
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                      {account.classification_name}
                    </span>
                  </td>

                  {/* Serial No. */}
                  <td className="px-5 py-3">
                    {account.meter_serial_no ? (
                      <span className="text-[11px] font-mono text-slate-600">{account.meter_serial_no}</span>
                    ) : (
                      <span className="text-[10px] text-slate-400 italic">—</span>
                    )}
                  </td>

                  {/* Meter Status */}
                  <td className="px-5 py-3">
                    <MeterStatusBadge statusName={account.meter_status_name} />
                  </td>

                  {/* Payment Status */}
                  <td className="px-5 py-3">
                    <PaymentStatusBadge paid={account.payment_status} />
                  </td>

                  {/* Actions */}
                  <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="h-7 w-7 rounded-md flex items-center justify-center bg-white border border-slate-200 text-slate-400 hover:text-violet-600 hover:border-violet-300 hover:bg-violet-50 transition-colors">
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="w-48 bg-white border border-slate-200 rounded-md p-1.5"
                      >
                        <DropdownMenuLabel className="text-[9px] font-bold uppercase tracking-widest text-violet-400 px-2 py-1.5">
                          Actions
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator className="bg-slate-100 mb-1" />

                        {/* View details */}
                        <DropdownMenuItem
                          onClick={() => handleViewAccount(account.meter_account_id)}
                          className="cursor-pointer rounded-md gap-2.5 py-2 group"
                        >
                          <div className="h-6 w-6 rounded-md flex items-center justify-center shrink-0 transition-colors bg-slate-100 group-hover:bg-blue-100">
                            <Eye className="h-3 w-3 text-slate-500 group-hover:text-blue-600 transition-colors" />
                          </div>
                          <span className="text-xs font-medium text-slate-500 group-hover:text-blue-600 transition-colors">
                            View details
                          </span>
                        </DropdownMenuItem>

                        {/* NEW: Add serial no. — only when the current meter has none */}
                        {!account.meter_serial_no && account.meter_id && (
                          <DropdownMenuItem
                            onClick={() => { setSerialTarget(account); setSerialOpen(true) }}
                            className="cursor-pointer rounded-md gap-2.5 py-2 group"
                          >
                            <div className="h-6 w-6 rounded-md flex items-center justify-center shrink-0 transition-colors bg-slate-100 group-hover:bg-violet-100">
                              <Hash className="h-3 w-3 text-slate-500 group-hover:text-violet-600 transition-colors" />
                            </div>
                            <span className="text-xs font-medium text-slate-500 group-hover:text-violet-600 transition-colors">
                              Add serial no.
                            </span>
                          </DropdownMenuItem>
                        )}

                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
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

      {/* NEW: Add serial number modal */}
      <EditSerialNoDialog
        account={serialTarget}
        open={serialOpen}
        onOpenChange={setSerialOpen}
        onDone={fetchAccounts}
      />
    </div>
  )
}