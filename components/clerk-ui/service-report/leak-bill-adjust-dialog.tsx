'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  encodeLeakBillAdjustment,
  getLeakBillAdjustmentContext,
  previewLeakBillAdjustment,
  type LeakBillAdjustmentContext,
} from '@/lib/actions/service-report/service-report-workflow.actions'

type ReportRow = {
  report_id: string
  reference_no: string | null
  consumer_name: string | null
  contract_no: string | null
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  report: ReportRow | null
  onSuccess?: () => void
}

const formatPHP = (v: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(v)

const formatM3 = (v: number) =>
  `${Number(v).toLocaleString('en-PH', { maximumFractionDigits: 2 })} m³`

export default function ClerkLeakBillAdjustDialog({
  open,
  onOpenChange,
  report,
  onSuccess,
}: Props) {
  const [ctx, setCtx] = useState<LeakBillAdjustmentContext | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [billedConsumption, setBilledConsumption] = useState('')
  const [preview, setPreview] = useState<{
    billed_consumption: number
    current_billing: number
    total_billing: number
    remaining_balance: number
  } | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    if (!open || !report) return
    setCtx(null)
    setLoadError(null)
    setBilledConsumption('')
    setPreview(null)
    setConfirmOpen(false)

    let cancelled = false
    ;(async () => {
      setLoading(true)
      const res = await getLeakBillAdjustmentContext(report.report_id)
      if (cancelled) return
      if (res.status === 'error' || !res.data) {
        setLoadError(res.message ?? 'Failed to load latest billing')
        setLoading(false)
        return
      }
      setCtx(res.data)
      setBilledConsumption(String(res.data.actual_consumption))
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [open, report])

  useEffect(() => {
    if (!open || !report || !ctx) return
    const n = Number(billedConsumption)
    if (!Number.isFinite(n) || n < 0) {
      setPreview(null)
      return
    }

    let cancelled = false
    const t = setTimeout(async () => {
      setPreviewing(true)
      const res = await previewLeakBillAdjustment({
        reportId: report.report_id,
        billedConsumption: n,
      })
      if (cancelled) return
      if (res.status === 'success' && res.data) setPreview(res.data)
      else setPreview(null)
      setPreviewing(false)
    }, 280)

    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [open, report, ctx, billedConsumption])

  const billedNum = Number(billedConsumption)
  const canSubmit =
    !!ctx &&
    Number.isFinite(billedNum) &&
    billedNum >= 0 &&
    !!preview

  const submit = async () => {
    if (!report || !canSubmit) return
    setSaving(true)
    const res = await encodeLeakBillAdjustment({
      reportId: report.report_id,
      billedConsumption: billedNum,
    })
    setSaving(false)
    setConfirmOpen(false)
    if (res.status === 'error') {
      toast.error(res.message ?? 'Failed to adjust bill')
      return
    }
    toast.success(res.message ?? 'Bill adjusted')
    onOpenChange(false)
    onSuccess?.()
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="rounded-md sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adjust bill</DialogTitle>
            <DialogDescription>
              {report?.reference_no ?? 'Report'} · {report?.consumer_name ?? 'Account'}
              {report?.contract_no ? ` (${report.contract_no})` : ''}
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : loadError ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-3 text-xs text-rose-700">
              {loadError}
            </div>
          ) : ctx ? (
            <div className="space-y-3 py-1">
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2.5 space-y-1.5 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Period</span>
                  <span className="font-semibold text-foreground">{ctx.period_label}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Previous reading</span>
                  <span className="font-mono font-semibold text-foreground">
                    {ctx.previous_reading}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Present reading</span>
                  <span className="font-mono font-semibold text-foreground">
                    {ctx.present_reading}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Actual consumption</span>
                  <span className="font-mono font-semibold text-foreground">
                    {formatM3(ctx.actual_consumption)}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Current total</span>
                  <span className="font-semibold text-foreground">
                    {formatPHP(ctx.total_billing)}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Billed consumption (m³)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={billedConsumption}
                  onChange={(e) => setBilledConsumption(e.target.value)}
                  className="h-9 text-xs rounded-md font-mono"
                />
              </div>

              <div className="rounded-md border border-violet-200 bg-violet-50/60 px-3 py-2.5 space-y-1 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-violet-700 font-medium">New bill</span>
                  {previewing && <Spinner />}
                </div>
                {preview ? (
                  <>
                    <div className="flex justify-between gap-2 text-muted-foreground">
                      <span>Charges</span>
                      <span className="font-mono text-foreground">
                        {formatPHP(preview.current_billing)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2 text-muted-foreground">
                      <span>Total</span>
                      <span className="font-mono font-semibold text-foreground">
                        {formatPHP(preview.total_billing)}
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="text-muted-foreground">Enter billed consumption…</p>
                )}
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-md"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              className="rounded-md bg-purple-600 hover:bg-purple-700"
              disabled={!canSubmit}
              onClick={() => setConfirmOpen(true)}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="rounded-md sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm adjustment</AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed">
              Bill <strong>{formatM3(billedNum || 0)}</strong>
              {' '}· total{' '}
              <strong>{preview ? formatPHP(preview.total_billing) : '—'}</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-md" disabled={saving}>
              Back
            </AlertDialogCancel>
            <Button
              className="rounded-md bg-purple-600 hover:bg-purple-700"
              onClick={submit}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Spinner className="mr-1.5" />
                  Saving…
                </>
              ) : (
                'Confirm'
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
