'use client'

import React, { useState, useEffect } from 'react';
import { AlertTriangle, Loader2, MapPin, CheckCircle2 } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { getZoneById, toggleZoneStatus } from '@/lib/actions/zone.actions';
import { toast } from 'sonner';

interface ZoneStatusModalProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  zoneId: string | null;
  onSuccess?: () => void;
}

const ZoneStatusModal: React.FC<ZoneStatusModalProps> = ({
  isOpen,
  setIsOpen,
  zoneId,
  onSuccess,
}) => {
  const [zone, setZone] = useState<{ zone_name: string; is_active: boolean } | null>(null)
  const [loadingZone, setLoadingZone] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Fetch zone data when modal opens
  useEffect(() => {
    const fetchZoneData = async () => {
      if (!isOpen || !zoneId) return

      setLoadingZone(true)
      try {
        const result = await getZoneById(zoneId)
        if (result.status === 'success' && result.data) {
          setZone({
            zone_name: result.data.zone_name,
            is_active: result.data.is_active,
          })
        }
      } catch (error) {
        console.error('Error fetching zone:', error)
      } finally {
        setLoadingZone(false)
      }
    }

    fetchZoneData()
  }, [isOpen, zoneId])

  useEffect(() => {
    if (!isOpen) {
      setZone(null)
    }
  }, [isOpen]);

  const handleConfirm = async () => {
    if (!zoneId || !zone) return;

    setIsSubmitting(true);

    try {
      const result = await toggleZoneStatus(zoneId, zone.is_active)
      if (result.status === 'success') {
        toast.success(`Zone ${zone.is_active ? 'deactivated' : 'activated'} successfully`)
        setIsOpen(false)
        onSuccess?.()
      } else {
        // Surface the validation message (e.g. existing meter accounts) instead of a generic one
        toast.error(result.message || 'Failed to update zone status')
      }
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setIsSubmitting(false)
    }
  };

  if (!zoneId) return null;

  if (loadingZone) {
    return (
      <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
        <AlertDialogContent className="max-w-md rounded-md border border-slate-200 shadow-xl shadow-slate-200/60 p-0 overflow-hidden">
          <AlertDialogTitle className="sr-only">Loading...</AlertDialogTitle>
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-violet-600" />
          </div>
        </AlertDialogContent>
      </AlertDialog>
    )
  }

  if (!zone) return null;

  const isActivating = !zone.is_active;
  const actionText = isActivating ? 'Activate' : 'Deactivate';
  const actionTextLower = isActivating ? 'activate' : 'deactivate';
  const zoneName = zone.zone_name;

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogContent className="max-w-md rounded-md border border-slate-200 shadow-xl shadow-slate-200/60 bg-white p-0 overflow-hidden">
        {/* Header */}
        <AlertDialogHeader className="px-5 py-4 border-b border-slate-100 space-y-0">
          <div className="flex items-center gap-2">
            <div
              className={
                isActivating
                  ? 'h-8 w-8 rounded-md bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0'
                  : 'h-8 w-8 rounded-md bg-red-50 border border-red-200 flex items-center justify-center shrink-0'
              }
            >
              <MapPin className={isActivating ? 'h-3.5 w-3.5 text-emerald-600' : 'h-3.5 w-3.5 text-red-600'} />
            </div>
            <AlertDialogTitle className="text-[14px] font-bold text-slate-900 tracking-tight">
              {actionText} Zone
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-[12.5px] text-slate-500 pt-2.5">
            Are you sure you want to {actionTextLower}{' '}
            <span className="font-semibold text-slate-800">{zoneName}</span>?
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Body */}
        <div className="px-5 py-4">
          {/* Warning message for deactivation */}
          {!isActivating && (
            <div className="flex items-start gap-2.5 p-3 rounded-md border border-amber-200 bg-amber-50">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-[11.5px] leading-relaxed text-amber-700">
                This zone will be deactivated and will no longer be available for selection.
              </div>
            </div>
          )}

          {/* Info message for activation */}
          {isActivating && (
            <div className="flex items-start gap-2.5 p-3 rounded-md border border-emerald-200 bg-emerald-50">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
              <div className="text-[11.5px] leading-relaxed text-emerald-700">
                This zone will be reactivated and available for selection.
              </div>
            </div>
          )}
        </div>

       {/* Footer */}
        <AlertDialogFooter className="px-5 py-3.5 border-t border-slate-100 bg-white gap-2">
          <AlertDialogCancel
            disabled={isSubmitting}
            className="!rounded-md h-9 border border-slate-200 bg-white px-3.5 text-[12.5px] font-semibold text-slate-500 hover:border-violet-300 hover:text-violet-600 hover:bg-white"
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
            disabled={isSubmitting}
            className={
              isActivating
                ? '!rounded-md h-9 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[12.5px] font-semibold shadow-sm'
                : '!rounded-md h-9 px-3.5 bg-red-600 hover:bg-red-700 text-white text-[12.5px] font-semibold shadow-sm'
            }
          >
            {isSubmitting ? (
              <>
                <Spinner className="mr-2 inline" />
                Processing...
              </>
            ) : (
              `Yes, ${actionText}`
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default ZoneStatusModal;