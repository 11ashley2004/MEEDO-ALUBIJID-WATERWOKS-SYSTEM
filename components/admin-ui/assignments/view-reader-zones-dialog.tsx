'use client'

import { useState, useEffect, useCallback } from 'react'
import { Power, PowerOff, MapPin, Layers, User } from 'lucide-react'
import { toast } from 'sonner'

import { Sheet, SheetClose, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import {
  getAssignmentsByUserId,
  type ReaderZoneAssignment,
} from '@/lib/actions/job-assignment/meter-reader-assignments.actions'
import ReassignZoneDialog from '@/components/admin-ui/assignments/reassign-zone-dialog'
import ActivateZoneDialog from '@/components/admin-ui/assignments/activate-zone-dialog'

interface ViewReaderZonesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  readerId: string
  readerName: string
  readerEmail: string
  onSuccess?: () => void
}

export function ViewReaderZonesDialog({
  open, onOpenChange, readerId, readerName, onSuccess,
}: ViewReaderZonesDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [assignments, setAssignments] = useState<ReaderZoneAssignment[]>([])

  // Reuse the same popup dialogs the previous combined sheet used.
  const [reassignOpen, setReassignOpen] = useState(false)
  const [reassignTarget, setReassignTarget] = useState<ReaderZoneAssignment | null>(null)

  const [activateOpen, setActivateOpen] = useState(false)
  const [activateTarget, setActivateTarget] = useState<ReaderZoneAssignment | null>(null)

  const loadAssignments = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await getAssignmentsByUserId(readerId)
      if (result.status === 'success' && result.data) {
        setAssignments(result.data)
      } else {
        setAssignments([])
        if (result.message) toast.error(result.message)
      }
    } catch (error) {
      console.error('Failed to load assignments:', error)
      toast.error('Failed to load zones')
      setAssignments([])
    } finally {
      setIsLoading(false)
    }
  }, [readerId])

  useEffect(() => {
    if (open) loadAssignments()
  }, [open, loadAssignments])

  useEffect(() => {
    if (!open) {
      setReassignOpen(false)
      setReassignTarget(null)
      setActivateOpen(false)
      setActivateTarget(null)
    }
  }, [open])

  const handleDeactivateClick = (assignment: ReaderZoneAssignment) => {
    setReassignTarget(assignment)
    setReassignOpen(true)
  }

  const handleActivateClick = (assignment: ReaderZoneAssignment) => {
    setActivateTarget(assignment)
    setActivateOpen(true)
  }

  const handleReassignSuccess = () => {
    loadAssignments()
    onSuccess?.()
  }

  const handleActivateSuccess = () => {
    loadAssignments()
    onSuccess?.()
  }

  const activeCount = assignments.filter((a) => a.is_active).length
  const inactiveCount = assignments.length - activeCount

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-lg flex flex-col h-full p-0 gap-0 border-l border-border bg-background">
          <div className="px-6 pt-6 pb-5 border-b border-border shrink-0">
            <div className="flex items-start gap-3 pr-8">
              <div className="h-10 w-10 rounded-md bg-primary flex items-center justify-center shrink-0">
                <User className="h-5 w-5 text-primary-foreground" />
              </div>
              <div className="min-w-0">
                <SheetTitle className="text-base font-semibold text-foreground leading-tight truncate">
                  Assigned zones
                </SheetTitle>
                <p className="text-sm text-foreground/80 mt-0.5 truncate">{readerName}</p>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                Assigned zones
              </p>
              {!isLoading && assignments.length > 0 && (
                <span className="text-sm font-medium text-foreground/80">
                  {activeCount} active · {inactiveCount} inactive
                </span>
              )}
            </div>

            <div className="rounded-md border border-border bg-card overflow-hidden">
              {isLoading && (
                <div className="p-3 space-y-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex items-center gap-3 px-2 py-3">
                      <div className="h-10 w-10 rounded-md bg-muted animate-pulse shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-2/3 bg-muted rounded-full animate-pulse" />
                        <div className="h-3 w-1/3 bg-muted rounded-full animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!isLoading && assignments.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 gap-2 px-6 text-center">
                  <div className="h-11 w-11 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <MapPin className="h-5 w-5 text-primary" />
                  </div>
                  <p className="text-sm font-semibold text-foreground">No zones yet</p>
                  <p className="text-sm text-foreground/80">
                    This reader has no zones assigned.
                  </p>
                </div>
              )}

              {!isLoading && assignments.length > 0 && (
                <div className="divide-y divide-border">
                  {assignments.map((a) => (
                    <div key={a.assignment_id} className="flex items-center gap-3 px-4 py-4">
                      <div className={cn(
                        'h-10 w-10 rounded-md border flex items-center justify-center shrink-0',
                        a.is_active ? 'bg-primary/10 border-primary/25' : 'bg-muted border-border',
                      )}>
                        <MapPin className={cn('h-4 w-4', a.is_active ? 'text-primary' : 'text-foreground/70')} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{a.zone_name}</p>
                        <p className="text-sm text-foreground/80 truncate mt-0.5">{a.barangay_name}</p>
                        <span className={cn(
                          'mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold',
                          a.is_active ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground/80',
                        )}>
                          <span className={cn(
                            'h-1.5 w-1.5 rounded-full',
                            a.is_active ? 'bg-emerald-500' : 'bg-foreground/40',
                          )} />
                          {a.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => a.is_active ? handleDeactivateClick(a) : handleActivateClick(a)}
                        className="!h-9 !rounded-md shrink-0 text-sm font-semibold"
                      >
                        {a.is_active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                        {a.is_active ? 'Reassign' : 'Activate'}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="px-6 py-4 border-t border-border bg-background shrink-0">
            <SheetClose asChild>
              <Button variant="outline" className="w-full !h-10 !rounded-md text-sm font-semibold">
                Close
              </Button>
            </SheetClose>
          </div>
        </SheetContent>
      </Sheet>

      {/* Deactivate / reassign popup — same logic as before */}
      <ReassignZoneDialog
        open={reassignOpen}
        onOpenChange={setReassignOpen}
        zoneId={reassignTarget?.zone_id ?? null}
        zoneName={reassignTarget?.zone_name ?? ''}
        barangayName={reassignTarget?.barangay_name ?? ''}
        fromAssignmentId={reassignTarget?.assignment_id ?? null}
        fromReaderId={readerId}
        fromReaderName={readerName}
        onSuccess={handleReassignSuccess}
      />

      {/* Activate popup — same logic as before */}
      <ActivateZoneDialog
        open={activateOpen}
        onOpenChange={setActivateOpen}
        assignmentId={activateTarget?.assignment_id ?? null}
        zoneId={activateTarget?.zone_id ?? null}
        zoneName={activateTarget?.zone_name ?? ''}
        barangayName={activateTarget?.barangay_name ?? ''}
        readerName={readerName}
        onSuccess={handleActivateSuccess}
      />
    </>
  )
}

export default ViewReaderZonesDialog