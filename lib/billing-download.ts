/**
 * billing-download.ts
 * ───────────────────
 * Generates a print-ready water bill HTML document matching the
 * Alubijid Waterworks System format and opens it in a new tab.
 *
 * Layout mirrors the official Alubijid water bill:
 *   - Monospace font, blue text on white
 *   - Header: org name + "WATER BILL"
 *   - Consumer name, address/zone, reading period, due date
 *   - Present/Previous reading + consumption
 *   - Table: Bracket | Consumption (Cu.M.) | Community Charges | Total Payables (PhP)
 *     (all tiers shown, unreached rows have empty Consumption & Total Payables)
 *   - Rows below table: Overdue Account | Penalty (2%) | Meter Charge | Connection Fee | Less: Advance Payment
 *   - Total Bill footer row
 *   - Received by / Date Received footer
 */

type ConBillingRecord = {
  billing_id:        string
  consumer_id:       string
  consumer:          { consumer_id: string; first_name: string; last_name: string; middle_name: string | null } | null
  due_date:          string
  was_overdue:       boolean
  current_billing:   number
  previous_balance:  number
  total_billing:     number
  remaining_balance: number
  penalty_total:     number
  meter_charge:      number
  billing_status:    { billing_status_id: string; billing_status_name: string }
  reading_job_order: { reading_order_id: string; reading_period: string } | null
  consumption:       { consumption_id: string; previous_reading: number; present_reading: number; consumption: number }
  breakdowns?: Array<{
    community_charge_id: string
    block_order:         number
    min_consumption:     number
    max_consumption:     number | null
    rate_per_unit:       number
    units_used:          number
    subtotal:            number
    reached:             boolean
  }>
  connection?: {
    connection_no:   string
    connection_type: boolean
    consumer:        { first_name: string; last_name: string; middle_name: string | null }
    zone:            { zone_id: string; zone_name: string; barangay: { barangay_id: string; barangay_name: string } }
    classification:  { classification_id: string; classification_name: string }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number)
  const date   = new Date(y, m - 1)
  const last   = new Date(y, m, 0).getDate()
  const month  = date.toLocaleDateString('en-US', { month: 'long' }).toUpperCase()
  return `${month} 1-${last}, ${y}`
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  }).toUpperCase()
}

function consumerLastFirst(r: ConBillingRecord): string {
  const c = r.connection?.consumer ?? r.consumer
  if (!c) return 'Consumer'
  const parts = [c.last_name + ',', c.first_name]
  if (c.middle_name) parts.push(c.middle_name)
  return parts.join(' ')
}

// ─── HTML builder ─────────────────────────────────────────────────────────────

