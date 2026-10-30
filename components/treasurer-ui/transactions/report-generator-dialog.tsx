// components/treasurer-ui/transactions/report-generator-card.tsx
'use client'

import { useState, useMemo, useEffect } from 'react'
import {
  FileSpreadsheet, FileText, Download, Droplets, Check, ChevronsUpDown,
  CalendarRange, CalendarDays, Wallet, Droplet, Zap, Receipt,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command, CommandGroup, CommandItem, CommandList,
} from '@/components/ui/command'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { TransactionRecord } from '@/lib/actions/payment/transaction.actions'
import {
  ORG_NAME, ORG_ADDRESS, ORG_CONTACT, MONTH_NAMES,
  REPORT_TYPE_OPTIONS, type ReportPaymentType, generatePeriodReport,
} from '@/components/treasurer-ui/transactions/excel-export'
import { generatePeriodReportPDF } from '@/components/treasurer-ui/transactions/pdf-export'

const formatPeso = (amount: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(amount)

type ReportFormat = 'excel' | 'pdf'

function typeIcon(val: ReportPaymentType) {
  switch (val) {
    case 'billing': return <Droplet className="h-3.5 w-3.5" />
    case 'connection_fee': return <Zap className="h-3.5 w-3.5" />
    case 'reconnection': return <Wallet className="h-3.5 w-3.5" />
    default: return <Receipt className="h-3.5 w-3.5" />
  }
}

// ─── Generic small combobox field (matches Job Order form styling) ────────────

interface ComboOption {
  value: string
  label: string
  icon?: React.ReactNode
  disabled?: boolean
}

function ComboField({
  label,
  icon,
  placeholder,
  value,
  options,
  onChange,
  disabled,
  width = 'w-full',
}: {
  label: string
  icon: React.ReactNode
  placeholder: string
  value: string | null
  options: ComboOption[]
  onChange: (v: string) => void
  disabled?: boolean
  width?: string
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.value === value)

  return (
    <div className={cn('flex flex-col gap-1.5', width)}>
      <label className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{label}</label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled || options.length === 0}
            className={cn(
              'w-full justify-between h-10 px-3 rounded-md text-sm border transition-colors',
              selected
                ? 'border-violet-300 bg-violet-50/70 text-violet-700 font-semibold'
                : 'border-slate-200 bg-white text-slate-400 font-normal hover:border-violet-300',
            )}
          >
            <span className="flex items-center gap-2 min-w-0 truncate">
              {selected ? (icon ?? null) : null}
              <span className="truncate">
                {selected ? selected.label : (options.length === 0 ? 'No data' : placeholder)}
              </span>
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 text-slate-400 shrink-0 ml-1" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] min-w-[180px] p-0 bg-white border border-slate-200 rounded-md shadow-lg"
          align="start"
          sideOffset={4}
        >
          <Command>
            <CommandList className="max-h-60 overflow-y-auto">
              <CommandGroup>
                {options.map((opt) => {
                  const isSelected = opt.value === value
                  return (
                    <CommandItem
                      key={opt.value}
                      value={opt.value}
                      disabled={opt.disabled}
                      onSelect={() => {
                        onChange(opt.value)
                        setOpen(false)
                      }}
                      className="cursor-pointer text-sm py-2.5 px-3 gap-2 flex items-center"
                    >
                      {opt.icon && (
                        <span className="h-6 w-6 rounded-md bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                          {opt.icon}
                        </span>
                      )}
                      <span className="flex-1 truncate font-medium text-slate-700">{opt.label}</span>
                      {isSelected && <Check className="h-4 w-4 text-violet-600 shrink-0" />}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}

// ─── Format toggle (Excel / PDF) ───────────────────────────────────────────────

function FormatToggle({
  value,
  onChange,
}: {
  value: ReportFormat
  onChange: (v: ReportFormat) => void
}) {
  const options: { value: ReportFormat; label: string; icon: React.ReactNode }[] = [
    { value: 'excel', label: 'Excel (.xls)', icon: <FileSpreadsheet className="h-3.5 w-3.5" /> },
    { value: 'pdf', label: 'PDF', icon: <FileText className="h-3.5 w-3.5" /> },
  ]

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <label className="text-[9px] font-bold uppercase tracking-widest text-slate-400">File Format</label>
      <div className="flex items-center gap-1.5 p-1 rounded-md bg-slate-100 border border-slate-200">
        {options.map((opt) => {
          const isActive = value === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={cn(
                'flex-1 inline-flex items-center justify-center gap-1.5 h-8 rounded-md text-xs font-semibold transition-colors',
                isActive
                  ? 'bg-white text-violet-700 shadow-sm border border-violet-200'
                  : 'text-slate-400 hover:text-slate-600',
              )}
            >
              {opt.icon}
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Report Generator (button + dialog) ────────────────────────────────────────

export function ReportGeneratorButton({ transactions }: { transactions: TransactionRecord[] }) {
  const [open, setOpen] = useState(false)

  // Only months/years that actually have transactions in the system
  const { availableYears, monthsByYear } = useMemo(() => {
    const monthsMap = new Map<number, Set<number>>()
    transactions.forEach((t) => {
      const d = new Date(t.payment_date)
      const y = d.getFullYear()
      const m = d.getMonth()
      if (!monthsMap.has(y)) monthsMap.set(y, new Set())
      monthsMap.get(y)!.add(m)
    })
    const years = Array.from(monthsMap.keys()).sort((a, b) => b - a)
    return { availableYears: years, monthsByYear: monthsMap }
  }, [transactions])

  const [periodType, setPeriodType] = useState<'monthly' | 'yearly'>('monthly')
  const [year, setYear] = useState<number | null>(null)
  const [month, setMonth] = useState<number | null>(null)
  const [paymentType, setPaymentType] = useState<ReportPaymentType>('all')
  const [format, setFormat] = useState<ReportFormat>('excel')
  const [isGenerating, setIsGenerating] = useState(false)
  const [lastResult, setLastResult] = useState<{ count: number; total: number; format: ReportFormat } | null>(null)

  useEffect(() => {
    if (availableYears.length === 0) return
    setYear((prev) => (prev != null && availableYears.includes(prev) ? prev : availableYears[0]))
  }, [availableYears])

  const monthsForSelectedYear = useMemo(() => {
    if (year == null) return []
    return Array.from(monthsByYear.get(year) ?? []).sort((a, b) => a - b)
  }, [year, monthsByYear])

  useEffect(() => {
    if (monthsForSelectedYear.length === 0) {
      setMonth(null)
      return
    }
    setMonth((prev) => (prev != null && monthsForSelectedYear.includes(prev)
      ? prev
      : monthsForSelectedYear[monthsForSelectedYear.length - 1]))
  }, [monthsForSelectedYear])

  // Reset the "last generated" hint whenever the selection changes
  useEffect(() => {
    setLastResult(null)
  }, [periodType, year, month, paymentType, format])

  const handleGenerate = async () => {
    if (year == null || (periodType === 'monthly' && month == null)) {
      toast.warning('No transaction data available to generate a report')
      return
    }
    setIsGenerating(true)
    try {
      const result = format === 'pdf'
        ? await generatePeriodReportPDF(transactions, periodType, month ?? 0, year, paymentType)
        : generatePeriodReport(transactions, periodType, month ?? 0, year, paymentType)

      if (result.count === 0) {
        toast.warning('No transactions found for that period and type')
        setLastResult(null)
      } else {
        toast.success(`Report generated: ${result.count} transaction${result.count !== 1 ? 's' : ''}, ${formatPeso(result.total)} total`)
        setLastResult({ ...result, format })
      }
      // Dialog stays open so the treasurer can generate another
      // report (different month/type) without reopening it.
    } catch {
      toast.error('Failed to generate report')
    } finally {
      setIsGenerating(false)
    }
  }

  const noData = availableYears.length === 0

  const periodOptions: ComboOption[] = [
    { value: 'monthly', label: 'Monthly', icon: <CalendarDays className="h-3.5 w-3.5" /> },
    { value: 'yearly', label: 'Yearly', icon: <CalendarRange className="h-3.5 w-3.5" /> },
  ]

  const monthOptions: ComboOption[] = monthsForSelectedYear.map((m) => ({
    value: String(m),
    label: MONTH_NAMES[m],
  }))

  const yearOptions: ComboOption[] = availableYears.map((y) => ({
    value: String(y),
    label: String(y),
  }))

  const typeOptions: ComboOption[] = REPORT_TYPE_OPTIONS.map((o) => ({
    value: o.val,
    label: o.label,
    icon: typeIcon(o.val),
  }))

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-9 gap-1.5 rounded-md border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 hover:border-violet-300 text-sm font-medium shrink-0"
      >
        <FileSpreadsheet className="h-3.5 w-3.5" />
        Generate Report
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl p-0 gap-0 overflow-hidden bg-white rounded-lg">

          {/* Letterhead */}
          <div className="px-8 py-6 bg-gradient-to-r from-violet-600 to-violet-700 text-white text-center">
            <div className="flex items-center justify-center gap-3">
              <div className="h-11 w-11 rounded-full bg-white/15 border border-white/30 flex items-center justify-center shrink-0">
                <Droplets className="h-5 w-5 text-white" />
              </div>
              <div className="text-left">
                <h2 className="text-lg font-bold tracking-wide leading-tight">{ORG_NAME}</h2>
                <p className="text-xs text-violet-100 leading-tight mt-0.5">{ORG_ADDRESS} · {ORG_CONTACT}</p>
              </div>
            </div>
          </div>

          <DialogHeader className="px-8 pt-6 pb-0 text-left space-y-0">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-md bg-violet-100 border border-violet-200 flex items-center justify-center shrink-0">
                <FileSpreadsheet className="h-4.5 w-4.5 text-violet-600" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-slate-800">Generate Revenue Report</DialogTitle>
                <p className="text-xs text-slate-500 mt-0.5">Choose a period and payment type to export</p>
              </div>
            </div>
          </DialogHeader>

          {/* Form */}
          <div className="px-8 py-6 flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <ComboField
                label="Period"
                icon={periodType === 'monthly' ? <CalendarDays className="h-3.5 w-3.5" /> : <CalendarRange className="h-3.5 w-3.5" />}
                placeholder="Period"
                value={periodType}
                options={periodOptions}
                onChange={(v) => setPeriodType(v as 'monthly' | 'yearly')}
              />
              <ComboField
                label="Year"
                icon={<CalendarRange className="h-3.5 w-3.5" />}
                placeholder="Year"
                value={year != null ? String(year) : null}
                options={yearOptions}
                onChange={(v) => setYear(Number(v))}
                disabled={availableYears.length === 0}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {periodType === 'monthly' ? (
                <ComboField
                  label="Month"
                  icon={<CalendarDays className="h-3.5 w-3.5" />}
                  placeholder="Month"
                  value={month != null ? String(month) : null}
                  options={monthOptions}
                  onChange={(v) => setMonth(Number(v))}
                  disabled={monthsForSelectedYear.length === 0}
                />
              ) : (
                <div className="hidden sm:block" />
              )}

              <ComboField
                label="Payment Type"
                icon={typeIcon(paymentType)}
                placeholder="Type"
                value={paymentType}
                options={typeOptions}
                onChange={(v) => setPaymentType(v as ReportPaymentType)}
              />
            </div>

            <FormatToggle value={format} onChange={setFormat} />

            {noData && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2.5">
                No transaction data available to generate a report yet.
              </p>
            )}

            {lastResult && (
              <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2.5">
                <Check className="h-4 w-4 shrink-0" />
                <span>
                  Last export ({lastResult.format === 'pdf' ? 'PDF' : 'Excel'}):{' '}
                  <span className="font-semibold">{lastResult.count} transaction{lastResult.count !== 1 ? 's' : ''}</span>
                  {' · '}
                  <span className="font-semibold">{formatPeso(lastResult.total)}</span>
                </span>
              </div>
            )}
          </div>

          <DialogFooter className="px-8 py-5 border-t border-slate-100 bg-slate-50/50 gap-2 sm:gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              className="h-9 rounded-md text-sm"
            >
              Close
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || noData}
              className="h-9 gap-1.5 rounded-md bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium"
            >
              <Download className="h-3.5 w-3.5" />
              {isGenerating ? 'Generating...' : `Generate ${format === 'pdf' ? 'PDF' : 'Excel'}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}