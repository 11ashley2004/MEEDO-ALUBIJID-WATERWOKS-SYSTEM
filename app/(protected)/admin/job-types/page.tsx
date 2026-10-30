'use client'

import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'

import { TablePagination } from '@/components/shared-ui/pagination'
import { PageHeading } from '@/components/shared-ui/page-heading'

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  MoreHorizontal,
  Search,
  Briefcase,
  Edit,
  SlidersHorizontal,
  ChevronDown,
  X,
  Users,
  Building2,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import CreateJobTypeForm from '@/components/admin-ui/job-types/create.job-type.form'
import UpdateJobTypeForm from '@/components/admin-ui/job-types/update.job-type.form'
import { getAllJobTypes } from '@/lib/actions/job-order/job-type.actions'
import { toast }         from 'sonner'
import { format }        from 'date-fns'

// ─── Types ────────────────────────────────────────────────────────────────────

interface JobType {
  job_type_id:   string
  job_type_name: string
  job_type_category: boolean
  created_at:   string
  skill?: { skill_id: string; skill_name: string } | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ROW_H             = 56
const HEAD_H            = 44
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

const CATEGORY_OPTIONS = [
  { val: 'all',      label: 'All Categories' },
  { val: 'consumer', label: 'Consumer'       },
  { val: 'internal', label: 'Internal'       },
] as const

const formatDate = (d: string) => format(new Date(d), 'MMM dd, yyyy')

// ─── Filters Panel ────────────────────────────────────────────────────────────

function FiltersPanel({
  skillFilter,    onSkillChange,
  categoryFilter, onCategoryChange,
  skillOptions,
}: {
  skillFilter:      string
  onSkillChange:    (v: string) => void
  categoryFilter:   string
  onCategoryChange: (v: string) => void
  skillOptions:     string[]
}) {
  const activeCount = [skillFilter !== 'all', categoryFilter !== 'all'].filter(Boolean).length

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline" size="sm"
          className={cn(
            'h-9 gap-2 text-sm font-medium rounded-xl border transition-all duration-150',
            activeCount > 0
              ? 'border-purple-300 bg-purple-50 text-purple-700 hover:bg-purple-100 hover:border-purple-400'
              : 'hover:border-slate-300 hover:bg-slate-50',
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
          Filters
          {activeCount > 0 && (
            <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-purple-600 text-white text-[10px] font-bold leading-none">
              {activeCount}
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-2xl p-1.5 shadow-xl shadow-slate-200/60">

        <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-2 py-1.5">
          Category
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={categoryFilter} onValueChange={onCategoryChange}>
          {CATEGORY_OPTIONS.map(({ val, label }) => (
            <DropdownMenuRadioItem key={val} value={val}
              className={cn('cursor-pointer rounded-xl text-sm', categoryFilter === val && 'text-purple-700 font-semibold bg-purple-50')}
            >{label}</DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator className="my-1.5" />

        <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-2 py-1.5">
          Skill
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={skillFilter} onValueChange={onSkillChange}>
          <DropdownMenuRadioItem value="all"
            className={cn('cursor-pointer rounded-xl text-sm', skillFilter === 'all' && 'text-purple-700 font-semibold bg-purple-50')}
          >All Skills</DropdownMenuRadioItem>
          {skillOptions.map((skill) => (
            <DropdownMenuRadioItem key={skill} value={skill}
              className={cn('cursor-pointer rounded-xl text-sm capitalize', skillFilter === skill && 'text-purple-700 font-semibold bg-purple-50')}
            >{skill}</DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const JobTypesPage = () => {
  const [jobTypes,        setJobTypes]        = useState<JobType[]>([])
  const [search,          setSearch]          = useState('')
  const debouncedSearch = useDebouncedSearch(search)
  const [searchFocused,   setSearchFocused]   = useState(false)
  const [skillFilter,     setSkillFilter]     = useState('all')
  const [categoryFilter,  setCategoryFilter]  = useState('all')
  const [isLoading,       setIsLoading]       = useState(true)
  const [selectedJobType, setSelectedJobType] = useState<JobType | null>(null)
  const [isEditOpen,      setIsEditOpen]      = useState(false)
  const [hoveredRow,      setHoveredRow]      = useState<string | null>(null)
  const [openDropdown,    setOpenDropdown]    = useState<string | null>(null)
  const [page,            setPage]            = useState(1)
  const [pageSize,        setPageSize]        = useState(10)

  const fetchJobTypes = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await getAllJobTypes()
      setJobTypes(response as JobType[])
    } catch {
      toast.error('Failed to load job types')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchJobTypes() }, [fetchJobTypes])

  const skillOptions = useMemo(() => {
    const skills = jobTypes.map((j) => j.skill?.skill_name).filter((s): s is string => !!s)
    return Array.from(new Set(skills)).sort()
  }, [jobTypes])

  const clearAll = useCallback(() => {
    setSearch(''); setSkillFilter('all'); setCategoryFilter('all'); setPage(1)
  }, [])

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    return jobTypes.filter((j) => {
      if (q &&
        !j.job_type_name.toLowerCase().includes(q) &&
        !(j.skill?.skill_name.toLowerCase().includes(q))
      ) return false
      if (categoryFilter !== 'all') {
        const categoryBool = categoryFilter === 'consumer'
        if (j.job_type_category !== categoryBool) return false
      }
      if (skillFilter    !== 'all' && j.skill?.skill_name !== skillFilter) return false
      return true
    })
  }, [jobTypes, debouncedSearch, skillFilter, categoryFilter])

  useEffect(() => { setPage(1) }, [filtered.length])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage   = Math.min(page, totalPages)
  const paginated  = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  )


  const hasActiveFilters     = debouncedSearch.trim().length > 0 || skillFilter !== 'all' || categoryFilter !== 'all'
  const isSearchActive       = debouncedSearch.trim().length > 0 || searchFocused
  const isNonDefaultPageSize = pageSize !== 10

  const handleMouseEnter = (id: string) => { if (!openDropdown) setHoveredRow(id) }
  const handleMouseLeave = ()            => { if (!openDropdown) setHoveredRow(null) }
  const isHovered        = (id: string) => hoveredRow === id || openDropdown === id

  const handleEdit    = (j: JobType) => { setSelectedJobType(j); setIsEditOpen(true) }
  const handleSuccess = () => { setIsEditOpen(false); setSelectedJobType(null); fetchJobTypes() }

  return (
    <div className="w-full space-y-6">

      {/* Page Header */}
      <PageHeading title="Job Types" description="Manage job types and their required skills" />
{/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1">

          <div className="relative w-full min-w-0 sm:w-auto sm:flex-1 sm:max-w-sm">
            <Search className={cn(
              'absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors duration-150',
              isSearchActive ? 'text-purple-500' : 'text-slate-400',
            )} />
            <Input
              placeholder="Search job types or skills…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              className={cn(
                'pl-9 h-9 rounded-xl text-sm transition-all duration-150',
                isSearchActive
                  ? 'border-purple-400 ring-[3px] ring-purple-500/15 focus-visible:ring-[3px] focus-visible:ring-purple-500/20'
                  : 'border-slate-200 focus-visible:ring-[3px] focus-visible:ring-purple-500/15 focus-visible:border-purple-400',
              )}
            />
            {search && (
              <button onClick={() => { setSearch(''); setPage(1) }} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 hover:bg-slate-100 transition-colors">
                <X className="h-3.5 w-3.5 text-slate-400" />
              </button>
            )}
          </div>

          <div className="hidden sm:block h-5 w-px bg-slate-200 shrink-0" />

          <FiltersPanel
            skillFilter={skillFilter}       onSkillChange={(v) => { setSkillFilter(v); setPage(1) }}
            categoryFilter={categoryFilter} onCategoryChange={(v) => { setCategoryFilter(v); setPage(1) }}
            skillOptions={skillOptions}
          />

          {hasActiveFilters && (
            <button onClick={clearAll} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-sm text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors">
              <X className="h-3.5 w-3.5" /> Clear all
            </button>
          )}
        </div>

        <CreateJobTypeForm onSuccess={fetchJobTypes} />
      </div>

      {/* Table */}
      <div className="border border-slate-200 rounded-2xl overflow-hidden">

        {/* Header bar */}
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-purple-100 flex items-center justify-center">
              <Briefcase className="h-3.5 w-3.5 text-purple-600" />
            </div>
            <p className="text-sm text-slate-500">
              {isLoading ? (
                <span className="h-3 w-20 bg-slate-200 animate-pulse rounded inline-block" />
              ) : (
                <>
                  <span className="font-semibold text-slate-800">{filtered.length}</span>
                  {' '}job type{filtered.length !== 1 ? 's' : ''}
                  {hasActiveFilters && <span className="text-slate-400"> · filtered</span>}
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span className="hidden sm:inline text-xs">Rows per page</span>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1) }}>
              <SelectTrigger className={cn('h-8 w-[68px] rounded-xl text-xs transition-all duration-150',
                isNonDefaultPageSize
                  ? 'border-purple-300 text-purple-700 ring-[3px] ring-purple-500/15'
                  : 'border-slate-200 focus:ring-[3px] focus:ring-purple-500/15 focus:border-purple-400',
              )}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {PAGE_SIZE_OPTIONS.map((s) => (
                  <SelectItem key={s} value={String(s)} className={cn('cursor-pointer rounded-lg text-sm', pageSize === s && 'text-purple-700 font-semibold')}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Two-panel layout */}
        <div className="flex">
          <div className="overflow-x-auto flex-1 min-w-0">
            <table className="w-full caption-bottom text-sm" style={{ minWidth: 500 }}>
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/50">
                  {['Job Type Name', 'Category', 'Required Skill', 'Created'].map((h) => (
                    <th key={h} className="px-4 text-left align-middle text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap" style={{ height: HEAD_H }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>

                {/* Skeletons */}
                {isLoading && [...Array(5)].map((_, i) => (
                  <tr key={i} className="border-b border-slate-100" style={{ height: ROW_H }}>
                    <td className="px-4 py-2 align-middle">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-lg bg-slate-100 animate-pulse shrink-0" />
                        <div className="h-3.5 w-40 bg-slate-100 animate-pulse rounded-full" />
                      </div>
                    </td>
                    {[20, 24, 24].map((w, j) => (
                      <td key={j} className="px-4 py-2 align-middle">
                        <div className="h-5 bg-slate-100 animate-pulse rounded-full" style={{ width: `${w * 4}px` }} />
                      </td>
                    ))}
                  </tr>
                ))}

                {/* Empty */}
                {!isLoading && jobTypes.length === 0 && (
                  <tr>
                    <td colSpan={4} className="h-80 text-center align-middle px-4">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                          <Briefcase className="h-7 w-7 text-slate-400" />
                        </div>
                        <div>
                          <p className="text-base font-semibold text-slate-800">No job types yet</p>
                          <p className="text-sm text-slate-400 mt-0.5">Get started by adding your first job type.</p>
                        </div>
                        <CreateJobTypeForm onSuccess={fetchJobTypes} />
                      </div>
                    </td>
                  </tr>
                )}

                {/* No results */}
                {!isLoading && jobTypes.length > 0 && filtered.length === 0 && (
                  <tr>
                    <td colSpan={4} className="h-64 text-center align-middle px-4">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                          <Search className="h-7 w-7 text-slate-400" />
                        </div>
                        <div>
                          <p className="text-base font-semibold text-slate-800">No results found</p>
                          <p className="text-sm text-slate-400 mt-0.5">No job types match your current filters.</p>
                        </div>
                        <Button variant="outline" size="sm" className="rounded-xl" onClick={clearAll}>Clear all filters</Button>
                      </div>
                    </td>
                  </tr>
                )}

                {/* Data rows */}
                {!isLoading && paginated.map((jobType) => (
                  <tr
                    key={jobType.job_type_id}
                    className={cn('border-b border-slate-100 transition-colors duration-100', isHovered(jobType.job_type_id) ? 'bg-purple-50/60' : 'bg-white')}
                    style={{ height: ROW_H }}
                    onMouseEnter={() => handleMouseEnter(jobType.job_type_id)}
                    onMouseLeave={handleMouseLeave}
                  >
                    {/* Name */}
                    <td className="px-4 py-2 align-middle whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
                          <Briefcase className="h-4 w-4 text-purple-500" />
                        </div>
                        <span className="text-sm font-medium text-slate-800">{jobType.job_type_name}</span>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="px-4 py-2 align-middle whitespace-nowrap">
                      {jobType.job_type_category === true ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ring-1 bg-blue-50 text-blue-700 ring-blue-200">
                          <Users className="h-3 w-3" /> Consumer
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ring-1 bg-amber-50 text-amber-700 ring-amber-200">
                          <Building2 className="h-3 w-3" /> Internal
                        </span>
                      )}
                    </td>

                    {/* Skill */}
                    <td className="px-4 py-2 align-middle whitespace-nowrap">
                      {jobType.skill ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-violet-50 text-violet-700 ring-1 ring-violet-200 capitalize">
                          {jobType.skill.skill_name}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>

                    {/* Created */}
                    <td className="px-4 py-2 align-middle whitespace-nowrap text-sm text-slate-500">
                      {formatDate(jobType.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Fixed action column */}
          <div className="shrink-0 flex flex-col border-l border-slate-200 bg-white" style={{ width: 52 }}>
            <div style={{ height: HEAD_H }} className="border-b border-slate-200 bg-slate-50/50 shrink-0" />

            {isLoading && [...Array(5)].map((_, i) => (
              <div key={i} className="shrink-0 flex items-center justify-center border-b border-slate-100" style={{ height: ROW_H }}>
                <div className="h-8 w-8 bg-slate-100 animate-pulse rounded-xl" />
              </div>
            ))}

            {!isLoading && paginated.map((jobType) => (
              <div
                key={jobType.job_type_id}
                className={cn('shrink-0 flex items-center justify-center border-b border-slate-100 transition-colors duration-100', isHovered(jobType.job_type_id) ? 'bg-purple-50/60' : 'bg-white')}
                style={{ height: ROW_H }}
                onMouseEnter={() => handleMouseEnter(jobType.job_type_id)}
                onMouseLeave={handleMouseLeave}
              >
                <DropdownMenu
                  onOpenChange={(open) => {
                    setOpenDropdown(open ? jobType.job_type_id : null)
                    if (!open) setHoveredRow(null)
                  }}
                >
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-all">
                      <MoreHorizontal className="h-4 w-4" />
                      <span className="sr-only">Actions</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52 rounded-2xl p-1.5 shadow-xl shadow-slate-200/60">
                    <DropdownMenuLabel className="text-xs font-semibold text-slate-400 uppercase tracking-widest px-2 py-1.5">Actions</DropdownMenuLabel>
                    <DropdownMenuSeparator className="mb-1" />
                    <DropdownMenuItem onClick={() => handleEdit(jobType)} className="cursor-pointer rounded-xl gap-2.5 py-2.5 group">
                      <div className="h-7 w-7 rounded-lg bg-slate-100 flex items-center justify-center group-hover:bg-blue-100 transition-colors shrink-0">
                        <Edit className="h-3.5 w-3.5 text-slate-500 group-hover:text-blue-600 transition-colors" />
                      </div>
                      <span className="text-sm font-medium">Edit job type</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
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
      {selectedJobType && (
        <UpdateJobTypeForm
          jobType={{
            job_type_id:       selectedJobType.job_type_id,
            job_type_name:     selectedJobType.job_type_name,
            skill_id:         selectedJobType.skill?.skill_id ?? '',
            job_type_category: selectedJobType.job_type_category,
          }}
          isOpen={isEditOpen}
          onOpenChange={setIsEditOpen}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  )
}

export default JobTypesPage