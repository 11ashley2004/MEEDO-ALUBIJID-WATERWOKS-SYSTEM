'use client'

import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'


import { TablePagination } from '@/components/shared-ui/pagination'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search,
  Users,
  MoreHorizontal,
  UserCheck,
  UserX,
  Eye,
  X,
  ChevronDown,
  SlidersHorizontal,
  UserPlus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
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
import { getAllConsumers, toggleConsumerStatus, Consumer } from '@/lib/actions/consumer/consumer.actions'
import { ToggleStatusDialog } from '@/components/admin-ui/consumers/consumer-status-modal'
import { toast } from 'sonner'
import { format } from 'date-fns'
import RegisterConsumerForm from '@/components/admin-ui/consumers/RegisterConsumerForm'

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

// ── Avatar palette — soft violet tones ───────────────────────────────────────
const AVATAR_STYLES = [
  'bg-violet-100 text-violet-700 border-violet-200',
  'bg-purple-100 text-purple-700 border-purple-200',
  'bg-indigo-100 text-indigo-700 border-indigo-200',
  'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200',
  'bg-violet-50  text-violet-600 border-violet-100',
]
const avatarStyle = (id: string) =>
  AVATAR_STYLES[id.charCodeAt(0) % AVATAR_STYLES.length]

// ── Get avatar initials from account_name ────────────────────────────────────
const getInitials = (accountName: string) => {
  const parts = accountName.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  if (parts.length === 2) return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase()
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase()
}

const formatDate = (d: string) => format(new Date(d), 'MMM dd, yyyy')

