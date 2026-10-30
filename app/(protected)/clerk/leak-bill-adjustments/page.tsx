'use client'

import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'



import { PageHeading } from '@/components/shared-ui/page-heading'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, Receipt, RefreshCw, Search,
} from 'lucide-react'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  getLeakReportsForBillAdjustment,
} from '@/lib/actions/service-report/service-report-workflow.actions'
import ClerkLeakBillAdjustDialog from '@/components/clerk-ui/service-report/leak-bill-adjust-dialog'

type LeakRow = NonNullable<
  Awaited<ReturnType<typeof getLeakReportsForBillAdjustment>>['data']
>[number]

export default function ClerkLeakBillAdjustmentsPage() {
  const [rows, setRows] = useState<LeakRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedSearch(search)
  const [adjustTarget, setAdjustTarget] = useState<LeakRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await getLeakReportsForBillAdjustment()
    if (res.status === 'success' && res.data) setRows(res.data)
    else toast.error(res.message ?? 'Failed to load leak reports')
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) =>
        r.reference_no?.toLowerCase().includes(q) ||
        r.consumer_name?.toLowerCase().includes(q) ||
        r.contract_no?.toLowerCase().includes(q) ||
        r.zone_name?.toLowerCase().includes(q) ||
        r.barangay_name?.toLowerCase().includes(q),
    )
  }, [rows, debouncedSearch])

  const pending = filtered.filter((r) => !r.has_adjustment)

  return (
    <div className="w-full space-y-4 lg:mb-0 mb-15">
      <PageHeading
        title="Leak Bill Adjustments"
        description="Confirmed leak reports — adjust billed consumption"
      />
      <div className="rounded-md border border-border bg-white overflow-hidden">
        <div className="px-4 sm:px-5 py-3 flex flex-col sm:flex-row gap-2.5 sm:items-center justify-between">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search account, zone, reference…"
              className="h-8 pl-8 text-xs rounded-md"
            />
          </div>
          <div className="flex items-center gap-2.5">
            <p className="text-[11px] text-muted-foreground">
              <span className="font-semibold text-foreground">{pending.length}</span> awaiting adjustment
            </p>
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-md text-xs gap-1.5 border-purple-200 text-purple-700 hover:bg-purple-50"
              onClick={load}
              disabled={loading}
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-md border border-border bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                {['Reference', 'Account', 'Zone / Barangay', 'Inspected', 'Flags', ''].map((h) => (
                  <th
                    key={h || 'actions'}
                    className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-muted-foreground whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(4)].map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    {[...Array(6)].map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-4 w-full rounded-md" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center">
                        <Receipt className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        No confirmed leak reports ready for bill adjustment
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr
                    key={r.report_id}
                    className="border-b border-border last:border-0 hover:bg-purple-50/40 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-bold text-purple-700 bg-purple-50 px-2 py-1 rounded-md border border-purple-100">
                        {r.reference_no ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-foreground">{r.consumer_name ?? '—'}</p>
                      <p className="text-[11px] text-muted-foreground font-mono">
                        {r.contract_no ?? '—'}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <p className="font-medium text-foreground">{r.zone_name ?? '—'}</p>
                      <p className="text-muted-foreground">{r.barangay_name ?? '—'}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                      {r.inspected_at
                        ? new Date(r.inspected_at).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {r.has_adjustment ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] rounded-md bg-emerald-50 text-emerald-700 border-emerald-200"
                          >
                            Adjusted
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-[10px] rounded-md bg-amber-50 text-amber-700 border-amber-200"
                          >
                            Needs adjustment
                          </Badge>
                        )}
                        {r.billed_on_average && (
                          <Badge
                            variant="outline"
                            className="text-[10px] rounded-md gap-1 bg-orange-50 text-orange-700 border-orange-200"
                          >
                            <AlertTriangle className="h-3 w-3" />
                            Billed on average
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!r.has_adjustment && (
                        <Button
                          size="sm"
                          className="h-8 rounded-md text-xs bg-purple-600 hover:bg-purple-700"
                          onClick={() => setAdjustTarget(r)}
                        >
                          Adjust bill
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ClerkLeakBillAdjustDialog
        open={!!adjustTarget}
        onOpenChange={(v) => {
          if (!v) setAdjustTarget(null)
        }}
        report={adjustTarget}
        onSuccess={load}
      />
    </div>
  )
}
