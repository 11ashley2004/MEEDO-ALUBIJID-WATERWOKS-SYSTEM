'use client'

import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'



import { PageHeading } from '@/components/shared-ui/page-heading'
import { TablePagination } from '@/components/shared-ui/pagination'
import { useEffect, useState, useMemo } from 'react'
import {
  Search, Receipt, X, Gauge, User,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'

import {
  getConsumerPaymentHistory,
  type ConsumerPaymentRecord,
} from '@/lib/actions/payment/consumer-payment-history.actions'

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE_OPTIONS = [5, 10, 25] as const

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPeso(n: number) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n)
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function PaymentTypeBadge({ type }: { type: string }) {
  const lowerType = type.toLowerCase()
  
  if (lowerType.includes('billing') || lowerType === 'water bill') {
    return (
      <Badge variant="outline" className="rounded-full bg-purple-50 text-purple-700 border-purple-200">
        Water Bill
      </Badge>
    )
  }
  if (lowerType.includes('connection fee') || lowerType === 'connection_fee') {
    return (
      <Badge variant="outline" className="rounded-full bg-sky-50 text-sky-700 border-sky-200">
        Connection Fee
      </Badge>
    )
  }
  if (lowerType.includes('reconnection')) {
    return (
      <Badge variant="outline" className="rounded-full bg-amber-50 text-amber-700 border-amber-200">
        Reconnection
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="rounded-full">
      {type}
    </Badge>
  )
}

// ─── Skeleton rows ─────────────────────────────────────────────────────────────

function SkeletonRows() {
  return (
    <>
      {[...Array(5)].map((_, i) => (
        <TableRow key={i}>
          {[...Array(6)].map((_, j) => (
            <TableCell key={j}>
              <div className="h-4 bg-muted animate-pulse rounded-md w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function ConsumerPaymentHistoryPage() {
  const [records, setRecords] = useState<ConsumerPaymentRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedSearch(search)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(5)

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    setIsLoading(true)
    getConsumerPaymentHistory()
      .then((res) => {
        if (res.status === 'success' && res.data) {
          setRecords(res.data)
        } else if (res.status === 'unauthenticated') {
          toast.error('Please log in to view your payment history.')
        } else {
          toast.error(res.message ?? 'Could not load payment history.')
        }
      })
      .catch(() => toast.error('An unexpected error occurred.'))
      .finally(() => setIsLoading(false))
  }, [])

  // ── Filter ─────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => records.filter((r) => {
    if (!debouncedSearch.trim()) return true
    const q = debouncedSearch.trim().toLowerCase()
    const receipt = r.receipt_number.toLowerCase()
    const meterNo = r.meter_account?.meter_serial_no?.toLowerCase() ?? ''
    const staff = r.processed_by
      ? `${r.processed_by.first_name} ${r.processed_by.last_name}`.toLowerCase()
      : ''
    return receipt.includes(q) || meterNo.includes(q) || staff.includes(q)
  }), [records, debouncedSearch])

  useEffect(() => { setPage(1) }, [filtered.length, debouncedSearch])

  // ── Pagination ─────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginated = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  )
  return (
    <div className="w-full space-y-6 lg:mb-0 mb-10">

      <PageHeading
        title="Payment History"
        description="A record of all payments made across your meter accounts"
      />

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="relative w-full min-w-0 sm:w-auto sm:flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by receipt, serial no., or staff…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 rounded-lg"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 hover:bg-muted"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between bg-muted/30">
          <p className="text-sm text-muted-foreground">
            {isLoading ? 'Loading…' : (
              <>
                <span className="font-medium text-foreground">{filtered.length}</span>
                {' '}payment{filtered.length !== 1 ? 's' : ''}
              </>
            )}
          </p>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="hidden sm:inline">Rows per page</span>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1) }}>
              <SelectTrigger className="h-8 w-[70px] rounded-lg"><SelectValue /></SelectTrigger>
              <SelectContent className="rounded-lg">
                {PAGE_SIZE_OPTIONS.map((s) => (
                  <SelectItem key={s} value={String(s)} className="rounded-lg cursor-pointer">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Receipt No.</TableHead>
              <TableHead>Receipt Type</TableHead>
              <TableHead>S/N</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Processed By</TableHead>
              <TableHead>Payment Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <SkeletonRows />
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-52 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <div className="rounded-lg bg-muted p-4 mb-1">
                      <Receipt className="h-7 w-7 text-muted-foreground" />
                    </div>
                    <p className="font-medium">No payments found</p>
                    <p className="text-sm text-muted-foreground">
                      {search ? 'Try adjusting your search.' : 'No payment history yet.'}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((record) => {
                const staffName = record.processed_by
                  ? `${record.processed_by.first_name} ${record.processed_by.last_name}`
                  : '—'

                return (
                  <TableRow key={record.receipt_id}>
                    {/* Receipt No. */}
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Receipt className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="font-mono text-sm font-medium">
                          {record.receipt_number || '—'}
                        </span>
                      </div>
                    </TableCell>

                    {/* Receipt Type */}
                    <TableCell>
                      <PaymentTypeBadge type={record.payment_type} />
                    </TableCell>

                    {/* Meter Account */}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="min-w-0">
                          <p className="font-mono text-sm font-medium leading-tight">
                            {record.meter_account?.meter_serial_no ?? '—'}
                          </p>
                          {record.meter_account && (
                            <p className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                              {record.meter_account.classification_name} · Brgy.&nbsp;
                              {record.meter_account.barangay_name}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>

                    {/* Amount */}
                    <TableCell className="text-right">
                      <span className="tabular-nums text-sm font-semibold text-emerald-600">
                        {formatPeso(record.amount)}
                      </span>
                    </TableCell>

                    {/* Processed By */}
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center shrink-0">
                          <User className="h-3 w-3 text-muted-foreground" />
                        </div>
                        <span className="text-sm">{staffName}</span>
                      </div>
                    </TableCell>

                    {/* Payment Date */}
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatDateTime(record.payment_date)}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

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