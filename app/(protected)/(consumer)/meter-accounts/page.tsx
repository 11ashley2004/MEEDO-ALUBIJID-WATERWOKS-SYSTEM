'use client'

import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'


import { PageHeading } from '@/components/shared-ui/page-heading'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search, Gauge, MoreHorizontal, Eye, X, ChevronDown,
  SlidersHorizontal, Wallet, CheckCircle2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
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
import { Button } from '@/components/ui/button'
import {
  getConsumerMeterAccounts,
  ConsumerMeterAccount,
} from '@/lib/actions/meter-account/meter-accounts'
import { toast } from 'sonner'

// ── Meter Status Badge ──────────────────────────────────────────────────────

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
          Stolen
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

// ── Payment Status Badge ─────────────────────────────────────────────────────

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

// ── Stat pill ─────────────────────────────────────────────────────────────

function StatPill({
  icon: Icon, label, value, tone,
}: {
  icon: React.ElementType
  label: string
  value: string | number
  tone: 'violet' | 'emerald' | 'amber'
}) {
  const tones = {
    violet: 'bg-violet-50 border-violet-100 text-violet-600',
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-600',
    amber: 'bg-amber-50 border-amber-100 text-amber-600',
  }[tone]

  return (
    <div className="flex items-center gap-2.5 rounded-md border border-slate-200 bg-white px-3.5 py-2.5">
      <div className={cn('h-8 w-8 rounded-md border flex items-center justify-center shrink-0', tones)}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
        <p className="text-sm font-bold text-slate-800 leading-tight">{value}</p>
      </div>
    </div>
  )
}

