'use client'

import { ArrowRightLeft, User, MapPin, ArrowRight, Calendar, UserCog } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import type { MeterTransferRecord } from '@/lib/actions/meter-transfers/meter-transfer.actions'

interface ViewMeterTransferDetailsDialogProps {
  transfer: MeterTransferRecord | null
  onOpenChange: (open: boolean) => void
}

export function ViewMeterTransferDetailsDialog({
  transfer,
  onOpenChange,
}: ViewMeterTransferDetailsDialogProps) {
  const isOpen = !!transfer
  const isOwnership = transfer?.transfer_type === 'OWNERSHIP'

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md flex flex-col h-full p-0 gap-0 border-l border-slate-200 bg-white">
        <div className="px-6 pt-6 pb-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-violet-100 border border-violet-200 flex items-center justify-center shrink-0">
              <ArrowRightLeft className="h-4 w-4 text-violet-600" />
            </div>
            <div>
              <SheetTitle className="text-[14px] font-bold text-slate-900 leading-tight">
                Transfer Details
              </SheetTitle>
              <SheetDescription className="text-[11px] text-slate-500 mt-0.5">
                {transfer?.meter_serial_no}
              </SheetDescription>
            </div>
          </div>
        </div>

        {transfer && (
          <div className="flex-1 overflow-y-auto bg-slate-50/60 px-6 py-5 space-y-4">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold border',
                isOwnership
                  ? 'bg-violet-50 text-violet-700 border-violet-200'
                  : 'bg-blue-50 text-blue-700 border-blue-200'
              )}
            >
              {isOwnership ? <User className="h-2.5 w-2.5" /> : <MapPin className="h-2.5 w-2.5" />}
              {isOwnership ? 'Ownership Transfer' : 'Relocation'}
            </span>

            <div className="rounded-md bg-white border border-slate-200 overflow-hidden">
              <div className="px-3 py-2 bg-slate-50/60 border-b border-slate-200">
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                  {isOwnership ? 'Consumer' : 'Location'} Change
                </p>
              </div>
              <div className="p-3.5 flex items-center gap-2 text-[12.5px]">
                <span className="text-slate-500 flex-1 truncate">
                  {isOwnership ? (transfer.previous_consumer_name ?? '—') : (transfer.old_zone_name ?? '—')}
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                <span className="text-slate-900 font-semibold flex-1 truncate text-right">
                  {isOwnership ? (transfer.new_consumer_name ?? '—') : (transfer.new_zone_name ?? '—')}
                </span>
              </div>
            </div>

            {transfer.transfer_reason && (
              <div className="rounded-md bg-white border border-slate-200 overflow-hidden">
                <div className="px-3 py-2 bg-slate-50/60 border-b border-slate-200">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Reason</p>
                </div>
                <div className="p-3.5">
                  <p className="text-[12.5px] text-slate-700">{transfer.transfer_reason}</p>
                </div>
              </div>
            )}

            <div className="rounded-md bg-white border border-slate-200 overflow-hidden">
              <div className="p-3 space-y-2">
                <div className="flex items-center gap-2 text-[12px]">
                  <UserCog className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span className="text-slate-500">Transferred by:</span>
                  <span className="text-slate-700 font-medium ml-auto">{transfer.transferred_by_name}</span>
                </div>
                <div className="flex items-center gap-2 text-[12px]">
                  <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span className="text-slate-500">Date:</span>
                  <span className="text-slate-700 font-medium ml-auto">
                    {new Date(transfer.transfer_date).toLocaleString('en-PH', {
                      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}