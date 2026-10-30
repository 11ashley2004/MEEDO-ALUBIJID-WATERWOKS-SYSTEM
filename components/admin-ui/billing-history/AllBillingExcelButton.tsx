'use client'

import { useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { BillingRecord } from '@/lib/actions/billing/billing.actions'
import * as XLSX from 'xlsx'

interface Props {
  records:     BillingRecord[]
  periodLabel: string   // e.g. "January 2025" or "All Periods"
}

function getConsumerName(record: BillingRecord): string {
  // Use account_name from the consumer
  return record.meter_account.consumer.account_name
}

function getPeriodLabel(periodStart: string): string {
  if (!periodStart) return ''
  const [y, m] = periodStart.split('-').map(Number)
  return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export function AllBillingExcelButton({ records, periodLabel }: Props) {
  const [loading, setLoading] = useState(false)

  const handleExport = () => {
    setLoading(true)
    try {
      const rows = records.map((r) => ({
        'Consumer Name':        getConsumerName(r),
        'Serial No.':     r.meter_account.meter_serial_no,
        'Barangay':             r.meter_account.zone.barangay.barangay_name,
        'Zone':                 r.meter_account.zone.zone_name,
        'Classification':       r.meter_account.classification.classification_name,
        'Reading Period':       r.period_start ? getPeriodLabel(r.period_start) : '',
        'Due Date':             r.due_date,
        'Previous Reading':     r.consumption.previous_reading,
        'Present Reading':      r.consumption.present_reading,
        'Consumed (m³)':        r.consumption.consumption,
        'Billed Consumption (m³)': r.consumption.billed_consumption ?? r.consumption.consumption,
        'Current Bill (PHP)':   r.current_billing,
        'Previous Balance (PHP)': r.previous_balance,
        'Penalty Total (PHP)':  r.penalty_amount,
        'Meter Charge (PHP)':   r.meter_charge || 0,
        'Total Bill (PHP)':     r.total_billing,
        'Remaining Balance (PHP)': r.remaining_balance,
        'Payment Status':       r.billing_status.billing_status_name,
      }))

      const ws = XLSX.utils.json_to_sheet(rows)

      // Auto column widths
      const colWidths = Object.keys(rows[0] ?? {}).map((key) => ({
        wch: Math.max(key.length, 14),
      }))
      ws['!cols'] = colWidths

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Billing Records')

      const safeLabel = periodLabel.replace(/[^a-zA-Z0-9 ]/g, '').trim()
      XLSX.writeFile(wb, `Billing_${safeLabel.replace(/ /g, '_')}.xlsx`)
    } catch (error) {
      console.error('Export error:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={loading || records.length === 0}>
      <FileSpreadsheet className="mr-2 h-4 w-4" />
      {loading ? 'Exporting…' : 'Export Excel'}
    </Button>
  )
}