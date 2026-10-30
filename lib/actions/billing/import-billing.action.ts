'use server'

import { createClient } from '@/lib/supabase/server'
import { createAuditLog } from '../audit.action'
import ExcelJS from 'exceljs'
import crypto from 'crypto'

// =====================================================================
// Requires: `npm install exceljs`  (bcryptjs no longer needed here —
// password hashing now happens inside the Postgres function via pgcrypto)
//
// Requires: 001_import_legacy_billing.sql already applied (unique
// indexes + import_legacy_billing_bulk()), and the usual lookup rows
// (classifications / account_status / meter_status / billing_status)
// seeded.
// =====================================================================

const MONTHS: Record<string, number> = {
  JANUARY: 1, FEBRUARY: 2, MARCH: 3, APRIL: 4, MAY: 5, JUNE: 6,
  JULY: 7, AUGUST: 8, SEPTEMBER: 9, OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12,
}

const THEME_COLORS: Record<number, string> = {
  4: '156082', 5: 'E97132', 6: '196B24', 7: '0F9ED5', 8: 'A02B93', 9: '4EA72E',
}

// your confirmed legend
const DISCONNECTED_HEX = new Set(['C04F15'])                    // burnt orange, name cell = "red"
const DEFECTIVE_HEX = new Set(['D86ECC', '96DCF8', '61CBF4'])    // violet + light blue "(DM)"
const INSTITUTIONAL_HEX = new Set(['008000'])                   // green
const COMMERCIAL_HEX = new Set(['FFFF00', 'CCCC00'])             // yellow

// ---------------------------------------------------------------------
// The shape we send to the SQL function — one row per consumer/meter
// entry on the sheet, fully flattened so the SQL side is pure set-based
// upserts with no per-row branching.
// ---------------------------------------------------------------------
interface ImportRow {
  barangay_name: string
  zone_name: string
  reading_period: string | null
  due_date: string | null
  account_no_in_sheet: number
  classification_name: 'Residential' | 'Commercial' | 'Institutional'
  account_status_name: 'Connected' | 'Disconnected'
  consumer_no: string
  first_name: string
  last_name: string
  meter_serial_no: string | null
  has_meter: boolean
  is_defective_meter: boolean
  present_reading: number | null
  previous_reading: number | null
  consumption: number | null
  current_bill: number | null
  overdue_accounts: number | null
  overdue_amount: number | null
  penalty: number | null
  total_bill: number | null
  balance: number | null
  billing_status_name: 'PAID' | 'PARTIAL' | 'UNPAID'
}

// =====================================================================
// Color / text helpers (unchanged from the original importer)
// =====================================================================

function hslToHex(h: number, l: number, s: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0
  if (h < 1 / 6) [r, g, b] = [c, x, 0]
  else if (h < 2 / 6) [r, g, b] = [x, c, 0]
  else if (h < 3 / 6) [r, g, b] = [0, c, x]
  else if (h < 4 / 6) [r, g, b] = [0, x, c]
  else if (h < 5 / 6) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0').toUpperCase()
  return toHex(r) + toHex(g) + toHex(b)
}

function rgbToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(0, 2), 16) / 255
  const g = parseInt(hex.slice(2, 4), 16) / 255
  const b = parseInt(hex.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  const d = max - min
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / d + 2) / 6
    else h = ((r - g) / d + 4) / 6
  }
  return [h, l, s]
}

function applyTint(hex: string, tint: number): string {
  const [h, l, s] = rgbToHsl(hex)
  const l2 = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint
  return hslToHex(h, l2, s)
}

function resolveHex(fill: ExcelJS.Fill | undefined): string | null {
  if (!fill || fill.type !== 'pattern') return null
  const fg = (fill as ExcelJS.FillPattern).fgColor
  if (!fg) return null
  if (fg.argb) return fg.argb.slice(-6)
  // exceljs's Color type doesn't declare `tint` even though the
  // library reads/writes it — cast narrowly instead of widening fg itself.
  const theme = fg.theme
  if (theme !== undefined && THEME_COLORS[theme]) {
    const tint = (fg as { tint?: number }).tint ?? 0
    return applyTint(THEME_COLORS[theme], tint)
  }
  return null
}

