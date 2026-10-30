'use client'

import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'


import { TablePagination } from '@/components/shared-ui/pagination'
import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  MoreHorizontal,
  Search,
  Users,
  Edit,
  Eye,
  PhilippinePeso,
  X,
  SlidersHorizontal,
  ChevronDown,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import CreateClassificationForm from '@/components/admin-ui/classifications/create.classification.form'
import UpdateClassificationForm from '@/components/admin-ui/classifications/update.classification.form'
import { getAllClassifications, Classification } from '@/lib/actions/classifications/classifications.actions'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(amount)

// ── Filters Panel ──────────────────────────────────────────────────────────

function FiltersPanel({
  search,
  onClearSearch,
}: {
  search: string
  onClearSearch: () => void
}) {
  const active = search.length > 0

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-9 gap-1.5 text-sm font-medium transition-all rounded-md',
            active && [
              'border-violet-400 bg-violet-50 text-violet-700',
              'hover:bg-violet-100 hover:border-violet-500',
            ],
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
          Filters
          {active && (
            <span className="inline-flex items-center justify-center h-[18px] min-w-[18px] px-1 rounded-full bg-violet-600 text-white text-[11px] font-semibold leading-none">
              1
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-52 rounded-md p-1.5">
        <DropdownMenuLabel className="text-[9px] font-bold uppercase tracking-widest text-violet-400 px-2 py-1.5">
          Search Filter
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="mb-1" />
        <div className="px-2 py-1.5">
          <p className="text-xs text-slate-500 mb-1">Search term:</p>
          <p className="text-sm font-medium text-slate-700 break-all">{search || '(none)'}</p>
        </div>
        {search && (
          <>
            <DropdownMenuSeparator className="my-1" />
            <DropdownMenuItem
              onClick={onClearSearch}
              className="cursor-pointer rounded-md text-xs text-rose-600 focus:bg-rose-50 focus:text-rose-700 py-2 gap-2"
            >
              <X className="h-3 w-3" /> Clear search
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────

const ConsumerClassificationsPage = () => {
  const [classifications, setClassifications] = useState<Classification[]>([])
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedSearch(search)
  const [searchFocused, setSearchFocused] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const router = useRouter()

  const fetchClassifications = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await getAllClassifications()
      setClassifications(response)
    } catch {
      toast.error('Failed to load consumer classifications')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchClassifications() }, [fetchClassifications])

  const clearAll = useCallback(() => {
    setSearch('')
    setPage(1)
  }, [])

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    if (!q) return classifications
    return classifications.filter((c) =>
      c.classification_name.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q)
    )
  }, [classifications, debouncedSearch])

  useEffect(() => { setPage(1) }, [filtered.length])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginated = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  )

  const hasActiveFilters = debouncedSearch.trim().length > 0
  const isSearchActive = debouncedSearch.trim().length > 0 || searchFocused


  return (
    <div className="w-full space-y-5">

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1">

          {/* Search */}
          <div className="relative w-full min-w-0 sm:w-auto sm:flex-1 sm:max-w-sm">
            <Search
              className={cn(
                'absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 transition-colors',
                isSearchActive ? 'text-violet-400' : 'text-slate-300',
              )}
            />
            <Input
              placeholder="Search classifications..."
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
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-slate-100"
              >
                <X className="h-3 w-3 text-slate-400" />
              </button>
            )}
          </div>

          <div className="hidden sm:block h-4 w-px bg-slate-200" />

          <FiltersPanel
            search={search}
            onClearSearch={() => { setSearch(''); setPage(1) }}
          />

          {hasActiveFilters && (
            <button
              onClick={clearAll}
              className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-xs text-slate-400 hover:text-violet-600 hover:bg-violet-50"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>

        <CreateClassificationForm onSuccess={fetchClassifications}>
          <Button className="h-9 gap-2 rounded-md bg-violet-600 hover:bg-violet-700 text-white shadow-sm shadow-violet-200 transition-all">
            <Users className="h-4 w-4" />
            Add Classification
          </Button>
        </CreateClassificationForm>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">

        {/* Table header bar */}
        <div className="px-5 py-3 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-white flex items-center justify-between">
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
                  {' '}classification{filtered.length !== 1 ? 's' : ''}
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
              <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                Classification
              </TableHead>
              <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                Description
              </TableHead>
              <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                Connection Fee
              </TableHead>
              <TableHead className="w-12">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>

            {/* Loading skeletons */}
            {isLoading && [...Array(5)].map((_, i) => (
              <TableRow key={i}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="h-7 w-7 rounded-md bg-slate-100 animate-pulse" />
                    <div className="h-3.5 w-36 bg-slate-100 animate-pulse rounded-full" />
                  </div>
                </TableCell>
                <TableCell><div className="h-3.5 w-48 bg-slate-100 animate-pulse rounded-full" /></TableCell>
                <TableCell><div className="h-6 w-20 bg-slate-100 animate-pulse rounded-full" /></TableCell>
                <TableCell><div className="h-7 w-7 bg-slate-100 animate-pulse rounded-md" /></TableCell>
              </TableRow>
            ))}

            {/* Empty — no classifications */}
            {!isLoading && classifications.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="h-72 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-12 w-12 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center">
                      <Users className="h-5 w-5 text-violet-300" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-600">No classifications yet</p>
                      <p className="text-xs text-slate-400 mt-1">Create your first consumer classification to get started.</p>
                    </div>
                    <CreateClassificationForm onSuccess={fetchClassifications}>
                      <Button className="h-9 gap-2 rounded-md bg-violet-600 hover:bg-violet-700 text-white shadow-sm shadow-violet-200 transition-all">
                        <Users className="h-4 w-4" />
                        Add Classification
                      </Button>
                    </CreateClassificationForm>
                  </div>
                </TableCell>
              </TableRow>
            )}

            {/* Empty — no results */}
            {!isLoading && classifications.length > 0 && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="h-64 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-12 w-12 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center">
                      <Search className="h-5 w-5 text-violet-300" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-600">No results</p>
                      <p className="text-xs text-slate-400 mt-1">No classifications match your search.</p>
                    </div>
                    <button
                      onClick={clearAll}
                      className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-xs font-medium text-violet-600 bg-violet-50 border border-violet-200 hover:bg-violet-100"
                    >
                      Clear search
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            )}

            {/* Data rows */}
            {!isLoading && paginated.map((classification) => (
              <TableRow
                key={classification.classification_id}
                className="border-t border-slate-100 hover:bg-violet-50/40 transition-colors cursor-pointer"
                onClick={() => router.push(`/admin/classifications/${classification.classification_id}`)}
              >
                <TableCell className="py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-7 w-7 rounded-md bg-violet-100 flex items-center justify-center shrink-0">
                      <Users className="h-3.5 w-3.5 text-violet-600" />
                    </div>
                    <span className="text-[12.5px] font-medium text-slate-700">
                      {classification.classification_name}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="py-3">
                  <p className="text-xs text-slate-500 line-clamp-2 max-w-md">
                    {classification.description}
                  </p>
                </TableCell>
                <TableCell className="py-3">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <PhilippinePeso className="h-3 w-3" />
                    {formatCurrency(classification.connection_fee)}
                  </span>
                </TableCell>
                <TableCell className="py-3" onClick={(e) => e.stopPropagation()}>
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

                      {/* <DropdownMenuItem
                        className="cursor-pointer rounded-md text-xs text-slate-500 focus:bg-violet-50 focus:text-violet-700 dark:focus:bg-accent dark:focus:text-accent-foreground py-2 gap-2"
                        onClick={() => router.push(`/admin/classifications/${classification.classification_id}`)}
                      >
                        <div className="h-6 w-6 rounded-md bg-slate-100 flex items-center justify-center">
                          <Eye className="h-3 w-3 text-slate-500" />
                        </div>
                        <span>View details</span>
                      </DropdownMenuItem> */}

                      <DropdownMenuItem
                        className="cursor-pointer rounded-md text-xs text-slate-500 focus:bg-violet-50 focus:text-violet-700 dark:focus:bg-accent dark:focus:text-accent-foreground p-0"
                        onSelect={(e) => e.preventDefault()}
                      >
                        <UpdateClassificationForm
                          classificationId={classification.classification_id}
                          onSuccess={fetchClassifications}
                        >
                          <div className="flex items-center gap-2 w-full px-2 py-2">
                            <div className="h-6 w-6 rounded-md bg-slate-100 flex items-center justify-center">
                              <Edit className="h-3 w-3 text-slate-500" />
                            </div>
                            <span>Edit classification</span>
                          </div>
                        </UpdateClassificationForm>
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
    </div>
  )
}

export default ConsumerClassificationsPage