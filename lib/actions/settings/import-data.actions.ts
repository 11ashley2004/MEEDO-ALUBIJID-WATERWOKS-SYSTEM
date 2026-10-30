'use server'

import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/server'
import { createServerClient } from '@/lib/supabase/serverClient'

// ============================================================
// Types
// ============================================================

export type ActionResult<T> =
  | { status: 'success'; data: T; message?: string }
  | { status: 'error'; data?: undefined; message: string }

export interface SkippedRecord {
  account_name: string
  reason: string
}

export interface FileSkippedRecord {
  row: number
  reason: string
}

export interface AuthConsumerSeed {
  consumer_id: string
  email: string
  account_name: string
  contract_no: string
  is_new?: boolean
}

export interface ImportSummary {
  reading_period_id: string
  consumers_created: number
  meter_accounts_created: number
  billings_created: number
  disconnections_created?: number
  /** payments + billing_payments rows created for paid/partial balances */
  payments_created?: number
  auth_created?: number
  auth_skipped?: number
  auth_errors?: string[]
  skipped: SkippedRecord[]
  fileSkipped: FileSkippedRecord[]
  auth_consumers?: AuthConsumerSeed[]
}

export interface ImportPreview {
  success: boolean
  fileName?: string
  rowCount?: number
  message?: string
  fileSkipped?: FileSkippedRecord[]
}

// ============================================================
// Constants & Helpers
// ============================================================

const HEADER_ROW_INDEX = 5 // Row 6 in Excel (0-based)
const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
]

function stripParenthetical(name: string): string {
  return name.replace(/\s*\([^)]*\)/g, '').trim()
}

function stripTrailingDuplicateNumber(name: string): string {
  return name.replace(/\s+\d+$/, '').trim()
}

function normalizeAccountNames(rawNames: string[]): Map<string, string> {
  const parenStripped = rawNames.map(stripParenthetical)
  const baseGroups = new Map<string, string[]>()

  for (const name of parenStripped) {
    const base = stripTrailingDuplicateNumber(name)
    const group = baseGroups.get(base) ?? []
    group.push(name)
    baseGroups.set(base, group)
  }

  const resolved = new Map<string, string>()
  rawNames.forEach((raw, i) => {
    const cleaned = parenStripped[i]
    const base = stripTrailingDuplicateNumber(cleaned)
    const group = baseGroups.get(base)!
    resolved.set(raw, group.length > 1 ? base : cleaned)
  })

  return resolved
}

function parsePeriodHeader(text: string): { periodStart: string; periodEnd: string } | null {
  const match = text.match(/([A-Z]+)\s+(\d{1,2})\s*-\s*(\d{1,2}),?\s*(\d{4})/i)
  if (!match) return null

  const [, monthName, startDay, endDay, year] = match
  const monthIndex = MONTH_NAMES.indexOf(monthName.toUpperCase())
  if (monthIndex === -1) return null

  const pad = (n: string) => n.padStart(2, '0')
  const monthStr = pad(String(monthIndex + 1))
  return {
    periodStart: `${year}-${monthStr}-${pad(startDay)}`,
    periodEnd: `${year}-${monthStr}-${pad(endDay)}`,
  }
}

function parseLocationHeader(text: string): { purok: number; barangayName: string } | null {
  const match = text.match(/Purok[-\s]?(\d+)\s*,\s*(.+)/i)
  if (!match) return null
  return { purok: Number(match[1]), barangayName: match[2].trim() }
}

function toNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function toNumber(v: unknown, fallback = 0): number {
  return toNumberOrNull(v) ?? fallback
}

// ─── Due Date Calculation (Same as meter-reading.actions) ────────────────────

function getLastFridayOfMonth(year: number, month: number): Date {
  const date = new Date(Date.UTC(year, month, 0))
  while (date.getUTCDay() !== 5) {
    date.setUTCDate(date.getUTCDate() - 1)
  }
  return date
}

function calculateDueDate(periodStart: Date): string {
  const periodMonth = periodStart.getUTCMonth()
  const periodYear = periodStart.getUTCFullYear()

  let dueYear = periodYear
  let dueMonth = periodMonth + 2

  if (dueMonth > 12) {
    dueMonth = 1
    dueYear += 1
  }

  const lastFriday = getLastFridayOfMonth(dueYear, dueMonth)
  return lastFriday.toISOString().split('T')[0]
}

