'use client'

import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'


import { TablePagination } from '@/components/shared-ui/pagination'
import { PageHeading } from '@/components/shared-ui/page-heading'
import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  MoreHorizontal,
  Search,
  Users,
  Edit,
  UserCheck,
  UserX,
  Activity,
  SlidersHorizontal,
  ChevronDown,
  X,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import AddUserForm from '@/components/admin-ui/users/create.user.form'
import EditUserForm from '@/components/admin-ui/users/update.user.form'
import UserStatusModal from '@/components/admin-ui/users/user-status-modal'
import AuditLogModal from '@/components/admin-ui/users/user.activty.log.modal'
import { getAllUsers, User } from '@/lib/actions/users/user.actions'
import { getAllUserRoles, Role } from '@/lib/actions/roles/roles.action'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import UserOnlineStatus from '@/components/shared-ui/UserOnlineStatus'

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

const formatFullName = (u: User) => 
  `${u.first_name}${u.middle_name ? ` ${u.middle_name.charAt(0)}.` : ''} ${u.last_name}`

// ─── Filters Panel ──────────────────────────────────────────────────────────

function FiltersPanel({
  statusFilter, onStatusChange,
  roleFilter, onRoleChange,
  roles,
}: {
  statusFilter: string
  onStatusChange: (v: string) => void
  roleFilter: string
  onRoleChange: (v: string) => void
  roles: Role[]
}) {
  const activeCount = [statusFilter !== 'all', roleFilter !== 'all'].filter(Boolean).length

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-9 gap-1.5 text-sm font-medium transition-all rounded-md',
            activeCount > 0 && [
              'border-violet-400 bg-violet-50 text-violet-700',
              'hover:bg-violet-100 hover:border-violet-500',
            ],
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
      <DropdownMenuContent align="end" className="w-44 rounded-md p-1.5">
        <DropdownMenuLabel className="text-[9px] font-bold uppercase tracking-widest text-violet-400 px-2 py-1.5">
          Status
        </DropdownMenuLabel>
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

        <DropdownMenuSeparator className="my-1" />

        <DropdownMenuLabel className="text-[9px] font-bold uppercase tracking-widest text-violet-400 px-2 py-1.5">
          Role
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={roleFilter} onValueChange={onRoleChange}>
          <DropdownMenuRadioItem
            value="all"
            className={cn(
              'cursor-pointer rounded-md text-xs',
              roleFilter === 'all' && 'text-violet-600 font-medium bg-violet-50',
            )}
          >
            All Roles
          </DropdownMenuRadioItem>
          {roles.map((role) => (
            <DropdownMenuRadioItem
              key={role.role_id} 
              value={role.role_id}
              className={cn(
                'cursor-pointer rounded-md text-xs capitalize',
                roleFilter === role.role_id && 'text-violet-600 font-medium bg-violet-50',
              )}
            >
              {role.role_name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

const UsersPage = () => {
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedSearch(search)
  const [searchFocused, setSearchFocused] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const fetchUsers = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await getAllUsers()
      setUsers(response) 
    } catch {
      toast.error('Failed to load users')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const fetchRoles = useCallback(async () => {
    try {
      const response = await getAllUserRoles()
      setRoles(response)
    } catch {
      toast.error('Failed to load roles')
    } 
  }, [])

  useEffect(() => { 
    fetchUsers()
    fetchRoles()
  }, [fetchUsers, fetchRoles])

  const clearAll = useCallback(() => {
    setSearch(''); setStatusFilter('all'); setRoleFilter('all'); setPage(1)
  }, [])

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    return users.filter((u) => {
      if (q &&
        !formatFullName(u).toLowerCase().includes(q) &&
        !u.email.toLowerCase().includes(q) &&
        !(u.contact_number?.toLowerCase().includes(q)) &&
        !(u.role?.role_name.toLowerCase().includes(q))
      ) return false
      
      if (statusFilter === 'active' && !u.is_active) return false
      if (statusFilter === 'inactive' && u.is_active) return false
      
      if (roleFilter !== 'all' && u.role?.role_id !== roleFilter) return false
      
      return true
    })
  }, [users, debouncedSearch, statusFilter, roleFilter])

  useEffect(() => { setPage(1) }, [filtered.length])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginated = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  )

  const hasActiveFilters = debouncedSearch.trim().length > 0 || statusFilter !== 'all' || roleFilter !== 'all'
  const isSearchActive = debouncedSearch.trim().length > 0 || searchFocused


  // ─── Check if user is Admin ──────────────────────────────────────────────
  const isAdmin = (user: User) => {
    return user.role?.role_name?.toLowerCase() === 'admin'
  }

  return (
    <div className="w-full space-y-5">

      <PageHeading title="Users" description="Manage staff accounts, roles, and access" />

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
              placeholder="Search users..."
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
            roleFilter={roleFilter}
            onRoleChange={(v) => { setRoleFilter(v); setPage(1) }}
            roles={roles}
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

        <AddUserForm onSuccess={fetchUsers} />
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
                  {' '}user{filtered.length !== 1 ? 's' : ''}
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

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/40">
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                  User
                </TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                  Email
                </TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                  Contact
                </TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                  Role
                </TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                  Status
                </TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                  Last Login
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
                      <div className="h-7 w-7 rounded-full bg-slate-100 animate-pulse" />
                      <div className="h-3.5 w-28 bg-slate-100 animate-pulse rounded-full" />
                    </div>
                  </TableCell>
                  <TableCell><div className="h-3.5 w-32 bg-slate-100 animate-pulse rounded-full" /></TableCell>
                  <TableCell><div className="h-3.5 w-24 bg-slate-100 animate-pulse rounded-full" /></TableCell>
                  <TableCell><div className="h-6 w-16 bg-slate-100 animate-pulse rounded-full" /></TableCell>
                  <TableCell><div className="h-6 w-16 bg-slate-100 animate-pulse rounded-full" /></TableCell>
                  <TableCell><div className="h-3.5 w-20 bg-slate-100 animate-pulse rounded-full" /></TableCell>
                  <TableCell><div className="h-7 w-7 bg-slate-100 animate-pulse rounded-md" /></TableCell>
                </TableRow>
              ))}

              {/* Empty — no users */}
              {!isLoading && users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="h-72 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-12 w-12 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center">
                        <Users className="h-5 w-5 text-violet-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-600">No users yet</p>
                        <p className="text-xs text-slate-400 mt-1">Create your first user to get started.</p>
                      </div>
                      <AddUserForm onSuccess={fetchUsers} />
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {/* Empty — no results */}
              {!isLoading && users.length > 0 && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="h-64 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-12 w-12 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center">
                        <Search className="h-5 w-5 text-violet-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-600">No results</p>
                        <p className="text-xs text-slate-400 mt-1">No users match your filters.</p>
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
              )}

              {/* Data rows */}
              {!isLoading && paginated.map((user) => {
                const isUserAdmin = isAdmin(user)
                
                return (
                  <TableRow key={user.user_id} className="border-t border-slate-100 hover:bg-violet-50/40 transition-colors">
                    <TableCell className="py-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-7 w-7">
                          <AvatarImage src={user?.profile_image ?? undefined} />
                          <AvatarFallback className="text-[11px] font-bold bg-violet-100 text-violet-600">
                            {user?.first_name ? user.first_name.slice(0, 2).toUpperCase() : "NA"}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-[12.5px] font-medium text-slate-700">{formatFullName(user)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3 text-xs text-slate-500">
                      {user.email}
                    </TableCell>
                    <TableCell className="py-3 text-xs text-slate-500">
                      {user.contact_number || '—'}
                    </TableCell>
                    <TableCell className="py-3">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-semibold bg-violet-50 text-violet-700 border border-violet-200 capitalize">
                        {user.role?.role_name || 'N/A'} 
                      </span>
                    </TableCell>
                    <TableCell className="py-3">
                      <span className={cn(
                        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold border',
                        user.is_active
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-50 text-slate-400 border-slate-200',
                      )}>
                        <span className={cn(
                          'h-1.5 w-1.5 rounded-full',
                          user.is_active ? 'bg-emerald-500' : 'bg-slate-300',
                        )} />
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </TableCell>
                    <TableCell className="py-3">
                      <UserOnlineStatus lastActive={user.last_active} />
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
                            className="cursor-pointer rounded-md text-xs text-slate-500 focus:bg-violet-50 focus:text-violet-700 dark:focus:bg-accent dark:focus:text-accent-foreground py-2 gap-2"
                            onSelect={(e) => e.preventDefault()}
                          >
                            <EditUserForm
                              userId={user.user_id}
                              onSuccess={fetchUsers}
                            />
                          </DropdownMenuItem>

                          <DropdownMenuItem
                            className="cursor-pointer rounded-md text-xs text-slate-500 focus:bg-violet-50 focus:text-violet-700 dark:focus:bg-accent dark:focus:text-accent-foreground py-2 gap-2"
                            onSelect={(e) => e.preventDefault()}
                          >
                            <AuditLogModal userId={user.user_id}>
                              <div className="flex items-center gap-2 w-full">
                                <div className="h-6 w-6 rounded-md bg-slate-100 flex items-center justify-center">
                                  <Activity className="h-3 w-3 text-slate-500" />
                                </div>
                                <span>Activity log</span>
                              </div>
                            </AuditLogModal>
                          </DropdownMenuItem>

                          {/* ─── Only show Deactivate/Activate if NOT Admin ─── */}
                          {!isUserAdmin && (
                            <>
                              <DropdownMenuSeparator className="my-1" />
                              <DropdownMenuItem
                                className="cursor-pointer rounded-md text-xs text-slate-500 focus:bg-violet-50 focus:text-violet-700 dark:focus:bg-accent dark:focus:text-accent-foreground py-2 gap-2"
                                onSelect={(e) => e.preventDefault()}
                              >
                                <UserStatusModal userId={user.user_id} onSuccess={fetchUsers}>
                                  <div className="flex items-center gap-2 w-full">
                                    <div className="h-6 w-6 rounded-md bg-slate-100 flex items-center justify-center">
                                      {user.is_active
                                        ? <UserX className="h-3 w-3 text-slate-500" />
                                        : <UserCheck className="h-3 w-3 text-slate-500" />
                                      }
                                    </div>
                                    <span>{user.is_active ? 'Deactivate' : 'Activate'}</span>
                                  </div>
                                </UserStatusModal>
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
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
    </div>
  )
}

export default UsersPage