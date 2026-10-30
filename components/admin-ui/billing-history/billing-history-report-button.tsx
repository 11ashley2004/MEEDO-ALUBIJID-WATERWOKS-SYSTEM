// components/billing-ui/report-button.tsx
'use client'

import { useState, useMemo } from 'react'
import {
  FileSpreadsheet, FileText, Download, Droplets, Check, ChevronsUpDown,
  CalendarDays, MapPin, SlidersHorizontal, CircleDot, Landmark,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command, CommandGroup, CommandItem, CommandList, CommandInput, CommandEmpty,
} from '@/components/ui/command'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  getAllBillingsAcrossPeriods,
  type ReadingPeriodSummary,
  type FilterOption,
  type BillingRecord,
} from '@/lib/actions/billing/all-billing.actions'
import { generateBillingReport } from '@/components/admin-ui/billing-history/billing-report-export'
import { generateBillingReportPDF } from '@/components/admin-ui/billing-history/billing-report-pdf-export'

const ORG_NAME = 'MEEDO ALUBIJID WATER WORKS'
const ORG_ADDRESS = 'Alubijid, Misamis Oriental, Philippines'
const ORG_CONTACT = 'Water Billing & Collection Office'

const STATUS_ALL = 'all'
const BARANGAY_ALL = 'all'

type ReportFormat = 'excel' | 'pdf'

// ─── Combobox field (matches transactions report styling) ─────────────────────

interface ComboOption {
  value: string
  label: string
  icon?: React.ReactNode
}

