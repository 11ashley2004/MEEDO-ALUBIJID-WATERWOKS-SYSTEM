// Suggested path: components/admin-ui/rate-limit/UnblockRateLimitModal.tsx
'use client'

import { useState, type ReactNode } from 'react'
import { ShieldOff, Clock, RotateCcw } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

import { unblockRateLimit, type RateLimitRecord } from '@/lib/actions/rate-limit/rate-limit.actions'
import { MaskedValue } from '@/components/ui/masked-value'

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export function UnblockRateLimitModal({
  rateLimit,
  children,
  onSuccess,
}: {
  rateLimit: RateLimitRecord
  children: ReactNode
  onSuccess?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleUnblock = async () => {
    setIsSubmitting(true)
    try {
      const res = await unblockRateLimit(rateLimit.rate_limit_id, note)
      if (res.status === 'success') {
        toast.success(`Unblocked ${rateLimit.scope}: ${rateLimit.identifier}`)
        setOpen(false)
        setNote('')
        onSuccess?.()
      } else {
        toast.error(res.message ?? 'Failed to unblock')
      }
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setNote('') }}>
      <div onClick={() => setOpen(true)}>{children}</div>

      <DialogContent className="sm:max-w-md rounded-md">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <ShieldOff className="h-4 w-4 text-rose-500" /> Unblock this {rateLimit.scope}
          </DialogTitle>
          <DialogDescription className="text-xs">
            This clears the lockout immediately and lets requests through again. The action is logged.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="rounded-md border border-slate-200 bg-slate-50/60 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Identifier</span>
              <MaskedValue value={rateLimit.identifier} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Scope</span>
              <span className="text-[12.5px] font-medium text-slate-700 capitalize">{rateLimit.scope}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Action</span>
              <span className="text-[12.5px] font-medium text-slate-700">{rateLimit.action_name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Attempts</span>
              <span className="text-[12.5px] font-medium text-slate-700">{rateLimit.attempts}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Lockout count</span>
              <span className="text-[12.5px] font-medium text-slate-700">{rateLimit.lockout_count}</span>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-slate-200">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 flex items-center gap-1">
                <Clock className="h-3 w-3" /> Blocked until
              </span>
              <span className="text-[12.5px] font-medium text-rose-600">{fmtDateTime(rateLimit.blocked_until)}</span>
            </div>
          </div>

          {rateLimit.override_note && (
            <div className="rounded-md border border-amber-200 bg-amber-50/60 p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 flex items-center gap-1">
                <RotateCcw className="h-3 w-3" /> Previous override
              </p>
              <p className="text-xs text-amber-700 mt-1">{rateLimit.override_note}</p>
              <p className="text-[10px] text-amber-500 mt-1">
                {rateLimit.override_by_name ?? 'Unknown'} · {fmtDateTime(rateLimit.override_at)}
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="unblock-note" className="text-xs text-slate-600">
              Reason (optional, but recommended for the audit trail)
            </Label>
            <Textarea
              id="unblock-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Confirmed with the consumer this was a legitimate retry, not abuse."
              className="text-xs min-h-[70px] rounded-md"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpen(false)}
            disabled={isSubmitting}
            className="rounded-md"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleUnblock}
            disabled={isSubmitting}
            className="rounded-md bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60"
          >
            {isSubmitting ? 'Unblocking…' : 'Unblock'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}