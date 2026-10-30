'use client'

import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'


import { TablePagination } from '@/components/shared-ui/pagination'
import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  MoreHorizontal,
  Search,
  Wrench,
  Edit,
  Power,
  PowerOff,
  Trash2,
  SlidersHorizontal,
  ChevronDown,
  X,
  User,
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
import { cn } from '@/lib/utils'
import CreateUserSkillForm from '@/components/admin-ui/user-skills/create.user-skill.form'
import UpdateUserSkillForm from '@/components/admin-ui/user-skills/update.user-skill.form'
import UserSkillStatusModal from '@/components/admin-ui/user-skills/user-skill-status-modal'
import {
  getAllUserSkills,
  toggleUserSkillStatus,
} from '@/lib/actions/user-skill.actions'
import { toast } from 'sonner'
import { format } from 'date-fns'

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserSkill {
  user_skill_id: string
  user_id:       string
  skill_id:      string
  is_active:     boolean
  created_at:    string
  user: {
    user_id:    string
    first_name: string
    last_name:  string
  }
  skill: {
    skill_id:   string
    skill_name: string
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatDate = (d: string) => format(new Date(d), 'MMM dd, yyyy')

// ─── Filters Panel ────────────────────────────────────────────────────────────

function FiltersPanel({
  statusFilter,
  onStatusChange,
}: {
  statusFilter:   string
  onStatusChange: (v: string) => void
}) {
  const active = statusFilter !== 'all'

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

      <DropdownMenuContent align="end" className="w-44 rounded-md p-1.5">
        <DropdownMenuLabel className="text-[9px] font-bold uppercase tracking-widest text-violet-400 px-2 py-1.5">
          Status
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="mb-1" />
        <DropdownMenuRadioGroup value={statusFilter} onValueChange={onStatusChange}>
          <DropdownMenuRadioItem
            value="all"
            className={cn(
              'cursor-pointer rounded-md text-xs',
              statusFilter === 'all' && 'text-violet-600 font-medium bg-violet-50',
            )}
          >
            All Statuses
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem
            value="active"
            className={cn(
              'cursor-pointer rounded-md text-xs',
              statusFilter === 'active' && 'text-violet-600 font-medium bg-violet-50',
            )}
          >
            Active
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem
            value="inactive"
            className={cn(
              'cursor-pointer rounded-md text-xs',
              statusFilter === 'inactive' && 'text-violet-600 font-medium bg-violet-50',
            )}
          >
            Inactive
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

const UserSkillsPage = () => {
  const [userSkills,         setUserSkills]         = useState<UserSkill[]>([])
  const [search,             setSearch]             = useState('')
  const debouncedSearch = useDebouncedSearch(search)
  const [searchFocused,      setSearchFocused]      = useState(false)
  const [statusFilter,       setStatusFilter]       = useState('all')
  const [isLoading,          setIsLoading]          = useState(true)
  const [selected,           setSelected]           = useState<UserSkill | null>(null)
  const [isEditSheetOpen,    setIsEditSheetOpen]    = useState(false)
  const [isStatusModalOpen,  setIsStatusModalOpen]  = useState(false)
  const [isProcessingStatus, setIsProcessingStatus] = useState(false)
  const [page,     setPage]     = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // ── Fetch ──────────────────────────────────────────────────
  const fetchUserSkills = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await getAllUserSkills()
      setUserSkills(response)
    } catch {
      toast.error('Failed to load worker skills')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchUserSkills() }, [fetchUserSkills])

  // ── Clear all ──────────────────────────────────────────────
  const clearAll = useCallback(() => {
    setSearch('')
    setStatusFilter('all')
    setPage(1)
  }, [])

  // ── Filtering ─────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    return userSkills.filter((us) => {
      const fullName = `${us.user.first_name} ${us.user.last_name}`.toLowerCase()
      if (q && !fullName.includes(q) && !us.skill.skill_name.toLowerCase().includes(q)) return false
      if (statusFilter === 'active'   && !us.is_active) return false
      if (statusFilter === 'inactive' &&  us.is_active) return false
      return true
    })
  }, [userSkills, debouncedSearch, statusFilter])

  useEffect(() => { setPage(1) }, [filtered.length])

  // ── Pagination ────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage   = Math.min(page, totalPages)

  const paginated = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  )


  // ── Derived flags ──────────────────────────────────────────
  const hasActiveFilters = debouncedSearch.trim().length > 0 || statusFilter !== 'all'
  const isSearchActive = debouncedSearch.trim().length > 0 || searchFocused
  const isNonDefaultPageSize = pageSize !== 10

  // ── Toggle status ─────────────────────────────────────────
  const handleToggleStatus = async () => {
    if (!selected) return
    setIsProcessingStatus(true)
    try {
      const result = await toggleUserSkillStatus(selected.user_skill_id, selected.is_active)
      if (result.status === 'success') {
        toast.success(`Skill ${selected.is_active ? 'deactivated' : 'activated'} successfully`)
        setIsStatusModalOpen(false)
        fetchUserSkills()
      } else {
        toast.error(result.message || 'Failed to update status')
      }
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setIsProcessingStatus(false)
      setSelected(null)
    }
  }

  // ── Handlers ──────────────────────────────────────────────
  const handleEdit         = (us: UserSkill) => { setSelected(us); setIsEditSheetOpen(true)   }
  const handleStatusClick  = (us: UserSkill) => { setSelected(us); setIsStatusModalOpen(true) }

  // ── Skeleton ──────────────────────────────────────────────
  const renderSkeletonRows = () =>
    [...Array(5)].map((_, i) => (
      <TableRow key={i} className="border-t border-slate-100">
        {[...Array(5)].map((__, j) => (
          <TableCell key={j} className="py-3">
            <div className="h-3.5 w-full bg-slate-100 animate-pulse rounded-full" />
          </TableCell>
        ))}
      </TableRow>
    ))

  // ─── JSX ─────────────────────────────────────────────────

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
              placeholder="Search by worker or skill..."
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
            statusFilter={statusFilter}
            onStatusChange={(v) => { setStatusFilter(v); setPage(1) }}
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

        <CreateUserSkillForm onSuccess={fetchUserSkills} />
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">

        {/* Table header bar */}
        <div className="px-5 py-3 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-violet-100 border border-violet-200 flex items-center justify-center">
              <Wrench className="h-3 w-3 text-violet-500" />
            </div>
            <p className="text-xs text-slate-500">
              {isLoading ? (
                <span className="inline-block h-3 w-24 bg-slate-100 animate-pulse rounded-full" />
              ) : (
                <>
                  <span className="font-semibold text-slate-700">{filtered.length}</span>
                  {' '}assignment{filtered.length !== 1 ? 's' : ''}
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
                  isNonDefaultPageSize && 'border-violet-300 text-violet-600',
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

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/40">
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Worker</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Skill</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Status</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Assigned</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>

              {isLoading ? (
                renderSkeletonRows()
              ) : userSkills.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-72 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-12 w-12 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center">
                        <Wrench className="h-5 w-5 text-violet-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-600">No skill assignments yet</p>
                        <p className="text-xs text-slate-400 mt-1">Create your first assignment to get started.</p>
                      </div>
                      <CreateUserSkillForm onSuccess={fetchUserSkills} />
                    </div>
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-64 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-12 w-12 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center">
                        <Search className="h-5 w-5 text-violet-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-600">No results</p>
                        <p className="text-xs text-slate-400 mt-1">No assignments match your filters.</p>
                      </div>
                      <button
                        onClick={clearAll}
                        className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-xs font-medium text-violet-600 bg-violet-50 border border-violet-200 hover:bg-violet-100"
                      >
                        Clear filters
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((us) => (
                  <TableRow key={us.user_skill_id} className="border-t border-slate-100 hover:bg-violet-50/40 transition-colors">
                    <TableCell className="py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-7 w-7 rounded-md bg-violet-100 flex items-center justify-center shrink-0">
                          <User className="h-3.5 w-3.5 text-violet-600" />
                        </div>
                        <span className="text-[12.5px] font-medium text-slate-700">
                          {us.user.first_name} {us.user.last_name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="flex items-center gap-2">
                        <Wrench className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="text-[12.5px] text-slate-600">{us.skill.skill_name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      <span className={cn(
                        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold border',
                        us.is_active
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-50 text-slate-400 border-slate-200',
                      )}>
                        <span className={cn(
                          'h-1.5 w-1.5 rounded-full',
                          us.is_active ? 'bg-emerald-500' : 'bg-slate-300',
                        )} />
                        {us.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </TableCell>
                    <TableCell className="py-3 text-[12.5px] text-slate-500">
                      {formatDate(us.created_at)}
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
                            onClick={() => handleEdit(us)}
                            className="cursor-pointer rounded-md text-xs text-slate-500 focus:bg-violet-50 focus:text-violet-700 dark:focus:bg-accent dark:focus:text-accent-foreground py-2 gap-2"
                          >
                            <Edit className="h-3.5 w-3.5" />
                            Edit assignment
                          </DropdownMenuItem>

                          <DropdownMenuItem
                            onClick={() => handleStatusClick(us)}
                            className={cn(
                              'cursor-pointer rounded-md text-xs py-2 gap-2',
                              us.is_active
                                ? 'text-rose-600 focus:text-rose-700'
                                : 'text-emerald-600 focus:text-emerald-700',
                            )}
                          >
                            {us.is_active ? (
                              <><PowerOff className="h-3.5 w-3.5" /> Deactivate</>
                            ) : (
                              <><Power className="h-3.5 w-3.5" /> Activate</>
                            )}
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
          page={safePage}
          pageSize={pageSize}
          total={filtered.length}
          onPageChange={setPage}
        />
      )}

      {/* Edit Sheet */}
      {selected && (
        <UpdateUserSkillForm
          userSkill={selected}
          isOpen={isEditSheetOpen}
          onOpenChange={setIsEditSheetOpen}
          onSuccess={fetchUserSkills}
        />
      )}

      {/* Status Modal */}
      <UserSkillStatusModal
        isOpen={isStatusModalOpen}
        setIsOpen={setIsStatusModalOpen}
        userSkill={selected}
        onConfirm={handleToggleStatus}
        isLoading={isProcessingStatus}
      />

    </div>
  )
}

export default UserSkillsPage