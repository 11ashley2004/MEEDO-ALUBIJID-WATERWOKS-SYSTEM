// 'use client'

// import { useState } from 'react'
// import { TriangleAlert } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
// import {
//   Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle,
// } from '@/components/ui/dialog'
// import { Button } from '@/components/ui/button'
// import { toast } from 'sonner'
// import { cancelJobOrder } from '@/lib/actions/job-order/job-order.actions'

// export interface CancelTarget {
//   job_order_id: string
//   job_order_no: string | null
// }

// export function CancelJobOrderDialog({
//   target,
//   onOpenChange,
//   onSuccess,
// }: {
//   target: CancelTarget | null
//   onOpenChange: (open: boolean) => void
//   onSuccess: () => void
// }) {
//   const [submitting, setSubmitting] = useState(false)

//   const handleSubmit = async () => {
//     if (!target) return
//     setSubmitting(true)
//     try {
//       const res = await cancelJobOrder(target.job_order_id)
//       if (res.status === 'success') {
//         toast.success(res.message || 'Job order cancelled')
//         onOpenChange(false)
//         onSuccess()
//       } else {
//         toast.error(res.message || 'Failed to cancel job order')
//       }
//     } finally {
//       setSubmitting(false)
//     }
//   }

//   return (
//     <Dialog open={!!target} onOpenChange={onOpenChange}>
//       <DialogContent className="sm:max-w-sm bg-white rounded-md">
//         <DialogHeader>
//           <div className="h-10 w-10 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center mb-2">
//             <TriangleAlert className="h-4.5 w-4.5 text-rose-500" />
//           </div>
//           <DialogTitle className="text-[15px] font-bold text-slate-900">Cancel Job Order</DialogTitle>
//         </DialogHeader>
//         <div className="py-1">
//           <p className="text-[12.5px] text-slate-500">
//             Are you sure you want to cancel job order{' '}
//             <span className="font-mono font-semibold text-slate-700">{target?.job_order_no ?? '—'}</span>?
//             This cannot be undone.
//           </p>
//         </div>
//         <DialogFooter className="gap-2">
//           <DialogClose asChild>
//             <Button variant="outline" className="rounded-md h-9 text-[13px]" disabled={submitting}>
//               Back
//             </Button>
//           </DialogClose>
//           <Button
//             className="rounded-md h-9 text-[13px] bg-rose-600 hover:bg-rose-700 text-white font-semibold gap-2"
//             disabled={submitting}
//             onClick={handleSubmit}
//           >
//             {submitting ? <><Spinner /> Cancelling…</> : 'Cancel Job Order'}
//           </Button>
//         </DialogFooter>
//       </DialogContent>
//     </Dialog>
//   )
// }