function parsePeriod(text: string): string | null {
  const m = text.toUpperCase().match(/([A-Z]+)\s+\d+-\d+,\s*(\d{4})/)
  if (!m) return null
  const month = MONTHS[m[1]]
  if (!month) return null
  return `${m[2]}-${String(month).padStart(2, '0')}-01`
}

// ---------------------------------------------------------------------
// Due date: same rule as the mobile app's submitMeterReading action —
// the due date is the LAST FRIDAY of the month AFTER the reading
// period, not the last calendar day of the reading-period month
// itself. Keeping this in one place (here) means the legacy import and
// the live mobile submissions can never drift apart on this again.
// ---------------------------------------------------------------------
function getLastFridayOfMonth(year: number, month: number): Date {
  // `month` is 1-indexed (e.g. 3 = March), matching the mobile action's usage.
  const date = new Date(Date.UTC(year, month, 0))
  while (date.getUTCDay() !== 5) date.setUTCDate(date.getUTCDate() - 1)
  return date
}

function computeDueDate(readingPeriod: string): string {
  const p = new Date(readingPeriod)
  const dueYear = p.getUTCMonth() === 11 ? p.getUTCFullYear() + 1 : p.getUTCFullYear()
  const dueMonth = p.getUTCMonth() === 11 ? 1 : p.getUTCMonth() + 2
  const d = getLastFridayOfMonth(dueYear, dueMonth)
  return d.toISOString().slice(0, 10)
}

function classifyName(raw: string) {
  const upper = raw.toUpperCase()
  let classification: ImportRow['classification_name'] = 'Residential'
  if (upper.includes('COMMERCIAL') || upper.includes('GAS STATION')) classification = 'Commercial'
  else if (upper.includes('INSTITUTIONAL')) classification = 'Institutional'

  let statusHint: 'ACTIVE' | 'INACTIVE' | 'VOLUNTARY_DISCONNECT' = 'ACTIVE'
  if (upper.includes('NOT IN USE')) statusHint = 'INACTIVE'
  else if (upper.includes('VOLUNTARY')) statusHint = 'VOLUNTARY_DISCONNECT'

  // "(DM)" written directly in the name marks a defective meter — this
  // has to be checked independently of cell color, since some rows
  // mark it with text only and no special fill.
  const isDefectiveMeterText = /\(\s*DM\s*\)/.test(upper)

  const clean = raw.replace(/\(.*?\)/g, '').trim()
  const baseName = clean.replace(/\s+\d+\s*$/, '').replace(/\s{2,}/g, ' ').trim().replace(/^\/|\/$/g, '').trim()

  return { baseName, classification, statusHint, isDefectiveMeterText }
}

function cellNumber(v: ExcelJS.CellValue): number | null {
  return typeof v === 'number' ? v : null
}

// =====================================================================
// Worksheet -> ImportRow[]
// =====================================================================

