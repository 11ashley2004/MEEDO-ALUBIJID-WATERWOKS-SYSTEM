'use client'

import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'


import { TablePagination } from '@/components/shared-ui/pagination'
// app/admin/meter-installments/page.tsx
import { PageHeading } from '@/components/shared-ui/page-heading'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Search, MoreHorizontal, Eye, Edit, X, Ban, TrendingUp, Users, DollarSign, CheckCircle2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

import {
  getActiveInstallments,
  getInstallmentById,
  type MeterInstallmentDetail,
} from '@/lib/actions/meter-installment/meter-installment.actions'
import { CreateInstallmentForm } from '@/components/admin-ui/meter-installment/CreateInstallmentForm'
import { CancelInstallmentDialog } from '@/components/admin-ui/meter-installment/CancelInstallmentDialog'
import { EditInstallmentForm } from '@/components/admin-ui/meter-installment/EditInstallmentForm'

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatPeso(amount: number): string {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount)
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

function getProgressColor(progress: number): string {
  if (progress >= 80) return 'bg-emerald-500'
  if (progress >= 50) return 'bg-amber-500'
  return 'bg-violet-500'
}

function getStatusBadge(statusCode: string) {
  switch (statusCode) {
    case 'ACTIVE':
      return { label: 'Active', className: 'rounded-md bg-emerald-50 text-emerald-700 border-emerald-200' }
    case 'COMPLETED':
      return { label: 'Completed', className: 'rounded-md bg-slate-100 text-slate-500 border-slate-200' }
    case 'CANCELLED':
      return { label: 'Cancelled', className: 'rounded-md bg-rose-50 text-rose-700 border-rose-200' }
    case 'PENDING':
      return { label: 'Pending', className: 'rounded-md bg-amber-50 text-amber-700 border-amber-200' }
    default:
      return { label: 'Unknown', className: 'rounded-md bg-slate-50 text-slate-500 border-slate-200' }
  }
}

// ─── Skeleton Row ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <TableRow>
      {[...Array(7)].map((_, i) => (
        <TableCell key={i} className="py-3">
          <div className="h-3.5 w-full bg-slate-100 animate-pulse rounded-full" />
        </TableCell>
      ))}
    </TableRow>
  )
}

// ─── View Details Dialog ─────────────────────────────────────────────────────

