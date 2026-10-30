'use client'

import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'


import { TablePagination } from '@/components/shared-ui/pagination'
import React, { useState, useEffect, useCallback } from 'react'
import { Search, X, Layers, Eye, Edit2, MoreHorizontal, TrendingUp, Plus } from 'lucide-react'
import { toast } from 'sonner'

import { Input }     from '@/components/ui/input'
import { Button }    from '@/components/ui/button'
import { Badge }     from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import {
  getClassificationsWithChargeSummary,
  getChargesByClassification,
  type ClassificationSummary,
  type TierDetail,
} from '@/lib/actions/community-charges.actions'
import CreateCommunityChargeForm    from '@/components/admin-ui/community-charges/create.community-charge.form'
import UpdateCommunityChargeForm    from '@/components/admin-ui/community-charges/update.community-charge.form'
import ViewCommunityChargeDialog   from '@/components/admin-ui/community-charges/view.community-charge.dialog'

// ============================================================================
// Helpers
// ============================================================================

function formatRange(min: number | null, max: number | null): string {
  if (min === null) return '—'
  if (max === null) return `${min} – ∞`
  return `${min} – ${max}`
}

function formatRate(min: number | null, max: number | null): string {
  if (min === null) return '—'
  if (min === max)  return `₱${min!.toFixed(2)}`
  return `₱${min!.toFixed(2)} – ₱${max!.toFixed(2)}`
}

// ============================================================================
// Sheet state discriminated union
// ============================================================================

type SheetState =
  | { type: 'view'; cls: ClassificationSummary }
  | { type: 'edit'; charge: TierDetail }
  | null

// ============================================================================
// Skeleton rows
// ============================================================================

