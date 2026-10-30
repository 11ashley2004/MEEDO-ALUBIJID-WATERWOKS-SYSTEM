'use client'

import React, { useState, useEffect } from 'react'
import { Loader2, Eye, TrendingUp, Droplets, Layers3, X } from 'lucide-react'
import { toast } from 'sonner'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import {
  getChargesByClassification,
  type TierDetail,
} from '@/lib/actions/community-charges.actions'

// ============================================================================
// Types
// ============================================================================

interface ViewCommunityChargeDialogProps {
  classificationId:   string
  classificationName: string
  description:        string | null
  tierCount:          number
  open:               boolean
  onOpenChange:       (open: boolean) => void
}

// ============================================================================
// Helpers
// ============================================================================

function formatRate(value: number): string {
  return new Intl.NumberFormat('en-PH', {
    style:                 'currency',
    currency:              'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function getRangeLabel(min: number, max: number | null): string {
  if (max === null) return `${min} m³ and above`
  return `${min} – ${max} m³`
}

// ============================================================================
// Stat Card
// ============================================================================

interface StatCardProps {
  icon:    React.ReactNode
  label:   string
  value:   string
}

function StatCard({ icon, label, value }: StatCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2.5">
      <div className="h-7 w-7 rounded-md bg-violet-100 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
          {label}
        </p>
        <p className="text-[13px] font-bold text-slate-800 tabular-nums">
          {value}
        </p>
      </div>
    </div>
  )
}

// ============================================================================
// Main Dialog
// ============================================================================

const ViewCommunityChargeDialog = ({
  classificationId,
  classificationName,
  description,
  tierCount,
  open,
  onOpenChange,
}: ViewCommunityChargeDialogProps) => {
  const [tiers, setTiers]         = useState<TierDetail[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Load tiers when dialog opens
  useEffect(() => {
    if (!open) return

    setIsLoading(true)
    getChargesByClassification(classificationId).then((res) => {
      if (res.status === 'success') {
        setTiers(res.data.tiers)
      } else {
        toast.error('Failed to load tier details.')
      }
      setIsLoading(false)
    })
  }, [open, classificationId])

  // Derived stats from loaded tiers
  const rates        = tiers.map((t) => t.multiplier)
  const lowestRate   = rates.length > 0 ? Math.min(...rates) : null
  const highestRate  = rates.length > 0 ? Math.max(...rates) : null
  const isUnbounded  = tiers.some((t) => t.max_consumption === null)
  const maxConsumption = isUnbounded
    ? '∞'
    : tiers.length > 0
      ? `${Math.max(...tiers.map((t) => t.max_consumption ?? 0))} m³`
      : '—'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full sm:max-w-2xl flex flex-col p-0 gap-0 border-l border-slate-200 bg-white rounded-md max-h-[90vh] overflow-hidden">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-md bg-violet-100 border border-violet-200 flex items-center justify-center shrink-0">
              <Eye className="h-4 w-4 text-violet-600" />
            </div>
            <div>
              <DialogTitle className="text-[14px] font-bold text-slate-900 leading-tight">
                Consumption Rates
              </DialogTitle>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {classificationName}
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
                <p className="text-[11px] text-slate-400">Loading tiers...</p>
              </div>
            </div>
          ) : tiers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="h-12 w-12 rounded-md bg-slate-100 flex items-center justify-center">
                <Layers3 className="h-5 w-5 text-slate-400" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-600">No tiers configured</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Add tiers to this classification to define billing rates.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Summary stat cards */}
              <div className="grid grid-cols-3 gap-3">
                <StatCard
                  icon={<Layers3 className="h-3.5 w-3.5 text-violet-600" />}
                  label="Total Tiers"
                  value={`${tiers.length} tier${tiers.length !== 1 ? 's' : ''}`}
                />
                <StatCard
                  icon={<Droplets className="h-3.5 w-3.5 text-violet-600" />}
                  label="Max Usage"
                  value={maxConsumption}
                />
                <StatCard
                  icon={<TrendingUp className="h-3.5 w-3.5 text-violet-600" />}
                  label="Rate Range"
                  value={
                    lowestRate === highestRate
                      ? formatRate(lowestRate!)
                      : `${formatRate(lowestRate!)} – ${formatRate(highestRate!)}`
                  }
                />
              </div>

              {/* Description */}
              {description && (
                <div className="bg-slate-50 rounded-md p-3 border border-slate-100">
                  <p className="text-[11px] text-slate-600">{description}</p>
                </div>
              )}

              {/* Tier table */}
              <div>
                <p className="text-[10px] font-semibold text-violet-600 uppercase tracking-wider mb-2.5">
                  Consumption Tiers
                </p>
                <div className="rounded-md border border-slate-200 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/40">
                        <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider w-12">Tier</TableHead>
                        <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Consumption Range</TableHead>
                        <TableHead className="text-right text-[9px] font-bold text-slate-400 uppercase tracking-wider">Rate (₱/m³)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tiers.map((tier, i) => {
                        const isLast = i === tiers.length - 1
                        return (
                          <TableRow
                            key={tier.community_charge_id}
                            className="border-t border-slate-100 hover:bg-violet-50/40 transition-colors"
                          >
                            <TableCell className="py-2.5">
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-violet-100 text-[10px] font-bold text-violet-600">
                                {i + 1}
                              </span>
                            </TableCell>
                            <TableCell className="py-2.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[12px] font-mono text-slate-700">
                                  {getRangeLabel(tier.min_consumption, tier.max_consumption)}
                                </span>
                                {isLast && tier.max_consumption === null && (
                                  <Badge variant="outline" className="rounded-md text-[9px] px-1.5 py-0 bg-slate-100 text-slate-500 border-slate-200">
                                    unbounded
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="py-2.5 text-right">
                              <span className="text-[12px] font-semibold tabular-nums text-emerald-700">
                                {formatRate(tier.multiplier)}
                              </span>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Footnote */}
              <div className="bg-slate-50 rounded-md p-3">
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Rates are applied per cubic meter (m³) of water consumption within each tier's
                  range. The last tier is unbounded — it applies to all consumption above its
                  minimum.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex items-center justify-end gap-2.5 bg-slate-50/60 border-t border-slate-100">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-md h-9 text-[13px] border-slate-200 hover:bg-slate-100"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default ViewCommunityChargeDialog