function parseWorksheet(ws: ExcelJS.Worksheet): { rows: ImportRow[]; totalRows: number; flaggedDisconnected: number; flaggedDefective: number } {
  const rows: ImportRow[] = []
  let currentPurok = ''
  let currentBarangay = ''
  let currentPeriod: string | null = null
  let totalRows = 0
  let flaggedDisconnected = 0
  let flaggedDefective = 0

  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const a1 = row.getCell(1).value
    const b1 = row.getCell(2).value

    if (typeof a1 === 'string' && /^Purok-/.test(a1)) {
      currentPurok = a1.trim()
      const parts = currentPurok.split(',')
      currentBarangay = parts.length > 1 ? parts[1].trim() : currentPurok
      continue
    }
    if (typeof a1 === 'string' && /\d{4}/.test(a1) && Object.keys(MONTHS).some(m => a1.toUpperCase().includes(m))) {
      currentPeriod = parsePeriod(a1)
      continue
    }
    if (a1 === '#' || (typeof b1 === 'string' && b1.trim() === 'Accounts Name')) continue
    if (typeof b1 === 'string' && b1.trim().toUpperCase() === 'TOTAL') continue
    if (!(typeof a1 === 'number' && typeof b1 === 'string' && b1.trim())) continue

    totalRows++

    const { baseName, classification, statusHint, isDefectiveMeterText } = classifyName(b1)

    const nameHex = resolveHex(row.getCell(2).fill)
    const meterNoHex = resolveHex(row.getCell(17).fill)
    const isDisconnected = !!(nameHex && DISCONNECTED_HEX.has(nameHex))
    const isDefectiveMeter = !!(
      isDefectiveMeterText ||
      (meterNoHex && DEFECTIVE_HEX.has(meterNoHex)) ||
      (nameHex && DEFECTIVE_HEX.has(nameHex))
    )
    if (isDisconnected) flaggedDisconnected++
    if (isDefectiveMeter) flaggedDefective++

    const meterNoVal = row.getCell(17).value
    const meterNo = meterNoVal != null && meterNoVal !== '' ? String(meterNoVal) : null

    const presentReading = cellNumber(row.getCell(3).value)
    const previousReading = cellNumber(row.getCell(4).value)
    const balance = cellNumber(row.getCell(14).value) ?? 0
    const totalBillRaw = cellNumber(row.getCell(10).value)
    const totalBillNum = totalBillRaw ?? 0

    // Your account_status lookup only has three real values: Pending,
    // Connected, Disconnected. There's no dedicated "voluntary" or
    // "not in use" status, so anything that isn't clearly active maps
    // to Disconnected — a legacy account that's inactive for any
    // reason (color-flagged, "NOT IN USE", or "Voluntary") is, from
    // the utility's point of view, not currently receiving service.
    const accountStatusName: ImportRow['account_status_name'] =
      isDisconnected || statusHint === 'INACTIVE' || statusHint === 'VOLUNTARY_DISCONNECT'
        ? 'Disconnected'
        : 'Connected'

    // Balance vs Total Bill is the reliable signal, not the (often
    // blank on legacy rows) Amount Paid cell: balance == total means
    // nothing has been paid yet, 0 < balance < total means a partial
    // payment landed, and balance <= 0 means it's fully settled.
    const billingStatusName: ImportRow['billing_status_name'] =
      balance <= 0 ? 'PAID' : balance < totalBillNum ? 'PARTIAL' : 'UNPAID'

    // group key: same person can appear under the same purok with the
    // same base name across multiple sheet rows (multi-unit accounts) —
    // they all resolve to one consumer, but each row is its own
    // meter_account.
    // IMPORTANT: hash the full groupKey BEFORE truncating. Truncating a
    // plain base64 re-encoding of the raw string (the old approach)
    // only keeps the first ~9 bytes of the *original text* — and every
    // consumer in the same zone shares the same "Purok-N, " prefix, so
    // they'd all collide onto the same consumer_no. Hashing first
    // spreads the entropy of the whole string (zone + full name)
    // evenly across every character of the digest, so truncating it
    // is safe.
    const groupKey = `${currentPurok}|||${baseName}`
    const consumerNo = 'LEG-' + crypto.createHash('sha256').update(groupKey).digest('base64url').slice(0, 12)
    const [lastName, firstName] = baseName.includes(',')
      ? baseName.split(',').map(s => s.trim())
      : ['', baseName]

    const meterSerialNo = meterNo ?? `LEG-MA-${currentPurok}-${a1}`

    // Due date follows the reading period, so it can only be computed
    // once we actually have a period for this row.
    const dueDate = currentPeriod ? computeDueDate(currentPeriod) : null

    rows.push({
      barangay_name: currentBarangay,
      zone_name: currentPurok,
      reading_period: currentPeriod,
      due_date: dueDate,
      account_no_in_sheet: a1,
      classification_name: classification,
      account_status_name: accountStatusName,
      consumer_no: consumerNo,
      first_name: firstName || baseName,
      last_name: lastName || '',
      meter_serial_no: meterSerialNo,
      has_meter: presentReading !== null,
      is_defective_meter: isDefectiveMeter,
      present_reading: presentReading,
      previous_reading: previousReading,
      consumption: cellNumber(row.getCell(5).value),
      current_bill: cellNumber(row.getCell(6).value),
      // RPC import_legacy_billing_bulk / import_billing_period_bulk reads
      // `overdue_accounts` into billing.previous_balance.
      overdue_accounts: cellNumber(row.getCell(7).value),
      overdue_amount: cellNumber(row.getCell(7).value),
      penalty: cellNumber(row.getCell(8).value),
      total_bill: totalBillRaw,
      balance,
      billing_status_name: billingStatusName,
    })
  }

  return { rows, totalRows, flaggedDisconnected, flaggedDefective }
}

