'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { Loader2, Save, Trash2, Plus, FilePenLine } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import {
  Sheet, SheetClose, SheetContent,
  SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import {
  getChargesByClassification,
  upsertClassificationTiers,
  type TierInput,
} from '@/lib/actions/community-charges.actions'

// ============================================================================
// Types
// ============================================================================

interface ConsumerClassification {
  classification_id:   string
  classification_name: string
  description:         string | null
}

interface TierRow {
  _id:                 string
  community_charge_id?: string
  min_consumption:     number
  max_consumption:     number | null
  multiplier:          number
}

interface UpdateCommunityChargeFormProps {
  charge: {
    community_charge_id: string
    classification_id:   string
    min_consumption:     number
    max_consumption:     number | null
    multiplier:          number
  }
  classifications: ConsumerClassification[]
  isOpen:          boolean
  onOpenChange:    (open: boolean) => void
  onSuccess:       () => void
}

// ============================================================================
// Helpers
// ============================================================================

function uid() {
  return Math.random().toString(36).slice(2, 9)
}

// ============================================================================
// Tier Editor Row
// ============================================================================

interface TierEditorRowProps {
  row:       TierRow
  index:     number
  isLast:    boolean
  onChange:  (id: string, field: 'max_consumption' | 'multiplier', value: number | null) => void
  onRemove:  (id: string) => void
  canRemove: boolean
}

