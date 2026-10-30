'use client'

import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'


import { TablePagination } from '@/components/shared-ui/pagination'
// Suggested path: app/(admin)/.../rate-limits/page.tsx
import { PageHeading } from '@/components/shared-ui/page-heading'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Search,
  ShieldAlert,
  ShieldOff,
  ShieldCheck,
  Clock,
  X,
  SlidersHorizontal,
  ChevronDown,
  Gauge,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent,
} from '@/components/ui/empty'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

import { getAllRateLimits, type RateLimitRecord } from '@/lib/actions/rate-limit/rate-limit.actions'
import { MaskedValue } from '@/components/ui/masked-value'
import { UnblockRateLimitModal } from '@/components/admin-ui/rate-limit/UnblockRateLimitModal'

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]
const SKELETON_ROW_COUNT = 8

const STATUS_FILTER_OPTIONS = {
  all:     'All Statuses',
  blocked: 'Currently Blocked',
  active:  'Default',
} as const

type StatusFilter = keyof typeof STATUS_FILTER_OPTIONS
const SCOPE_FILTER_ALL = 'all'

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function isCurrentlyBlocked(r: RateLimitRecord): boolean {
  return Boolean(r.blocked_until) && new Date(r.blocked_until!).getTime() > Date.now()
}

function formatActionName(name: string): string {
  return name.replace(/_/g, ' ')
}

function StatusBadge({ record }: { record: RateLimitRecord }) {
  if (isCurrentlyBlocked(record))
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
        <ShieldOff className="h-3 w-3" /> Blocked
      </span>
    )
  if (record.override_by)
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        <ShieldCheck className="h-3 w-3" /> Unblocked
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-slate-50 text-slate-600 border border-slate-200">
      <ShieldCheck className="h-3 w-3" /> Default
    </span>
  )
}

function ScopeBadge({ scope }: { scope: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-violet-50 text-violet-600 border border-violet-200 capitalize">
      {scope}
    </span>
  )
}

function RateLimitTableSkeletonRow() {
  return (
    <TableRow className="border-t border-slate-100 hover:bg-transparent">
      <TableCell className="py-3"><Skeleton className="h-3 w-14 rounded-md" /></TableCell>
      <TableCell className="py-3"><Skeleton className="h-3 w-28 rounded-md" /></TableCell>
      <TableCell className="py-3"><Skeleton className="h-3 w-24 rounded-md" /></TableCell>
      <TableCell className="py-3"><Skeleton className="h-3 w-10 rounded-md ml-auto" /></TableCell>
      <TableCell className="py-3"><Skeleton className="h-3 w-10 rounded-md ml-auto" /></TableCell>
      <TableCell className="py-3"><Skeleton className="h-3 w-28 rounded-md" /></TableCell>
      <TableCell className="py-3"><Skeleton className="h-5 w-16 rounded-md" /></TableCell>
      <TableCell className="py-3"><Skeleton className="h-7 w-20 rounded-md mx-auto" /></TableCell>
    </TableRow>
  )
}

function RateLimitTableEmpty({
  hasActiveFilters,
  onClearFilters,
}: {
  hasActiveFilters: boolean
  onClearFilters?: () => void
}) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={8} className="py-8 px-4">
        <Empty className="rounded-md border border-dashed border-slate-200 bg-slate-50/40 py-10 mx-auto text-center">
          <EmptyHeader>
            <EmptyMedia variant="icon" className="rounded-md border border-violet-200 bg-violet-50 text-violet-500 mx-auto">
              {hasActiveFilters ? <Search className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
            </EmptyMedia>
            <EmptyTitle className="text-sm font-semibold text-slate-700">
              {hasActiveFilters ? 'No matching records' : 'Nothing rate-limited right now'}
            </EmptyTitle>
            <EmptyDescription className="text-xs text-slate-400 max-w-sm mx-auto">
              {hasActiveFilters
                ? 'Try adjusting your search or filters — nothing matches the current criteria.'
                : 'Blocked IPs, emails, and accounts will show up here once they trip a rate limit.'}
            </EmptyDescription>
          </EmptyHeader>
          {hasActiveFilters && onClearFilters && (
            <EmptyContent>
              <Button size="sm" variant="outline" onClick={onClearFilters}
                className="h-7 text-[11px] rounded-md border-violet-200 text-violet-600 hover:bg-violet-50 hover:border-violet-300">
                <X className="h-3 w-3 mr-1" /> Clear filters
              </Button>
            </EmptyContent>
          )}
        </Empty>
      </TableCell>
    </TableRow>
  )
}

