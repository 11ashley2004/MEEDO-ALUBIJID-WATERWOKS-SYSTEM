'use client'

import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'



import { TablePagination } from '@/components/shared-ui/pagination'
import { PageHeading } from '@/components/shared-ui/page-heading'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Search, X, Users, Banknote, User, Calendar, Gauge, Droplets, FileText, Clock, CheckCircle2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  getNoticeById,
  type NoticeOfDisconnection,
  type NoticeMeterAccount,
} from '@/lib/actions/disconnection-notice/disconnection-notice.actions'
import { PdfExportButton } from '@/components/admin-ui/disconnection-notice/pdf-export'

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatPeso(n: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency', currency: 'PHP',
  }).format(n)
}

function formatDateTime(d: string): string {
  return new Date(d).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

// ─── Status Badge Component ────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  switch (status?.toLowerCase()) {
    case 'unpaid':
      return (
        <Badge variant="outline" className="rounded-full bg-rose-50 text-rose-700 border-rose-200 gap-1">
          <Clock className="h-3 w-3" />
          Unpaid
        </Badge>
      )
    case 'partial':
      return (
        <Badge variant="outline" className="rounded-full bg-amber-50 text-amber-700 border-amber-200 gap-1">
          <Clock className="h-3 w-3" />
          Partial
        </Badge>
      )
    case 'paid':
      return (
        <Badge variant="outline" className="rounded-full bg-emerald-50 text-emerald-700 border-emerald-200 gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Paid
        </Badge>
      )
    default:
      return (
        <Badge variant="outline" className="rounded-full bg-slate-50 text-slate-500 border-slate-200 gap-1">
          <span className="h-2 w-2 rounded-full bg-slate-400" />
          Unknown
        </Badge>
      )
  }
}

// ─── Skeleton Components ───────────────────────────────────────────────────────

const StatCardSkeleton = () => (
  <Card className="rounded-md border-slate-200">
    <CardContent className="p-4">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-4 w-24 bg-slate-100 animate-pulse rounded-md" />
          <div className="h-7 w-20 bg-slate-100 animate-pulse rounded-md" />
        </div>
        <div className="h-10 w-10 rounded-md bg-slate-100 animate-pulse" />
      </div>
    </CardContent>
  </Card>
)

const TableRowSkeleton = () => (
  <TableRow className="border-t border-slate-100">
    {[...Array(9)].map((_, j) => (
      <TableCell key={j} className="py-3">
        <div className="h-4 w-full bg-slate-100 animate-pulse rounded-md" />
      </TableCell>
    ))}
  </TableRow>
)

// ─── Main Page ─────────────────────────────────────────────────────────────────

