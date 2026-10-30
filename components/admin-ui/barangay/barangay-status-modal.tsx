'use client'

import React, { useState, useEffect } from 'react'
import { MapPin, Power, PowerOff, Loader2 } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getBarangayById, toggleBarangayStatus } from '@/lib/actions/barangay/barangay.actions'
import { toast } from 'sonner'

interface BarangayStatusModalProps {
  barangayId: string
  onSuccess?: () => void
  children: React.ReactNode
}

interface BarangayData {
  barangay_id: string
  barangay_name: string
  is_active: boolean
}

const BarangayStatusModal: React.FC<BarangayStatusModalProps> = ({ barangayId, onSuccess, children }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [barangay, setBarangay] = useState<BarangayData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  // Fetch barangay data when modal opens
  useEffect(() => {
    if (isOpen && barangayId) {
      const fetchBarangay = async () => {
        setIsLoading(true)
        try {
          const data = await getBarangayById(barangayId)
          setBarangay(data)
        } catch (error) {
          toast.error('Failed to load barangay data')
        } finally {
          setIsLoading(false)
        }
      }
      fetchBarangay()
    } else if (!isOpen) {
      // Reset when dialog closes
      setBarangay(null)
    }
  }, [isOpen, barangayId])

  const handleConfirm = async () => {
    if (!barangay) return

    setIsProcessing(true)
    try {
      const result = await toggleBarangayStatus(barangayId, barangay.is_active)

      if (result.status === 'success') {
        toast.success(`Barangay ${barangay.is_active ? 'deactivated' : 'activated'} successfully`)
        setIsOpen(false)
        onSuccess?.()
      } else {
        toast.error(result.message || 'Failed to update barangay status')
      }
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setIsProcessing(false)
    }
  }

  const isActive = barangay?.is_active ?? false
  const action = isActive ? 'Deactivate' : 'Activate'
  const barangayName = barangay?.barangay_name || ''

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md rounded-md border border-slate-200 bg-white p-0 overflow-hidden shadow-none">
        {/* DialogTitle must be a direct child of DialogContent */}
        <DialogTitle className="sr-only">
          {action} Barangay
        </DialogTitle>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-violet-600" />
          </div>
        ) : barangay && (
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
                    <PowerOff className="h-4 w-4 text-red-600" />
                  ) : (
                    <Power className="h-4 w-4 text-emerald-600" />
                  )}
                </div>
                <div
                  className={cn(
                    'text-base font-semibold tracking-tight',
                    isActive ? 'text-red-600' : 'text-emerald-600',
                  )}
                >
                  {action} Barangay
                </div>
              </div>
              <div className="text-sm text-slate-500 pt-2">
                {isActive ? (
                  <>
                    Are you sure you want to deactivate{' '}
                    <span className="font-semibold text-slate-700">{barangayName}</span>?
                    <br />
                    <span className="text-xs text-slate-400 mt-1.5 block leading-relaxed">
                      This barangay will no longer be available for new connections or assignments.
                    </span>
                  </>
                ) : (
                  <>
                    Are you sure you want to activate{' '}
                    <span className="font-semibold text-slate-700">{barangayName}</span>?
                    <br />
                    <span className="text-xs text-slate-400 mt-1.5 block leading-relaxed">
                      This barangay will be available for selection again.
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
                  <Spinner />
                ) : isActive ? (
                  <PowerOff className="h-3.5 w-3.5" />
                ) : (
                  <Power className="h-3.5 w-3.5" />
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

export default BarangayStatusModal