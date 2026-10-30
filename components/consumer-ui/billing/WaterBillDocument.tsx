/**
 * consumer WaterBillDocument.tsx
 *
 * A4-size water bill document that can be printed multiple per page.
 *
 * Type notes:
 *   • This component intentionally defines its own `WaterBillRecord` shape
 *     instead of importing `BillingRecord` from a specific actions file.
 *     Both `lib/actions/billing/billing.actions` (admin/treasurer) and
 *     `lib/actions/billing/consumer-billing.actions` (consumer) produce
 *     records that are structurally compatible with this shape, so either
 *     can be passed in directly without casting or padding unused fields
 *     (e.g. meter_serial_no, meter_issue_status) that this document never
 *     renders.
 *
 * Schema change notes:
 *   • reading_period is now reading_period_id (UUID reference to reading_periods)
 *   • Consumer uses account_name instead of first_name, last_name, middle_name
 *   • All accesses to consumer fields use account_name
 *   • billing_status no longer includes 'overdue'. The was_overdue flag
 *     on the record is used instead — not rendered on the printed bill
 *     (the penalty rows already communicate this to the consumer).
 *   • meter_charge is sourced from meter_installment_charges.amount summed
 *     per billing_id. It is included in the Total Bill calculation.
 */

import React from 'react'

// ─── Self-contained type ──────────────────────────────────────
// Only the fields this component actually reads. Kept deliberately
// separate from any specific server action's return type so this
// component can be reused across admin, treasurer, and consumer flows.

export interface WaterBillBreakdownRow {
  community_charge_id: string
  block_order:         number
  min_consumption:     number
  max_consumption:     number | null
  rate_per_unit:        number
  units_used:           number
  subtotal:             number
  reached:               boolean
}

export interface WaterBillRecord {
  due_date:            string
  period_start:        string
  current_billing:     number
  previous_balance:    number
  penalty_amount:      number
  meter_charge?:       number | null
  breakdowns:           WaterBillBreakdownRow[]
  consumption: {
    previous_reading: number
    present_reading:  number
    consumption:      number
  }
  meter_account: {
    meter_serial_no: string | null
    consumer: {
      account_name: string
    }
    zone: {
      zone_id: string
      zone_name: string
      barangay: {
        barangay_id: string
        barangay_name: string
      }
    }
  }
}

export interface WaterBillDocumentProps {
  record:             WaterBillRecord
  organizationName?:  string
  innerRef?:          React.RefObject<HTMLDivElement>
  compact?:           boolean
}

// ─── Helpers ──────────────────────────────────────────────────

function peso(n: number): string {
  return new Intl.NumberFormat('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

function formatPeriod(periodStart: string): string {
  const [y, m] = periodStart.split('-').map(Number)
  const date   = new Date(y, m - 1)
  const last   = new Date(y, m, 0).getDate()
  return `${date.toLocaleDateString('en-US', { month: 'long' }).toUpperCase()} 1-${last}, ${y}`
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  }).toUpperCase()
}

function tierLabel(t: WaterBillBreakdownRow): string {
  return t.max_consumption === null
    ? `${t.min_consumption} and above`
    : `${t.min_consumption} - ${t.max_consumption} cu.m.`
}

// ─── Component ────────────────────────────────────────────────

