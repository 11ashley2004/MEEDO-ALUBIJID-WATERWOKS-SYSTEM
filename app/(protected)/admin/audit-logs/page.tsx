'use client'

import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'


import { TablePagination } from '@/components/shared-ui/pagination'
// Suggested path: app/(admin)/.../audit-logs/page.tsx
import { PageHeading } from '@/components/shared-ui/page-heading'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Search,
  History,
  X,
  SlidersHorizontal,
  ChevronDown,
  User as UserIcon,
  Database,
  Calendar,
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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

import { getAllAuditLogs, type AuditLogRecord } from '@/lib/actions/audit.action'

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]
const SKELETON_ROW_COUNT = 8
const ACTION_FILTER_ALL = 'all'
const TABLE_FILTER_ALL = 'all'

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase()
}

// Loosely groups action strings so the badge color communicates intent
// without requiring you to enumerate every literal action name you log.
function ActionBadge({ action }: { action: string }) {
  const a = action.toUpperCase()
  const isCreate  = a.includes('CREATE') || a.includes('ADD') || a.includes('INSERT')
  const isUpdate  = a.includes('UPDATE') || a.includes('EDIT') || a.includes('ADJUST')
  const isDelete  = a.includes('DELETE') || a.includes('REMOVE') || a.includes('CANCEL')
  const isApprove = a.includes('APPROVE') || a.includes('UNBLOCK')
  const isReject  = a.includes('REJECT') || a.includes('DENY') || a.includes('BLOCK')

  const styles = isCreate
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : isDelete || isReject
      ? 'bg-rose-50 text-rose-700 border-rose-200'
      : isApprove
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : isUpdate
          ? 'bg-amber-50 text-amber-700 border-amber-200'
          : 'bg-slate-50 text-slate-600 border-slate-200'

  return (
    <span className={cn('inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-semibold border', styles)}>
      {action}
    </span>
  )
}

function AuditLogTableSkeletonRow() {
  return (
    <TableRow className="border-t border-slate-100 hover:bg-transparent">
      <TableCell className="py-3"><Skeleton className="h-3 w-28 rounded-md" /></TableCell>
      <TableCell className="py-3"><Skeleton className="h-7 w-7 rounded-md" /></TableCell>
      <TableCell className="py-3"><Skeleton className="h-5 w-20 rounded-md" /></TableCell>
      <TableCell className="py-3"><Skeleton className="h-3 w-24 rounded-md" /></TableCell>
      <TableCell className="py-3"><Skeleton className="h-3 w-40 rounded-md" /></TableCell>
    </TableRow>
  )
}

