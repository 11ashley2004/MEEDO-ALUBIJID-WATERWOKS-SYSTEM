'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { Plus, Loader2, Save, Trash2, X } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'

import {
  Sheet, SheetClose, SheetContent,
  SheetDescription, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  upsertClassificationTiers,
  getClassificationsWithChargeSummary,
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
  _id:             string
  min_consumption: number
  max_consumption: number | null
  multiplier:      number
}

interface CreateCommunityChargeFormProps {
  classifications: ConsumerClassification[]
  onSuccess?:      () => void
  children?: React.ReactNode
}

// ============================================================================
// Helpers
// ============================================================================

function uid(): string {
  return Math.random().toString(36).slice(2, 9)
}

function makeDefaultTiers(): TierRow[] {
  return [
    { _id: uid(), min_consumption: 1, max_consumption: 2,    multiplier: 0 },
    { _id: uid(), min_consumption: 3, max_consumption: null, multiplier: 0 },
  ]
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

function TierEditorRow({
  row,
  index,
  isLast,
  onChange,
  onRemove,
  canRemove,
}: TierEditorRowProps) {
  return (
    <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-start">
      {/* Min — read-only, derived from previous max */}
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
            !isLast &&
              row.max_consumption === null &&
              'border-rose-500 focus-visible:ring-rose-500'
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
// Main Form
// ============================================================================

export function CreateCommunityChargeForm({
  classifications,
  onSuccess,
  children,
}: CreateCommunityChargeFormProps) {
  const [open, setOpen]                     = useState(false)
  const [isSaving, setIsSaving]             = useState(false)
  const [isLoadingEmpty, setIsLoadingEmpty] = useState(false)

  const [emptyClassifications, setEmptyClassifications] = useState<ConsumerClassification[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [tiers, setTiers]           = useState<TierRow[]>([])

  const selected = emptyClassifications.find((c) => c.classification_id === selectedId) ?? null

  // Load classifications without tiers when sheet opens
  useEffect(() => {
    if (!open) return

    setIsLoadingEmpty(true)
    setSelectedId('')
    setTiers([])

    getClassificationsWithChargeSummary().then((res) => {
      if (res.status === 'success') {
        const empty = res.data
          .filter((r) => r.tier_count === 0)
          .map((r) => ({
            classification_id:   r.classification_id,
            classification_name: r.classification_name,
            description:         r.description,
          }))
        setEmptyClassifications(empty)
      } else {
        toast.error('Failed to load classifications.')
      }
      setIsLoadingEmpty(false)
    })
  }, [open])

  const handleSelectClassification = useCallback((id: string) => {
    setSelectedId(id)
    setTiers(makeDefaultTiers())
  }, [])

  const recomputeMins = useCallback((rows: TierRow[]): TierRow[] =>
    rows.map((row, i) => {
      if (i === 0) return { ...row, min_consumption: 1 }
      const prevMax = rows[i - 1].max_consumption
      return {
        ...row,
        min_consumption: prevMax !== null ? prevMax + 1 : row.min_consumption,
      }
    }), [])

  const handleChange = useCallback(
    (id: string, field: 'max_consumption' | 'multiplier', value: number | null) => {
      setTiers((prev) => {
        const updated = prev.map((row) =>
          row._id === id ? { ...row, [field]: value } : row
        )
        return field === 'max_consumption' ? recomputeMins(updated) : updated
      })
    },
    [recomputeMins]
  )

  const handleAddTier = useCallback(() => {
    setTiers((prev) => {
      const last   = prev[prev.length - 1]
      const newMin =
        last.max_consumption !== null
          ? last.max_consumption + 1
          : last.min_consumption + 1
      return [
        ...prev,
        { _id: uid(), min_consumption: newMin, max_consumption: null, multiplier: 0 },
      ]
    })
  }, [])

  const handleRemove = useCallback(
    (id: string) => {
      setTiers((prev) => recomputeMins(prev.filter((r) => r._id !== id)))
    },
    [recomputeMins]
  )

  function validateTiers(): string | null {
    for (let i = 0; i < tiers.length; i++) {
      const tier = tiers[i]
      const isLast = i === tiers.length - 1

      if (!isLast && tier.max_consumption === null) {
        return `Tier ${i + 1}: max is required for non-last tiers.`
      }
      if (
        tier.max_consumption !== null &&
        tier.max_consumption <= tier.min_consumption
      ) {
        return `Tier ${i + 1}: max must be greater than min (${tier.min_consumption}).`
      }
      if (tier.multiplier <= 0) {
        return `Tier ${i + 1}: rate must be greater than 0.`
      }
    }
    return null
  }

  const handleSave = async () => {
    if (!selected) return

    const validationError = validateTiers()
    if (validationError) {
      toast.error(validationError)
      return
    }

    setIsSaving(true)
    try {
      const payload: TierInput[] = tiers.map((t) => ({
        min_consumption: t.min_consumption,
        max_consumption: t.max_consumption,
        multiplier:      t.multiplier,
      }))

      const result = await upsertClassificationTiers(selected.classification_id, payload)

      if (result.status === 'success') {
        toast.success(`Tiers created for ${selected.classification_name}.`)
        setOpen(false)
        onSuccess?.()
      } else {
        toast.error(result.message ?? 'Failed to save tiers.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  const lastTierHasMax = tiers.length > 0 && tiers[tiers.length - 1].max_consumption !== null

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {children}
      </SheetTrigger>

      <SheetContent className="w-full sm:max-w-lg flex flex-col h-full p-0 gap-0">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-md bg-violet-100 border border-violet-200 flex items-center justify-center shrink-0">
              <Plus className="h-4 w-4 text-violet-600" />
            </div>
            <div>
              <SheetTitle className="text-[14px] font-bold text-slate-900 leading-tight">
                Add Community Charge
              </SheetTitle>
              <SheetDescription className="text-[11px] text-slate-500 mt-0.5">
                Select a classification and define its consumption tiers.
              </SheetDescription>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Classification dropdown */}
          <div>
            <Label className="text-[11px] font-semibold text-slate-700 mb-1.5 block">
              Consumer Classification
            </Label>

            {isLoadingEmpty ? (
              <div className="h-9 rounded-md border bg-slate-50 flex items-center px-3 gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" />
                <span className="text-[13px] text-slate-500">Loading...</span>
              </div>
            ) : (
              <Select value={selectedId} onValueChange={handleSelectClassification}>
                <SelectTrigger className="w-full h-9 rounded-md text-[13px]">
                  <SelectValue placeholder="Select a classification" />
                </SelectTrigger>
                <SelectContent className="bg-white border border-slate-200 rounded-md">
                  {emptyClassifications.length === 0 ? (
                    <div className="px-3 py-4 text-[13px] text-slate-500 text-center">
                      All classifications already have tiers configured.
                    </div>
                  ) : (
                    emptyClassifications.map((cls) => (
                      <SelectItem
                        key={cls.classification_id}
                        value={cls.classification_id}
                        className="text-[13px] cursor-pointer"
                      >
                        {cls.classification_name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            )}
            <p className="text-[10px] text-slate-400 mt-1.5">
              Only classifications without existing tiers are shown.
            </p>
          </div>

          {/* Tier rows */}
          {selected && tiers.length > 0 && (
            <>
              <Separator />
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
            disabled={isSaving || !selected || tiers.length === 0}
            className="rounded-md h-9 text-[13px] bg-violet-600 hover:bg-violet-700 text-white gap-1.5 font-medium shadow-sm shadow-violet-200"
          >
            {isSaving
              ? <><Spinner /> Saving...</>
              : <><Save className="h-3.5 w-3.5" /> Save Tiers</>
            }
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export default CreateCommunityChargeForm