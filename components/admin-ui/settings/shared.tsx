'use client'

import { Save, Info, Pencil, X, AlertTriangle } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

// ─── Formatting helpers ─────────────────────────────────────────────────────

export const fmtRelative = (d: string) => {
  const diffMs = Date.now() - new Date(d).getTime()
  const days = Math.floor(diffMs / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

export const fieldInputClass =
  'h-10 rounded-none border-0 text-[12.5px] disabled:opacity-100 disabled:bg-slate-50 disabled:text-slate-500 focus-visible:ring-0 focus-visible:ring-offset-0'

// ─── Small display bits ─────────────────────────────────────────────────────

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
      {children}
    </Label>
  )
}

export function UnsavedPill() {
  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-1.5 py-0.5">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      Unsaved
    </span>
  )
}

export function LoadingBlock() {
  return (
    <div className="space-y-3">
      <div className="h-10 bg-slate-100 animate-pulse rounded-md border border-slate-100" />
      <div className="h-10 bg-slate-100 animate-pulse rounded-md border border-slate-100 w-2/3" />
    </div>
  )
}

export function EmptyBlock({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-2 border border-dashed border-slate-200 rounded-md">
      <div className="h-12 w-12 rounded-md bg-slate-100 flex items-center justify-center">
        <Info className="h-6 w-6 text-slate-300" />
      </div>
      <p className="text-sm font-bold text-slate-700">{label}</p>
    </div>
  )
}

/** Bordered wrapper every field/section sits in — the consistent "card" unit for settings tabs. */
export function FieldCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('border border-slate-200 rounded-md p-4', className)}>
      {children}
    </div>
  )
}

/**
 * Edit-gated field.
 * Clean layout with Edit/Save button on the right side, no cancel button above.
 * Cancel is handled via the X button next to Save when editing.
 */
export function EditableField({
  label,
  dirty,
  editing,
  onEdit,
  onCancel,
  onSave,
  saving,
  children,
}: {
  label: React.ReactNode
  dirty: boolean
  editing: boolean
  onEdit: () => void
  onCancel: () => void
  onSave: () => void
  saving: boolean
  children: React.ReactNode
}) {
  return (
    <FieldCard className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <SectionLabel>{label}</SectionLabel>
          {dirty && <UnsavedPill />}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 min-w-[140px]">
          <div className={cn(
            'rounded-md border overflow-hidden transition-colors',
            editing ? 'border-violet-300 focus-within:border-violet-400' : 'border-slate-200'
          )}>
            <div className="[&_input]:h-10 [&_input]:border-0 [&_input]:focus-visible:ring-0 [&_input]:focus-visible:ring-offset-0 [&_input]:rounded-none">
              {children}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {editing ? (
            <>
              <button
                type="button"
                onClick={onCancel}
                disabled={saving}
                className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white h-10 w-10 text-slate-500 hover:border-red-200 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                title="Cancel editing"
              >
                <X className="h-4 w-4" />
              </button>

              <Button
                size="sm"
                disabled={!dirty || saving}
                onClick={onSave}
                className="h-10 rounded-md bg-violet-600 hover:bg-violet-700 text-white text-[12px] font-semibold px-4"
              >
                {saving
                  ? <><Spinner className="mr-1.5" />Saving…</>
                  : <><Save className="mr-1.5 h-3.5 w-3.5" />Save</>
                }
              </Button>
            </>
          ) : (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white h-10 px-4 text-[12px] font-semibold text-violet-600 hover:bg-violet-50 transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
          )}
        </div>
      </div>
    </FieldCard>
  )
}

// ─── Confirm dialog ─────────────────────────────────────────────────────────

interface ConfirmSaveDialogProps {
  open:       boolean
  title:      string
  summary:    React.ReactNode
  onConfirm:  () => void
  onClose:    () => void
  isLoading:  boolean
}

export function ConfirmSaveDialog({
  open, title, summary, onConfirm, onClose, isLoading,
}: ConfirmSaveDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !isLoading) onClose() }}>
      <DialogContent className="max-w-sm rounded-md border-slate-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[14px] font-bold text-slate-900">
            <div className="h-8 w-8 rounded-md bg-violet-600 flex items-center justify-center shrink-0">
              <Save className="h-4 w-4 text-white" />
            </div>
            {title}
          </DialogTitle>
          <DialogDescription className="text-[12px] text-slate-500">
            Please confirm the changes before saving.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md border border-slate-200 bg-slate-50/60 px-4 py-3 text-[12.5px]">
          {summary}
        </div>
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>This change will apply to all future billing calculations.</span>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
            className="rounded-md h-9 text-[13px] border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-600"
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isLoading}
            className="rounded-md h-9 text-[13px] bg-violet-600 hover:bg-violet-700 text-white font-semibold"
          >
            {isLoading
              ? <><Spinner className="mr-2" />Saving…</>
              : <><Save className="mr-2 h-4 w-4" />Save Changes</>
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Shared tab imperative handle ──────────────────────────────────────────
// Every tab component exposes this so the settings page can cancel an
// in-progress edit when the user switches away, without the parent needing
// to know each tab's internal state shape.

export interface SettingsTabHandle {
  cancelEdit: () => void
}