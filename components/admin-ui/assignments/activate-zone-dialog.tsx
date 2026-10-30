'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Power, AlertTriangle, ArrowRightLeft } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  getActiveAssignmentForZone,
  activateAssignment,
  type ActiveZoneHolder,
} from '@/lib/actions/job-assignment/meter-reader-assignments.actions'

interface ActivateZoneDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  assignmentId: string | null
  zoneId: string | null
  zoneName: string
  barangayName: string
  readerName: string
  onSuccess: () => void
}

export function ActivateZoneDialog({
  open, onOpenChange, assignmentId, zoneId, zoneName, readerName, onSuccess,
}: ActivateZoneDialogProps) {
  const [isChecking, setIsChecking] = useState(false)
  const [isActivating, setIsActivating] = useState(false)
  const [conflict, setConflict] = useState<ActiveZoneHolder | null>(null)

  const checkConflict = useCallback(async () => {
    if (!zoneId || !assignmentId) return
    setIsChecking(true)
    try {
      setConflict(await getActiveAssignmentForZone(zoneId, assignmentId))
    } catch {
      toast.error('Failed to check zone status')
    } finally {
      setIsChecking(false)
    }
  }, [zoneId, assignmentId])

  useEffect(() => {
    if (open) checkConflict()
    if (!open) setConflict(null)
  }, [open, checkConflict])

  const handleActivate = async () => {
    if (!assignmentId) return
    setIsActivating(true)
    try {
      const result = await activateAssignment({
        assignment_id: assignmentId,
        conflict_assignment_id: conflict?.assignment_id,
      })
      if (result.status === 'success') {
        toast.success(result.message || 'Assignment activated')
        onOpenChange(false)
        onSuccess()
      } else {
        toast.error(result.message || 'Failed to activate assignment')
        checkConflict() // state may have changed underneath us — refresh
      }
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setIsActivating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden rounded-md border border-border bg-background">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border text-left">
          <div className="flex items-start gap-3 pr-8">
            <div className="h-10 w-10 rounded-md bg-emerald-600 flex items-center justify-center shrink-0">
              <Power className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold text-foreground leading-tight">
                Activate zone
              </DialogTitle>
              <p className="text-sm text-foreground/80 mt-0.5 truncate">
                {zoneName} · {readerName}
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="px-6 py-5">
          {isChecking && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm font-medium text-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking who has this zone…
            </div>
          )}

          {!isChecking && !conflict && (
            <div className="flex items-start gap-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-4">
              <Power className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <p className="text-sm text-foreground leading-relaxed">
                No one else is active on this zone. You can turn it on for {readerName}.
              </p>
            </div>
          )}

          {!isChecking && conflict && (
            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-4">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    Another reader already has this zone
                  </p>
                  <p className="text-sm text-foreground mt-1 truncate">
                    {conflict.first_name} {conflict.last_name}
                  </p>
                  <p className="text-sm text-foreground/80 truncate">{conflict.email}</p>
                </div>
              </div>
              <p className="text-sm text-foreground/80 leading-relaxed flex items-start gap-2">
                <ArrowRightLeft className="h-4 w-4 shrink-0 mt-0.5" />
                Turning this on moves the zone from {conflict.first_name} {conflict.last_name} to {readerName}.
              </p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isActivating}
            className="!h-10 !rounded-md text-sm font-semibold"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleActivate}
            disabled={isChecking || isActivating}
            className={cn(
              '!h-10 !rounded-md text-sm font-semibold',
              conflict && 'bg-amber-600 hover:bg-amber-700 text-white',
            )}
          >
            {isActivating ? <Spinner /> : conflict ? <ArrowRightLeft className="h-4 w-4" /> : <Power className="h-4 w-4" />}
            {conflict ? 'Move and activate' : 'Activate'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default ActivateZoneDialog