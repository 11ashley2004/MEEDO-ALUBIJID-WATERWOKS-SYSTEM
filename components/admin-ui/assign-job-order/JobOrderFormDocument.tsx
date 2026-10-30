// components/admin-ui/assign-job-order/JobOrderFormDocument.tsx
//
// One printable Job Order form, copied from the paper form of the
// Alubijid Waterworks System. Two of these fit on one A4 portrait page.
//
// The checklist is NOT hard-coded: it lists every row of the `job_types`
// table (passed in as `jobTypes`) and ticks the one whose id matches the
// job order's `job_type_id`.
//
// Inline styles only, so html2canvas renders it exactly as shown here.

import React from 'react'
import type {
  JobAssignmentJobOrder,
  JobTypeOption,
} from '@/lib/actions/job-assignment/job-assignment.actions'

// ─── Fixed form sizing (A4 @ 96dpi, two forms per page) ─────────────────────
export const PAGE_W = 794
export const PAGE_H = 1123
export const FORM_H = Math.floor(PAGE_H / 2)

const MIN_ROWS = 10 // each checklist box is at least this many rows, like the paper form

// ─── Props ──────────────────────────────────────────────────────────────────
export interface JobOrderFormProps {
  jobOrder: JobAssignmentJobOrder
  jobTypes: JobTypeOption[]
  assignedTo: string
  helpers: string[]
  preparedBy: string
  approvedBy?: string
  scheduledAt: string | null
  logoSrc?: string
}

// ─── Helpers ────────────────────────────────────────────────────────────────
const MANILA = 'Asia/Manila'
const INK = '#1a1a1a'

function formatDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone: MANILA, month: 'long', day: 'numeric', year: 'numeric',
  })
}

function seriesYear(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date()
  return d.toLocaleDateString('en-US', { timeZone: MANILA, year: 'numeric' })
}

const cell: React.CSSProperties = {
  border: `1px solid ${INK}`,
  height: 18,
  padding: '0 4px',
  fontSize: 9.5,
  lineHeight: '16px',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 20 }}>
      <span style={{ fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap' }}>{label}</span>
      <span
        style={{
          flex: 1,
          borderBottom: `1px solid ${INK}`,
          fontSize: 11,
          paddingLeft: 6,
          minHeight: 16,
          lineHeight: '16px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
        }}
      >
        {value ?? ''}
      </span>
    </div>
  )
}