export function WaterBillDocument({
  record,
  organizationName = 'ALUBIJID WATERWORKS SYSTEM',
  innerRef,
  compact = false,
}: WaterBillDocumentProps) {
  const consumer   = record.meter_account.consumer
  const zone       = record.meter_account.zone
  const cons       = record.consumption

  // Use period_start from the reading period
  const periodStart = record.period_start ?? ''

  // ── Bill amounts ──────────────────────────────────────────────────────
  // currentBilling  = this month's water charge from tier breakdowns
  //                   source: record.current_billing (DB column)
  //
  // overdue         = previous period's unpaid carry-over amount
  //                   source: record.previous_balance (DB column)
  //                   label on bill: "Overdue Account"
  //
  // penaltyAmount   = 2% penalty charged on the overdue amount
  //                   source: record.penalty_amount (DB column)
  //                   label on bill: "Penalty (2%)"
  //
  // meterCharge     = monthly meter installment amount owed
  //                   source: record.meter_charge (summed from meter_installment_charges)
  //                   label on bill: "Meter Charge"
  //
  // totalBill       = currentBilling + overdue + penaltyAmount + meterCharge
  // ─────────────────────────────────────────────────────────────────────
  const currentBilling = record.current_billing
  const overdue        = record.previous_balance   // "Overdue Account"
  const penaltyAmount  = record.penalty_amount      // "Penalty (2%)"
  const meterCharge    = record.meter_charge ?? 0  // "Meter Charge"
  const totalBill      = currentBilling + overdue + penaltyAmount + meterCharge

  const fs   = compact ? '9px'  : '11px'
  const fsHd = compact ? '10px' : '12px'
  const fsLg = compact ? '12px' : '15px'
  const pb   = compact ? '2px'  : '4px'

  const containerStyle: React.CSSProperties = compact ? {
    fontFamily:      "'Courier New', Courier, monospace",
    fontSize:        fs,
    color:           '#0077b6',
    backgroundColor: '#ffffff',
    width:           '100%',
    padding:         '8px 10px 6px',
    border:          '1px solid #90c8e0',
    boxSizing:       'border-box',
    lineHeight:      1.2,
    marginBottom:    '8px',
  } : {
    fontFamily:      "'Courier New', Courier, monospace",
    fontSize:        fs,
    color:           '#0077b6',
    backgroundColor: '#ffffff',
    width:           '100%',
    maxWidth:        '210mm',
    padding:         '14px 16px 10px',
    border:          '1px solid #90c8e0',
    boxSizing:       'border-box',
    lineHeight:      1.35,
    margin:          '0 auto',
  }

  const leftCellTd: React.CSSProperties = {
    width:         '50%',
    verticalAlign: 'top',
    paddingBottom: pb,
    fontSize:      fs,
  }

  const rightCellTd: React.CSSProperties = {
    width:         '50%',
    verticalAlign: 'top',
    paddingBottom: pb,
    fontSize:      fs,
  }

  const metaFlexRow: React.CSSProperties = {
    display:        'flex',
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'flex-start',
    gap:            '4px',
  }

  const metaFlexRowRight: React.CSSProperties = {
    display:        'flex',
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'flex-end',
    gap:            '4px',
  }

  const bold: React.CSSProperties = { fontWeight: 700, whiteSpace: 'nowrap' }

  return (
    <div ref={innerRef} style={containerStyle}>

      {/* ── Header ────────────────────────────────────────────── */}
      <div style={{ textAlign: 'center', marginBottom: compact ? '3px' : '6px' }}>
        <div style={{ fontWeight: 700, fontSize: fsHd, letterSpacing: '0.5px' }}>
          {organizationName}
        </div>
        <div style={{ fontWeight: 900, fontSize: fsLg, letterSpacing: '2px', marginTop: '1px' }}>
          WATER&nbsp;&nbsp;BILL
        </div>
      </div>

      {/* ── Meta table ────────────────────────────────────────── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', marginBottom: compact ? '4px' : '8px' }}>
        <tbody>
          <tr>
            <td style={leftCellTd}>
              <div style={metaFlexRow}>
                <span style={bold}>S/N</span>
                <span>: {record.meter_account.meter_serial_no || '—'}</span>
              </div>
            </td>
            <td style={rightCellTd}>
              <div style={metaFlexRowRight}>
                <span style={bold}>Address/Zone</span>
                <span>: {zone.zone_name.toUpperCase()} - {zone.barangay.barangay_name.toUpperCase()}</span>
              </div>
            </td>
          </tr>

          <tr>
            <td style={leftCellTd}>
              <div style={metaFlexRow}>
                <span style={bold}>Present Reading</span>
                <span>: {cons.present_reading.toFixed(0)}</span>
              </div>
            </td>
            <td style={rightCellTd}>
              <div style={metaFlexRowRight}>
                <span style={bold}>Reading Period</span>
                <span>: {periodStart ? formatPeriod(periodStart) : '—'}</span>
              </div>
            </td>
          </tr>

          <tr>
            <td style={{ ...leftCellTd, paddingBottom: '0' }}>
              <div style={metaFlexRow}>
                <span style={bold}>Previous Reading</span>
                <span>: {cons.previous_reading.toFixed(0)}</span>
              </div>
            </td>
            <td style={{ ...rightCellTd, paddingBottom: '0' }}>
              <div style={metaFlexRowRight}>
                <span style={bold}>Due Date</span>
                <span>: {formatDate(record.due_date)}</span>
              </div>
            </td>
          </tr>

          <tr>
            <td style={{ ...leftCellTd, paddingBottom: '0' }}>
              <div style={metaFlexRow}>
                <span style={bold}>Consumption</span>
                <span>: {cons.consumption.toFixed(0)}</span>
              </div>
            </td>
            <td style={{ ...rightCellTd, paddingBottom: '0' }} />
          </tr>

        </tbody>
      </table>

      {/* ── Disclaimer ─────────────────────────────────────────── */}
      <p style={{ fontSize: '9px', textAlign: 'justify', margin: '4px 0', lineHeight: 1.4 }}>
        Your service will be discontinued from non-payment of bills (15) days upon
        delivery of this statement of account. Partial payment will not relieve disconnection of
        your service as well as disconnection will not relieve your obligation.
      </p>

      {/* ── Breakdown Table ────────────────────────────────────── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #0077b6' }}>
        <thead>
          <tr style={{ backgroundColor: '#e8f4fd' }}>
            <th style={compact ? thCompact : th}>Bracket</th>
            <th style={{ ...(compact ? thCompact : th), textAlign: 'center' }}>Consumption (Cu.M.)</th>
            <th style={{ ...(compact ? thCompact : th), textAlign: 'center' }}>Community Charges</th>
            <th style={{ ...(compact ? thCompact : th), textAlign: 'right' }}>Total Payables (PhP)</th>
          </tr>
        </thead>
        <tbody>

          {/* ── Tier rows ── */}
          {record.breakdowns.map((tier, i) => (
            <tr key={`${tier.community_charge_id}-${i}`}>
              <td style={compact ? tdCompact : td}>{tierLabel(tier)}</td>
              <td style={{ ...(compact ? tdCompact : td), textAlign: 'center' }}>
                {tier.reached ? tier.units_used.toFixed(0) : ''}
              </td>
              <td style={{ ...(compact ? tdCompact : td), textAlign: 'center' }}>
                {tier.rate_per_unit.toFixed(2)}
              </td>
              <td style={{ ...(compact ? tdCompact : td), textAlign: 'right' }}>
                {tier.reached ? peso(tier.subtotal) : ''}
              </td>
            </tr>
          ))}

          {/* ── Overdue Account: previous period's carry-over unpaid amount ── */}
          <tr>
            <td style={{ ...(compact ? tdCompact : td), fontWeight: 700 }} colSpan={3}>
              Overdue Account
            </td>
            <td style={{ ...(compact ? tdCompact : td), textAlign: 'right' }}>
              {overdue > 0 ? peso(overdue) : ''}
            </td>
          </tr>

          {/* ── Penalty (2%): sourced from penalties table via penalty_amount ── */}
          <tr>
            <td style={{ ...(compact ? tdCompact : td), fontWeight: 700 }} colSpan={3}>
              Penalty (2%)
            </td>
            <td style={{ ...(compact ? tdCompact : td), textAlign: 'right' }}>
              {penaltyAmount > 0 ? peso(penaltyAmount) : ''}
            </td>
          </tr>

          {/* ── Meter Charge: sourced from meter_installment_charges via meter_charge ── */}
          <tr>
            <td style={{ ...(compact ? tdCompact : td), fontWeight: 700 }} colSpan={3}>
              Meter Charge
            </td>
            <td style={{ ...(compact ? tdCompact : td), textAlign: 'right' }}>
              {meterCharge > 0 ? peso(meterCharge) : ''}
            </td>
          </tr>

          <tr>
            <td style={{ ...(compact ? tdCompact : td), fontWeight: 700 }} colSpan={3}>Connection Fee</td>
            <td style={compact ? tdCompact : td} />
          </tr>
          <tr>
            <td style={{ ...(compact ? tdCompact : td), fontWeight: 700 }} colSpan={3}>Less: Advance Payment</td>
            <td style={compact ? tdCompact : td} />
          </tr>

          {/* ── Total Bill = currentBilling + overdue + penaltyAmount + meterCharge ── */}
          <tr style={{ backgroundColor: '#e8f4fd', borderTop: '2px solid #0077b6' }}>
            <td
              style={{ ...(compact ? tdCompact : td), fontWeight: 900, fontSize: compact ? '10px' : '12px' }}
              colSpan={3}
            >
              Total Bill
            </td>
            <td style={{ ...(compact ? tdCompact : td), textAlign: 'right', fontWeight: 900, fontSize: compact ? '10px' : '12px' }}>
              {peso(totalBill)}
            </td>
          </tr>

          <tr>
            <td style={{ ...(compact ? tdCompact : td), fontWeight: 700 }}>Received by :</td>
            <td style={{ ...(compact ? tdCompact : td), fontWeight: 700, textAlign: 'right' }} colSpan={2}>
              Date Received :
            </td>
            <td style={{ ...(compact ? tdCompact : td), textAlign: 'right', fontWeight: 900 }}>
              {peso(totalBill)}
            </td>
          </tr>

        </tbody>
      </table>
    </div>
  )
}

// ─── Shared styles ─────────────────────────────────────────────

const th: React.CSSProperties = {
  border: '1px solid #0077b6', padding: '3px 5px',
  fontWeight: 700, textAlign: 'left', fontSize: '10px',
}

const thCompact: React.CSSProperties = {
  border: '1px solid #0077b6', padding: '2px 3px',
  fontWeight: 700, textAlign: 'left', fontSize: '8px',
}

const td: React.CSSProperties = {
  border: '1px solid #0077b6', padding: '2px 5px', fontSize: '10px',
}

const tdCompact: React.CSSProperties = {
  border: '1px solid #0077b6', padding: '1px 3px', fontSize: '8px',
}