const NoticeViewPage = () => {
  const params = useParams()
  const router = useRouter()
  const noticeId = params?.noticeId as string

  const [notice, setNotice] = useState<NoticeOfDisconnection | null>(null)
  const [connections, setConnections] = useState<NoticeMeterAccount[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedSearch(search)
  const [searchFocused, setSearchFocused] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!noticeId) return
    setIsLoading(true)
    try {
      const result = await getNoticeById(noticeId)
      if (result.status === 'success' && result.data) {
        setNotice(result.data.notice)
        setConnections(result.data.connections)
      } else {
        toast.error(result.message ?? 'Failed to load notice')
        router.push('/clerk/notice-disconnection')
      }
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }, [noticeId, router])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { setPage(1) }, [debouncedSearch])

  // ── Client filter ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    if (!q) return connections
    return connections.filter(
      (c) =>
        c.meter_serial_no?.toLowerCase().includes(q) ||
        c.consumer_name?.toLowerCase().includes(q) ||
        c.barangay_name?.toLowerCase().includes(q) ||
        c.zone_name?.toLowerCase().includes(q)
    )
  }, [connections, debouncedSearch])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginated = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize]
  )

  const isSearchActive = search.length > 0 || searchFocused
  const isNonDefaultPageSize = pageSize !== 10
  const totalBalance = connections.reduce((sum, c) => sum + (c.balance_snapshot ?? 0), 0)

  // ── Page numbers ───────────────────────────────────────────────────────────

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
      <div className="w-full space-y-5 lg:mb-0 mb-10">
        <PageHeading
          title={!notice?.notice_no ? 'Notice of Disconnection' : notice.notice_no}
          description={
            notice
              ? `Notice of Disconnection · Generated ${formatDateTime(notice.generated_at)}`
              : 'Notice of Disconnection'
          }
        />

        {/* Header */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-md border border-slate-200 hover:border-violet-300 hover:bg-violet-50"
            onClick={() => router.push('/clerk/notice-disconnection')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </div>

        <div className="h-px bg-slate-100" />

        {/* Search toolbar — Export/Print now live here, right-aligned */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative w-full min-w-0 sm:w-auto sm:flex-1 sm:max-w-sm">
            <Search className={cn(
              'absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors duration-150',
              isSearchActive ? 'text-violet-500' : 'text-muted-foreground'
            )} />
            <Input
              placeholder="Search by serial no., consumer, or location…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              disabled={isLoading}
              className={cn(
                'pl-9 h-9 transition-all duration-150 rounded-md',
                isSearchActive
                  ? 'border-violet-400 ring-[3px] ring-violet-500/15 focus-visible:ring-[3px] focus-visible:ring-violet-500/20 focus-visible:border-violet-500'
                  : 'focus-visible:ring-[3px] focus-visible:ring-violet-500/15 focus-visible:border-violet-400',
                isLoading && 'bg-slate-50'
              )}
            />
            {search && !isLoading && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 hover:bg-muted transition-colors"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isLoading ? (
              <>
                <div className="h-9 w-28 rounded-md bg-slate-100 animate-pulse" />
                <div className="h-9 w-24 rounded-md bg-slate-100 animate-pulse" />
              </>
            ) : notice ? (
              <>
                <PdfExportButton noticeId={notice.notice_id} />
              </>
            ) : null}
          </div>
        </div>

        {/* Table */}
        <div className="border rounded-md overflow-hidden border-slate-200">
          <div className="px-4 py-3 border-b flex items-center justify-between bg-violet-50/30 border-slate-100">
            <div className="text-sm text-muted-foreground">
              {isLoading ? (
                <div className="h-4 w-32 bg-slate-100 animate-pulse rounded-md" />
              ) : (
                <>
                  <span className="font-medium text-foreground">{filtered.length}</span>
                  {' meter account'}{filtered.length !== 1 ? 's' : ''}{search && ' matching search'}
                </>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="hidden sm:inline">Rows per page</span>
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1) }} disabled={isLoading}>
                <SelectTrigger className={cn(
                  'h-8 w-[70px] transition-all duration-150 rounded-md',
                  isNonDefaultPageSize
                    ? 'border-violet-400 text-violet-700 ring-[3px] ring-violet-500/15'
                    : 'focus:ring-[3px] focus:ring-violet-500/15 focus:border-violet-400'
                )}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-md">
                  {PAGE_SIZE_OPTIONS.map((s) => (
                    <SelectItem
                      key={s}
                      value={String(s)}
                      className={cn('cursor-pointer rounded-md', pageSize === s && 'text-violet-700 font-semibold')}
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
              <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
                <TableHead className="text-slate-600">S/N</TableHead>
                <TableHead className="text-slate-600">Consumer Name</TableHead>
                <TableHead className="text-slate-600">Barangay</TableHead>
                <TableHead className="text-slate-600">Zone</TableHead>
                <TableHead className="text-slate-600">Classification</TableHead>
                <TableHead className="text-right text-slate-600">Outstanding Balance</TableHead>
                <TableHead className="text-center text-slate-600">Unpaid Months</TableHead>
                <TableHead className="text-center text-slate-600">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(5)].map((_, i) => <TableRowSkeleton key={i} />)
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-48 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <FileText className="h-10 w-10 text-muted-foreground/50" />
                      <p className="text-sm text-muted-foreground">No meter accounts match your search.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((conn, idx) => (
                  <TableRow key={conn.notice_meter_account_id} className="hover:bg-violet-50/30 transition-colors">
                    <TableCell>
                      <p className="text-sm py-2 font-medium font-mono text-slate-700">{conn.meter_serial_no}</p>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium text-slate-700">{conn.consumer_name}</p>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm text-slate-600">{conn.barangay_name}</p>
                    </TableCell>
                    <TableCell>
                      <p className="text-xs text-muted-foreground">Zone {conn.zone_name}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="rounded-full bg-violet-50 text-violet-700 border-violet-200 text-xs">
                        {conn.classification_name}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-sm font-semibold text-violet-700 tabular-nums">
                        {formatPeso(conn.balance_snapshot ?? 0)}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="rounded-full bg-violet-100 text-violet-700 border-violet-200">
                        {conn.months_unpaid ?? 0} mo.
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <StatusBadge status={conn.billing_status ?? 'unknown'} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {!isLoading && filtered.length > 0 && (
            <div className="px-4 py-3 border-t bg-violet-50/30 border-slate-100 flex justify-end">
              <div className="flex items-center gap-4 text-sm">
                <span className="text-muted-foreground">Total outstanding:</span>
                <span className="font-bold text-violet-700 tabular-nums">{formatPeso(totalBalance)}</span>
              </div>
            </div>
          )}
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

export default NoticeViewPage