interface ViewDetailsDialogProps {
  installment: MeterInstallmentDetail | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function ViewDetailsDialog({ installment, open, onOpenChange }: ViewDetailsDialogProps) {
  if (!installment) return null

  const statusBadge = getStatusBadge(installment.status_code)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full sm:max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 border border-slate-200 bg-white rounded-md">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-violet-600 flex items-center justify-center shrink-0">
              <TrendingUp className="h-[18px] w-[18px] text-white" />
            </div>
            <div>
              <DialogTitle className="text-[14px] font-bold text-slate-900 leading-tight">
                Installment Details
              </DialogTitle>
              <DialogDescription className="text-[11px] text-slate-500 mt-0.5">
                {installment.meter_serial_no}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/60">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-md border border-slate-200 p-3">
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Total Cost</p>
              <p className="text-[15px] font-bold text-slate-800">{formatPeso(installment.total_cost)}</p>
            </div>
            <div className="bg-white rounded-md border border-slate-200 p-3">
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Monthly</p>
              <p className="text-[15px] font-bold text-slate-800">{formatPeso(installment.monthly_amount)}</p>
            </div>
            <div className="bg-white rounded-md border border-slate-200 p-3">
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Remaining</p>
              <p className="text-[15px] font-bold text-rose-600">{formatPeso(installment.remaining_balance)}</p>
            </div>
            <div className="bg-white rounded-md border border-slate-200 p-3">
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Progress</p>
              <p className="text-[15px] font-bold text-violet-600">{installment.progress_pct}%</p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="bg-white rounded-md border border-slate-200 p-4 space-y-2">
            <div className="flex justify-between text-[12px]">
              <span className="text-slate-500">Payment Progress</span>
              <span className="font-semibold text-slate-700">{installment.progress_pct}%</span>
            </div>
            <Progress value={installment.progress_pct} className="h-2.5" />
            <div className="flex justify-between text-[11px] text-slate-500">
              <span>{installment.months_paid} months paid</span>
              <span>{installment.months_remaining} months remaining</span>
            </div>
          </div>

          {/* Details */}
          <div className="bg-white rounded-md border border-slate-200 divide-y divide-slate-100">
            <div className="flex justify-between px-4 py-3">
              <span className="text-[12px] text-slate-500">Status</span>
              <Badge variant="outline" className={cn('text-[10px] font-semibold', statusBadge.className)}>
                {statusBadge.label}
              </Badge>
            </div>
            <div className="flex justify-between px-4 py-3">
              <span className="text-[12px] text-slate-500">Created</span>
              <span className="text-[12px] text-slate-700">{formatDate(installment.created_at)}</span>
            </div>
            <div className="flex justify-between px-4 py-3">
              <span className="text-[12px] text-slate-500">Est. Completion</span>
              <span className="text-[12px] text-slate-700">{formatDate(installment.estimated_completion_date || '')}</span>
            </div>
          </div>

          {/* Charges History */}
          {installment.charges && installment.charges.length > 0 && (
            <div className="bg-white rounded-md border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Payment History</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead className="bg-slate-50/60">
                    <tr>
                      <th className="text-left px-4 py-2 font-semibold text-slate-500">Period</th>
                      <th className="text-right px-4 py-2 font-semibold text-slate-500">Amount</th>
                      <th className="text-left px-4 py-2 font-semibold text-slate-500">Status</th>
                      <th className="text-left px-4 py-2 font-semibold text-slate-500">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {installment.charges.map((charge) => (
                      <tr key={charge.charge_id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-2.5 text-slate-600">{charge.billing_period || '—'}</td>
                        <td className="px-4 py-2.5 text-right font-medium tabular-nums text-slate-700">
                          {formatPeso(charge.amount)}
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge variant="outline" className={cn(
                            'rounded-md text-[10px] font-semibold',
                            charge.billing_status?.toLowerCase() === 'paid'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          )}>
                            {charge.billing_status || 'Pending'}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">{formatDate(charge.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function MeterInstallmentsPage() {
  const [installments, setInstallments] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedSearch(search)
  const [searchFocused, setSearchFocused] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [selectedInstallment, setSelectedInstallment] = useState<MeterInstallmentDetail | null>(null)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [viewDialogOpen, setViewDialogOpen] = useState(false)
  const [editSheetOpen, setEditSheetOpen] = useState(false)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await getActiveInstallments()
      if (result.status === 'success') {
        setInstallments(result.data || [])
      } else {
        toast.error(result.message || 'Failed to load installments')
      }
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    return installments.filter((i) => {
      if (q && !i.consumer_name.toLowerCase().includes(q) && !i.meter_serial_no.toLowerCase().includes(q)) {
        return false
      }
      return true
    })
  }, [installments, debouncedSearch])

  useEffect(() => { setPage(1) }, [filtered.length])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginated = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  )


  const clearFilters = useCallback(() => {
    setSearch('')
    setPage(1)
  }, [])

  const hasActiveFilters = debouncedSearch.trim().length > 0
  const isSearchActive = debouncedSearch.trim().length > 0 || searchFocused
  const isNonDefaultPageSize = pageSize !== 10

  const totalRemaining = installments.reduce((sum, i) => sum + i.remaining_balance, 0)
  const totalActive = installments.length

  const loadFullInstallment = async (installmentId: string): Promise<MeterInstallmentDetail | null> => {
    setIsDetailLoading(true)
    try {
      const result = await getInstallmentById(installmentId)
      if (result.status === 'success' && result.data) {
        return result.data
      }
      toast.error(result.status === 'error' ? result.message : 'Installment not found')
      return null
    } catch {
      toast.error('Failed to load installment details')
      return null
    } finally {
      setIsDetailLoading(false)
    }
  }

  const handleView = async (installmentId: string) => {
    const detail = await loadFullInstallment(installmentId)
    if (detail) {
      setSelectedInstallment(detail)
      setViewDialogOpen(true)
    }
  }

  const handleEdit = async (installment: any) => {
    const detail = await loadFullInstallment(installment.installment_id)
    if (detail) {
      setSelectedInstallment(detail)
      setEditSheetOpen(true)
    }
  }

  const handleCancel = (installment: any) => {
    setSelectedInstallment({
      ...installment,
      charges: installment.charges || [],
    } as MeterInstallmentDetail)
    setCancelDialogOpen(true)
  }

  return (
     <div className="w-full space-y-5 lg:mb-0 mb-15">

      {/* Header */}
      <PageHeading title="Meter Installments" description="Manage meter installment plans" />
{/* Toolbar */}
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
              placeholder="Search consumer or serial no.…"
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

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-xs text-slate-400 hover:text-violet-600 hover:bg-violet-50"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>

        <CreateInstallmentForm onSuccess={fetchData} />
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">

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
                  {' plan'}{filtered.length !== 1 ? 's' : ''}
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
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Consumer</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Serial No.</TableHead>
                <TableHead className="text-right text-[9px] font-bold text-slate-400 uppercase tracking-wider">Remaining</TableHead>
                <TableHead className="text-right text-[9px] font-bold text-slate-400 uppercase tracking-wider">Monthly</TableHead>
                <TableHead className="text-center text-[9px] font-bold text-slate-400 uppercase tracking-wider">Months Left</TableHead>
                <TableHead className="text-center text-[9px] font-bold text-slate-400 uppercase tracking-wider">Status</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>

              {isLoading && [...Array(5)].map((_, i) => <SkeletonRow key={i} />)}

              {!isLoading && installments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="h-72 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-12 w-12 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center">
                        <TrendingUp className="h-5 w-5 text-violet-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-600">No installment plans</p>
                        <p className="text-xs text-slate-400 mt-1">Installment plans will appear here once created.</p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {!isLoading && installments.length > 0 && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="h-64 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-12 w-12 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center">
                        <Search className="h-5 w-5 text-violet-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-600">No results</p>
                        <p className="text-xs text-slate-400 mt-1">No plans match your search.</p>
                      </div>
                      <button
                        onClick={clearFilters}
                        className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-xs font-medium text-violet-600 bg-violet-50 border border-violet-200 hover:bg-violet-100"
                      >
                        Clear filters
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {!isLoading && paginated.map((installment) => {
                const statusBadge = getStatusBadge(installment.status_code)
                const isPending = installment.status_code === 'PENDING'
                const isActive  = installment.status_code === 'ACTIVE'
                return (
                  <TableRow key={installment.installment_id} className="border-t border-slate-100 hover:bg-violet-50/40 transition-colors">
                    <TableCell className="py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-md bg-violet-100 flex items-center justify-center text-[11px] font-bold text-violet-600 shrink-0">
                          {installment.consumer_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <span className="text-[12.5px] font-medium text-slate-800">{installment.consumer_name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3 text-[12.5px] font-mono text-slate-600">
                      {installment.meter_serial_no}
                    </TableCell>
                    <TableCell className="py-3 text-right">
                      <span className="text-[12.5px] font-semibold tabular-nums text-rose-600">
                        {formatPeso(installment.remaining_balance)}
                      </span>
                    </TableCell>
                    <TableCell className="py-3 text-right">
                      <span className="text-[12.5px] tabular-nums text-slate-600">
                        {formatPeso(installment.monthly_amount)}
                      </span>
                    </TableCell>
                    <TableCell className="py-3 text-center">
                      <Badge variant="outline" className="rounded-md bg-violet-50 text-violet-700 border-violet-200 text-[10px] font-semibold">
                        {installment.months_remaining} mo.
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3 text-center">
                      <Badge variant="outline" className={cn('text-[10px] font-semibold', statusBadge.className)}>
                        {statusBadge.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3">
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
                            onClick={() => handleView(installment.installment_id)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>View details</span>
                          </DropdownMenuItem>

                          {!isActive && (
                            <DropdownMenuItem
                              className="cursor-pointer rounded-md text-xs text-slate-500 focus:bg-violet-50 focus:text-violet-700 dark:focus:bg-accent dark:focus:text-accent-foreground py-2 gap-2"
                              onClick={() => handleEdit(installment)}
                            >
                              <Edit className="h-3.5 w-3.5" />
                              <span>Edit plan</span>
                            </DropdownMenuItem>
                          )}

                          {isPending && (
                            <>
                              <DropdownMenuSeparator className="my-1" />
                              <DropdownMenuItem
                                className="cursor-pointer rounded-md text-xs text-rose-600 focus:bg-rose-50 focus:text-rose-700 py-2 gap-2"
                                onClick={() => handleCancel(installment)}
                              >
                                <Ban className="h-3.5 w-3.5" />
                                <span>Cancel plan</span>
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

      {/* View Details Dialog */}
      <ViewDetailsDialog
        installment={selectedInstallment}
        open={viewDialogOpen}
        onOpenChange={setViewDialogOpen}
      />

      {/* Edit Installment Sheet — now a separate component */}
      <EditInstallmentForm
        installment={selectedInstallment}
        open={editSheetOpen}
        onOpenChange={setEditSheetOpen}
        onSuccess={fetchData}
      />

      {/* Cancel Installment Confirmation */}
      <CancelInstallmentDialog
        installmentId={selectedInstallment?.installment_id ?? null}
        meterSerialNo={selectedInstallment?.meter_serial_no ?? undefined}
        consumerName={selectedInstallment?.consumer_name}
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        onCancelled={fetchData}
      />
    </div>
  )
}