function ComboField({
  label,
  icon,
  placeholder,
  value,
  options,
  onChange,
  disabled,
  searchable = false,
  searchPlaceholder = 'Search...',
}: {
  label: string
  icon: React.ReactNode
  placeholder: string
  value: string | null
  options: ComboOption[]
  onChange: (v: string) => void
  disabled?: boolean
  /** Shows a filter input above the list. Also sidesteps needing to scroll a
   *  long list — narrowing by text is far more reliable than relying on
   *  internal scroll behavior that can get swallowed by nested containers. */
  searchable?: boolean
  searchPlaceholder?: string
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.value === value)

  return (
    <div className="flex flex-col gap-1.5 w-full">
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
              {selected ? icon : null}
              <span className="truncate">
                {selected ? selected.label : (options.length === 0 ? 'No data' : placeholder)}
              </span>
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 text-slate-400 shrink-0 ml-1" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] min-w-[220px] p-0 bg-white border border-slate-200 rounded-md shadow-lg z-[100]"
          align="start"
          sideOffset={4}
          collisionPadding={16}
        >
          <Command className="p-0 overflow-hidden">
            {searchable && (
              <CommandInput
                placeholder={searchPlaceholder}
                className="h-9 text-sm"
              />
            )}
            <CommandList className="max-h-[220px] overflow-y-auto overflow-x-hidden">
              <CommandEmpty className="py-6 text-center text-xs text-slate-400">
                No matches found.
              </CommandEmpty>
              <CommandGroup>
                {options.map((opt) => {
                  const isSelected = opt.value === value
                  return (
                    <CommandItem
                      key={opt.value}
                      value={opt.label}
                      onSelect={() => {
                        onChange(opt.value)
                        setOpen(false)
                      }}
                      className="cursor-pointer text-sm py-2.5 px-3 gap-2 flex items-center"
                    >
                      <span className="h-6 w-6 rounded-md bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                        {opt.icon}
                      </span>
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusIcon(name: string) {
  const n = name.toLowerCase()
  if (n === STATUS_ALL) return <SlidersHorizontal className="h-3.5 w-3.5" />
  if (n === 'forwarded') return <CircleDot className="h-3.5 w-3.5 text-violet-600" />
  if (n.includes('paid') && !n.includes('unpaid') && !n.includes('partial')) {
    return <CircleDot className="h-3.5 w-3.5 text-emerald-600" />
  }
  if (n.includes('unpaid')) return <CircleDot className="h-3.5 w-3.5 text-rose-600" />
  if (n.includes('partial')) return <CircleDot className="h-3.5 w-3.5 text-amber-600" />
  return <CircleDot className="h-3.5 w-3.5" />
}

// ─── Report Generator (button + dialog) ────────────────────────────────────────

export function ReportButton({
  periods,
  statuses,
  barangays,
}: {
  periods: ReadingPeriodSummary[]
  statuses: FilterOption[]
  barangays: FilterOption[]
}) {
  const [open, setOpen] = useState(false)
  const [periodId, setPeriodId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>(STATUS_ALL)
  const [barangayFilter, setBarangayFilter] = useState<string>(BARANGAY_ALL)
  const [format, setFormat] = useState<ReportFormat>('excel')
  const [isGenerating, setIsGenerating] = useState(false)
  const [lastResult, setLastResult] = useState<{ sheets: number; totalAccounts: number; format: ReportFormat } | null>(null)

  const periodOptions: ComboOption[] = periods.map((p) => ({
    value: p.reading_period_id,
    label: p.label,
    icon: <CalendarDays className="h-3.5 w-3.5" />,
  }))

  const statusOptions: ComboOption[] = useMemo(() => [
    { value: STATUS_ALL, label: 'All Statuses', icon: statusIcon(STATUS_ALL) },
    ...statuses.map((s) => ({
      value: s.id,
      label: s.name,
      icon: statusIcon(s.name),
    })),
  ], [statuses])

  const barangayOptions: ComboOption[] = useMemo(() => [
    { value: BARANGAY_ALL, label: 'All Barangays', icon: <Landmark className="h-3.5 w-3.5" /> },
    ...barangays.map((b) => ({
      value: b.id,
      label: b.name,
      icon: <MapPin className="h-3.5 w-3.5" />,
    })),
  ], [barangays])

  const selectedPeriod = periods.find((p) => p.reading_period_id === periodId) ?? null
  const selectedStatusName = statuses.find((s) => s.id === statusFilter)?.name ?? null
  const selectedBarangayName = barangays.find((b) => b.id === barangayFilter)?.name ?? null
  const noData = periods.length === 0

  const resetResult = () => setLastResult(null)

  const handleGenerate = async () => {
    if (!selectedPeriod) {
      toast.warning('Select a billing period first')
      return
    }
    setIsGenerating(true)
    try {
      const res = await getAllBillingsAcrossPeriods(selectedPeriod.reading_period_id)
      if (res.status !== 'success' || !res.data || res.data.length === 0) {
        toast.warning('No billing records found for that period')
        return
      }

      let filtered: BillingRecord[] = res.data

      if (statusFilter !== STATUS_ALL) {
        filtered = filtered.filter((r) => r.billing_status.billing_status_id === statusFilter)
      }
      if (barangayFilter !== BARANGAY_ALL) {
        filtered = filtered.filter((r) => r.meter_account.zone.barangay.barangay_id === barangayFilter)
      }

      if (filtered.length === 0) {
        toast.warning('No billing records match the selected filters')
        return
      }

      const labelParts = [selectedPeriod.label]
      if (selectedStatusName) labelParts.push(selectedStatusName)
      if (selectedBarangayName) labelParts.push(selectedBarangayName)
      const periodLabel = labelParts.join(' — ')

      const result = format === 'pdf'
        ? await generateBillingReportPDF(filtered, periodLabel)
        : generateBillingReport(filtered, periodLabel)

      const unitWord = format === 'pdf' ? 'section' : 'sheet'
      toast.success(
        `Report generated: ${result.sheets} barangay ${unitWord}${result.sheets !== 1 ? 's' : ''}, ${result.totalAccounts} account${result.totalAccounts !== 1 ? 's' : ''}`,
      )
      setLastResult({ ...result, format })
      // Dialog stays open in case they want to export another combination
    } catch {
      toast.error('Failed to generate report')
    } finally {
      setIsGenerating(false)
    }
  }

  const hasNonDefaultFilters = statusFilter !== STATUS_ALL || barangayFilter !== BARANGAY_ALL

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
        <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden bg-white rounded-lg">

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
                <DialogTitle className="text-base font-bold text-slate-800">Generate Report</DialogTitle>
                <p className="text-xs text-slate-500 mt-0.5">Choose a period and narrow down the records to export</p>
              </div>
            </div>
          </DialogHeader>

          {/* Form */}
          <div className="px-8 py-6 flex flex-col gap-4">
            <ComboField
              label="Billing Period"
              icon={<CalendarDays className="h-3.5 w-3.5" />}
              placeholder="Select period"
              value={periodId}
              options={periodOptions}
              onChange={(v) => { setPeriodId(v); resetResult() }}
              disabled={noData}
              searchable
              searchPlaceholder="Search period (e.g. April 2027)"
            />

            <div className="grid grid-cols-2 gap-4">
              <ComboField
                label="Payment Status"
                icon={statusIcon(selectedStatusName ?? STATUS_ALL)}
                placeholder="Status"
                value={statusFilter}
                options={statusOptions}
                onChange={(v) => { setStatusFilter(v); resetResult() }}
              />
              <ComboField
                label="Barangay"
                icon={<Landmark className="h-3.5 w-3.5" />}
                placeholder="Barangay"
                value={barangayFilter}
                options={barangayOptions}
                onChange={(v) => { setBarangayFilter(v); resetResult() }}
                searchable={barangayOptions.length > 8}
                searchPlaceholder="Search barangay"
              />
            </div>

            <FormatToggle
              value={format}
              onChange={(v) => { setFormat(v); resetResult() }}
            />

            <div className="flex items-start gap-2 text-xs text-slate-500 bg-violet-50/60 border border-violet-100 rounded-md px-3 py-2.5">
              <MapPin className="h-3.5 w-3.5 text-violet-500 shrink-0 mt-0.5" />
              <span>
                Accounts are grouped by <span className="font-semibold text-slate-700">Purok</span> within
                each barangay{barangayFilter === BARANGAY_ALL ? ', and every barangay is exported to its own '
                  + (format === 'pdf' ? 'section' : 'sheet') : ''}.
              </span>
            </div>

            {noData && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2.5">
                No billing periods available yet.
              </p>
            )}

            {lastResult && (
              <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2.5">
                <Check className="h-4 w-4 shrink-0" />
                <span>
                  Last export ({lastResult.format === 'pdf' ? 'PDF' : 'Excel'}):{' '}
                  <span className="font-semibold">
                    {lastResult.sheets} {lastResult.format === 'pdf' ? 'section' : 'sheet'}{lastResult.sheets !== 1 ? 's' : ''}
                  </span>
                  {' · '}
                  <span className="font-semibold">{lastResult.totalAccounts} account{lastResult.totalAccounts !== 1 ? 's' : ''}</span>
                  {hasNonDefaultFilters && <span className="text-emerald-600"> · filtered</span>}
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
              disabled={isGenerating || noData || !periodId}
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