function AuditLogTableEmpty({
  hasActiveFilters,
  onClearFilters,
}: {
  hasActiveFilters: boolean
  onClearFilters?: () => void
}) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={5} className="py-8 px-4">
        <Empty className="rounded-md border border-dashed border-slate-200 bg-slate-50/40 py-10 mx-auto text-center">
          <EmptyHeader>
            <EmptyMedia variant="icon" className="rounded-md border border-violet-200 bg-violet-50 text-violet-500 mx-auto">
              {hasActiveFilters ? <Search className="h-5 w-5" /> : <History className="h-5 w-5" />}
            </EmptyMedia>
            <EmptyTitle className="text-sm font-semibold text-slate-700">
              {hasActiveFilters ? 'No matching activity' : 'No activity recorded yet'}
            </EmptyTitle>
            <EmptyDescription className="text-xs text-slate-400 max-w-sm mx-auto">
              {hasActiveFilters
                ? 'Try adjusting your search or filters — nothing matches the current criteria.'
                : 'Actions taken across the system will appear here as they happen.'}
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
  actionFilter, tableFilter, actions, tables, onActionChange, onTableChange,
}: {
  actionFilter:   string
  tableFilter:    string
  actions:        string[]
  tables:         string[]
  onActionChange: (v: string) => void
  onTableChange:  (v: string) => void
}) {
  const activeCount = [actionFilter !== ACTION_FILTER_ALL, tableFilter !== TABLE_FILTER_ALL].filter(Boolean).length

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

      <DropdownMenuContent align="end" className="w-56 rounded-md p-1.5 max-h-96 overflow-y-auto">
        <DropdownMenuLabel className="text-[9px] font-bold uppercase tracking-widest text-violet-400 px-2 py-1.5">Action</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={actionFilter} onValueChange={onActionChange}>
          <DropdownMenuRadioItem value={ACTION_FILTER_ALL}
            className={cn('cursor-pointer rounded-md text-xs', actionFilter === ACTION_FILTER_ALL && 'text-violet-600 font-medium bg-violet-50')}>
            All Actions
          </DropdownMenuRadioItem>
          {actions.map((a) => (
            <DropdownMenuRadioItem key={a} value={a}
              className={cn('cursor-pointer rounded-md text-xs', actionFilter === a && 'text-violet-600 font-medium bg-violet-50')}>
              {a}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator className="my-1" />
        <DropdownMenuLabel className="text-[9px] font-bold uppercase tracking-widest text-violet-400 px-2 py-1.5">Target Table</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={tableFilter} onValueChange={onTableChange}>
          <DropdownMenuRadioItem value={TABLE_FILTER_ALL}
            className={cn('cursor-pointer rounded-md text-xs', tableFilter === TABLE_FILTER_ALL && 'text-violet-600 font-medium bg-violet-50')}>
            All Tables
          </DropdownMenuRadioItem>
          {tables.map((t) => (
            <DropdownMenuRadioItem key={t} value={t}
              className={cn('cursor-pointer rounded-md text-xs', tableFilter === t && 'text-violet-600 font-medium bg-violet-50')}>
              {t}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function LogDetailDialog({
  log,
  open,
  onOpenChange,
}: {
  log: AuditLogRecord | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  if (!log) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-md">
        <DialogHeader>
          <DialogTitle className="text-base">Activity Detail</DialogTitle>
          <DialogDescription className="text-xs">{fmtDateTime(log.created_at)}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="rounded-md border border-slate-200 bg-slate-50/60 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">User</span>
              <span className="text-[12.5px] font-medium text-slate-700">{log.user_name}</span>
            </div>
            {log.user_email && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Email</span>
                <span className="text-[12.5px] text-slate-600">{log.user_email}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Action</span>
              <ActionBadge action={log.action} />
            </div>
            {log.target_table && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Target Table</span>
                <span className="font-mono text-[12px] text-slate-600">{log.target_table}</span>
              </div>
            )}
            {log.target_id && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Target ID</span>
                <span className="font-mono text-[11px] text-slate-500">{log.target_id}</span>
              </div>
            )}
          </div>

          {log.description && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Description</p>
              <p className="text-xs text-slate-600 mt-0.5 whitespace-pre-wrap">{log.description}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function AuditLogPage() {
  const [logs,          setLogs]          = useState<AuditLogRecord[]>([])
  const [isLoading,     setIsLoading]     = useState(true)
  const [searchQuery,   setSearchQuery]   = useState('')
  const debouncedSearchQuery = useDebouncedSearch(searchQuery)
  const [searchFocused, setSearchFocused] = useState(false)
  const [selectedAction, setSelectedAction] = useState(ACTION_FILTER_ALL)
  const [selectedTable,  setSelectedTable]  = useState(TABLE_FILTER_ALL)
  const [fromDate, setFromDate] = useState('')
  const [toDate,   setToDate]   = useState('')
  const [page,     setPage]     = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [viewingLog, setViewingLog] = useState<AuditLogRecord | null>(null)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await getAllAuditLogs({
        from: fromDate ? new Date(fromDate).toISOString() : undefined,
        to:   toDate   ? new Date(new Date(toDate).setHours(23, 59, 59, 999)).toISOString() : undefined,
      })
      if (result.status === 'success') {
        setLogs(result.data)
      } else {
        toast.error(result.message ?? 'Failed to load audit logs')
      }
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }, [fromDate, toDate])

  useEffect(() => { fetchData() }, [fetchData])

  const actionOptions = useMemo(
    () => Array.from(new Set(logs.map((l) => l.action))).sort(),
    [logs],
  )
  const tableOptions = useMemo(
    () => Array.from(new Set(logs.map((l) => l.target_table).filter(Boolean) as string[])).sort(),
    [logs],
  )

  const filtered = useMemo(() => {
    const result: AuditLogRecord[] = []
    for (const l of logs) {
      if (selectedAction !== ACTION_FILTER_ALL && l.action !== selectedAction) continue
      if (selectedTable !== TABLE_FILTER_ALL && l.target_table !== selectedTable) continue

      if (debouncedSearchQuery) {
        const q = debouncedSearchQuery.toLowerCase()
        const match =
          l.user_name.toLowerCase().includes(q) ||
          (l.user_email ?? '').toLowerCase().includes(q) ||
          l.action.toLowerCase().includes(q) ||
          (l.description ?? '').toLowerCase().includes(q) ||
          (l.target_table ?? '').toLowerCase().includes(q) ||
          (l.target_id ?? '').toLowerCase().includes(q)
        if (!match) continue
      }
      result.push(l)
    }
    return result
  }, [logs, selectedAction, selectedTable, debouncedSearchQuery])

  useEffect(() => { setPage(1) }, [filtered.length])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage   = Math.min(page, totalPages)
  const paginated  = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  )


  const hasActiveFilters =
    debouncedSearchQuery.trim().length > 0 ||
    selectedAction !== ACTION_FILTER_ALL ||
    selectedTable !== TABLE_FILTER_ALL ||
    Boolean(fromDate) ||
    Boolean(toDate)
  const isSearchActive       = debouncedSearchQuery.trim().length > 0 || searchFocused
  const isNonDefaultPageSize = pageSize !== 25

  const clearAllFilters = () => {
    setSearchQuery('')
    setSelectedAction(ACTION_FILTER_ALL)
    setSelectedTable(TABLE_FILTER_ALL)
    setFromDate('')
    setToDate('')
    setPage(1)
  }

  return (
    <div className="w-full space-y-5">

      <PageHeading title="Audit Logs" description="Every recorded action taken across the system, by every user" />
<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1 flex-wrap">
          <div className="relative w-full min-w-0 sm:w-auto sm:flex-1 sm:max-w-sm">
            <Search className={cn('absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 transition-colors', isSearchActive ? 'text-violet-400' : 'text-slate-300')} />
            <Input
              placeholder="Search user, action, description, target…"
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

          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => { setFromDate(e.target.value); setPage(1) }}
              className="h-8 w-[130px] rounded-md text-xs bg-white border-slate-200 text-slate-600"
            />
            <span className="text-xs text-slate-300">–</span>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => { setToDate(e.target.value); setPage(1) }}
              className="h-8 w-[130px] rounded-md text-xs bg-white border-slate-200 text-slate-600"
            />
          </div>

          <FiltersPanel
            actionFilter={selectedAction} tableFilter={selectedTable}
            actions={actionOptions} tables={tableOptions}
            onActionChange={(v) => { setSelectedAction(v); setPage(1) }}
            onTableChange={(v) => { setSelectedTable(v); setPage(1) }}
          />

          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-xs text-slate-400 hover:text-violet-600 hover:bg-violet-50"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-violet-100 border border-violet-200 flex items-center justify-center">
              <History className="h-3 w-3 text-violet-500" />
            </div>
            <p className="text-xs text-slate-500">
              {isLoading ? (
                <span className="inline-block h-3 w-24 bg-slate-100 animate-pulse rounded-full" />
              ) : (
                <>
                  <span className="font-semibold text-slate-700">{filtered.length}</span>
                  {' '}entr{filtered.length !== 1 ? 'ies' : 'y'}
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
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">When</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">User</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Action</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Target</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Description</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {isLoading ? (
                Array.from({ length: SKELETON_ROW_COUNT }).map((_, i) => (
                  <AuditLogTableSkeletonRow key={`skeleton-${i}`} />
                ))
              ) : paginated.length === 0 ? (
                <AuditLogTableEmpty hasActiveFilters={hasActiveFilters} onClearFilters={clearAllFilters} />
              ) : (
                paginated.map((log) => (
                  <TableRow
                    key={log.log_id}
                    className="border-t border-slate-100 hover:bg-violet-50/40 transition-colors cursor-pointer"
                    onClick={() => setViewingLog(log)}
                  >
                    <TableCell className="py-3">
                      <span className="text-[12.5px] text-slate-500 whitespace-nowrap">{fmtDateTime(log.created_at)}</span>
                    </TableCell>

                    <TableCell className="py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-md bg-violet-100 flex items-center justify-center text-[11px] font-bold text-violet-600 shrink-0">
                          {getInitials(log.user_name)}
                        </div>
                        <div>
                          <p className="text-[12.5px] font-medium leading-tight text-slate-800">{log.user_name}</p>
                          {log.user_email && <p className="text-[10px] text-slate-400">{log.user_email}</p>}
                        </div>
                      </div>
                    </TableCell>

                    <TableCell className="py-3">
                      <ActionBadge action={log.action} />
                    </TableCell>

                    <TableCell className="py-3">
                      {log.target_table ? (
                        <div className="flex items-center gap-1">
                          <Database className="h-3 w-3 text-slate-400 shrink-0" />
                          <span className="font-mono text-[11.5px] text-slate-600">{log.target_table}</span>
                        </div>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </TableCell>

                    <TableCell className="py-3 max-w-xs">
                      <p className="text-[12.5px] text-slate-500 truncate">{log.description ?? '—'}</p>
                    </TableCell>
                  </TableRow>
                ))
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

      <LogDetailDialog
        log={viewingLog}
        open={Boolean(viewingLog)}
        onOpenChange={(open) => { if (!open) setViewingLog(null) }}
      />
    </div>
  )
}