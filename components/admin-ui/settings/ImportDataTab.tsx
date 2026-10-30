'use client'

import { useRef, useState, useTransition } from 'react'
import { Info, FileUp, Upload, CheckCircle2, XCircle, FileSpreadsheet, RotateCcw } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import {
  previewImportFile,
  importBillingPeriod,
  type ImportPreview,
  type ImportSummary,
} from '@/lib/actions/settings/import-data.actions'

type Step = 'select' | 'importing' | 'done'

export default function ImportDataTab() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>('select')
  const [isPending, startTransition] = useTransition()

  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ success: boolean; message: string; summary?: ImportSummary } | null>(null)

  function reset() {
    setFile(null)
    setPreview(null)
    setError(null)
    setResult(null)
    setStep('select')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // FIX: previously this only called previewImportFile and set step to
  // 'importing' without ever calling importBillingPeriod — the real
  // import request was never sent, so the spinner was stuck forever
  // (result never got set, so step could never advance to 'done').
  // The actual import call is now chained right after a successful
  // preview, inside the same transition.
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0]
    if (!picked) return

    if (!picked.name.toLowerCase().endsWith('.xlsx')) {
      setError('Only .xlsx files are supported. CSV files are rejected.')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setError(null)
    setFile(picked)

    startTransition(async () => {
      const fd = new FormData()
      fd.append('file', picked)
      const res = await previewImportFile(fd)

      if (!res.success) {
        setError(res.message ?? 'Could not parse file.')
        setFile(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
        return
      }

      setPreview(res)
      setStep('importing') // shows the spinner while the real import runs

      const importFd = new FormData()
      importFd.append('file', picked)
      const importRes = await importBillingPeriod(importFd)
      setResult(importRes)
      setStep('done')
    })
  }

  return (
    <div className="max-w-md space-y-4">
      {/* Step 1: Select File */}
      {step === 'select' && (
        <>
          <div className="flex flex-col items-center justify-center gap-3 py-10 border border-dashed border-slate-200 rounded-md">
            <div className="h-12 w-12 rounded-md bg-slate-100 flex items-center justify-center">
              <FileUp className="h-6 w-6 text-slate-400" />
            </div>
            <p className="text-sm font-bold text-slate-700">Import Water Billing Sheet</p>
            <p className="text-[11.5px] text-slate-500 text-center max-w-xs">
              Upload the monthly spreadsheet (<strong>.xlsx only</strong>) to bulk-import consumers, meter accounts, readings, and billings.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={handleFileChange}
              disabled={isPending}
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={isPending}
              className="h-9 rounded-md bg-violet-600 hover:bg-violet-700 text-white text-[12px] font-semibold shadow-sm"
            >
              {isPending ? (
                <Spinner className="mr-1.5" />
              ) : (
                <Upload className="mr-1.5 h-3.5 w-3.5" />
              )}
              {isPending ? 'Reading File…' : 'Select .xlsx File'}
            </Button>
          </div>

          {error && (
            <div className="flex items-start gap-2 text-[11.5px] text-rose-600 bg-rose-50 border border-rose-100 rounded-md px-2.5 py-2">
              <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-start gap-2 text-[11px] text-slate-500 px-1">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Detects Barangay, Purok, Reading Period, and Due Date from the header.
              Include <strong>Email</strong> and <strong>Contact Number</strong> columns — each new consumer gets a Supabase Auth login (default password <code>consumer123</code>).
            </span>
          </div>
        </>
      )}

      {/* Step 2: Importing Spinner (Auto-import starts immediately after file selection) */}
      {step === 'importing' && (
        <div className="flex flex-col items-center justify-center gap-3 py-12 border border-dashed border-slate-200 rounded-md">
          <Spinner />
          <p className="text-[12.5px] font-semibold text-slate-700">Processing Import…</p>
          <p className="text-[11px] text-slate-500 text-center max-w-xs">
            Inserting consumers, meters, readings, and billings inside a database transaction.
          </p>
        </div>
      )}

      {/* Step 3: Complete Summary */}
      {step === 'done' && result && (
        <div className="space-y-3">
          <div
            className={`flex items-start gap-2 text-[12px] rounded-md px-2.5 py-2 border ${
              result.success
                ? 'text-emerald-800 bg-emerald-50 border-emerald-200'
                : 'text-rose-800 bg-rose-50 border-rose-200'
            }`}
          >
            {result.success ? (
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600" />
            ) : (
              <XCircle className="h-4 w-4 mt-0.5 shrink-0 text-rose-600" />
            )}
            <span>{result.message}</span>
          </div>

          {result.success && result.summary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <div className="rounded-md border border-slate-200 py-2">
                <p className="text-base font-bold text-slate-700">{result.summary.consumers_created}</p>
                <p className="text-[10.5px] text-slate-500">Consumers</p>
              </div>
              <div className="rounded-md border border-slate-200 py-2">
                <p className="text-base font-bold text-slate-700">{result.summary.meter_accounts_created}</p>
                <p className="text-[10.5px] text-slate-500">Meter Accounts</p>
              </div>
              <div className="rounded-md border border-slate-200 py-2">
                <p className="text-base font-bold text-slate-700">{result.summary.billings_created}</p>
                <p className="text-[10.5px] text-slate-500">Billings</p>
              </div>
              <div className="rounded-md border border-slate-200 py-2">
                <p className="text-base font-bold text-slate-700">{result.summary.auth_created ?? 0}</p>
                <p className="text-[10.5px] text-slate-500">Auth Logins</p>
              </div>
            </div>
          )}

          <Button variant="outline" onClick={reset} className="h-9 rounded-md text-[12px] font-semibold">
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Import Another File
          </Button>
        </div>
      )}
    </div>
  )
}