// =====================================================================
// MAIN ACTION
// =====================================================================

export async function importLegacyBillingExcel(formData: FormData) {
  const supabase = await createClient()

  try {
    const file = formData.get('file') as File | null
    if (!file) return { status: 'error', message: 'No file was uploaded.' }

    // The mismatch here isn't really about the buffer's shape — it's
    // that your project has two conflicting copies of @types/node
    // (one with the newer generic Buffer<TArrayBuffer>, one without),
    // so "your" Buffer type and the Buffer type exceljs's own .d.ts
    // references are structurally different nominal types. Casting to
    // `Buffer` still gets checked against exceljs's Buffer at the call
    // site, so it doesn't help — `any` is what actually bypasses that
    // parameter check. At runtime this is a completely ordinary Node
    // Buffer either way.
    const buffer = Buffer.from(await file.arrayBuffer())
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer as any)
    const ws = workbook.worksheets[0]
    if (!ws) return { status: 'error', message: 'The uploaded file has no sheets.' }

    const { rows, totalRows, flaggedDisconnected, flaggedDefective } = parseWorksheet(ws)
    if (rows.length === 0) {
      return { status: 'error', message: 'No consumer rows were found in this file.' }
    }

    const { data: { user: actorUser } } = await supabase.auth.getUser()

    // ---- ONE round trip for the whole import ----
    const { data, error } = await supabase.rpc('import_legacy_billing_bulk', {
      p_payload: rows,
    })

    if (error) {
      console.error('import_legacy_billing_bulk error:', error)
      return { status: 'error', message: error.message }
    }

    if (data?.status === 'error') {
      return { status: 'error', message: data.message ?? 'Import failed.' }
    }

    const summary = {
      ...data.summary,
      flaggedDisconnected,
      flaggedDefectiveMeter: flaggedDefective,
    }

    if (actorUser) {
      await createAuditLog(
        actorUser.id,
        'IMPORT',
        `Imported legacy billing sheet "${file.name}": ${totalRows} rows -> ` +
          `${summary.consumersCreated} new consumers, ${summary.meterAccountsUpserted} meter accounts, ` +
          `${summary.billingUpserted} billing records, ${summary.skippedNonMetered} skipped (no reading)`,
        'meter_accounts',
        // This is a bulk import, not one record — there's no single
        // target_id, but createAuditLog's signature requires `string`
        // (not `string | null`). Pass an empty string rather than
        // widening the shared audit-log type just for this call site.
        ''
      )
    }

    return { status: 'success', summary }
  } catch (error) {
    console.error('Error importing legacy billing sheet:', error)
    return { status: 'error', message: error instanceof Error ? error.message : 'Failed to import file' }
  }
}