// ── Filters dropdown ──────────────────────────────────────────────────────────
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
        <button
          className={cn(
            'inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs border transition-colors',
            'bg-white border-slate-200 text-slate-500 hover:border-violet-300 hover:text-violet-600',
            active && 'border-violet-300 bg-violet-50 text-violet-600 font-medium',
          )}
        >
          <SlidersHorizontal className="h-3 w-3 shrink-0" />
          Filters
          {active && (
            <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-violet-600 text-white text-[9px] font-bold leading-none">
              1
            </span>
          )}
          <ChevronDown className="h-3 w-3 shrink-0 opacity-40" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-44 bg-white border border-slate-200 rounded-lg p-1.5"
      >
        <DropdownMenuLabel className="text-[9px] font-bold uppercase tracking-widest text-violet-400 px-2 py-1.5">
          Status
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={statusFilter} onValueChange={onStatusChange}>
          {(['all', 'active', 'inactive'] as const).map((val) => (
            <DropdownMenuRadioItem
              key={val}
              value={val}
              className={cn(
                'cursor-pointer rounded-lg text-xs text-slate-500',
                'focus:bg-violet-50 focus:text-violet-700 dark:focus:bg-accent dark:focus:text-accent-foreground',
                statusFilter === val && 'text-violet-600 font-medium',
              )}
            >
              {val === 'all' ? 'All Statuses' : val.charAt(0).toUpperCase() + val.slice(1)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
interface ConsumerListProps {
  onRefreshTrigger?: number
  basePath?: string
}

export default function ConsumerList({ onRefreshTrigger, basePath = "" }: ConsumerListProps) {
  const router = useRouter()
  const [consumers, setConsumers] = useState<Consumer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedSearch(search)
  const [searchFocused, setSearchFocused] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedConsumerId, setSelectedConsumerId] = useState<string | null>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const fetchConsumers = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await getAllConsumers()
      setConsumers(data)
    } catch {
      toast.error('Failed to load consumers')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchConsumers() }, [fetchConsumers, onRefreshTrigger])

  const handleConsumerRegistered = () => {
    setRefreshTrigger((n) => n + 1)
    fetchConsumers()
  }

  const clearAll = useCallback(() => {
    setSearch('')
    setStatusFilter('all')
    setPage(1)
  }, [])

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    return consumers.filter((c) => {
      if (q &&
        !(c.contract_no ?? '').toLowerCase().includes(q) &&
        !c.account_name.toLowerCase().includes(q) &&
        !(c.email ?? '').toLowerCase().includes(q) &&
        !(c.contact_number ?? '').toLowerCase().includes(q)
      ) return false
      if (statusFilter === 'active' && !c.is_active) return false
      if (statusFilter === 'inactive' && c.is_active) return false
      return true
    })
  }, [consumers, debouncedSearch, statusFilter])

  useEffect(() => { setPage(1) }, [filtered.length])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginated = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  )

  const hasActiveFilters = debouncedSearch.trim().length > 0 || statusFilter !== 'all'
  const isSearchActive = debouncedSearch.trim().length > 0 || searchFocused


  const openToggleDialog = (consumerId: string) => {
    setSelectedConsumerId(consumerId)
    setDialogOpen(true)
  }

  const handleToggleStatus = async (consumerId: string) => {
    try {
      const consumer = consumers.find(c => c.consumer_id === consumerId)
      if (!consumer) {
        toast.error('Consumer not found')
        return
      }

      const res = await toggleConsumerStatus(consumerId, consumer.is_active)
      if (res.status === 'success') {
        toast.success(`Consumer ${consumer.is_active ? 'deactivated' : 'activated'}`)
        fetchConsumers()
        setDialogOpen(false)
        setSelectedConsumerId(null)
      } else {
        toast.error(res.message ?? 'Failed to update status')
      }
    } catch {
      toast.error('Something went wrong')
    }
  }

  const handleViewConsumer = (consumerId: string) => {
    router.push(`${basePath}/consumers/${consumerId}`)
  }

  return (
    <>
      <ToggleStatusDialog
        consumerId={selectedConsumerId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onConfirm={handleToggleStatus}
      />

      {/* ── Toolbar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-4">
        
        {/* Left Group: Search + Filter */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 flex-1">
          {/* Search */}
          <div className="relative w-full min-w-0 sm:w-auto sm:flex-1 sm:max-w-xs">
            <Search
              className={cn(
                'absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 transition-colors pointer-events-none',
                isSearchActive ? 'text-violet-400' : 'text-slate-300',
              )}
            />
            <Input
              placeholder="Search Contract No., name, email…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              className={cn(
                'pl-9 h-8 rounded-lg text-xs bg-white border-slate-200 text-slate-700',
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

        {/* Right Group: Create Consumer Button */}
        <div className="flex items-center">
          <RegisterConsumerForm onSuccess={handleConsumerRegistered}>
            <button className="inline-flex items-center gap-2 h-8 px-4 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-700 text-white shadow-sm transition-colors">
              <UserPlus className="h-3.5 w-3.5" />
              Create Consumer
            </button>
          </RegisterConsumerForm>
        </div>
      </div>

      {/* ── Table panel ── */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">

        {/* Table bar */}
        <div className="px-5 py-3 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-lg bg-violet-100 border border-violet-200 flex items-center justify-center">
              <Users className="h-3 w-3 text-violet-500" />
            </div>
            <p className="text-xs text-slate-500">
              {isLoading ? (
                <span className="inline-block h-3 w-24 bg-slate-100 animate-pulse rounded-full" />
              ) : (
                <>
                  <span className="font-semibold text-slate-700">{filtered.length}</span>
                  {' '}consumer{filtered.length !== 1 ? 's' : ''}
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
                {['Consumer', 'Contract No.', 'Contact', 'Email', 'Status', 'Registered', ''].map((h, i) => (
                  <th
                    key={i}
                    className={cn(
                      'px-5 py-2.5 text-left text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap',
                      i === 6 && 'w-[44px]',
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
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-slate-100 animate-pulse shrink-0" />
                      <div className="space-y-1.5">
                        <div className="h-3 w-28 bg-slate-100 animate-pulse rounded-full" />
                      </div>
                    </div>
                  </td>
                  {[0, 1, 2, 3].map((j) => (
                    <td key={j} className="px-5 py-3.5">
                      <div className="h-3 w-24 bg-slate-100 animate-pulse rounded-full" />
                    </td>
                  ))}
                  <td className="px-5 py-3.5">
                    <div className="h-7 w-7 bg-slate-100 animate-pulse rounded-lg" />
                  </td>
                </tr>
              ))}

              {/* Empty — no consumers */}
              {!isLoading && consumers.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-12 w-12 rounded-lg bg-violet-50 border border-violet-100 flex items-center justify-center">
                        <Users className="h-5 w-5 text-violet-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-600">No consumers yet</p>
                        <p className="text-xs text-slate-400 mt-1">Use the Create Consumer button to add your first consumer.</p>
                      </div>
                    </div>
                  </td>
                </tr>
              )}

              {/* Empty — filtered */}
              {!isLoading && consumers.length > 0 && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-14 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-12 w-12 rounded-lg bg-violet-50 border border-violet-100 flex items-center justify-center">
                        <Search className="h-5 w-5 text-violet-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-600">No results</p>
                        <p className="text-xs text-slate-400 mt-1">No consumers match your filters.</p>
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

              {/* Data rows */}
              {!isLoading && paginated.map((consumer) => (
                <tr
                  key={consumer.consumer_id}
                  className="border-t border-slate-100 hover:bg-violet-50/40 transition-colors"
                >
                  {/* Consumer col */}
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'h-8 w-8 rounded-lg border flex items-center justify-center text-[10px] font-bold shrink-0',
                        avatarStyle(consumer.consumer_id),
                      )}>
                        {getInitials(consumer.account_name)}
                      </div>
                      <div>
                        <div className="text-[12.5px] font-medium text-slate-700 leading-tight">
                          {consumer.account_name}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="px-5 py-3 text-xs font-mono text-slate-600">
                    {consumer.contract_no || <span className="text-slate-300">—</span>}
                  </td>

                  {/* Contact */}
                  <td className="px-5 py-3 text-xs text-slate-500">
                    {consumer.contact_number || <span className="text-slate-300">—</span>}
                  </td>

                  {/* Email */}
                  <td className="px-5 py-3 text-xs text-slate-500">
                    {consumer.email || <span className="text-slate-300">—</span>}
                  </td>

                  {/* Status */}
                  <td className="px-5 py-3">
                    <span className={cn(
                      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold border',
                      consumer.is_active
                        ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                        : 'bg-slate-50 text-slate-400 border-slate-200',
                    )}>
                      <span className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        consumer.is_active ? 'bg-emerald-500' : 'bg-slate-300',
                      )} />
                      {consumer.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>

                  {/* Registered */}
                  <td className="px-5 py-3 text-xs text-slate-400">
                    {formatDate(consumer.created_at)}
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
                        className="w-48 bg-white border border-slate-200 rounded-lg p-1.5"
                      >
                        <DropdownMenuLabel className="text-[9px] font-bold uppercase tracking-widest text-violet-400 px-2 py-1.5">
                          Actions
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator className="bg-slate-100 mb-1" />

                        {/* View details */}
                        <DropdownMenuItem
                          onSelect={(e) => { e.preventDefault(); handleViewConsumer(consumer.consumer_id) }}
                          className="cursor-pointer rounded-lg gap-2.5 py-2 group"
                        >
                          <div className="h-6 w-6 rounded-md flex items-center justify-center shrink-0 transition-colors bg-slate-100 group-hover:bg-blue-100">
                            <Eye className="h-3 w-3 text-slate-500 group-hover:text-blue-600 transition-colors" />
                          </div>
                          <span className="text-xs font-medium text-slate-500 group-hover:text-blue-600 transition-colors">
                            View details
                          </span>
                        </DropdownMenuItem>

                        {/* Toggle status */}
                        <DropdownMenuItem
                          onSelect={(e) => { e.preventDefault(); openToggleDialog(consumer.consumer_id) }}
                          className={cn(
                            'cursor-pointer rounded-lg gap-2.5 py-2 group',
                            consumer.is_active ? 'focus:bg-rose-50' : 'focus:bg-emerald-50',
                          )}
                        >
                          <div className={cn(
                            'h-6 w-6 rounded-md flex items-center justify-center shrink-0 transition-colors bg-slate-100',
                            consumer.is_active ? 'group-hover:bg-rose-100' : 'group-hover:bg-emerald-100',
                          )}>
                            {consumer.is_active
                              ? <UserX className="h-3 w-3 text-slate-400 group-hover:text-rose-500 transition-colors" />
                              : <UserCheck className="h-3 w-3 text-slate-400 group-hover:text-emerald-600 transition-colors" />
                            }
                          </div>
                          <span className={cn(
                            'text-xs font-medium text-slate-500 transition-colors',
                            consumer.is_active ? 'group-hover:text-rose-600' : 'group-hover:text-emerald-700',
                          )}>
                            {consumer.is_active ? 'Deactivate' : 'Activate'}
                          </span>
                        </DropdownMenuItem>

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
    </>
  )
}