// Fills the full height of the checklist area: rows stretch evenly so the
// box column is always "full", and shows every job type passed in.
function CheckBox({
  rows, totalRows,
}: {
  rows: { label: string; checked: boolean }[]
  totalRows: number
}) {
  const padded = [...rows]
  while (padded.length < totalRows) padded.push({ label: '', checked: false })

  return (
    <table
      style={{
        flex: 1,
        alignSelf: 'stretch',
        height: '100%',
        borderCollapse: 'collapse',
        tableLayout: 'fixed',
      }}
    >
      <tbody>
        {padded.map((r, i) => (
          <tr key={i}>
            <td style={{ ...cell, width: 24, textAlign: 'center', fontSize: 13, fontWeight: 900 }}>
              {r.checked ? '✓' : ''}
            </td>
            <td style={{ ...cell, fontWeight: 700, textOverflow: 'ellipsis' }}>{r.label}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ─── Component ──────────────────────────────────────────────────────────────
export function JobOrderFormDocument({
  jobOrder: jo,
  jobTypes,
  assignedTo,
  helpers,
  preparedBy,
  approvedBy = 'JOSE J. CAMENSI',
  scheduledAt,
  logoSrc,
}: JobOrderFormProps) {
  // Build the checklist from the database rows — nothing hard-coded.
  const items = jobTypes.map((t) => ({
    label: t.job_type_name.toUpperCase(),
    checked: !!jo.job_type_id && t.job_type_id === jo.job_type_id,
  }))
  // Single column: every job type in one box.
  const totalRows = Math.max(MIN_ROWS, items.length)

  const toValue = helpers.length > 0
    ? `${assignedTo} (with ${helpers.join(', ')})`
    : assignedTo

  // "For:" carries the specifics the checklist can't (e.g. which leak)
  const forValue = jo.issue_name
    ? `${jo.job_type_name} — ${jo.issue_name}`
    : jo.job_type_name

  // "Barangay, Zone" e.g. "Nani, Zone 2"
  const location = [jo.barangay_name, jo.account_zone_name ?? jo.zone_name]
    .filter((v) => v && v !== '—')
    .join(', ')

  return (
    <div
      style={{
        width: PAGE_W,
        height: FORM_H,
        boxSizing: 'border-box',
        padding: '14px 30px 10px',
        fontFamily: 'Arial, Helvetica, sans-serif',
        color: INK,
        backgroundColor: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      {/* Logo — top-left, like the paper form */}
      {logoSrc && (
        <img
          src={logoSrc}
          alt=""
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
          style={{ position: 'absolute', left: 36, top: 14, width: 58, height: 58, objectFit: 'contain' }}
        />
      )}

      {/* Title block */}
      <div style={{ textAlign: 'center', lineHeight: 1.3 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Alubijid Waterworks System</div>
        <div style={{ fontWeight: 700, fontSize: 10.5 }}>Municipal Economic Enterprises &amp; Development</div>
        <div style={{ fontWeight: 700, fontSize: 10.5 }}>Series of {seriesYear(scheduledAt)}</div>
        <div style={{ fontWeight: 700, fontSize: 11.5, marginTop: 3 }}>
          JOB ORDER NUMBER{' '}
          <span
            style={{
              display: 'inline-block',
              minWidth: 110,
              borderBottom: `1px solid ${INK}`,
              fontFamily: "'Courier New', monospace",
              fontSize: 12,
            }}
          >
            {jo.job_order_no ?? ''}
          </span>
        </div>
      </div>

      {/* Date / To / For */}
      <div style={{ marginTop: 6 }}>
        <Field label="Date:" value={formatDate(scheduledAt)} />
        <Field label="To:" value={assignedTo === '—' ? '' : toValue} />
        <Field label="For:" value={forValue} />
      </div>

      {/* Job type checklist (from the job_types table).
          flex: 1 → the box column expands to fill all free space on the
          form; margins keep it clear of "For:" above and "Name:" below. */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          marginTop: 14,
          marginBottom: 14,
        }}
      >
        <CheckBox rows={items} totalRows={totalRows} />
      </div>

      {/* Consumer details */}
      <div>
        <Field label="Name:" value={jo.consumer_name ?? ''} />
        <Field label="Location:" value={location} />
        <Field
          label="Contract No.:"
          value={jo.contract_no ?? ''}
        />
        <Field label="Tools, Equipment and Supplies Needed:" />
      </div>

      {/* Signatures */}
      <div style={{ display: 'flex', gap: 40, marginTop: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 11 }}>Prepared by:</div>
          <div style={{ borderBottom: `1px solid ${INK}`, height: 20 }} />
          <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 11, marginTop: 2 }}>
            {preparedBy.toUpperCase()}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 11 }}>Approved By:</div>
          <div style={{ borderBottom: `1px solid ${INK}`, height: 20 }} />
          <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 11, marginTop: 2 }}>
            {approvedBy}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 40, marginTop: 8 }}>
        <div style={{ flex: 1 }}>
          {/* Filled automatically once the job order is completed; blank otherwise */}
          <Field label="Date Completed:" value={formatDate(jo.completion_date ?? null)} />
        </div>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ borderBottom: `1px solid ${INK}`, height: 16 }} />
          <div style={{ fontSize: 9.5, marginTop: 2 }}>Signature over printed name</div>
        </div>
      </div>
    </div>
  )
}