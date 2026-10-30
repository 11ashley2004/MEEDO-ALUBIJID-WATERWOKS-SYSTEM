'use client'

import { useRef } from 'react'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { BillingRecord } from '@/lib/actions/billing/billing.actions'

interface Props {
  records:     BillingRecord[]
  periodLabel: string
}

function getConsumerName(r: BillingRecord): string {
  // Use account_name from the consumer
  return r.meter_account.consumer.account_name
}

function formatPeso(n: number) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n)
}

function formatDate(d: string) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function getPeriodLabel(periodStart: string): string {
  if (!periodStart) return '—'
  const [y, m] = periodStart.split('-').map(Number)
  return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

export function AllBillingPrintButton({ records, periodLabel }: Props) {
  const printRef = useRef<HTMLDivElement>(null)

  const handlePrint = () => {
    const content = printRef.current
    if (!content) return

    const win = window.open('', '_blank', 'width=1200,height=800')
    if (!win) return

    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Billing Report — ${periodLabel}</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: Arial, sans-serif; font-size: 10px; padding: 16px; color: #111; }
            h1  { font-size: 16px; font-weight: 700; margin-bottom: 2px; }
            .sub { font-size: 11px; color: #555; margin-bottom: 12px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; }
            th { background: #1e3a5f; color: #fff; font-size: 9px; text-transform: uppercase; }
            tr:nth-child(even) { background: #f5f7fa; }
            .right { text-align: right; }
            .badge-paid      { color: #166534; }
            .badge-partial   { color: #1e40af; }
            .badge-unpaid    { color: #92400e; }
            .badge-forwarded { color: #6d28d9; }
            .badge-overdue   { color: #b91c1c; }
            .summary { display: flex; gap: 24px; margin-bottom: 12px; font-size: 11px; }
            .summary b { font-size: 13px; display: block; }
            @media print { @page { size: landscape; margin: 1cm; } }
          </style>
        </head>
        <body>
          ${content.innerHTML}
        </body>
      </html>
    `)
    win.document.close()
    win.focus()
    win.print()
    win.close()
  }

  const totalBilled    = records.reduce((s, r) => s + r.total_billing,    0)
  const totalRemaining = records.reduce((s, r) => s + r.remaining_balance, 0)
  const paidCount      = records.filter((r) => r.billing_status.billing_status_name.toLowerCase() === 'paid').length

  return (
    <>
      <Button variant="outline" size="sm" onClick={handlePrint} disabled={records.length === 0}>
        <Printer className="mr-2 h-4 w-4" />
        Print Report
      </Button>

      {/* Hidden print source */}
      <div className="hidden">
        <div ref={printRef}>
          <h1>Water Billing Report</h1>
          <p className="sub">Period: {periodLabel} &nbsp;|&nbsp; Generated: {new Date().toLocaleDateString('en-US', { dateStyle: 'long' })}</p>

          <div className="summary">
            <div><b>{records.length}</b> Total Records</div>
            <div><b>{paidCount}</b> Paid</div>
            <div><b>{formatPeso(totalBilled)}</b> Total Billed</div>
            <div><b>{formatPeso(totalRemaining)}</b> Remaining Balance</div>
          </div>

          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Consumer</th>
                <th>Serial No.</th>
                <th>Barangay / Zone</th>
                <th>Classification</th>
                <th>Type</th>
                <th>Period</th>
                <th>Due Date</th>
                <th className="right">Prev (m³)</th>
                <th className="right">Present (m³)</th>
                <th className="right">Consumed</th>
                <th className="right">Current Bill</th>
                <th className="right">Total Bill</th>
                <th className="right">Remaining</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => {
                const status = r.billing_status.billing_status_name.toLowerCase()
                const badgeCls =
                  status === 'paid' ? 'badge-paid'
                  : status === 'partial' ? 'badge-partial'
                  : status === 'forwarded' ? 'badge-forwarded'
                  : 'badge-unpaid'
                const periodStr = r.period_start
                  ? getPeriodLabel(r.period_start)
                  : '—'
                return (
                  <tr key={r.billing_id}>
                    <td>{i + 1}</td>
                    <td>{getConsumerName(r)}</td>
                    <td style={{ fontFamily: 'monospace' }}>{r.meter_account.meter_serial_no}</td>
                    <td>{r.meter_account.zone.barangay.barangay_name} · Zone {r.meter_account.zone.zone_name}</td>
                    <td>{r.meter_account.classification.classification_name}</td>
                    <td>{periodStr}</td>
                    <td>{formatDate(r.due_date)}</td>
                    <td className="right">{r.consumption.previous_reading.toFixed(2)}</td>
                    <td className="right">{r.consumption.present_reading.toFixed(2)}</td>
                    <td className="right">{r.consumption.consumption.toFixed(2)}</td>
                    <td className="right">{formatPeso(r.current_billing)}</td>
                    <td className="right">{formatPeso(r.total_billing)}</td>
                    <td className="right">{formatPeso(r.remaining_balance)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}