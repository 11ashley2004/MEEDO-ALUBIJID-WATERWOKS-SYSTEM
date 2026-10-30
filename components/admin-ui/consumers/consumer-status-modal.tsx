'use client'

import { useState, useEffect } from 'react'
import { UserCheck, UserX, Power, Gauge } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { getConsumerById, type Consumer } from '@/lib/actions/consumer/consumer.actions'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ToggleStatusDialogProps {
  consumerId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (consumerId: string) => Promise<void>
  isProcessing?: boolean
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function ToggleStatusDialog({
  consumerId,
  open,
  onOpenChange,
  onConfirm,
  isProcessing: externalIsProcessing = false,
}: ToggleStatusDialogProps) {
  const [consumer, setConsumer] = useState<Consumer | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [internalProcessing, setInternalProcessing] = useState(false)

  const isProcessing = externalIsProcessing || internalProcessing

  // Fetch consumer data when dialog opens
  useEffect(() => {
    if (open && consumerId) {
      const fetchConsumer = async () => {
        setIsLoading(true)
        try {
          const data = await getConsumerById(consumerId)
          setConsumer(data)
        } catch (error) {
          console.error('Failed to fetch consumer:', error)
        } finally {
          setIsLoading(false)
        }
      }
      fetchConsumer()
    } else if (!open) {
      // Reset when dialog closes
      setConsumer(null)
    }
  }, [open, consumerId])

  const handleConfirm = async () => {
    if (!consumerId) return
    
    setInternalProcessing(true)
    try {
      await onConfirm(consumerId)
    } finally {
      setInternalProcessing(false)
    }
  }

  if (!consumerId) return null

  const isActive = consumer?.is_active ?? false
  const action = isActive ? 'Deactivate' : 'Activate'
  const accountName = consumer?.account_name ?? ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-md border border-slate-200 bg-white p-0 overflow-hidden shadow-none">
        {/* DialogTitle must be a direct child of DialogContent */}
        <DialogTitle className="sr-only">
          {action} Consumer
        </DialogTitle>
        
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
          </div>
        ) : (
          <>
            <div className="p-5 pb-3">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'h-9 w-9 rounded-md flex items-center justify-center',
                    isActive ? 'bg-red-100' : 'bg-emerald-100',
                  )}
                >
                  {isActive ? (
                    <UserX className="h-4 w-4 text-red-600" />
                  ) : (
                    <UserCheck className="h-4 w-4 text-emerald-600" />
                  )}
                </div>
                <div
                  className={cn(
                    'text-base font-semibold tracking-tight',
                    isActive ? 'text-red-600' : 'text-emerald-600',
                  )}
                >
                  {action} Consumer
                </div>
              </div>
              <div className="text-sm text-slate-500 pt-2">
                {isActive ? (
                  <>
                    Are you sure you want to deactivate{' '}
                    <span className="font-semibold text-slate-700">{accountName}</span>?
                    <br />
                    <span className="text-xs text-slate-400 mt-1.5 block leading-relaxed">
                      Deactivated consumers will not be able to log in or create new
                      service connections. Existing service connections will remain
                      active.
                    </span>
                  </>
                ) : (
                  <>
                    Are you sure you want to reactivate{' '}
                    <span className="font-semibold text-slate-700">{accountName}</span>?
                    <br />
                    <span className="text-xs text-slate-400 mt-1.5 block leading-relaxed">
                      The consumer will be able to log in and access their account
                      again.
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="px-5 py-3 bg-slate-50/50 border-t border-slate-100 flex flex-row justify-end gap-2">
              <DialogClose asChild>
                <Button
                  disabled={isProcessing}
                  variant="outline"
                  className="h-8 px-3 rounded-md text-xs font-medium bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-700 transition-colors shadow-none"
                >
                  Cancel
                </Button>
              </DialogClose>
              <Button
                onClick={handleConfirm}
                disabled={isProcessing}
                className={cn(
                  'h-8 px-3 rounded-md text-xs font-medium gap-1.5 shadow-none transition-colors',
                  isActive
                    ? 'bg-red-600 hover:bg-red-700 focus:ring-red-600 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-600 text-white',
                )}
              >
                {isProcessing ? (
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : isActive ? (
                  <UserX className="h-3.5 w-3.5" />
                ) : (
                  <UserCheck className="h-3.5 w-3.5" />
                )}
                {action}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}