// ============================================================
// Server Actions
// ============================================================

export async function previewImportFile(formData: FormData): Promise<ImportPreview> {
  const file = formData.get('file')

  if (!(file instanceof File)) {
    return { success: false, message: 'No file was uploaded.' }
  }

  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    return { success: false, message: 'Only .xlsx files are supported. CSV files are rejected.' }
  }

  try {
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]

    if (!sheet) {
      return { success: false, message: 'The workbook contains no sheets.' }
    }

    const grid: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null })

    if (grid.length <= HEADER_ROW_INDEX + 1) {
      return { success: false, message: 'No billing rows found below row 6.' }
    }

    const dataRows = grid.slice(HEADER_ROW_INDEX + 1).filter((row) => row && row[1])

    return {
      success: true,
      fileName: file.name,
      rowCount: dataRows.length,
      fileSkipped: [],
    }
  } catch (err) {
    console.error('previewImportFile failed:', err)
    return { success: false, message: 'Failed to read Excel file format.' }
  }
}

export async function importBillingPeriod(formData: FormData): Promise<{ success: boolean; message: string; summary?: ImportSummary }> {
  const file = formData.get('file')

  if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.xlsx')) {
    return { success: false, message: 'Valid .xlsx file is required.' }
  }

  try {
    // meter_accounts.created_by (and now consumers.registered_by) are
    // NOT NULL — resolve the importing user up front so the RPC has a
    // real value to attribute the batch to, instead of failing partway
    // through the transaction.
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return { success: false, message: 'User not authenticated.' }
    }

    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const grid: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null })

    // ─── Parse Header Information ──────────────────────────────────────────────
    const location = parseLocationHeader(String(grid[2]?.[0] ?? ''))
    const period = parsePeriodHeader(String(grid[3]?.[0] ?? ''))

    if (!location) {
      return { success: false, message: 'Could not parse Barangay and Purok from the Excel header (Row 3). Please ensure the format is: "Purok-XX, Barangay Name".' }
    }

    if (!period) {
      return { success: false, message: 'Could not parse Reading Period from the Excel header (Row 4). Please ensure the format is: "MONTH day-day, YEAR".' }
    }

    const dataRows = grid.slice(HEADER_ROW_INDEX + 1).filter((row) => row && row[1])

    const rawNames = dataRows.map((row) => String(row[1]).trim())
    const nameMap = normalizeAccountNames(rawNames)

    const parsedRows: any[] = dataRows.map((row) => {
      const statusRaw = String(row[11] ?? '').trim().toLowerCase()
      const isDisconnected = statusRaw === 'disconnected' || statusRaw === 'discon'
      const emailRaw = row[15] != null ? String(row[15]).trim().toLowerCase() : ''
      const contactRaw = row[16] != null ? String(row[16]).trim() : ''

      return {
        account_name: nameMap.get(String(row[1]).trim())!,
        present_reading: isDisconnected ? 0 : toNumberOrNull(row[2]),
        previous_reading: isDisconnected ? 0 : toNumberOrNull(row[3]),
        consumption: isDisconnected ? 0 : toNumber(row[4]),
        current_billing: toNumber(row[5]),
        overdue_accounts: toNumber(row[6]),
        penalty: toNumber(row[7]),
        meter_charge: toNumber(row[8]),
        total_bill: toNumber(row[9]),
        balance: toNumber(row[10]),
        meter_status: String(row[11] ?? '').trim() || 'Active',
        classification: String(row[12] ?? '').trim() || 'Residential',
        meter_serial_no: row[14] ? String(row[14]).trim() : null,
        email: emailRaw || null,
        contact_number: contactRaw || null,
      }
    })

    // ─── Resolve Barangay ID ──────────────────────────────────────────────────
    const { data: barangayData, error: barangayErr } = await supabase
      .from('barangay')
      .select('barangay_id')
      .ilike('barangay_name', location.barangayName)
      .maybeSingle()

    if (barangayErr || !barangayData) {
      return {
        success: false,
        message: `Barangay "${location.barangayName}" not found in the database. Please create it first, then re-import.`,
      }
    }

    // ─── Resolve Zone ID ──────────────────────────────────────────────────────
    const { data: zoneData, error: zoneErr } = await supabase
      .from('zone')
      .select('zone_id')
      .eq('barangay_id', barangayData.barangay_id)
      .ilike('zone_name', `Purok-${location.purok}`)
      .maybeSingle()

    if (zoneErr || !zoneData) {
      return {
        success: false,
        message: `Zone "Purok-${location.purok}" under Barangay "${location.barangayName}" not found. Please create it first, then re-import.`,
      }
    }

    // ─── Get or Create Reading Period (Server handles Due Date) ──────────────
    const periodStartDate = new Date(period.periodStart)
    const dueDateStr = calculateDueDate(periodStartDate)

    const { data: existingPeriod } = await supabase
      .from('reading_periods')
      .select('reading_period_id')
      .eq('period_start', period.periodStart)
      .eq('period_end', period.periodEnd)
      .maybeSingle()

    if (!existingPeriod) {
      const { error: insertErr } = await supabase
        .from('reading_periods')
        .insert({
          period_start: period.periodStart,
          period_end: period.periodEnd,
          due_date: dueDateStr,
        })

      if (insertErr) {
        return { success: false, message: `Failed to create reading period: ${insertErr.message}` }
      }
    }

    // ─── Call the Bulk Import Function ──────────────────────────────────────
    const { data, error } = await supabase.rpc('import_billing_period_bulk', {
      payload: {
        period: {
          period_start: period.periodStart,
          period_end: period.periodEnd,
          due_date: dueDateStr,
        },
        barangay_name: location.barangayName,
        purok: location.purok,
        rows: parsedRows,
        // Required — meter_accounts.created_by / consumers.registered_by
        // are NOT NULL and get set to whoever ran this import.
        imported_by: user.id,
      },
    })

    if (error) throw error

    const summary = data as ImportSummary

    // Provision Supabase Auth for imported consumers (default password).
    // Done outside the SQL RPC because Auth is not reachable from Postgres.
    const authResult = await provisionImportedConsumerAuth(summary.auth_consumers ?? [])
    summary.auth_created = authResult.created
    summary.auth_skipped = authResult.skipped
    summary.auth_errors = authResult.errors

    const authNote =
      authResult.created > 0
        ? ` Auth accounts created: ${authResult.created} (default password: consumer123).`
        : authResult.skipped > 0
          ? ` Auth: ${authResult.skipped} already existed.`
          : ''

    return {
      success: true,
      message: `Successfully imported ${summary.billings_created ?? 0} billing records${
        (summary.payments_created ?? 0) > 0
          ? ` (${summary.payments_created} payment transaction${summary.payments_created === 1 ? '' : 's'})`
          : ''
      }.${authNote}`,
      summary: {
        ...summary,
        fileSkipped: [],
      },
    }
  } catch (err: any) {
    console.error('importBillingPeriod error:', err)
    return {
      success: false,
      message: err.message || 'Database transaction failed. All changes rolled back.',
    }
  }
}