// ── Filters ──────────────────────────────────────────────────────────────

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
            active && ['border-violet-400 bg-violet-50 text-violet-700', 'hover:bg-violet-100 hover:border-violet-500'],
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
          Filters
          {active && (
            <span className="inline-flex items-center justify-center h-[18px] min-w-[18px] px-1 rounded-full bg-violet-600 text-white text-[11px] font-semibold leading-none">
              {activeCount}
            </span>
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
              className={cn('cursor-pointer rounded-md text-xs', statusFilter === s && 'text-violet-600 font-medium bg-violet-50')}
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
              className={cn('cursor-pointer rounded-md text-xs', paymentFilter === s && 'text-violet-600 font-medium bg-violet-50')}
            >
              {s === 'all' ? 'All Payments' : s}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ── Main component ───────────────────────────────────────────────────────

interface ConsumerMeterAccountListProps {
  consumerName?: string
  /** base route to push to when viewing a single account, defaults to `meter-account/{id}` */
  basePath?: string
  onRefreshTrigger?: number
}

const currency = (n: number) =>
  n.toLocaleString('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 })

export default function ConsumerMeterAccountList({
  consumerName,
  basePath = 'meter-account',
  onRefreshTrigger,
}: ConsumerMeterAccountListProps) {
  const router = useRouter()
  const [accounts, setAccounts] = useState<ConsumerMeterAccount[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedSearch(search)
  const [searchFocused, setSearchFocused] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [paymentFilter, setPaymentFilter] = useState('all')

  const fetchAccounts = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await getConsumerMeterAccounts()
      setAccounts(data)
    } catch (err) {
      console.error('[ConsumerMeterAccountList] fetchAccounts failed:', err)
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
  }, [])

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    return accounts.filter((a) => {
      if (
        q &&
        !(a.contract_no ?? '').toLowerCase().includes(q) &&
        !(a.meter_serial_no ?? '').toLowerCase().includes(q) &&
        !a.barangay_name.toLowerCase().includes(q) &&
        !a.zone_name.toLowerCase().includes(q)
      ) return false
      if (statusFilter !== 'all' && a.meter_status_name !== statusFilter) return false
      if (paymentFilter === 'Paid' && !a.payment_status) return false
      if (paymentFilter === 'Unpaid' && a.payment_status) return false
      return true
    })
  }, [accounts, debouncedSearch, statusFilter, paymentFilter])

  const hasActiveFilters = debouncedSearch.trim().length > 0 || statusFilter !== 'all' || paymentFilter !== 'all'
  const isSearchActive = debouncedSearch.trim().length > 0 || searchFocused

  const stats = useMemo(() => {
    const active = accounts.filter((a) => a.meter_status_name === 'Active').length
    const unpaid = accounts.filter((a) => !a.payment_status).length
    const outstanding = accounts
      .filter((a) => !a.payment_status)
      .reduce((sum, a) => sum + a.total_connection_fee, 0)
    return { total: accounts.length, active, unpaid, outstanding }
  }, [accounts])

  const handleViewAccount = (meterAccountId: string) => {
    router.push(`${basePath}/${meterAccountId}`)
  }

  return (
    <div className="w-full space-y-5">
      <PageHeading
        title="Meter Accounts"
        description={
          consumerName
            ? `All meter accounts registered under ${consumerName}`
            : 'All meter accounts registered under this consumer'
        }
      />

      {/* ── Stat pills ── */}
      {!isLoading && accounts.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          <StatPill icon={Gauge} label="Total Accounts" value={stats.total} tone="violet" />
          <StatPill icon={CheckCircle2} label="Active Meters" value={stats.active} tone="emerald" />
          <StatPill icon={Wallet} label="Unpaid Balance" value={currency(stats.outstanding)} tone="amber" />
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
        <div className="relative w-full min-w-0 sm:w-auto sm:flex-1 sm:max-w-xs">
          <Search
            className={cn(
              'absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 transition-colors pointer-events-none',
              isSearchActive ? 'text-violet-400' : 'text-slate-300',
            )}
          />
          <Input
            placeholder="Search Contract No., serial, zone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-slate-100 transition-colors"
            >
              <X className="h-3 w-3 text-slate-400" />
            </button>
          )}
        </div>

        <div className="hidden sm:block h-4 w-px bg-slate-200 shrink-0" />

        <FiltersPanel
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          paymentFilter={paymentFilter}
          onPaymentChange={setPaymentFilter}
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

      {/* ── Table panel ── */}
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
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
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                {['S/N', 'Barangay', 'Zone', 'Classification', 'Meter Status', 'Payment Status', 'Connection Fee', 'Registered', ''].map((h, i) => (
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
              {isLoading && [...Array(4)].map((_, i) => (
                <tr key={i} className="border-t border-slate-100">
                  {[...Array(9)].map((__, j) => (
                    <td key={j} className="px-5 py-3.5">
                      <div className="h-3 w-20 bg-slate-100 animate-pulse rounded-full" />
                    </td>
                  ))}
                </tr>
              ))}

              {/* Empty — no accounts at all */}
              {!isLoading && accounts.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-12 w-12 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center">
                        <Gauge className="h-5 w-5 text-violet-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-600">No meter accounts yet</p>
                        <p className="text-xs text-slate-400 mt-1">This consumer has no registered meter accounts.</p>
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
              {!isLoading && filtered.map((account) => (
                <tr
                  key={account.meter_account_id}
                  className="border-t border-slate-100 hover:bg-violet-50/40 transition-colors"
                >
                  <td className="px-5 py-3">
                    <span className="text-[12px] font-mono font-medium text-slate-600">
                      {account.meter_serial_no || '—'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-500">{account.barangay_name}</td>
                  <td className="px-5 py-3 text-xs text-slate-500">{account.zone_name}</td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                      {account.classification_name}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <MeterStatusBadge statusName={account.meter_status_name} />
                  </td>
                  <td className="px-5 py-3">
                    <PaymentStatusBadge paid={account.payment_status} />
                  </td>
                  <td className="px-5 py-3 text-xs font-medium text-slate-600">
                    {currency(account.total_connection_fee)}
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-500">
                    {new Date(account.created_at).toLocaleDateString('en-PH', {
                      year: 'numeric', month: 'short', day: 'numeric',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}