function buildBillHTML(record: ConBillingRecord): string {
  const period    = record.reading_job_order?.reading_period
  const zone      = record.connection?.zone
  const zoneLabel = zone
    ? `${zone.zone_name} – ${zone.barangay.barangay_name.toUpperCase()}`
    : 'N/A'
  const name      = consumerLastFirst(record)

  // Sort breakdowns by block_order
  const tiers = (record.breakdowns ?? []).slice().sort((a, b) => a.block_order - b.block_order)

  // Build tier rows — ALL tiers shown; unreached get empty consumption & total
  const tierRows = tiers.map((tier) => {
    const bracket = tier.max_consumption === null
      ? `${tier.min_consumption} and above`
      : `${tier.min_consumption} – ${tier.max_consumption} cu.m.`

    const consumption = tier.reached
      ? String(Math.round(tier.units_used))   // whole number like original
      : ''
    const total = tier.reached
      ? tier.subtotal.toFixed(2)
      : ''

    return `
      <tr>
        <td style="border:1px solid #a8c8e8;padding:3px 8px;">${bracket}</td>
        <td style="border:1px solid #a8c8e8;padding:3px 8px;text-align:center;">${consumption}</td>
        <td style="border:1px solid #a8c8e8;padding:3px 8px;text-align:center;">${tier.rate_per_unit.toFixed(2)}</td>
        <td style="border:1px solid #a8c8e8;padding:3px 8px;text-align:right;">${total}</td>
      </tr>`
  }).join('')

  // Extra charge rows (Overdue Account, Penalty, Meter Charge, Connection Fee, Less: Advance Payment)
  function extraRow(label: string, amount: string | null): string {
    return `
      <tr>
        <td colspan="3" style="border:1px solid #a8c8e8;padding:3px 8px;">${label}</td>
        <td style="border:1px solid #a8c8e8;padding:3px 8px;text-align:right;">${amount ?? ''}</td>
      </tr>`
  }

  const overdueRow     = extraRow('Overdue Account',      record.previous_balance > 0 ? record.previous_balance.toFixed(2) : '')
  const penaltyRow     = extraRow('Penalty (2%)',         record.penalty_total > 0    ? record.penalty_total.toFixed(2)    : '')
  const meterRow       = extraRow('Meter Charge',         record.meter_charge > 0     ? record.meter_charge.toFixed(2)     : '')
  const connFeeRow     = extraRow('Connection Fee',       null)
  const advPaymentRow  = extraRow('Less: Advance Payment',null)

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Water Bill${period ? ` — ${fmtPeriod(period)}` : ''}</title>
  <style>
    @page { size: A5 landscape; margin: 10mm 12mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 11px;
      color: #1a6ea8;
      background: #fff;
    }
    @media screen {
      body { max-width: 740px; margin: 20px auto; padding: 20px; box-shadow: 0 0 12px rgba(0,0,0,.15); }
    }
    @media print {
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    table { border-collapse: collapse; width: 100%; }
    th, td { font-family: 'Courier New', Courier, monospace; font-size: 11px; color: #1a6ea8; }
  </style>
</head>
<body>

  <!-- ── Header ─────────────────────────────────────────────────────── -->
  <div style="text-align:center;margin-bottom:10px;">
    <div style="font-size:14px;font-weight:bold;letter-spacing:.5px;">ALUBIJID WATERWORKS SYSTEM</div>
    <div style="font-size:16px;font-weight:bold;letter-spacing:4px;margin-top:2px;">WATER &nbsp; BILL</div>
  </div>

  <!-- ── Consumer / Address block ───────────────────────────────────── -->
  <table style="margin-bottom:6px;">
    <tr>
      <td style="width:50%;vertical-align:top;">
        <div><strong>Name</strong> : ${name}</div>
        <div style="margin-top:3px;"><strong>Present Reading</strong> : ${record.consumption.present_reading}</div>
        <div style="margin-top:3px;"><strong>Previous Reading</strong> : ${record.consumption.previous_reading}</div>
        <div style="margin-top:3px;"><strong>Consumption</strong> : ${record.consumption.consumption}</div>
      </td>
      <td style="width:50%;vertical-align:top;text-align:right;">
        <div><strong>Address/Zone</strong> : ${zoneLabel}</div>
        <div style="margin-top:3px;"><strong>Reading Period</strong> : ${period ? fmtPeriod(period) : 'N/A'}</div>
        <div style="margin-top:3px;"><strong>Due Date</strong> : ${fmtDate(record.due_date)}</div>
      </td>
    </tr>
  </table>

  <!-- ── Notice ─────────────────────────────────────────────────────── -->
  <div style="font-size:10px;margin-bottom:8px;line-height:1.5;">
    Your service will be discontinued from non-payment of bills (15) days upon delivery of this statement of account.
    Partial payment will not relieve disconnection of your service as well as disconnection will not relieve your obligation.
  </div>

  <!-- ── Main billing table ─────────────────────────────────────────── -->
  <table style="margin-bottom:0;">
    <thead>
      <tr style="background:#e8f4fd;">
        <th style="border:1px solid #a8c8e8;padding:4px 8px;text-align:left;">Bracket</th>
        <th style="border:1px solid #a8c8e8;padding:4px 8px;text-align:center;">Consumption (Cu.M.)</th>
        <th style="border:1px solid #a8c8e8;padding:4px 8px;text-align:center;">Community Charges</th>
        <th style="border:1px solid #a8c8e8;padding:4px 8px;text-align:right;">Total Payables (PhP)</th>
      </tr>
    </thead>
    <tbody>
      ${tierRows}
      ${overdueRow}
      ${penaltyRow}
      ${meterRow}
      ${connFeeRow}
      ${advPaymentRow}
      <!-- Total Bill row -->
      <tr style="font-weight:bold;background:#e8f4fd;">
        <td colspan="3" style="border:1px solid #a8c8e8;padding:4px 8px;font-weight:bold;">Total Bill</td>
        <td style="border:1px solid #a8c8e8;padding:4px 8px;text-align:right;font-weight:bold;">
          ${record.total_billing.toFixed(2)}
        </td>
      </tr>
      <!-- Received by / Date Received -->
      <tr>
        <td style="border:1px solid #a8c8e8;padding:4px 8px;">Received by :</td>
        <td style="border:1px solid #a8c8e8;padding:4px 8px;"></td>
        <td style="border:1px solid #a8c8e8;padding:4px 8px;">Date Received :</td>
        <td style="border:1px solid #a8c8e8;padding:4px 8px;text-align:right;font-weight:bold;">
          ${record.total_billing.toFixed(2)}
        </td>
      </tr>
    </tbody>
  </table>

</body>
</html>`
}

// ─── Public function ──────────────────────────────────────────────────────────

/**
 * Opens a print-ready water bill in a new browser tab.
 * The user can then use the browser's Save as PDF or Print function.
 */
export function downloadWaterBillHTML(record: ConBillingRecord): void {
  const html = buildBillHTML(record)

  const win = window.open('', '_blank', 'width=800,height=600,toolbar=0,menubar=0,scrollbars=1')
  if (!win) {
    alert('Please allow pop-ups to download your water bill.')
    return
  }

  win.document.open()
  win.document.write(html)
  win.document.close()

  win.onload = () => {
    win.focus()
    setTimeout(() => win.print(), 350)
  }
}