async function provisionImportedConsumerAuth(
  consumers: AuthConsumerSeed[],
): Promise<{ created: number; skipped: number; errors: string[] }> {
  if (!consumers.length) return { created: 0, skipped: 0, errors: [] }

  const admin = createServerClient()
  let created = 0
  let skipped = 0
  const errors: string[] = []
  const seen = new Set<string>()

  for (const c of consumers) {
    const email = (c.email ?? '').trim().toLowerCase()
    const consumerId = c.consumer_id
    if (!email || !consumerId) continue
    if (seen.has(consumerId)) continue
    seen.add(consumerId)

    const { data: existingUser } = await admin.auth.admin.getUserById(consumerId)
    if (existingUser?.user) {
      skipped += 1
      continue
    }

    const { error: authError } = await admin.auth.admin.createUser({
      id: consumerId,
      email,
      password: 'consumer123',
      email_confirm: false,
      user_metadata: {
        full_name: c.account_name,
        account_name: c.account_name,
        contract_no: c.contract_no,
        role: 'consumer',
      },
    })

    if (authError) {
      const msg = authError.message?.toLowerCase() ?? ''
      if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
        skipped += 1
        continue
      }
      console.error('[provisionImportedConsumerAuth]', c.account_name, authError)
      errors.push(`${c.account_name}: ${authError.message}`)
      continue
    }

    created += 1
  }

  return { created, skipped, errors }
}