function SkeletonRows() {
  return (
    <>
      {[...Array(5)].map((_, i) => (
        <TableRow key={i} className="border-t border-slate-100">
          {[...Array(5)].map((_, j) => (
            <TableCell key={j} className="py-3">
              <div className="h-3.5 w-full bg-slate-100 animate-pulse rounded-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}

// ============================================================================
// Main Page
// ============================================================================

const CommunityChargesPage = () => {
  const [rows, setRows]           = useState<ClassificationSummary[]>([])
  const [filtered, setFiltered]   = useState<ClassificationSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch]       = useState('')
  const debouncedSearch = useDebouncedSearch(search)
  const [searchFocused, setSearchFocused] = useState(false)
  const [page, setPage]           = useState(1)
  const pageSize                  = 10

  const [sheet, setSheet]             = useState<SheetState>(null)
  const [editSheetOpen, setEditSheetOpen] = useState(false)

  // Derive a flat classifications list for the Create / Update forms
  const classifications = rows.map((r) => ({
    classification_id:   r.classification_id,
    classification_name: r.classification_name,
    description:         r.description,
  }))

  // ── Fetch summary data ───────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await getClassificationsWithChargeSummary()
      if (res.status === 'success') {
        setRows(res.data)
      } else {
        toast.error('Failed to load data.')
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Filter: exclude zero-tier rows + apply search ────────────────────────
  useEffect(() => {
    const withTiers = rows.filter((r) => r.tier_count > 0)
    const q         = debouncedSearch.trim().toLowerCase()
    setFiltered(
      q ? withTiers.filter((r) => r.classification_name.toLowerCase().includes(q)) : withTiers
    )
    setPage(1)
  }, [debouncedSearch, rows])

  // ── Open edit sheet: load first tier of the classification ───────────────
  const handleOpenEdit = useCallback(async (cls: ClassificationSummary) => {
    const res = await getChargesByClassification(cls.classification_id)

    if (res.status !== 'success') {
      toast.error('Failed to load charge data.')
      return
    }

    const first = res.data.tiers[0] as TierDetail | undefined

    if (!first) {
      toast.info('No tiers yet — add one using "Add Community Charge" first.')
      return
    }

    setSheet({
      type:   'edit',
      charge: { ...first, classification_id: cls.classification_id },
    })
    setEditSheetOpen(true)
  }, [])

  // ── Pagination ───────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paginated  = filtered.slice((page - 1) * pageSize, page * pageSize)


  const isSearchActive = search.length > 0 || searchFocused
  const hasActiveFilters = search.length > 0

  // ── Render ───────────────────────────────────────────────────────────────
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
              placeholder="Search classification..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
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
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-slate-100"
              >
                <X className="h-3 w-3 text-slate-400" />
              </button>
            )}
          </div>

          {hasActiveFilters && (
            <button
              onClick={() => setSearch('')}
              className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-xs text-slate-400 hover:text-violet-600 hover:bg-violet-50"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>

        {/* Create Button */}
        <CreateCommunityChargeForm
          classifications={classifications}
          onSuccess={fetchData}
        >
          <Button className="h-8 gap-1.5 rounded-md bg-violet-600 hover:bg-violet-700 text-white text-xs">
            <Plus className="h-3.5 w-3.5" /> Add Rate Tier
          </Button>
        </CreateCommunityChargeForm>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">

        {/* Table header bar */}
        <div className="px-5 py-3 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-violet-100 border border-violet-200 flex items-center justify-center">
              <TrendingUp className="h-3 w-3 text-violet-500" />
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
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/40">
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Classification</TableHead>
                <TableHead className="text-center text-[9px] font-bold text-slate-400 uppercase tracking-wider">Tiers</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Consumption Range (m³)</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Rate (₱/m³)</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {isLoading ? (
                <SkeletonRows />
              ) : paginated.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-64 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-12 w-12 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center">
                        <TrendingUp className="h-5 w-5 text-violet-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-600">
                          {search ? 'No results found' : 'No rate tiers configured'}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          {search
                            ? `No classifications match "${search}".`
                            : 'No classifications with configured tiers yet.'}
                        </p>
                      </div>
                      {search && (
                        <button
                          onClick={() => setSearch('')}
                          className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-xs font-medium text-violet-600 bg-violet-50 border border-violet-200 hover:bg-violet-100"
                        >
                          Clear search
                        </button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((cls) => (
                  <TableRow
                    key={cls.classification_id}
                    className="border-t border-slate-100 hover:bg-violet-50/40 transition-colors"
                  >
                    {/* Classification name + description */}
                    <TableCell className="py-3">
                      <div>
                        <p className="text-[12.5px] font-medium text-slate-800">{cls.classification_name}</p>
                        {cls.description && (
                          <p className="text-[10px] text-slate-400 mt-0.5 max-w-xs truncate" title={cls.description}>
                            {cls.description}
                          </p>
                        )}
                      </div>
                    </TableCell>

                    {/* Tier count badge */}
                    <TableCell className="text-center py-3">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-semibold bg-violet-50 text-violet-700 border border-violet-200">
                        {cls.tier_count} tier{cls.tier_count !== 1 ? 's' : ''}
                      </span>
                    </TableCell>

                    {/* Consumption range */}
                    <TableCell className="py-3">
                      <span className="text-[12.5px] font-mono text-slate-600">
                        {formatRange(cls.range_min, cls.range_max)}
                      </span>
                    </TableCell>

                    {/* Rate range */}
                    <TableCell className="py-3">
                      <span className="text-[12.5px] font-mono text-slate-600">
                        {formatRate(cls.multiplier_min, cls.multiplier_max)}
                      </span>
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="py-3" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md text-slate-400 hover:text-violet-600 hover:bg-violet-50">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44 rounded-md p-1.5">
                          <DropdownMenuLabel className="text-[9px] font-bold uppercase tracking-widest text-violet-400 px-2 py-1.5">
                            Actions
                          </DropdownMenuLabel>
                          <DropdownMenuSeparator className="mb-1" />

                          <DropdownMenuItem
                            className="cursor-pointer rounded-md text-xs text-slate-500 focus:bg-violet-50 focus:text-violet-700 dark:focus:bg-accent dark:focus:text-accent-foreground py-2 gap-2"
                            onClick={() => setSheet({ type: 'view', cls })}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            View details
                          </DropdownMenuItem>

                          <DropdownMenuItem
                            className="cursor-pointer rounded-md text-xs text-slate-500 focus:bg-violet-50 focus:text-violet-700 dark:focus:bg-accent dark:focus:text-accent-foreground py-2 gap-2"
                            onClick={() => handleOpenEdit(cls)}
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                            Edit rates
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination */}
      {!isLoading && (
        <TablePagination
          page={page}
          pageSize={pageSize}
          total={filtered.length}
          onPageChange={setPage}
        />
      )}

      {/* View Dialog */}
      {sheet?.type === 'view' && (
        <ViewCommunityChargeDialog
          classificationId={sheet.cls.classification_id}
          classificationName={sheet.cls.classification_name}
          description={sheet.cls.description}
          tierCount={sheet.cls.tier_count}
          open
          onOpenChange={(v) => { if (!v) setSheet(null) }}
        />
      )}

      {/* Edit Sheet */}
      {sheet?.type === 'edit' && (
        <UpdateCommunityChargeForm
          charge={sheet.charge}
          classifications={classifications}
          isOpen={editSheetOpen}
          onOpenChange={(open) => {
            setEditSheetOpen(open)
            if (!open) setSheet(null)
          }}
          onSuccess={() => {
            setSheet(null)
            setEditSheetOpen(false)
            fetchData()
          }}
        />
      )}
    </div>
  )
}

export default CommunityChargesPage