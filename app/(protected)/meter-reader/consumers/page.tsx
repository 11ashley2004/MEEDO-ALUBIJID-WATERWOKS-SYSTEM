'use client'

import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'

import { PageHeading } from '@/components/shared-ui/page-heading'

import { useState, useEffect } from 'react'
import {
  Search,
  MapPin,
  User,
  MoreHorizontal,
  ChevronDown,
  Eye,
  X,
  SlidersHorizontal,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Wrench,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  getAssignedConsumersTableData,
  getAssignedZonesSimple,
  type TableConsumer,
  type Zone,
} from '@/lib/actions/job-assignment/meter-reader-assignments.actions'
import { toast } from 'sonner'
import Link from 'next/link'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitialsFromName(consumerName: string) {
  const parts = consumerName.split(',')
  if (parts.length !== 2) return 'U'
  const lastName  = parts[0].trim()
  const firstName = parts[1].trim().split(' ')[0]
  return `${firstName[0]}${lastName[0]}`.toUpperCase()
}

// �… New: Meter Status Badge
function meterStatusBadge(statusName: string | null) {
  const s = (statusName ?? '').toUpperCase()

  switch (s) {
    case 'ACTIVE':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="h-3 w-3" />
          Active
        </span>
      )
    case 'DEFECTIVE':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
          <XCircle className="h-3 w-3" />
          Defective
        </span>
      )
    case 'STOLEN':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
          <AlertTriangle className="h-3 w-3" />
          Stolen
        </span>
      )
    case 'LEAK_AFTER_METER':
    case 'WATERLEAK_AFTER_METER':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-orange-50 text-orange-700 border border-orange-200">
          <Wrench className="h-3 w-3" />
          Leak After Meter
        </span>
      )
    case 'REMOVED':
    case 'REPLACED':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-slate-50 text-slate-600 border border-slate-200">
          {s}
        </span>
      )
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-slate-50 text-slate-500 border border-slate-200">
          {statusName || 'Unknown'}
        </span>
      )
  }
}

// ─── Page Component ───────────────────────────────────────────────────────────