function TierEditorRow({ row, index, isLast, onChange, onRemove, canRemove }: TierEditorRowProps) {
  return (
    <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-start">
      {/* Min — read-only */}
      <div>
        {index === 0 && (
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Min (m³)</p>
        )}
        <div className="h-9 px-3 rounded-md border bg-slate-50 flex items-center text-[13px] text-slate-500 select-none">
          {row.min_consumption}
        </div>
      </div>

      {/* Max */}
      <div>
        {index === 0 && (
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Max (m³)</p>
        )}
        <Input
          type="number"
          min={row.min_consumption + 1}
          placeholder={isLast ? '∞' : 'Required'}
          value={row.max_consumption ?? ''}
          onChange={(e) => {
            const v = e.target.value
            onChange(row._id, 'max_consumption', v === '' ? null : parseFloat(v))
          }}
          className={cn(
            'h-9 rounded-md text-[13px]',
            !isLast && row.max_consumption === null && 'border-rose-500 focus-visible:ring-rose-500'
          )}
        />
      </div>

      {/* Rate */}
      <div>
        {index === 0 && (
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Rate (₱/m³)</p>
        )}
        <Input
          type="number"
          min={0.01}
          step={0.01}
          placeholder="0.00"
          value={row.multiplier === 0 ? '' : row.multiplier}
          onChange={(e) => {
            const v = e.target.value
            onChange(row._id, 'multiplier', v === '' ? 0 : parseFloat(v))
          }}
          className="h-9 rounded-md text-[13px]"
        />
      </div>

      {/* Remove */}
      <div className={cn(index === 0 && 'mt-6')}>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          disabled={!canRemove}
          onClick={() => onRemove(row._id)}
          className="h-9 w-9 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function UpdateCommunityChargeForm({
  charge,
  classifications,
  isOpen,
  onOpenChange,
  onSuccess,
}: UpdateCommunityChargeFormProps) {
  const [tiers, setTiers]       = useState<TierRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const classification = classifications.find(
    (c) => c.classification_id === charge.classification_id
  )

  // Load all tiers for this classification when the sheet opens
  useEffect(() => {
    if (!isOpen) return
    setIsLoading(true)

    getChargesByClassification(charge.classification_id).then((res) => {
      if (res.status === 'success') {
        setTiers(
          res.data.tiers.length > 0
            ? res.data.tiers.map((t) => ({
                _id:                 uid(),
                community_charge_id: t.community_charge_id,
                min_consumption:     t.min_consumption,
                max_consumption:     t.max_consumption,
                multiplier:          t.multiplier,
              }))
            : [{ _id: uid(), min_consumption: 1, max_consumption: null, multiplier: 0 }]
        )
      } else {
        toast.error('Failed to load tiers')
      }
      setIsLoading(false)
    })
  }, [isOpen, charge.classification_id])

  // Tier helpers
  const recomputeMins = useCallback((rows: TierRow[]): TierRow[] =>
    rows.map((row, i) => {
      if (i === 0) return { ...row, min_consumption: 1 }
      const prevMax = rows[i - 1].max_consumption
      return { ...row, min_consumption: prevMax !== null ? prevMax + 1 : row.min_consumption }
    }), [])

  const handleChange = useCallback((id: string, field: 'max_consumption' | 'multiplier', value: number | null) => {
    setTiers((prev) => {
      const updated = prev.map((row) => row._id === id ? { ...row, [field]: value } : row)
      return field === 'max_consumption' ? recomputeMins(updated) : updated
    })
  }, [recomputeMins])

  const handleAddTier = useCallback(() => {
    setTiers((prev) => {
      const last   = prev[prev.length - 1]
      const newMin = last.max_consumption !== null ? last.max_consumption + 1 : last.min_consumption + 1
      return [...prev, { _id: uid(), min_consumption: newMin, max_consumption: null, multiplier: 0 }]
    })
  }, [])

  const handleRemove = useCallback((id: string) => {
    setTiers((prev) => recomputeMins(prev.filter((r) => r._id !== id)))
  }, [recomputeMins])

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const payload: TierInput[] = tiers.map((t) => ({
        community_charge_id: t.community_charge_id,
        min_consumption:     t.min_consumption,
        max_consumption:     t.max_consumption,
        multiplier:          t.multiplier,
      }))
      const result = await upsertClassificationTiers(charge.classification_id, payload)
      if (result.status === 'success') {
        toast.success(`Tiers updated for ${classification?.classification_name ?? 'classification'}`)
        onOpenChange(false)
        onSuccess()
      } else {
        toast.error(result.message ?? 'Failed to update tiers')
      }
    } finally {
      setIsSaving(false)
    }
  }

  const lastTierHasMax = tiers.length > 0 && tiers[tiers.length - 1].max_consumption !== null

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col h-full p-0 gap-0">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-md bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0">
              <FilePenLine className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <SheetTitle className="text-[14px] font-bold text-slate-900 leading-tight">
                Edit Consumption Rates
              </SheetTitle>
              <SheetDescription className="text-[11px] text-slate-500 mt-0.5">
                {classification?.description
                  ? classification.description
                  : 'Update the consumption tiers for this classification.'}
              </SheetDescription>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
            </div>
          ) : (
            <>
              <div>
                <Badge variant="outline" className="rounded-md bg-violet-50 text-violet-700 border-violet-200 text-[10px] font-semibold">
                  {classification?.classification_name}
                </Badge>
              </div>

              <div className="space-y-3">
                <p className="text-[10px] font-semibold text-violet-600 uppercase tracking-wider">
                  Consumption Tiers
                </p>
                <div className="space-y-2">
                  {tiers.map((tier, idx) => (
                    <TierEditorRow
                      key={tier._id}
                      row={tier}
                      index={idx}
                      isLast={idx === tiers.length - 1}
                      onChange={handleChange}
                      onRemove={handleRemove}
                      canRemove={tiers.length > 1}
                    />
                  ))}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full gap-1.5 rounded-md border-dashed h-8 text-[12px]"
                  onClick={handleAddTier}
                  disabled={!lastTierHasMax}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add tier
                </Button>

                <div className="bg-slate-50 rounded-md p-3 space-y-1 text-[10px] text-slate-500">
                  <p><span className="font-semibold text-slate-600">Min</span> — auto-set from previous tier's max + 1. First tier always starts at 1.</p>
                  <p><span className="font-semibold text-slate-600">Max</span> — leave empty only on the last tier (means no upper limit).</p>
                  <p><span className="font-semibold text-slate-600">Rate</span> — price per cubic meter (₱/m³) for this range.</p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex items-center justify-end gap-2.5 bg-slate-50/60 border-t border-slate-100">
          <SheetClose asChild>
            <Button
              type="button"
              variant="outline"
              className="rounded-md h-9 text-[13px] border-slate-200 hover:bg-slate-100"
              disabled={isSaving}
            >
              Cancel
            </Button>
          </SheetClose>
          <Button
            onClick={handleSave}
            disabled={isSaving || isLoading}
            className="rounded-md h-9 text-[13px] bg-violet-600 hover:bg-violet-700 text-white gap-1.5 font-medium shadow-sm shadow-violet-200"
          >
            {isSaving
              ? <><Spinner /> Saving...</>
              : <><Save className="h-3.5 w-3.5" /> Save Changes</>
            }
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export default UpdateCommunityChargeForm