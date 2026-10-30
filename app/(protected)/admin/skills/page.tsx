'use client'

import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'


import { TablePagination } from '@/components/shared-ui/pagination'
import { PageHeading } from '@/components/shared-ui/page-heading'
import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  MoreHorizontal,
  Search,
  Wrench,
  Edit,
  Eye,
  Power,
  PowerOff,
  SlidersHorizontal,
  ChevronDown,
  X,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import CreateSkillForm from '@/components/admin-ui/skills/create.skill.form'
import UpdateSkillForm from '@/components/admin-ui/skills/update.skill.form'
import { getAllSkills } from '@/lib/actions/skill.actions'
import { toast } from 'sonner'
import { format } from 'date-fns'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Skill {
  skill_id:    string
  skill_name:  string
  description: string | null
  is_active:   boolean
  created_at:  string
  updated_at?: string | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatDate = (d: string) => format(new Date(d), 'MMM dd, yyyy')

// ─── Component ───────────────────────────────────────────────────────────────

const SkillsPage = () => {
  const [skills,             setSkills]             = useState<Skill[]>([])
  const [search,             setSearch]             = useState('')
  const debouncedSearch = useDebouncedSearch(search)
  const [searchFocused,      setSearchFocused]      = useState(false)
  const [statusFilter,       setStatusFilter]       = useState('all')
  const [isLoading,          setIsLoading]          = useState(true)
  const [selectedSkill,      setSelectedSkill]      = useState<Skill | null>(null)
  const [isEditSheetOpen,    setIsEditSheetOpen]    = useState(false)
  const [page,     setPage]     = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // ── Fetch ──────────────────────────────────────────────────
  const fetchSkills = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await getAllSkills()
      setSkills(response)
    } catch {
      toast.error('Failed to load skills')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchSkills() }, [fetchSkills])

  // ── Clear all ──────────────────────────────────────────────
  const clearAll = useCallback(() => {
    setSearch('')
    setStatusFilter('all')
    setPage(1)
  }, [])

  // ── Filtering ─────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    return skills.filter((s) => {
      if (q && !s.skill_name.toLowerCase().includes(q) && !s.skill_id.toLowerCase().includes(q)) return false
      if (statusFilter === 'active'   && !s.is_active) return false
      if (statusFilter === 'inactive' &&  s.is_active) return false
      return true
    })
  }, [skills, debouncedSearch, statusFilter])

  useEffect(() => { setPage(1) }, [filtered.length])

  // ── Pagination ────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage   = Math.min(page, totalPages)

  const paginated = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  )


  // ── Derived flags ──────────────────────────────────────────
  const hasActiveFilters     = debouncedSearch.trim().length > 0 || statusFilter !== 'all'
  const isSearchActive       = debouncedSearch.trim().length > 0 || searchFocused
  const isNonDefaultPageSize = pageSize !== 10


  const handleEditSkill   = (s: Skill) => { setSelectedSkill(s); setIsEditSheetOpen(true)   }

  const handleEditSuccess = () => {
    setIsEditSheetOpen(false)
    setSelectedSkill(null)
    fetchSkills()
    toast.success('Skill updated successfully')
  }

  // ── Skeleton ──────────────────────────────────────────────
  const renderSkeletonRows = () =>
    [...Array(5)].map((_, i) => (
      <TableRow key={i}>
        {[...Array(4)].map((__, j) => (
          <TableCell key={j}><div className="h-4 w-full bg-muted animate-pulse rounded-lg" /></TableCell>
        ))}
      </TableRow>
    ))

  // ─── JSX ─────────────────────────────────────────────────

  return (
    <div className="w-full space-y-6">

      <PageHeading title="Skills" description="Manage worker skills and competencies" />

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1">

          {/* Search */}
          <div className="relative w-full min-w-0 sm:w-auto sm:flex-1 sm:max-w-sm">
            <Search className={cn(
              'absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors duration-150',
              isSearchActive ? 'text-purple-500 dark:text-purple-400' : 'text-muted-foreground',
            )} />
            <Input
              placeholder="Search skills..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              className={cn(
                'pl-9 h-9 transition-all duration-150 rounded-lg',
                isSearchActive
                  ? 'border-purple-400 ring-[3px] ring-purple-500/15 focus-visible:ring-[3px] focus-visible:ring-purple-500/20 focus-visible:border-purple-500 dark:border-purple-500 dark:ring-purple-400/20'
                  : 'focus-visible:ring-[3px] focus-visible:ring-purple-500/15 focus-visible:border-purple-400',
              )}
            />
            {search && (
              <button
                onClick={() => { setSearch(''); setPage(1) }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 hover:bg-muted transition-colors"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>

          {/* Clear all */}
          {hasActiveFilters && (
            <button
              onClick={clearAll}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              Clear all
            </button>
          )}
        </div>

        <CreateSkillForm onSuccess={fetchSkills} />
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">

        {/* Header bar */}
        <div className="px-4 py-3 border-b flex items-center justify-between bg-muted/30">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-primary" />
            <p className="text-sm text-muted-foreground">
              {isLoading ? 'Loading...' : (
                <>
                  <span className="font-medium text-foreground">{filtered.length}</span>
                  {' '}skill{filtered.length !== 1 ? 's' : ''}
                  {hasActiveFilters && ' matching filters'}
                </>
              )}
            </p>
          </div>

          {/* Rows per page */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="hidden sm:inline">Rows per page</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => { setPageSize(Number(v)); setPage(1) }}
            >
              <SelectTrigger
                className={cn(
                  'h-8 w-[70px] transition-all duration-150 rounded-lg',
                  isNonDefaultPageSize
                    ? 'border-purple-400 text-purple-700 ring-[3px] ring-purple-500/15 dark:border-purple-500 dark:text-purple-300 dark:ring-purple-400/20'
                    : 'focus:ring-[3px] focus:ring-purple-500/15 focus:border-purple-400',
                )}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-lg">
                {PAGE_SIZE_OPTIONS.map((s) => (
                  <SelectItem
                    key={s} value={String(s)}
                    className={cn('cursor-pointer rounded-lg', pageSize === s && 'text-purple-700 font-semibold dark:text-purple-300')}
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
            <TableRow>
              <TableHead>Skill Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              renderSkeletonRows()

            ) : skills.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-96 text-center">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <div className="rounded-lg bg-muted p-4 mb-2">
                      <Wrench className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-semibold">No skills yet</h3>
                    <p className="text-sm text-muted-foreground max-w-sm mb-2">
                      Get started by creating your first skill.
                    </p>
                    <CreateSkillForm onSuccess={fetchSkills} />
                  </div>
                </TableCell>
              </TableRow>

            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-64 text-center">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <div className="rounded-lg bg-muted p-4 mb-2">
                      <Search className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-semibold">No results found</h3>
                    <p className="text-sm text-muted-foreground max-w-sm mb-2">
                      No skills match your current filters.
                    </p>
                    <Button variant="outline" size="sm" className="rounded-lg" onClick={clearAll}>
                      Clear all filters
                    </Button>
                  </div>
                </TableCell>
              </TableRow>

            ) : (
              paginated.map((skill) => (
                <TableRow key={skill.skill_id} className="hover:bg-muted/30">

                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Wrench className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm font-medium">{skill.skill_name}</span>
                    </div>
                  </TableCell>

                  <TableCell className="text-sm text-muted-foreground max-w-xs">
                    <span className="line-clamp-1">
                      {skill.description ?? <span className="italic text-muted-foreground/60">No description</span>}
                    </span>
                  </TableCell>

                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(skill.created_at)}
                  </TableCell>

                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg">
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Open menu</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48 rounded-lg">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleEditSkill(skill)}
                          className="cursor-pointer rounded-lg"
                        >
                          <Edit className="mr-2 h-4 w-4" /> Edit skill
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination footer */}
      {!isLoading && (
        <TablePagination
          page={safePage}
          pageSize={pageSize}
          total={filtered.length}
          onPageChange={setPage}
        />
      )}

      {/* Edit Sheet */}
      {selectedSkill && (
        <UpdateSkillForm
          skill={selectedSkill}
          isOpen={isEditSheetOpen}
          onOpenChange={setIsEditSheetOpen}
          onSuccess={handleEditSuccess}
        />
      )}
    </div>
  )
}

export default SkillsPage