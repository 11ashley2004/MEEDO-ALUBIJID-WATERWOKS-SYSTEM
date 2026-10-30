'use client'

import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'



import { TablePagination } from '@/components/shared-ui/pagination'
import { PageHeading } from '@/components/shared-ui/page-heading'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { Search, Users, Mail, Plus, Eye, MoreHorizontal, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import AssignZoneForm from '@/components/admin-ui/assignments/assign-zone-form'
import ViewReaderZonesDialog from '@/components/admin-ui/assignments/view-reader-zones-dialog'
import {
  getActiveMeterReadersWithStats,
  type MeterReaderRow,
} from '@/lib/actions/job-assignment/meter-reader-assignments.actions'
import { toast } from 'sonner'

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

const MeterReaderAssignmentsPage = () => {
  const [readers, setReaders] = useState<MeterReaderRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const debouncedSearchQuery = useDebouncedSearch(searchQuery)
  const [searchFocused, setSearchFocused] = useState(false)

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // Which reader the Assign / View sheets are currently acting on.
  const [activeReader, setActiveReader] = useState<MeterReaderRow | null>(null)
  const [assignOpen, setAssignOpen] = useState(false)
  const [viewOpen, setViewOpen] = useState(false)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await getActiveMeterReadersWithStats()
      setReaders(data)
    } catch {
      toast.error('Failed to load meter readers')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = useMemo(() => {
    const q = debouncedSearchQuery.trim().toLowerCase()
    if (!q) return readers
    return readers.filter((r) =>
      `${r.first_name} ${r.last_name}`.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q),
    )
  }, [readers, debouncedSearchQuery])

  useEffect(() => { setPage(1) }, [filtered.length])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginated = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  )

  const hasActiveFilters = debouncedSearchQuery.trim().length > 0
  const isSearchActive = debouncedSearchQuery.trim().length > 0 || searchFocused

  const openAssign = (reader: MeterReaderRow) => {
    setActiveReader(reader)
    setAssignOpen(true)
  }

  const openView = (reader: MeterReaderRow) => {
    setActiveReader(reader)
    setViewOpen(true)
  }


  return (
    <div className="w-full space-y-5">

      <PageHeading title="Assignment" description="Assign meter readers to their zones" />

      {/* Toolbar — no "New Assignment" button; assigning happens per-reader via the row actions menu */}
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
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1) }}
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
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(''); setPage(1) }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-slate-100"
              >
                <X className="h-3 w-3 text-slate-400" />
              </button>
            )}
          </div>

          {hasActiveFilters && (
            <button
              onClick={() => { setSearchQuery(''); setPage(1) }}
              className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-xs text-slate-400 hover:text-violet-600 hover:bg-violet-50"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">

        <div className="px-5 py-3 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-white flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-violet-100 border border-violet-200 flex items-center justify-center">
              <Users className="h-3 w-3 text-violet-500" />
            </div>
            <p className="text-xs text-slate-500">
              {isLoading ? (
                <span className="inline-block h-3 w-24 bg-slate-100 animate-pulse rounded-full" />
              ) : (
                <>
                  <span className="font-semibold text-slate-700">{filtered.length}</span>
                  {' '}meter reader{filtered.length !== 1 ? 's' : ''}
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

        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/40">
              <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Meter Reader</TableHead>
              <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Active Zones</TableHead>
              <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Total Zones</TableHead>
              <TableHead className="w-16">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>

            {isLoading && [...Array(5)].map((_, i) => (
              <TableRow key={i}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="h-7 w-7 rounded-md bg-slate-100 animate-pulse" />
                    <div className="h-3.5 w-36 bg-slate-100 animate-pulse rounded-full" />
                  </div>
                </TableCell>
                <TableCell><div className="h-6 w-12 bg-slate-100 animate-pulse rounded-full" /></TableCell>
                <TableCell><div className="h-6 w-12 bg-slate-100 animate-pulse rounded-full" /></TableCell>
                <TableCell><div className="h-7 w-7 bg-slate-100 animate-pulse rounded-md" /></TableCell>
              </TableRow>
            ))}

            {!isLoading && readers.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="h-72 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-12 w-12 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center">
                      <Users className="h-5 w-5 text-violet-300" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-600">No active meter readers</p>
                      <p className="text-xs text-slate-400 mt-1">Meter readers appear here once their user accounts are active.</p>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            )}

            {!isLoading && readers.length > 0 && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="h-64 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-12 w-12 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center">
                      <Search className="h-5 w-5 text-violet-300" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-600">No results</p>
                      <p className="text-xs text-slate-400 mt-1">No readers match your search.</p>
                    </div>
                    <button
                      onClick={() => setSearchQuery('')}
                      className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-xs font-medium text-violet-600 bg-violet-50 border border-violet-200 hover:bg-violet-100"
                    >
                      Clear search
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            )}

            {!isLoading && paginated.map((reader) => (
              <TableRow
                key={reader.user_id}
                className="border-t border-slate-100 hover:bg-violet-50/40 transition-colors"
              >
                <TableCell className="py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-7 w-7 rounded-md bg-violet-100 flex items-center justify-center shrink-0">
                      <Users className="h-3.5 w-3.5 text-violet-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-medium text-slate-700 truncate">
                        {reader.first_name} {reader.last_name}
                      </p>
                      <p className="text-[10px] text-slate-400 flex items-center gap-1 min-w-0">
                        <Mail className="h-2.5 w-2.5 shrink-0" />
                        <span className="truncate">{reader.email}</span>
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-3">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold border bg-emerald-50 text-emerald-700 border-emerald-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {reader.active_zone_count}
                  </span>
                </TableCell>
                <TableCell className="py-3 text-[12.5px] text-slate-500">
                  {reader.total_zone_count}
                </TableCell>
                <TableCell className="py-3">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-md text-slate-400 hover:text-violet-600 hover:bg-violet-50"
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44 rounded-md p-1.5">
                      <DropdownMenuLabel className="text-[9px] font-bold uppercase tracking-widest text-violet-400 px-2 py-1.5">
                        Actions
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator className="mb-1" />
                      <DropdownMenuItem
                        onSelect={() => openAssign(reader)}
                        className="cursor-pointer rounded-md text-xs text-slate-500 focus:bg-violet-50 focus:text-violet-700 dark:focus:bg-accent dark:focus:text-accent-foreground py-2 gap-2"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Assign Zone
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => openView(reader)}
                        className="cursor-pointer rounded-md text-xs text-slate-500 focus:bg-violet-50 focus:text-violet-700 dark:focus:bg-accent dark:focus:text-accent-foreground py-2 gap-2"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View Details
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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

      {/* Row-action sheets — controlled here so only one instance exists for the active reader */}
      {activeReader && (
        <>
          <AssignZoneForm
            open={assignOpen}
            onOpenChange={setAssignOpen}
            readerId={activeReader.user_id}
            readerName={`${activeReader.first_name} ${activeReader.last_name}`}
            readerEmail={activeReader.email}
            onSuccess={fetchData}
          />
          <ViewReaderZonesDialog
            open={viewOpen}
            onOpenChange={setViewOpen}
            readerId={activeReader.user_id}
            readerName={`${activeReader.first_name} ${activeReader.last_name}`}
            readerEmail={activeReader.email}
            onSuccess={fetchData}
          />
        </>
      )}
    </div>
  )
}

export default MeterReaderAssignmentsPage