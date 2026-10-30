'use client'

import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'



import { useState, useEffect, useCallback } from 'react'
import { ArrowRightLeft, User, RefreshCw, UserPlus, PowerOff, Search, X } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  getEligibleReadersForZone,
  transferZoneAssignment,
  toggleAssignmentStatus,
  type EligibleReader,
} from '@/lib/actions/job-assignment/meter-reader-assignments.actions'

interface ReassignZoneDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  zoneId: string | null
  zoneName: string
  barangayName: string
  fromAssignmentId: string | null
  fromReaderId: string | null
  fromReaderName: string
  onSuccess: () => void
}

export function ReassignZoneDialog({
  open, onOpenChange, zoneId, zoneName,
  fromAssignmentId, fromReaderId, fromReaderName, onSuccess,
}: ReassignZoneDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [readers, setReaders] = useState<EligibleReader[]>([])
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedSearch(search)
  const [transferringUserId, setTransferringUserId] = useState<string | null>(null)
  const [deactivating, setDeactivating] = useState(false)

  const loadReaders = useCallback(async () => {
    if (!zoneId || !fromReaderId) return
    setIsLoading(true)
    try {
      const data = await getEligibleReadersForZone(zoneId, fromReaderId)
      setReaders(data)
    } catch (error) {
      console.error('Failed to load eligible readers:', error)
      toast.error('Failed to load available meter readers')
      setReaders([])
    } finally {
      setIsLoading(false)
    }
  }, [zoneId, fromReaderId])

  useEffect(() => {
    if (open && zoneId) loadReaders()
    if (!open) { setSearch(''); setReaders([]) }
  }, [open, zoneId, loadReaders])

  const filteredReaders = debouncedSearch.trim()
    ? readers.filter((r) =>
        `${r.first_name} ${r.last_name}`.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        r.email.toLowerCase().includes(debouncedSearch.toLowerCase()),
      )
    : readers

  const handleTransfer = async (reader: EligibleReader) => {
    if (!zoneId || !fromAssignmentId) return
    setTransferringUserId(reader.user_id)
    try {
      const result = await transferZoneAssignment({
        zone_id: zoneId,
        from_assignment_id: fromAssignmentId,
        to_user_id: reader.user_id,
        to_assignment_id: reader.assignment_id ?? undefined,
      })
      if (result.status === 'success') {
        toast.success(result.message || 'Zone transferred successfully')
        onOpenChange(false)
        onSuccess()
      } else {
        toast.error(result.message || 'Failed to transfer zone')
      }
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setTransferringUserId(null)
    }
  }

  const handleDeactivateOnly = async () => {
    if (!fromAssignmentId) return
    setDeactivating(true)
    try {
      const result = await toggleAssignmentStatus(fromAssignmentId, true)
      if (result.status === 'success') {
        toast.success('Assignment deactivated')
        onOpenChange(false)
        onSuccess()
      } else {
        toast.error(result.message || 'Failed to deactivate assignment')
      }
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setDeactivating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden rounded-md border border-border bg-background">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border text-left">
          <div className="flex items-start gap-3 pr-8">
            <div className="h-10 w-10 rounded-md bg-amber-500 flex items-center justify-center shrink-0">
              <ArrowRightLeft className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold text-foreground leading-tight">
                Reassign zone
              </DialogTitle>
              <p className="text-sm text-foreground/80 mt-0.5 truncate">
                {zoneName} · {fromReaderName}
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="px-6 pt-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/70" />
            <Input
              placeholder="Search by name or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 rounded-md text-sm"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-md text-foreground/80 hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="px-6 pb-4 max-h-[320px] overflow-y-auto space-y-2">
          {isLoading && (
            [0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-3">
                <div className="h-9 w-9 rounded-md bg-muted animate-pulse shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/2 bg-muted rounded-full animate-pulse" />
                  <div className="h-3 w-2/3 bg-muted rounded-full animate-pulse" />
                </div>
              </div>
            ))
          )}

          {!isLoading && filteredReaders.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 px-4 text-center">
              <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center">
                <User className="h-4 w-4 text-foreground/80" />
              </div>
              <p className="text-sm font-semibold text-foreground">
                {readers.length === 0 ? 'No available readers' : 'No matches'}
              </p>
              <p className="text-sm text-foreground/80 leading-relaxed">
                {readers.length === 0
                  ? 'Every other meter reader is already handling this zone.'
                  : 'Try a different name or email.'}
              </p>
            </div>
          )}

          {!isLoading && filteredReaders.map((reader) => {
            const busy = transferringUserId === reader.user_id
            const isReactivate = reader.status === 'reactivate'
            return (
              <button
                key={reader.user_id}
                type="button"
                onClick={() => handleTransfer(reader)}
                disabled={transferringUserId !== null}
                className="w-full flex items-center gap-3 rounded-md border border-border bg-card px-3 py-3 text-left transition-colors hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="h-9 w-9 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {reader.first_name} {reader.last_name}
                  </p>
                  <p className="text-sm text-foreground/80 truncate">{reader.email}</p>
                  <p className="text-xs font-medium text-foreground/80 mt-0.5">
                    {isReactivate ? 'Previously assigned' : 'New assignment'}
                  </p>
                </div>
                {busy ? (
                  <Spinner className="shrink-0" />
                ) : (
                  <span className="inline-flex items-center gap-1 shrink-0 text-sm font-semibold text-primary">
                    {isReactivate ? <RefreshCw className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
                    Assign
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="px-6 py-4 border-t border-border bg-muted/40 space-y-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleDeactivateOnly}
            disabled={deactivating || transferringUserId !== null}
            className="w-full !h-10 !rounded-md text-sm font-semibold"
          >
            {deactivating ? <Spinner /> : <PowerOff className="h-4 w-4" />}
            Turn off without assigning
          </Button>
          <p className="text-sm text-foreground/80 text-center">
            The zone stays unassigned until someone else is chosen.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default ReassignZoneDialog