// app/admin/connection-fee-payments/page.tsx

'use client'

import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'


import { TablePagination } from '@/components/shared-ui/pagination'
import { PageHeading } from '@/components/shared-ui/page-heading'
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Search,
  X,
  ChevronDown,
  SlidersHorizontal,
  Receipt,
  Gauge,
  CheckCircle2,
  Printer,
  Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import { format } from 'date-fns'
import {
  getUnpaidMeterAccounts,
  getPaidMeterAccounts,
  getBarangaysForFeePayment,
  getZonesForFeePayment,
  type UnpaidMeterAccount,
  type PaidMeterAccount,
  type BarangayOption,
  type ZoneOption,
} from '@/lib/actions/payment/connection-fee-payment.actions'
import { PaymentDialog } from '@/components/treasurer-ui/connection-fee/payment-dialog'
import { ReceiptDialog } from '@/components/treasurer-ui/connection-fee/receipt-dialog'

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

function formatPeso(n: number): string {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(n)
}

function formatDate(d: string): string {
  return format(new Date(d), 'MMM dd, yyyy')
}

type CombinedMeterAccount = {
  meter_account_id: string
  meter_serial_no: string | null
  consumer_name: string
  barangay_id: string
  barangay_name: string
  zone_id: string
  zone_name: string
  classification_name: string
  total_connection_fee: number
  status: 'unpaid' | 'paid'
  date: string
  receipt_number?: string
}

function StatusBadge({ status }: { status: 'unpaid' | 'paid' }) {
  if (status === 'paid') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        <CheckCircle2 className="h-3 w-3" />
        Paid
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
      <Clock className="h-3 w-3" />
      Unpaid
    </span>
  )
}