function FiltersPanel({
  statusFilter, scopeFilter, scopes, onStatusChange, onScopeChange,
}: {
  statusFilter:   StatusFilter
  scopeFilter:    string
  scopes:         string[]
  onStatusChange: (v: StatusFilter) => void
  onScopeChange:  (v: string) => void
}) {
  const activeCount = [statusFilter !== 'all', scopeFilter !== SCOPE_FILTER_ALL].filter(Boolean).length

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline" size="sm"
          className={cn(
            'h-9 gap-1.5 text-sm font-medium transition-all rounded-md',
            activeCount > 0 && 'border-violet-400 bg-violet-50 text-violet-700 hover:bg-violet-100 hover:border-violet-500',
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
        <DropdownMenuLabel className="text-[9px] font-bold uppercase tracking-widest text-violet-400 px-2 py-1.5">Status</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={statusFilter} onValueChange={(v) => onStatusChange(v as StatusFilter)}>
          {(Object.keys(STATUS_FILTER_OPTIONS) as StatusFilter[]).map((key) => (
            <DropdownMenuRadioItem key={key} value={key}
              className={cn('cursor-pointer rounded-md text-xs', statusFilter === key && 'text-violet-600 font-medium bg-violet-50')}>
              {STATUS_FILTER_OPTIONS[key]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator className="my-1" />
        <DropdownMenuLabel className="text-[9px] font-bold uppercase tracking-widest text-violet-400 px-2 py-1.5">Scope</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={scopeFilter} onValueChange={onScopeChange}>
          <DropdownMenuRadioItem value={SCOPE_FILTER_ALL}
            className={cn('cursor-pointer rounded-md text-xs', scopeFilter === SCOPE_FILTER_ALL && 'text-violet-600 font-medium bg-violet-50')}>
            All Scopes
          </DropdownMenuRadioItem>
          {scopes.map((s) => (
            <DropdownMenuRadioItem key={s} value={s}
              className={cn('cursor-pointer rounded-md text-xs capitalize', scopeFilter === s && 'text-violet-600 font-medium bg-violet-50')}>
              {s}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default function RateLimitPage() {
  const [records,       setRecords]       = useState<RateLimitRecord[]>([])
  const [isLoading,     setIsLoading]     = useState(true)
  const [searchQuery,   setSearchQuery]   = useState('')
  const debouncedSearchQuery = useDebouncedSearch(searchQuery)
  const [searchFocused, setSearchFocused] = useState(false)
  const [selectedScope,  setSelectedScope]  = useState(SCOPE_FILTER_ALL)
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>('all')
  const [page,     setPage]     = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await getAllRateLimits()
      if (result.status === 'success') {
        setRecords(result.data)
      } else {
        toast.error(result.message ?? 'Failed to load rate limits')
      }
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const scopes = useMemo(
    () => Array.from(new Set(records.map((r) => r.scope))).sort(),
    [records],
  )

  const filtered = useMemo(() => {
    const result: RateLimitRecord[] = []
    for (const r of records) {
      const blocked = isCurrentlyBlocked(r)
      if (selectedStatus === 'blocked' && !blocked) continue
      if (selectedStatus === 'active' && blocked) continue
      if (selectedScope !== SCOPE_FILTER_ALL && r.scope !== selectedScope) continue

      if (debouncedSearchQuery) {
        const q = debouncedSearchQuery.toLowerCase()
        const match =
          r.scope.toLowerCase().includes(q) ||
          r.action_name.toLowerCase().includes(q) ||
          formatActionName(r.action_name).toLowerCase().includes(q) ||
          r.status_name.toLowerCase().includes(q)
        // Note: identifier is intentionally excluded from search — searching
        // by IP/email would defeat the point of masking it in the table.
        if (!match) continue
      }
      result.push(r)
    }
    return result
  }, [records, selectedStatus, selectedScope, debouncedSearchQuery])

  useEffect(() => { setPage(1) }, [filtered.length])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage   = Math.min(page, totalPages)
  const paginated  = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  )


  const hasActiveFilters     = debouncedSearchQuery.trim().length > 0 || selectedStatus !== 'all' || selectedScope !== SCOPE_FILTER_ALL
  const isSearchActive       = debouncedSearchQuery.trim().length > 0 || searchFocused
  const isNonDefaultPageSize = pageSize !== 10
  const handleUnblockSuccess = useCallback(() => { fetchData() }, [fetchData])

  const blockedCount = useMemo(() => records.filter(isCurrentlyBlocked).length, [records])

  return (
    <div className="w-full space-y-5">

      <PageHeading title="Rate Limit Blocks" description="Review and unblock IPs, emails, and accounts that tripped a rate limit" />
<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1 flex-wrap">
          <div className="relative w-full min-w-0 sm:w-auto sm:flex-1 sm:max-w-sm">
            <Search className={cn('absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 transition-colors', isSearchActive ? 'text-violet-400' : 'text-slate-300')} />
            <Input
              placeholder="Search scope, action, status…"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1) }}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              className={cn(
                'pl-9 h-8 rounded-md text-xs bg-white border-slate-200 text-slate-700 placeholder:text-slate-300 focus-visible:ring-0 focus-visible:ring-offset-0 transition-colors',
                isSearchActive ? 'border-violet-400 ring-2 ring-violet-100' : 'hover:border-violet-200',
              )}
            />
            {searchQuery && (
              <button onClick={() => { setSearchQuery(''); setPage(1) }} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-slate-100">
                <X className="h-3 w-3 text-slate-400" />
              </button>
            )}
          </div>

          <div className="hidden sm:block h-4 w-px bg-slate-200" />

          <FiltersPanel
            statusFilter={selectedStatus} scopeFilter={selectedScope} scopes={scopes}
            onStatusChange={(v) => { setSelectedStatus(v); setPage(1) }}
            onScopeChange={(v) => { setSelectedScope(v); setPage(1) }}
          />

          {hasActiveFilters && (
            <button
              onClick={() => { setSearchQuery(''); setSelectedStatus('all'); setSelectedScope(SCOPE_FILTER_ALL); setPage(1) }}
              className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-xs text-slate-400 hover:text-violet-600 hover:bg-violet-50"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>

        {!isLoading && blockedCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border shrink-0 bg-rose-50 border-rose-200">
            <ShieldOff className="h-3.5 w-3.5 text-rose-500" />
            <span className="text-[11px] text-rose-700 whitespace-nowrap">
              {blockedCount} currently blocked
            </span>
          </div>
        )}
      </div>

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
                  {' '}record{filtered.length !== 1 ? 's' : ''}
                  {hasActiveFilters && <span className="text-slate-400"> · filtered</span>}
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <span className="hidden sm:inline">Rows per page</span>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1) }}>
              <SelectTrigger className={cn('h-7 w-[58px] rounded-md text-[11px] bg-white border-slate-200 text-slate-500 focus:ring-0 focus:ring-offset-0 hover:border-violet-300', isNonDefaultPageSize && 'border-violet-300 text-violet-600')}>
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

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/40">
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Identifier</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Scope</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Action</TableHead>
                <TableHead className="text-right text-[9px] font-bold text-slate-400 uppercase tracking-wider">Attempts</TableHead>
                <TableHead className="text-right text-[9px] font-bold text-slate-400 uppercase tracking-wider">Lockouts</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Blocked Until</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Status</TableHead>
                <TableHead className="w-32 text-center text-[9px] font-bold text-slate-400 uppercase tracking-wider">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {isLoading ? (
                Array.from({ length: SKELETON_ROW_COUNT }).map((_, i) => (
                  <RateLimitTableSkeletonRow key={`skeleton-${i}`} />
                ))
              ) : paginated.length === 0 ? (
                <RateLimitTableEmpty
                  hasActiveFilters={hasActiveFilters}
                  onClearFilters={() => {
                    setSearchQuery('')
                    setSelectedStatus('all')
                    setSelectedScope(SCOPE_FILTER_ALL)
                    setPage(1)
                  }}
                />
              ) : (
                paginated.map((record) => {
                  const blocked = isCurrentlyBlocked(record)
                  return (
                    <TableRow key={record.rate_limit_id} className="border-t border-slate-100 hover:bg-violet-50/40 transition-colors">
                      <TableCell className="py-3">
                        <MaskedValue value={record.identifier} />
                      </TableCell>

                      <TableCell className="py-3">
                        <ScopeBadge scope={record.scope} />
                      </TableCell>

                      <TableCell className="py-3">
                        <span className="text-[12.5px] text-slate-600">{formatActionName(record.action_name)}</span>
                      </TableCell>

                      <TableCell className="text-right py-3">
                        <span className="tabular-nums text-[12.5px] font-medium text-slate-600">{record.attempts}</span>
                      </TableCell>

                      <TableCell className="text-right py-3">
                        <span className="tabular-nums text-[12.5px] font-medium text-slate-600">{record.lockout_count}</span>
                      </TableCell>

                      <TableCell className="py-3">
                        {blocked ? (
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3 text-rose-400 shrink-0" />
                            <span className="text-[12.5px] text-rose-600">{fmtDateTime(record.blocked_until)}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[12.5px]">—</span>
                        )}
                      </TableCell>

                      <TableCell className="py-3">
                        <StatusBadge record={record} />
                      </TableCell>

                      <TableCell className="py-3">
                        <div className="flex items-center justify-center">
                          {blocked ? (
                            <UnblockRateLimitModal rateLimit={record} onSuccess={handleUnblockSuccess}>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[11px] rounded-md border-rose-200 text-rose-600 hover:bg-rose-50 hover:border-rose-300"
                              >
                                <ShieldOff className="h-3 w-3 mr-1" /> Unblock
                              </Button>
                            </UnblockRateLimitModal>
                          ) : (
                            <span className="text-slate-300 text-xs">—</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {!isLoading && (
        <TablePagination
          page={safePage}
          pageSize={pageSize}
          total={filtered.length}
          onPageChange={setPage}
        />
      )}
    </div>
  )
}