const MeterReaderConsumersPage = () => {
  const [consumers, setConsumers] = useState<TableConsumer[]>([])
  const [zones, setZones] = useState<Zone[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const debouncedSearchQuery = useDebouncedSearch(searchQuery)
  const [searchFocused, setSearchFocused] = useState(false)

  // Load zones once on mount
  useEffect(() => {
    getAssignedZonesSimple().then((res) => {
      if (res.status === 'success') {
        setZones(res.data ?? [])
      } else {
        toast.error(res.message ?? 'Failed to load assigned zones')
      }
    })
  }, [])

  // Load consumers on mount
  useEffect(() => {
    loadConsumers()
  }, [])

  async function loadConsumers() {
    setIsLoading(true)
    try {
      const result = await getAssignedConsumersTableData()

      if (result.status === 'success') {
        setConsumers(result.data ?? [])
      } else {
        toast.error(result.message ?? 'Failed to load consumers')
      }
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  const clearAll = () => {
    setSearchQuery('')
  }

  // Client-side search across name, zone, barangay, and meter serial
  const filteredConsumers = consumers.filter((c) => {
    if (!debouncedSearchQuery) return true
    const q = debouncedSearchQuery.toLowerCase()
    return (
      (c.contract_no ?? '').toLowerCase().includes(q) ||
      c.consumer_name.toLowerCase().includes(q) ||
      c.barangay_name.toLowerCase().includes(q) ||
      c.zone_name.toLowerCase().includes(q) ||
      c.classification_name.toLowerCase().includes(q) ||
      (c.meter_serial_no?.toLowerCase().includes(q) ?? false)
    )
  })

  const hasActiveFilters = debouncedSearchQuery.trim().length > 0
  const isSearchActive = debouncedSearchQuery.trim().length > 0 || searchFocused

  // ── Skeleton ────────────────────────────────────────────────────────────────
  const renderSkeleton = () => (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i} className="border-t border-slate-100">
          <TableCell className="py-3"><div className="h-10 w-10 rounded-full bg-slate-100 animate-pulse" /></TableCell>
          <TableCell className="py-3"><div className="h-3.5 w-32 bg-slate-100 animate-pulse rounded-full" /></TableCell>
          <TableCell className="py-3"><div className="h-3.5 w-40 bg-slate-100 animate-pulse rounded-full" /></TableCell>
          <TableCell className="py-3"><div className="h-6 w-20 bg-slate-100 animate-pulse rounded-full" /></TableCell>
          <TableCell className="py-3"><div className="h-3.5 w-24 bg-slate-100 animate-pulse rounded-full" /></TableCell>
          <TableCell className="py-3"><div className="h-6 w-24 bg-slate-100 animate-pulse rounded-full" /></TableCell>
          <TableCell className="py-3"><div className="h-7 w-7 bg-slate-100 animate-pulse rounded-md" /></TableCell>
        </TableRow>
      ))}
    </>
  )

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="w-full space-y-5">

      {/* Page header */}
      <PageHeading title="Assigned Consumers" description="View and manage consumers in your assigned zones" />
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
              placeholder="Search Contract No., name, serial, zone…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
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
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-slate-100"
              >
                <X className="h-3 w-3 text-slate-400" />
              </button>
            )}
          </div>

          {hasActiveFilters && (
            <button
              onClick={clearAll}
              className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-xs text-slate-400 hover:text-violet-600 hover:bg-violet-50"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">

        {/* Table header bar */}
        <div className="px-5 py-3 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-violet-100 border border-violet-200 flex items-center justify-center">
              <User className="h-3 w-3 text-violet-500" />
            </div>
            <p className="text-xs text-slate-500">
              {isLoading ? (
                <span className="inline-block h-3 w-24 bg-slate-100 animate-pulse rounded-full" />
              ) : (
                <>
                  <span className="font-semibold text-slate-700">{filteredConsumers.length}</span>
                  {' '}consumer{filteredConsumers.length !== 1 ? 's' : ''}
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
                <TableHead className="w-12"><span className="sr-only">Avatar</span></TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Consumer Name</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Contract No.</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Location</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Classification</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Meter Serial</TableHead>
                <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Meter Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? renderSkeleton()
                : filteredConsumers.length === 0
                  ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-72 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <div className="h-12 w-12 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center">
                            {searchQuery ? (
                              <Search className="h-5 w-5 text-violet-300" />
                            ) : (
                              <User className="h-5 w-5 text-violet-300" />
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-600">
                              {searchQuery ? 'No results found' : 'No consumers found'}
                            </p>
                            <p className="text-xs text-slate-400 mt-1">
                              {searchQuery
                                ? 'No consumers match your search query.'
                                : zones.length === 0
                                  ? "You don't have any zones assigned yet. Contact your administrator."
                                  : 'No consumers found in your assigned zones.'}
                            </p>
                          </div>
                          {searchQuery && (
                            <button
                              onClick={() => setSearchQuery('')}
                              className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-xs font-medium text-violet-600 bg-violet-50 border border-violet-200 hover:bg-violet-100"
                            >
                              Clear search
                            </button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                  : filteredConsumers.map((consumer) => (
                    <TableRow key={consumer.meter_account_id} className="border-t border-slate-100 hover:bg-violet-50/40 transition-colors">
                      {/* Avatar */}
                      <TableCell className="py-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-violet-100 text-violet-700 text-[11px] font-bold">
                            {getInitialsFromName(consumer.consumer_name)}
                          </AvatarFallback>
                        </Avatar>
                      </TableCell>

                      {/* Name */}
                      <TableCell className="py-3">
                        <div className="text-[12.5px] font-medium text-slate-800">{consumer.consumer_name}</div>
                      </TableCell>

                      <TableCell className="py-3">
                        <span className="font-mono text-[12px] text-slate-600">
                          {consumer.contract_no || '—'}
                        </span>
                      </TableCell>

                      {/* Location */}
                      <TableCell className="py-3">
                        <div className="flex items-start gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
                          <div>
                            <div className="text-[12.5px] font-medium text-slate-700">{consumer.barangay_name}</div>
                            <div className="text-[10px] text-slate-400">Zone {consumer.zone_name}</div>
                          </div>
                        </div>
                      </TableCell>

                      {/* Classification */}
                      <TableCell className="py-3">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                          {consumer.classification_name}
                        </span>
                      </TableCell>

                      {/* Meter serial no. */}
                      <TableCell className="py-3">
                        {consumer.meter_serial_no ? (
                          <span className="text-[11px] font-mono text-slate-600">{consumer.meter_serial_no}</span>
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">—</span>
                        )}
                      </TableCell>

                      {/* �… Meter Status */}
                      <TableCell className="py-3">
                        {meterStatusBadge(consumer.meter_status_name)}
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}

export default MeterReaderConsumersPage