function FiltersPanel({
  statusFilter, barangayFilter, zoneFilter, barangays, zones,
  onStatusChange, onBarangayChange, onZoneChange,
}: {
  statusFilter: string
  barangayFilter: string
  zoneFilter: string
  barangays: BarangayOption[]
  zones: ZoneOption[]
  onStatusChange: (v: string) => void
  onBarangayChange: (v: string) => void
  onZoneChange: (v: string) => void
}) {
  const activeCount = [statusFilter !== 'all', barangayFilter !== 'all', zoneFilter !== 'all'].filter(Boolean).length

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-9 gap-1.5 text-sm font-medium transition-all rounded-md',
            activeCount > 0 && 'border-emerald-400 bg-emerald-50 text-emerald-700',
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
          Filters
          {activeCount > 0 && (
            <span className="inline-flex items-center justify-center h-[18px] min-w-[18px] px-1 rounded-full bg-emerald-600 text-white text-[11px] font-semibold">
              {activeCount}
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-60 rounded-md border border-slate-200">
        <DropdownMenuLabel className="text-[9px] font-bold uppercase tracking-widest text-emerald-500 px-2 py-1.5">
          Status
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={statusFilter} onValueChange={onStatusChange}>
          <DropdownMenuRadioItem value="all" className="cursor-pointer rounded-md text-xs">All Statuses</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="unpaid" className="cursor-pointer rounded-md text-xs">Unpaid</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="paid" className="cursor-pointer rounded-md text-xs">Paid</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        <DropdownMenuLabel className="text-[9px] font-bold uppercase tracking-widest text-emerald-500 px-2 py-1.5">
          Barangay
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={barangayFilter} onValueChange={onBarangayChange}>
          <DropdownMenuRadioItem value="all" className="cursor-pointer rounded-md text-xs">All Barangays</DropdownMenuRadioItem>
          {barangays.map((b) => (
            <DropdownMenuRadioItem key={b.barangay_id} value={b.barangay_id} className="cursor-pointer rounded-md text-xs">
              {b.barangay_name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        {barangayFilter !== 'all' && zones.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[9px] font-bold uppercase tracking-widest text-emerald-500 px-2 py-1.5">
              Zone
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup value={zoneFilter} onValueChange={onZoneChange}>
              <DropdownMenuRadioItem value="all" className="cursor-pointer rounded-md text-xs">All Zones</DropdownMenuRadioItem>
              {zones.map((z) => (
                <DropdownMenuRadioItem key={z.zone_id} value={z.zone_id} className="cursor-pointer rounded-md text-xs">
                  Zone {z.zone_name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default function ConnectionFeePaymentPage() {
  const [unpaidAccounts, setUnpaidAccounts] = useState<UnpaidMeterAccount[]>([])
  const [paidAccounts, setPaidAccounts] = useState<PaidMeterAccount[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedSearch(search)
  const [searchFocused, setSearchFocused] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [barangayFilter, setBarangayFilter] = useState('all')
  const [zoneFilter, setZoneFilter] = useState('all')
  const [barangays, setBarangays] = useState<BarangayOption[]>([])
  const [zones, setZones] = useState<ZoneOption[]>([])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [selectedAccount, setSelectedAccount] = useState<UnpaidMeterAccount | null>(null)
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [selectedPaidAccount, setSelectedPaidAccount] = useState<PaidMeterAccount | null>(null)
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [unpaidData, paidData, barangaysData] = await Promise.all([
        getUnpaidMeterAccounts(),
        getPaidMeterAccounts(),
        getBarangaysForFeePayment(),
      ])
      setUnpaidAccounts(unpaidData)
      setPaidAccounts(paidData)
      setBarangays(barangaysData)
    } catch {
      toast.error('Failed to load data')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    if (barangayFilter === 'all') { setZones([]); setZoneFilter('all'); return }
    getZonesForFeePayment(barangayFilter).then(setZones)
    setZoneFilter('all')
  }, [barangayFilter])

  const clearAll = useCallback(() => {
    setSearch('')
    setStatusFilter('all')
    setBarangayFilter('all')
    setZoneFilter('all')
    setPage(1)
  }, [])

  const combinedData: CombinedMeterAccount[] = useMemo(() => {
    const unpaid: CombinedMeterAccount[] = unpaidAccounts.map((a) => ({
      meter_account_id: a.meter_account_id,
      meter_serial_no: a.meter_serial_no,
      consumer_name: a.consumer_name,
      barangay_id: a.barangay_id,
      barangay_name: a.barangay_name,
      zone_id: a.zone_id,
      zone_name: a.zone_name,
      classification_name: a.classification_name,
      total_connection_fee: a.total_connection_fee,
      status: 'unpaid' as const,
      date: a.created_at,
    }))

    const paid: CombinedMeterAccount[] = paidAccounts.map((a) => ({
      meter_account_id: a.meter_account_id,
      meter_serial_no: a.meter_serial_no,
      consumer_name: a.consumer_name,
      barangay_id: a.barangay_id,
      barangay_name: a.barangay_name,
      zone_id: a.zone_id,
      zone_name: a.zone_name,
      classification_name: a.classification_name,
      total_connection_fee: a.total_connection_fee,
      status: 'paid' as const,
      date: a.paid_at,
      receipt_number: a.receipt_number,
    }))

    return [...unpaid, ...paid].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [unpaidAccounts, paidAccounts])

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    return combinedData.filter((a) => {
      if (q &&
        !a.consumer_name.toLowerCase().includes(q) &&
        !(a.meter_serial_no ?? '').toLowerCase().includes(q)
      ) return false
      if (statusFilter === 'unpaid' && a.status !== 'unpaid') return false
      if (statusFilter === 'paid' && a.status !== 'paid') return false
      if (barangayFilter !== 'all' && a.barangay_id !== barangayFilter) return false
      if (zoneFilter !== 'all' && a.zone_id !== zoneFilter) return false
      return true
    })
  }, [combinedData, debouncedSearch, statusFilter, barangayFilter, zoneFilter])

  useEffect(() => { setPage(1) }, [filtered.length])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginated = useMemo(() => filtered.slice((safePage - 1) * pageSize, safePage * pageSize), [filtered, safePage, pageSize])

  const hasActiveFilters = debouncedSearch.trim().length > 0 || statusFilter !== 'all' || barangayFilter !== 'all' || zoneFilter !== 'all'
  const isSearchActive = debouncedSearch.trim().length > 0 || searchFocused


  const handlePaymentDialogClose = (open: boolean) => {
    setPaymentDialogOpen(open)
    if (!open) setSelectedAccount(null)
  }

  const handleReceiptDialogClose = (open: boolean) => {
    setReceiptDialogOpen(open)
    if (!open) setSelectedPaidAccount(null)
  }

  const handlePaymentSuccess = () => fetchData()

  return (
    <div className="w-full space-y-6">
      <PageHeading
        title="Connection Fees"
        description="Record and manage connection fee payments from consumers"
      />

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
        <div className="relative w-full min-w-0 sm:w-auto sm:flex-1 sm:max-w-xs">
          <Search className={cn(
            'absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 transition-colors pointer-events-none',
            isSearchActive ? 'text-emerald-400' : 'text-slate-300',
          )} />
          <Input
            placeholder="Search serial no. or consumer…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            className={cn(
              'pl-9 h-8 rounded-lg text-xs bg-white border-slate-200 text-slate-700',
              'placeholder:text-slate-300 focus-visible:ring-0 focus-visible:ring-offset-0 transition-colors',
              isSearchActive ? 'border-emerald-400 ring-2 ring-emerald-100' : 'hover:border-emerald-200',
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
          barangayFilter={barangayFilter}
          zoneFilter={zoneFilter}
          barangays={barangays}
          zones={zones}
          onStatusChange={(v) => { setStatusFilter(v); setPage(1) }}
          onBarangayChange={(v) => { setBarangayFilter(v); setPage(1) }}
          onZoneChange={(v) => { setZoneFilter(v); setPage(1) }}
        />

        {hasActiveFilters && (
          <button
            onClick={clearAll}
            className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-xs text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-lg bg-emerald-100 border border-emerald-200 flex items-center justify-center">
              <Gauge className="h-3 w-3 text-emerald-500" />
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
              <SelectTrigger className={cn(
                'h-7 w-[58px] rounded-md text-[11px] bg-white border-slate-200 text-slate-500',
                'focus:ring-0 focus:ring-offset-0 hover:border-emerald-300',
                pageSize !== 10 && 'border-emerald-300 text-emerald-600',
              )}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white border border-slate-200 rounded-lg">
                {PAGE_SIZE_OPTIONS.map((s) => (
                  <SelectItem key={s} value={String(s)} className="text-xs cursor-pointer focus:bg-emerald-50 focus:text-emerald-700 dark:focus:bg-accent dark:focus:text-accent-foreground">
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
                {['Serial No.', 'Consumer', 'Barangay', 'Zone', 'Classification', 'Amount', 'Date', 'Status', ''].map((h, i) => (
                  <th key={i} className={cn(
                    'px-4 py-2.5 text-left text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap',
                    i === 8 && 'w-[44px]',
                  )}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && [...Array(6)].map((_, i) => (
                <tr key={i} className="border-t border-slate-100">
                  {[...Array(9)].map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-3 bg-slate-100 animate-pulse rounded-full w-20" />
                    </td>
                  ))}
                </tr>
              ))}

              {!isLoading && combinedData.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-12 w-12 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                        <Receipt className="h-5 w-5 text-emerald-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-600">No meter accounts</p>
                        <p className="text-xs text-slate-400 mt-1">No connection fee records found.</p>
                      </div>
                    </div>
                  </td>
                </tr>
              )}

              {!isLoading && combinedData.length > 0 && filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-14 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-12 w-12 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                        <Search className="h-5 w-5 text-emerald-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-600">No results</p>
                        <p className="text-xs text-slate-400 mt-1">No meter accounts match your filters.</p>
                      </div>
                      <button
                        onClick={clearAll}
                        className="inline-flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                      >
                        Clear filters
                      </button>
                    </div>
                  </td>
                </tr>
              )}

              {!isLoading && paginated.map((account) => {
                const isUnpaid = account.status === 'unpaid'
                return (
                  <tr key={account.meter_account_id} className="border-t border-slate-100 hover:bg-emerald-50/40 transition-colors">
                    <td className="px-4 py-3">
                      <span className="text-[12.5px] font-medium text-slate-700 font-mono">
                        {account.meter_serial_no}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-[12.5px] font-medium text-slate-700 leading-tight">
                        {account.consumer_name}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{account.barangay_name}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{account.zone_name}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                        {account.classification_name}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[12.5px] font-semibold text-emerald-600 font-mono">
                        {formatPeso(account.total_connection_fee)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                      {formatDate(account.date)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={account.status} />
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      {isUnpaid ? (
                        <Button
                          size="sm"
                          onClick={() => {
                            const acc = unpaidAccounts.find(u => u.meter_account_id === account.meter_account_id)
                            if (acc) { setSelectedAccount(acc); setPaymentDialogOpen(true) }
                          }}
                          className="h-7 px-3 rounded-md text-[10px] font-medium bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 gap-1"
                        >
                          <Receipt className="h-3 w-3" />
                          Pay
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const acc = paidAccounts.find(p => p.meter_account_id === account.meter_account_id)
                            if (acc) { setSelectedPaidAccount(acc); setReceiptDialogOpen(true) }
                          }}
                          className="h-7 px-3 rounded-md text-[10px] font-medium border-emerald-200 text-emerald-600 hover:bg-emerald-50 hover:border-emerald-300 gap-1"
                        >
                          <Printer className="h-3 w-3" />
                          Receipt
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
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

      <PaymentDialog
        open={paymentDialogOpen}
        onOpenChange={handlePaymentDialogClose}
        account={selectedAccount}
        onSuccess={handlePaymentSuccess}
      />

      <ReceiptDialog
        open={receiptDialogOpen}
        onOpenChange={handleReceiptDialogClose}
        account={selectedPaidAccount}
      />
    </div>
  )
}