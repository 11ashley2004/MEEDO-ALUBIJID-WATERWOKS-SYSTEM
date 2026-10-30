'use client'

import { useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import {
  getPenaltyRates,
  updatePenaltyRate,
  type PenaltyRateRecord,
} from '@/lib/actions/settings/penalty-rate.actions'
import {
  EditableField, ConfirmSaveDialog, LoadingBlock, EmptyBlock,
  fieldInputClass, type SettingsTabHandle,
} from '@/components/admin-ui/settings/shared'

interface PenaltyRateTabProps {
  onDirtyChange?: (dirty: boolean) => void
}

const PenaltyRateTab = forwardRef<SettingsTabHandle, PenaltyRateTabProps>(
  function PenaltyRateTab({ onDirtyChange }, ref) {
    const [rates,       setRates]       = useState<PenaltyRateRecord[]>([])
    const [loading,     setLoading]     = useState(true)
    const [editing,     setEditing]     = useState<Record<string, string>>({})
    const [dirty,       setDirty]       = useState<Record<string, boolean>>({})
    const [editMode,    setEditMode]    = useState<Record<string, boolean>>({})
    const [saving,      setSaving]      = useState<string | null>(null)
    const [confirmRate, setConfirmRate] = useState<PenaltyRateRecord | null>(null)
    const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

    const fetchRates = useCallback(async () => {
      setLoading(true)
      try {
        const res = await getPenaltyRates()
        if (res.status === 'success' && res.data) {
          setRates(res.data)
          const nextEditing: Record<string, string> = {}
          res.data.forEach((r) => { nextEditing[r.penalty_rate_id] = String(r.penalty_rate) })
          setEditing(nextEditing)
          setDirty({})
          setEditMode({})
          setValidationErrors({})
        } else {
          toast.error(res.message ?? 'Failed to load penalty rates')
        }
      } catch {
        toast.error('Failed to load penalty rates')
      } finally {
        setLoading(false)
      }
    }, [])

    useEffect(() => { fetchRates() }, [fetchRates])

    useEffect(() => {
      onDirtyChange?.(Object.values(dirty).some(Boolean))
    }, [dirty, onDirtyChange])

    function handleInput(id: string, raw: string, original: number) {
      setEditing((p) => ({ ...p, [id]: raw }))
      const parsed = parseFloat(raw)
      setDirty((p) => ({ ...p, [id]: !isNaN(parsed) && parsed !== original }))
      // Clear validation error when user types
      setValidationErrors((p) => {
        const newErrors = { ...p }
        delete newErrors[id]
        return newErrors
      })
    }

    function startEdit(id: string) {
      setEditMode((p) => ({ ...p, [id]: true }))
      setValidationErrors((p) => {
        const newErrors = { ...p }
        delete newErrors[id]
        return newErrors
      })
    }

    function cancelEditFor(id: string, original: number) {
      setEditing((p) => ({ ...p, [id]: String(original) }))
      setDirty((p) => ({ ...p, [id]: false }))
      setEditMode((p) => ({ ...p, [id]: false }))
      setValidationErrors((p) => {
        const newErrors = { ...p }
        delete newErrors[id]
        return newErrors
      })
    }

    useImperativeHandle(ref, () => ({
      cancelEdit: () => {
        Object.keys(editMode).forEach((id) => {
          if (editMode[id]) {
            const record = rates.find((r) => r.penalty_rate_id === id)
            if (record) cancelEditFor(id, record.penalty_rate)
          }
        })
      },
    }))

    async function saveRate(record: PenaltyRateRecord) {
      const newRate = parseFloat(editing[record.penalty_rate_id])
      
      // Basic client-side validation
      if (isNaN(newRate) || newRate <= 0) {
        toast.error('Penalty rate must be greater than 0')
        setValidationErrors((p) => ({
          ...p,
          [record.penalty_rate_id]: 'Penalty rate must be greater than 0'
        }))
        return
      }
      if (newRate > 100) {
        toast.error('Penalty rate cannot exceed 100%')
        setValidationErrors((p) => ({
          ...p,
          [record.penalty_rate_id]: 'Penalty rate cannot exceed 100%'
        }))
        return
      }

      setSaving(record.penalty_rate_id)
      try {
        const res = await updatePenaltyRate(record.penalty_rate_id, newRate)
        
        if (res.status === 'success') {
          toast.success('Penalty rate updated successfully')
          await fetchRates()
          setConfirmRate(null)
        } else {
          // Handle server validation errors
          if (res.errors && Array.isArray(res.errors) && res.errors.length > 0) {
            const errorMessage = res.errors[0].message
            setValidationErrors((p) => ({
              ...p,
              [record.penalty_rate_id]: errorMessage
            }))
            toast.error(errorMessage)
          } else {
            toast.error(res.message ?? 'Failed to update penalty rate')
          }
        }
      } catch {
        toast.error('An unexpected error occurred')
      } finally {
        setSaving(null)
      }
    }

    if (loading) return <LoadingBlock />
    if (rates.length === 0) return <EmptyBlock label="No penalty rates configured." />

    return (
      <div className="space-y-4 max-w-md">
        {rates.map((rate) => {
          const isDirty        = !!dirty[rate.penalty_rate_id]
          const isEditingField = !!editMode[rate.penalty_rate_id]
          const isSaving       = saving === rate.penalty_rate_id
          const editVal        = editing[rate.penalty_rate_id] ?? String(rate.penalty_rate)
          const parsed         = parseFloat(editVal)
          const hasError       = !!validationErrors[rate.penalty_rate_id]

          return (
            <div key={rate.penalty_rate_id} className="space-y-2">
              <EditableField
                label="Penalty Rate"
                dirty={isDirty}
                editing={isEditingField}
                onEdit={() => startEdit(rate.penalty_rate_id)}
                onCancel={() => cancelEditFor(rate.penalty_rate_id, rate.penalty_rate)}
                onSave={() => setConfirmRate(rate)}
                saving={isSaving}
              >
                <Input
                  type="number"
                  min="0.01"
                  max="100"
                  step="0.01"
                  value={editVal}
                  disabled={!isEditingField}
                  onChange={(e) => handleInput(rate.penalty_rate_id, e.target.value, rate.penalty_rate)}
                  className={`${fieldInputClass} pr-8 ${hasError ? 'border-red-300 focus-visible:border-red-400' : ''}`}
                  placeholder="e.g. 2.00"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-[12.5px] font-medium pointer-events-none">
                  %
                </span>
              </EditableField>

              {hasError && isEditingField && (
                <p className="text-[11px] text-red-600 px-1">
                  {validationErrors[rate.penalty_rate_id]}
                </p>
              )}

              {!isNaN(parsed) && parsed > 0 && !hasError && (
                <p className="text-[11px] text-slate-500 px-1">
                  Example: ₱1,000 overdue → penalty of{' '}
                  <span className="font-semibold text-slate-700">
                    ₱{((parsed / 100) * 1000).toFixed(2)}
                  </span>
                </p>
              )}
            </div>
          )
        })}

        {confirmRate && (
          <ConfirmSaveDialog
            open={!!confirmRate}
            title="Update Penalty Rate"
            summary={
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Current rate</span>
                  <span className="font-medium text-slate-800">{confirmRate.penalty_rate}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">New rate</span>
                  <span className="font-semibold text-violet-600">
                    {editing[confirmRate.penalty_rate_id]}%
                  </span>
                </div>
              </div>
            }
            onConfirm={() => saveRate(confirmRate)}
            onClose={() => setConfirmRate(null)}
            isLoading={saving === confirmRate.penalty_rate_id}
          />
        )}
      </div>
    )
  },
)

export default PenaltyRateTab