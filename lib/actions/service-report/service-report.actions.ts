'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAuditLog } from '@/lib/actions/audit.action'
import {
  createNotification,
  createNotifications,
  getUserIdsByRole,
} from '@/lib/actions/notifications/notifications'
import {
  getFirst,
  fullName,
  getBulkStatusId,
  findJobOrderForReport,
  getJobOrderStatusId,
  getMeterStatusId,
  latestMeterSerialFromMeters,
  logServiceReportEvent,
} from './service-report.helpers'
import type { SupabaseClient } from '@supabase/supabase-js'

// ============================================================================
// Types
// ============================================================================

// Reuse the existing private proofs bucket (same as reading adjustments)
// with a service-reports/ prefix so no new Supabase bucket is required.
const REPORT_EVIDENCE_BUCKET = 'adjustment-proofs'
const REPORT_EVIDENCE_MAX_SIZE = 5 * 1024 * 1024 // 5 MB
const REPORT_EVIDENCE_MAX_FILES = 3
const REPORT_EVIDENCE_MIME = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']

function validateEvidenceFile(file: File): string | null {
  if (!file || file.size === 0) return 'Evidence image is empty.'
  if (file.size > REPORT_EVIDENCE_MAX_SIZE) return 'Evidence image must be 5 MB or less.'
  if (!REPORT_EVIDENCE_MIME.includes(file.type)) return 'Only PNG, JPG, or WEBP images are allowed.'
  return null
}

async function uploadReportEvidence(
  supabase: SupabaseClient,
  ownerId: string,
  reportId: string,
  file: File,
): Promise<{ file_name: string; file_path: string; mime_type: string; file_size: number } | null> {
  const err = validateEvidenceFile(file)
  if (err) {
    console.error('[uploadReportEvidence] validation:', err)
    return null
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const filePath = `service-reports/${ownerId}/${reportId}/${crypto.randomUUID()}.${ext}`

  const { error } = await supabase.storage
    .from(REPORT_EVIDENCE_BUCKET)
    .upload(filePath, file, { contentType: file.type })

  if (error) {
    console.error('[uploadReportEvidence]', error)
    return null
  }

  return {
    file_name: file.name,
    file_path: filePath,
    mime_type: file.type,
    file_size: file.size,
  }
}

async function attachReportEvidence(opts: {
  supabase: SupabaseClient
  reportId: string
  files: File[]
  uploadedBy?: string | null
  uploadedByConsumer?: string | null
}): Promise<string | null> {
  const files = (opts.files ?? []).slice(0, REPORT_EVIDENCE_MAX_FILES)
  if (!files.length) return null

  for (const f of files) {
    const v = validateEvidenceFile(f)
    if (v) return v
  }

  const ownerId = opts.uploadedBy ?? opts.uploadedByConsumer ?? 'anonymous'
  const uploaded: {
    file_name: string
    file_path: string
    mime_type: string
    file_size: number
  }[] = []

  for (const file of files) {
    const row = await uploadReportEvidence(opts.supabase, ownerId, opts.reportId, file)
    if (!row) {
      // Best-effort cleanup of anything already uploaded for this attempt
      if (uploaded.length) {
        await opts.supabase.storage
          .from(REPORT_EVIDENCE_BUCKET)
          .remove(uploaded.map((u) => u.file_path))
      }
      return 'Failed to upload evidence photo. Please try again.'
    }
    uploaded.push(row)
  }

  const { error } = await opts.supabase.from('report_attachments').insert(
    uploaded.map((u) => ({
      report_id: opts.reportId,
      file_name: u.file_name,
      file_path: u.file_path,
      mime_type: u.mime_type,
      file_size: u.file_size,
      attachment_kind: 'REPORT',
      uploaded_by: opts.uploadedBy ?? null,
      uploaded_by_consumer: opts.uploadedByConsumer ?? null,
    })),
  )

  if (error) {
    console.error('[attachReportEvidence] insert:', error)
    await opts.supabase.storage
      .from(REPORT_EVIDENCE_BUCKET)
      .remove(uploaded.map((u) => u.file_path))
    return 'Failed to save evidence photos.'
  }

  return null
}

export interface ServiceReport {
  report_id: string
  meter_account_id: string | null
  meter_serial_no: string | null
  consumer_name: string | null
  zone_id: string | null
  zone_name: string | null
  barangay_id: string | null
  barangay_name: string | null
  issue_type_id: string
  issue_name: string
  requires_job_order: boolean
  affects_billing: boolean
  needs_meter_swap: boolean
  reference_no: string | null
  report_description: string | null
  report_status_id: string
  report_status_name: string
  report_by: string
  report_by_name: string
  approved_by: string | null
  approved_by_name: string | null
  approved_at: string | null
  field_completed_at: string | null
  confirmed_at: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
  job_order_id: string | null
  job_order_no: string | null
  job_status_name: string | null
}

export interface IssueTypeOption {
  issue_type_id: string
  issue_name: string
  description: string | null
  affects_billing: boolean
  requires_job_order: boolean
  default_job_type_id: string | null
  approved_meter_status_id: string | null
  target_type: 'account' | 'zone'
}

export interface MeterAccountOption {
  meter_account_id: string
  meter_serial_no: string | null
  consumer_name: string
  zone_id: string
  zone_name: string
  barangay_id: string
  barangay_name: string
  label: string
}

export interface BarangayOption {
  barangay_id: string
  barangay_name: string
}

export interface ZoneOption {
  zone_id: string
  zone_name: string
  barangay_id: string
  barangay_name: string
  label: string
}

export interface CreateServiceReportData {
  issue_type_id: string
  meter_account_id?: string | null
  zone_id?: string | null
  report_description?: string
  /** Optional evidence photos (PNG/JPG/WEBP, max 5 MB each, up to 3). */
  evidence?: File[]
}

export interface UpdateServiceReportData {
  report_id: string
  issue_type_id: string
  meter_account_id?: string | null
  zone_id?: string | null
  report_description?: string
}

export interface ActionResult<T = null> {
  status: 'success' | 'error'
  data?: T
  message?: string
}

// ============================================================================
// Validation
// ============================================================================

const uuid = z.string().uuid()

const createServiceReportSchema = z
  .object({
    issue_type_id: uuid,
    meter_account_id: uuid.optional().nullable(),
    zone_id: uuid.optional().nullable(),
    report_description: z.string().trim().max(2000, 'Description is too long').optional(),
  })
  .refine((d) => !!d.meter_account_id || !!d.zone_id, {
    message: 'Select a meter account or a zone for this report',
    path: ['meter_account_id'],
  })
  .refine((d) => !(d.meter_account_id && d.zone_id), {
    message: 'Choose either a meter account or a zone, not both',
    path: ['zone_id'],
  })

const updateServiceReportSchema = z
  .object({
    report_id: uuid,
    issue_type_id: uuid,
    meter_account_id: uuid.optional().nullable(),
    zone_id: uuid.optional().nullable(),
    report_description: z.string().trim().max(2000, 'Description is too long').optional(),
  })
  .refine((d) => !!d.meter_account_id || !!d.zone_id, {
    message: 'Select a meter account or a zone for this report',
    path: ['meter_account_id'],
  })
  .refine((d) => !(d.meter_account_id && d.zone_id), {
    message: 'Choose either a meter account or a zone, not both',
    path: ['zone_id'],
  })

// ============================================================================
// Local helpers
// ============================================================================

function extractRelationName(relation: unknown, nameKey: string): string | null {
  if (!relation) return null
  if (Array.isArray(relation)) {
    return (relation[0] as Record<string, string> | undefined)?.[nameKey] ?? null
  }
  return (relation as Record<string, string>)[nameKey] ?? null
}

// Picks the newest meter row (by installation_date, tie-broken by created_at)
// and returns its status name. Matches the rule used by pickLatestMeter in
// worker-job-order / job-orders, so every surface agrees on which meter is
// "current" for an account.
function pickLatestMeterStatus(meters: unknown): string | null {
  const list = Array.isArray(meters) ? meters : meters ? [meters] : []
  if (!list.length) return null

  const latest = list
    .slice()
    .sort((a: any, b: any) => {
      const da = a?.installation_date ? new Date(a.installation_date).getTime() : 0
      const db = b?.installation_date ? new Date(b.installation_date).getTime() : 0
      if (db !== da) return db - da
      const ca = a?.created_at ? new Date(a.created_at).getTime() : 0
      const cb = b?.created_at ? new Date(b.created_at).getTime() : 0
      return cb - ca
    })[0] as any

  return extractRelationName(latest?.meter_status, 'meter_status_name') ?? null
}

// ── Report target validation ────────────────────────────────────────────────

const NEW_ACCOUNT_REPORT_MESSAGE =
  'This meter account is new and has no meter reading or billing record yet, so a service report cannot be filed for it.'

// A meter account is "established" once it has at least one actual meter
// reading or at least one billing record. Totally new accounts have neither.
async function hasReadingOrBillingHistory(supabase: any, meterAccountId: string): Promise<boolean> {
  const [readings, billings] = await Promise.all([
    supabase
      .from('meter_readings')
      .select('reading_id', { count: 'exact', head: true })
      .eq('meter_account_id', meterAccountId)
      .not('present_reading', 'is', null), // only real readings, not empty placeholder rows
    supabase
      .from('billing')
      .select('billing_id', { count: 'exact', head: true })
      .eq('meter_account_id', meterAccountId),
  ])

  if (readings.error) throw readings.error
  if (billings.error) throw billings.error

  return (readings.count ?? 0) > 0 || (billings.count ?? 0) > 0
}

// Finds an unresolved (pending or approved) service report on the same target,
// regardless of who filed it (staff or consumer) or which issue type it is.
//
// `resolved_at IS NULL` matters: resolveServiceReport() only stamps
// resolved_at and does not change the status, so an approved report that was
// already resolved still has status "approved". Without this filter, a
// resolved report would block the account forever.
async function findOpenReportForTarget(
  supabase: any,
  opts: { meterAccountId?: string | null; zoneId?: string | null; excludeReportId?: string },
): Promise<{
  report_id: string
  reference_no: string | null
  issue_name: string | null
  status_name: string | null
} | null> {
  const statusIds = (
    await Promise.all([getBulkStatusId(supabase, 'pending'), getBulkStatusId(supabase, 'approved')])
  ).filter((id): id is string => !!id)

  if (statusIds.length === 0) return null

  let q = supabase
    .from('service_reports')
    .select(
      `
      report_id,
      reference_no,
      issue_type:issue_type_id ( issue_name ),
      report_status:report_status_id ( status_name )
    `,
    )
    .in('report_status_id', statusIds)
    .is('resolved_at', null)
    .limit(1)

  if (opts.meterAccountId) {
    q = q.eq('meter_account_id', opts.meterAccountId)
  } else if (opts.zoneId) {
    // Zone-level report: only match other zone-level reports. Meter-account
    // reports also store their zone_id, so exclude rows that have an account.
    q = q.eq('zone_id', opts.zoneId).is('meter_account_id', null)
  } else {
    return null
  }

  if (opts.excludeReportId) q = q.neq('report_id', opts.excludeReportId)

  const { data, error } = await q
  if (error) throw error

  const row = data?.[0]
  if (!row) return null

  return {
    report_id: row.report_id,
    reference_no: row.reference_no ?? null,
    issue_name: getFirst(row.issue_type)?.issue_name ?? null,
    status_name: getFirst(row.report_status)?.status_name ?? null,
  }
}

// One validator for every create/update path (staff and consumer).
// Returns an error message when the report must be blocked, or null when OK.
//
//   Meter account target:
//     1. must have a meter reading or billing record
//     2. must not have an unresolved (pending/approved) report from anyone
//   Zone target:
//     must not have an unresolved zone-level report
async function validateReportTarget(
  supabase: any,
  opts: { meterAccountId?: string | null; zoneId?: string | null; excludeReportId?: string },
): Promise<string | null> {
  if (opts.meterAccountId) {
    const hasHistory = await hasReadingOrBillingHistory(supabase, opts.meterAccountId)
    if (!hasHistory) return NEW_ACCOUNT_REPORT_MESSAGE
  }

  const open = await findOpenReportForTarget(supabase, opts)
  if (open) {
    const target = opts.meterAccountId ? 'meter account' : 'zone'
    const ref = open.reference_no ?? open.report_id
    const detail = [open.issue_name, open.status_name].filter(Boolean).join(', ')
    return `This ${target} has a service report that is not resolved yet (${ref}${detail ? ` — ${detail}` : ''}). Please wait for it to be resolved before filing another.`
  }

  return null
}

// ============================================================================
// GET — issue types (create-form dropdown)
// ============================================================================

export async function getServiceIssueTypes(): Promise<IssueTypeOption[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('service_issue_types')
    .select(
      'issue_type_id, issue_name, description, affects_billing, requires_job_order, default_job_type_id, approved_meter_status_id, target_type',
    )
    .order('issue_name', { ascending: true })

  if (error) {
    console.error('[getServiceIssueTypes]', error)
    throw new Error('Failed to load issue types')
  }
  return (data ?? []) as IssueTypeOption[]
}

// ============================================================================
// GET — barangays
// ============================================================================

export async function getBarangays(): Promise<BarangayOption[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('barangay')
    .select('barangay_id, barangay_name')
    .eq('is_active', true)
    .order('barangay_name', { ascending: true })

  if (error) {
    console.error('[getBarangays]', error)
    throw new Error('Failed to load barangays')
  }
  return data ?? []
}

// ============================================================================
// GET — meter accounts (search)
// ============================================================================

export async function searchMeterAccounts(query: string, limit = 10): Promise<MeterAccountOption[]> {
  const supabase = await createClient()
  const q = query.trim()

  // Fetch a wider page then filter client-side so we can match serial OR
  // consumer name/number. Nested PostgREST filters only match one relation
  // and exclude Waterleak/Defective accounts when the filter misses.
  const fetchLimit = q ? Math.max(limit * 8, 40) : limit

  const { data, error } = await supabase
    .from('meter_accounts')
    .select(
      `
      meter_account_id,
      consumers:consumer_id ( account_name, contract_no ),
      zone:zone_id ( zone_id, zone_name, barangay_id, barangay:barangay_id ( barangay_name ) ),
      meters (
        meter_serial_no,
        created_at,
        installation_date,
        meter_status:meter_status_id ( meter_status_name )
      )
    `,
    )
    .limit(fetchLimit)

  if (error) {
    console.error('[searchMeterAccounts]', error)
    throw new Error('Failed to search meter accounts')
  }

  const needle = q.toLowerCase()

  const mapped = (data ?? []).map((row: any) => {
    const consumer = getFirst(row.consumers)
    const zone = getFirst(row.zone)
    const barangay = getFirst(zone?.barangay)
    const serial = latestMeterSerialFromMeters(row.meters)
    const display = serial ?? '—'
    const status = pickLatestMeterStatus(row.meters)
    return {
      meter_account_id: row.meter_account_id,
      meter_serial_no: serial,
      consumer_name: consumer?.account_name ?? '—',
      contract_no: consumer?.contract_no ?? '',
      zone_id: zone?.zone_id ?? '',
      zone_name: zone?.zone_name ?? '—',
      barangay_id: zone?.barangay_id ?? '',
      barangay_name: barangay?.barangay_name ?? '—',
      latest_meter_status: status,
      label: `${display} — ${consumer?.account_name ?? '—'}`,
    }
  })

  const filtered = needle
    ? mapped.filter((row) => {
        const hay = [
          row.meter_serial_no,
          row.consumer_name,
          row.contract_no,
          row.zone_name,
          row.barangay_name,
          row.latest_meter_status,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return hay.includes(needle)
      })
    : mapped

  return filtered.slice(0, limit).map((row): MeterAccountOption => ({
    meter_account_id: row.meter_account_id,
    meter_serial_no: row.meter_serial_no,
    consumer_name: row.consumer_name,
    zone_id: row.zone_id,
    zone_name: row.zone_name,
    barangay_id: row.barangay_id,
    barangay_name: row.barangay_name,
    label: row.label,
  }))
}

// ============================================================================
// CHECK — can a service report be filed for this target? (optional, for forms)
// ============================================================================
// Lets the report form warn the user as soon as a meter account / zone is
// picked. The create/update actions enforce the same rules on the server.

export async function checkServiceReportTarget(opts: {
  meter_account_id?: string | null
  zone_id?: string | null
  exclude_report_id?: string
}): Promise<{ allowed: boolean; message?: string }> {
  const supabase = await createClient()
  try {
    const message = await validateReportTarget(supabase, {
      meterAccountId: opts.meter_account_id ?? null,
      zoneId: opts.meter_account_id ? null : opts.zone_id ?? null,
      excludeReportId: opts.exclude_report_id,
    })
    return message ? { allowed: false, message } : { allowed: true }
  } catch (err: any) {
    console.error('[checkServiceReportTarget]', err)
    return { allowed: false, message: 'Failed to validate the selected target' }
  }
}

// ============================================================================
// GET — zones (search)
// ============================================================================

export async function searchZones(query: string, barangayId: string, limit = 10): Promise<ZoneOption[]> {
  const supabase = await createClient()

  if (!barangayId) return []

  let req = supabase
    .from('zone')
    .select('zone_id, zone_name, barangay_id, barangay:barangay_id ( barangay_name )')
    .eq('is_active', true)
    .eq('barangay_id', barangayId)
    .limit(limit)

  if (query.trim()) {
    req = req.ilike('zone_name', `%${query.trim()}%`)
  }

  const { data, error } = await req
  if (error) {
    console.error('[searchZones]', error)
    throw new Error('Failed to search zones')
  }

  return (data ?? []).map((row: any) => {
    const barangay = getFirst(row.barangay)
    return {
      zone_id: row.zone_id,
      zone_name: row.zone_name,
      barangay_id: row.barangay_id,
      barangay_name: barangay?.barangay_name ?? '—',
      label: row.zone_name,
    }
  })
}

// ============================================================================
// GET — all service reports (joined view for list pages)
// ============================================================================

const SERVICE_REPORT_SELECT = `
  report_id,
  meter_account_id,
  zone_id,
  barangay_id,
  issue_type_id,
  reference_no,
  report_description,
  report_status_id,
  report_by,
  approved_by,
  approved_at,
  field_completed_at,
  confirmed_at,
  resolved_at,
  created_at,
  updated_at,
  issue_type:issue_type_id ( issue_name, requires_job_order, affects_billing, approved_meter_status_id, target_type ),
  report_status:report_status_id ( status_name ),
  meter_accounts:meter_account_id (
    consumers:consumer_id ( account_name ),
    meters ( meter_serial_no, created_at, installation_date )
  ),
  zone:zone_id ( zone_name ),
  barangay:barangay_id ( barangay_name ),
  reporter:report_by ( first_name, last_name ),
  reporter_consumer:reported_by_consumer_id ( account_name ),
  approver:approved_by ( first_name, last_name )
`

export async function shapeServiceReport(supabase: any, row: any): Promise<ServiceReport> {
  const issueType = getFirst(row.issue_type)
  const status = getFirst(row.report_status)
  const meterAccount = getFirst(row.meter_accounts)
  const consumer = getFirst(meterAccount?.consumers)
  const zone = getFirst(row.zone)
  const barangay = getFirst(row.barangay)
  const reporter = getFirst(row.reporter)
  const reporterConsumer = getFirst(row.reporter_consumer)
  const approver = getFirst(row.approver)

  const jo = await findJobOrderForReport(supabase, row.report_id)

  // Determine who reported it - staff (report_by) or consumer (reported_by_consumer_id)
  let reportByName = ''
  if (reporter) {
    reportByName = fullName(reporter)
  } else if (reporterConsumer) {
    reportByName = reporterConsumer.account_name
  } else {
    reportByName = '—'
  }

  return {
    report_id: row.report_id,
    meter_account_id: row.meter_account_id,
    // meter_serial_no lives on meters, not meter_accounts — pick the newest meter
    meter_serial_no: latestMeterSerialFromMeters(meterAccount?.meters),
    consumer_name: consumer?.account_name ?? null,
    zone_id: row.zone_id,
    zone_name: zone?.zone_name ?? null,
    barangay_id: row.barangay_id,
    barangay_name: barangay?.barangay_name ?? null,
    issue_type_id: row.issue_type_id,
    issue_name: issueType?.issue_name ?? '—',
    requires_job_order: !!issueType?.requires_job_order,
    affects_billing: !!issueType?.affects_billing,
    needs_meter_swap: !!issueType?.approved_meter_status_id,
    reference_no: row.reference_no,
    report_description: row.report_description,
    report_status_id: row.report_status_id,
    report_status_name: status?.status_name ?? 'pending',
    report_by: row.report_by,
    report_by_name: reportByName,
    approved_by: row.approved_by,
    approved_by_name: row.approved_by ? fullName(approver) : null,
    approved_at: row.approved_at,
    field_completed_at: row.field_completed_at ?? null,
    confirmed_at: row.confirmed_at ?? null,
    resolved_at: row.resolved_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    job_order_id: jo?.job_order_id ?? null,
    job_order_no: jo?.job_order_no ?? null,
    job_status_name: jo ? getFirst(jo.job_order_status)?.job_status_name ?? null : null,
  }
}

export async function getAllServiceReports(): Promise<ServiceReport[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('service_reports')
    .select(SERVICE_REPORT_SELECT)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[getAllServiceReports]', error)
    throw new Error('Failed to fetch service reports')
  }

  return Promise.all((data ?? []).map((row: any) => shapeServiceReport(supabase, row)))
}

// ============================================================================
// CREATE
// ============================================================================

export async function createServiceReport(
  payload: CreateServiceReportData,
): Promise<ActionResult<{ report_id: string }>> {
  const supabase = await createClient()

  try {
    const {
      data: { user: actor },
    } = await supabase.auth.getUser()
    if (!actor) return { status: 'error', message: 'Unauthorised' }

    const parsed = createServiceReportSchema.safeParse(payload)
    if (!parsed.success) {
      return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Invalid input' }
    }
    const { issue_type_id, meter_account_id, zone_id, report_description } = parsed.data

    const { data: issueType, error: itError } = await supabase
      .from('service_issue_types')
      .select('issue_type_id, issue_name')
      .eq('issue_type_id', issue_type_id)
      .single()

    if (itError || !issueType) {
      return { status: 'error', message: 'Selected issue type was not found' }
    }

    let resolvedZoneId: string | null = zone_id ?? null
    let barangayId: string | null = null

    if (meter_account_id) {
      const { data: ma, error: maError } = await supabase
        .from('meter_accounts')
        .select('meter_account_id, zone:zone_id ( zone_id, barangay_id )')
        .eq('meter_account_id', meter_account_id)
        .single()

      if (maError || !ma) {
        return { status: 'error', message: 'Meter account not found' }
      }
      const zone = getFirst(ma.zone)
      resolvedZoneId = zone?.zone_id ?? null
      barangayId = zone?.barangay_id ?? null
    } else if (zone_id) {
      const { data: zone, error: zoneError } = await supabase
        .from('zone')
        .select('zone_id, barangay_id')
        .eq('zone_id', zone_id)
        .single()

      if (zoneError || !zone) {
        return { status: 'error', message: 'Zone not found' }
      }
      barangayId = zone.barangay_id
    }

    const pendingStatusId = await getBulkStatusId(supabase, 'pending')
    if (!pendingStatusId) {
      return { status: 'error', message: 'Report status "pending" is not configured' }
    }

    // ── Guard: new accounts + unresolved reports ─────────────────────────
    try {
      const blocked = await validateReportTarget(supabase, {
        meterAccountId: meter_account_id,
        zoneId: meter_account_id ? null : resolvedZoneId,
      })
      if (blocked) return { status: 'error', message: blocked }
    } catch (validationError) {
      console.error('[createServiceReport] target validation:', validationError)
      return { status: 'error', message: 'Failed to validate the selected target' }
    }

    const { data: report, error: insError } = await supabase
      .from('service_reports')
      .insert({
        meter_account_id: meter_account_id ?? null,
        zone_id: resolvedZoneId,
        barangay_id: barangayId,
        issue_type_id,
        report_description: report_description || null,
        report_status_id: pendingStatusId,
        report_by: actor.id,
      })
      .select('report_id')
      .single()

    if (insError || !report) {
      console.error('[createServiceReport] insert:', insError)
      return { status: 'error', message: insError?.message ?? 'Failed to create service report' }
    }

    await createAuditLog(
      actor.id,
      'CREATE',
      `Filed service report — ${issueType.issue_name}`,
      'service_reports',
      report.report_id,
    )

    await logServiceReportEvent(supabase, {
      reportId: report.report_id,
      eventType: 'REPORTED',
      body: `Filed ${issueType.issue_name}`,
      toStatusId: pendingStatusId,
      actorUserId: actor.id,
    })

    if (payload.evidence?.length) {
      const attachErr = await attachReportEvidence({
        supabase,
        reportId: report.report_id,
        files: payload.evidence,
        uploadedBy: actor.id,
      })
      if (attachErr) {
        return { status: 'error', message: attachErr }
      }
    }

    // Consultant owns triage — do not require admin approval
    const consultantIds = await getUserIdsByRole(['consultant'])
    await createNotifications(
      consultantIds.map((id) => ({ userId: id })),
      'SERVICE_REPORT_NEW',
      { issue_name: issueType.issue_name, report_id: report.report_id },
      meter_account_id ?? null,
      report.report_id,
    )

    return {
      status: 'success',
      data: { report_id: report.report_id },
      message: 'Service report submitted',
    }
  } catch (err) {
    console.error('[createServiceReport]', err)
    return { status: 'error', message: 'Failed to create service report' }
  }
}

// ============================================================================
// UPDATE — only reachable while status is 'pending'
// ============================================================================

export async function updateServiceReport(
  payload: UpdateServiceReportData,
): Promise<ActionResult<{ report_id: string }>> {
  const supabase = await createClient()

  try {
    const {
      data: { user: actor },
    } = await supabase.auth.getUser()
    if (!actor) return { status: 'error', message: 'Unauthorised' }

    const parsed = updateServiceReportSchema.safeParse(payload)
    if (!parsed.success) {
      return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Invalid input' }
    }
    const { report_id, issue_type_id, meter_account_id, zone_id, report_description } = parsed.data

    const { data: existingReport, error: fetchError } = await supabase
      .from('service_reports')
      .select('report_id, report_status_id, report_status:report_status_id ( status_name )')
      .eq('report_id', report_id)
      .single()

    if (fetchError || !existingReport) {
      return { status: 'error', message: 'Service report not found' }
    }
    const currentStatus = getFirst(existingReport.report_status)?.status_name?.toLowerCase()
    if (currentStatus !== 'pending') {
      return { status: 'error', message: 'Only pending reports can be edited' }
    }

    const { data: issueType, error: itError } = await supabase
      .from('service_issue_types')
      .select('issue_type_id, issue_name')
      .eq('issue_type_id', issue_type_id)
      .single()

    if (itError || !issueType) {
      return { status: 'error', message: 'Selected issue type was not found' }
    }

    let resolvedZoneId: string | null = zone_id ?? null
    let barangayId: string | null = null

    if (meter_account_id) {
      const { data: ma, error: maError } = await supabase
        .from('meter_accounts')
        .select('meter_account_id, zone:zone_id ( zone_id, barangay_id )')
        .eq('meter_account_id', meter_account_id)
        .single()

      if (maError || !ma) {
        return { status: 'error', message: 'Meter account not found' }
      }
      const zone = getFirst(ma.zone)
      resolvedZoneId = zone?.zone_id ?? null
      barangayId = zone?.barangay_id ?? null
    } else if (zone_id) {
      const { data: zone, error: zoneError } = await supabase
        .from('zone')
        .select('zone_id, barangay_id')
        .eq('zone_id', zone_id)
        .single()

      if (zoneError || !zone) {
        return { status: 'error', message: 'Zone not found' }
      }
      barangayId = zone.barangay_id
    }

    // ── Guard: new accounts + unresolved reports (ignoring this report) ──
    try {
      const blocked = await validateReportTarget(supabase, {
        meterAccountId: meter_account_id,
        zoneId: meter_account_id ? null : resolvedZoneId,
        excludeReportId: report_id,
      })
      if (blocked) return { status: 'error', message: blocked }
    } catch (validationError) {
      console.error('[updateServiceReport] target validation:', validationError)
      return { status: 'error', message: 'Failed to validate the selected target' }
    }

    const { error: updError } = await supabase
      .from('service_reports')
      .update({
        meter_account_id: meter_account_id ?? null,
        zone_id: resolvedZoneId,
        barangay_id: barangayId,
        issue_type_id,
        report_description: report_description || null,
        updated_at: new Date().toISOString(),
      })
      .eq('report_id', report_id)

    if (updError) {
      console.error('[updateServiceReport] update:', updError)
      return { status: 'error', message: updError.message }
    }

    await createAuditLog(
      actor.id,
      'UPDATE',
      `Edited service report — ${issueType.issue_name}`,
      'service_reports',
      report_id,
    )

    return {
      status: 'success',
      data: { report_id },
      message: 'Service report updated',
    }
  } catch (err) {
    console.error('[updateServiceReport]', err)
    return { status: 'error', message: 'Failed to update service report' }
  }
}

// ============================================================================
// CANCEL
// ============================================================================

export async function cancelServiceReport(reportId: string, reason?: string): Promise<ActionResult> {
  const supabase = await createClient()
  try {
    const {
      data: { user: actor },
    } = await supabase.auth.getUser()
    if (!actor) return { status: 'error', message: 'Unauthorised' }

    const cancelId = await getBulkStatusId(supabase, 'cancelled')
    if (!cancelId) return { status: 'error', message: 'Report status "cancel" is not configured' }

    const { data: existingReport } = await supabase
      .from('service_reports')
      .select('report_id, meter_account_id, report_by, reported_by_consumer_id, issue_type:issue_type_id ( issue_name )')
      .eq('report_id', reportId)
      .single()

    const { error } = await supabase
      .from('service_reports')
      .update({ report_status_id: cancelId, updated_at: new Date().toISOString() })
      .eq('report_id', reportId)

    if (error) {
      console.error('[cancelServiceReport]', error)
      return { status: 'error', message: error.message }
    }

    const jo = await findJobOrderForReport(supabase, reportId)
    if (jo) {
      const cancelledJoStatusId = await getJobOrderStatusId(supabase, 'Cancelled')
      if (cancelledJoStatusId) {
        await supabase
          .from('job_orders')
          .update({ job_status_id: cancelledJoStatusId, updated_at: new Date().toISOString() })
          .eq('job_order_id', jo.job_order_id)
      }
    }

    const logDetail = reason?.trim()
      ? `Cancelled service report: ${reason.trim()}`
      : 'Cancelled service report'
    await createAuditLog(actor.id, 'UPDATE', logDetail, 'service_reports', reportId)

    if (existingReport) {
      const issueType = getFirst(existingReport.issue_type)
      const staffIds = await getUserIdsByRole(['admin', 'consultant'])

      const recipients: ({ userId: string } | { consumerId: string })[] = staffIds.map((id) => ({ userId: id }))

      // Notify whoever filed it — unless they're the one who just cancelled it
      if (existingReport.report_by && existingReport.report_by !== actor.id) {
        recipients.push({ userId: existingReport.report_by })
      } else if (existingReport.reported_by_consumer_id) {
        recipients.push({ consumerId: existingReport.reported_by_consumer_id })
      }

      await createNotifications(
        recipients,
        'SERVICE_REPORT_CANCELLED',
        { issue_name: issueType?.issue_name ?? '', reason: reason?.trim() ?? null },
        existingReport.meter_account_id,
        reportId,
      )
    }

    return { status: 'success', message: 'Service report cancelled' }
  } catch (err) {
    console.error('[cancelServiceReport]', err)
    return { status: 'error', message: 'Failed to cancel service report' }
  }
}

// ============================================================================
// RESOLVE
// ============================================================================
//
// NOTE: service_reports has no old_meter_id / new_meter_id / swapped_at
// columns in the current schema, so meter-swap bookkeeping is not persisted
// on the report row. If a meter swap is needed (issue type has an
// approved_meter_status_id), the OLD meter is marked with that status
// (e.g. "Defective" / "Stolen") and a NEW meter row is inserted into
// `meters` with status "Active". The report itself only records
// resolved_at/updated_at.

export async function resolveServiceReport(
  reportId: string,
  opts?: { new_meter_serial_no?: string },
): Promise<ActionResult> {
  const supabase = await createClient()
  try {
    const {
      data: { user: actor },
    } = await supabase.auth.getUser()
    if (!actor) return { status: 'error', message: 'Unauthorised' }

    const { data: report, error: fetchError } = await supabase
      .from('service_reports')
      .select('report_id, meter_account_id, issue_type:issue_type_id ( approved_meter_status_id )')
      .eq('report_id', reportId)
      .single()

    if (fetchError || !report) {
      return { status: 'error', message: 'Service report not found' }
    }

    const issueType = getFirst(report.issue_type)
    const needsMeterSwap = !!issueType?.approved_meter_status_id
    const nowIso = new Date().toISOString()

    if (needsMeterSwap) {
      const serial = opts?.new_meter_serial_no?.trim()
      if (!serial) {
        return { status: 'error', message: 'New meter serial number is required to resolve this report' }
      }
      if (!report.meter_account_id) {
        return { status: 'error', message: 'This report has no linked meter account to swap a meter on' }
      }

      const activeMeterStatusId = await getMeterStatusId(supabase, 'Active')
      if (!activeMeterStatusId) {
        return { status: 'error', message: 'Meter status "Active" is not configured' }
      }

      // Find the current meter on this account so it can be marked with
      // the issue-driven status (e.g. Defective / Stolen).
      const { data: oldMeter } = await supabase
        .from('meters')
        .select('meter_id')
        .eq('meter_account_id', report.meter_account_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (oldMeter) {
        const { error: oldMeterError } = await supabase
          .from('meters')
          .update({ meter_status_id: issueType.approved_meter_status_id, updated_at: nowIso })
          .eq('meter_id', oldMeter.meter_id)

        if (oldMeterError) {
          console.error('[resolveServiceReport] old meter status update:', oldMeterError)
          return { status: 'error', message: oldMeterError.message }
        }
      }

      const { error: newMeterError } = await supabase
        .from('meters')
        .insert({
          meter_account_id: report.meter_account_id,
          meter_serial_no: serial,
          meter_status_id: activeMeterStatusId,
          installation_date: nowIso,
        })
        .select('meter_id')
        .single()

      if (newMeterError) {
        console.error('[resolveServiceReport] new meter insert:', newMeterError)
        return { status: 'error', message: newMeterError?.message ?? 'Failed to register the new meter' }
      }
    }

    const { error: updateError } = await supabase
      .from('service_reports')
      .update({ resolved_at: nowIso, updated_at: nowIso })
      .eq('report_id', reportId)

    if (updateError) {
      console.error('[resolveServiceReport] update:', updateError)
      return { status: 'error', message: updateError.message }
    }

    const jo = await findJobOrderForReport(supabase, reportId)
    if (jo) {
      const completedJoStatusId = await getJobOrderStatusId(supabase, 'Completed')
      if (completedJoStatusId) {
        await supabase
          .from('job_orders')
          .update({ job_status_id: completedJoStatusId, completion_date: nowIso, updated_at: nowIso })
          .eq('job_order_id', jo.job_order_id)
      }
    }

    await createAuditLog(actor.id, 'UPDATE', 'Resolved service report', 'service_reports', reportId)
    return { status: 'success', message: 'Service report resolved' }
  } catch (err) {
    console.error('[resolveServiceReport]', err)
    return { status: 'error', message: 'Failed to resolve service report' }
  }
}

// ============================================================================
// CONSUMER — my meter accounts
// ============================================================================

export interface ConsumerMeterAccountOption {
  meter_account_id: string
  meter_serial_no: string | null
  zone_id: string
  zone_name: string
  barangay_id: string
  barangay_name: string
  latest_meter_status: string | null
}

// The meter statuses whose accounts a consumer may still file a report
// against. Removed / Disconnected means the account physically has no meter
// on site — nothing for the consumer to report. Active / Defective / Stolen
// / Waterleak_After_Meter all mean there IS a meter worth reporting on.
const REPORTABLE_METER_STATUSES = ['active', 'defective', 'stolen', 'waterleak_after_meter']

// ============================================================================
// CONSUMER IDENTITY
// ============================================================================
// In this app, a consumer IS a Supabase auth user. meter_accounts.consumer_id
// stores the auth user's UUID directly — there is no separate consumers-table
// lookup. "consumer" here just means "an auth user who owns at least one
// meter account", as opposed to staff (admin / consultant / meter_reader /
// plumber) who authenticate through the same auth.users table.
//
// We validate by checking the auth user owns at least one meter account.
// This keeps staff sessions from accidentally matching a consumer flow.

async function getConsumerId(supabase: any, userId: string): Promise<string | null> {
  console.log('[getConsumerId] auth userId =', userId)

  const { data, error, count } = await supabase
    .from('meter_accounts')
    .select('meter_account_id', { count: 'exact', head: true })
    .eq('consumer_id', userId)
    .limit(1)

  if (error) {
    console.error('[getConsumerId] meter_accounts lookup failed:', error)
    return null
  }

  if ((count ?? 0) === 0) {
    console.warn(
      '[getConsumerId] auth user', userId,
      'owns no meter accounts — not a consumer, or accounts are mis-linked.',
    )
    return null
  }

  // The auth user's UUID *is* the consumer_id. Return it directly.
  return userId
}

export async function getMyMeterAccounts(): Promise<ConsumerMeterAccountOption[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    console.warn('[getMyMeterAccounts] no auth user')
    return []
  }

  const consumerId = await getConsumerId(supabase, user.id)
  if (!consumerId) {
    console.warn('[getMyMeterAccounts] no consumer profile for auth user', user.id)
    return []
  }

  const { data, error } = await supabase
    .from('meter_accounts')
    .select(`
      meter_account_id,
      zone:zone_id ( zone_id, zone_name, barangay_id, barangay:barangay_id ( barangay_name ) ),
      meters (
        meter_id,
        meter_serial_no,
        installation_date,
        created_at,
        meter_status:meter_status_id ( meter_status_name )
      )
    `)
    .eq('consumer_id', consumerId)

  if (error) {
    console.error('[getMyMeterAccounts]', error)
    throw new Error('Failed to load your meter accounts')
  }

  const rows = (data ?? []).map((row: any) => {
    const zone = getFirst(row.zone)
    const barangay = getFirst(zone?.barangay)
    const latestStatus = pickLatestMeterStatus(row.meters)

    return {
      meter_account_id: row.meter_account_id,
      meter_serial_no: latestMeterSerialFromMeters(row.meters),
      zone_id: zone?.zone_id ?? '',
      zone_name: zone?.zone_name ?? '—',
      barangay_id: zone?.barangay_id ?? '',
      barangay_name: barangay?.barangay_name ?? '—',
      latest_meter_status: latestStatus,
    }
  })

  // Keep only accounts whose LATEST meter is in a reportable state. A
  // multi-meter account (e.g. one Active + one Removed from a prior swap)
  // is kept when its newest meter is Active / Defective / Stolen / Waterleak.
  // Removed and Disconnected accounts are dropped — the account has no
  // usable meter on site for the consumer to report against.
  const filtered = rows.filter((acc) =>
    REPORTABLE_METER_STATUSES.includes((acc.latest_meter_status ?? '').toLowerCase()),
  )

  console.log(
    '[getMyMeterAccounts] consumerId =', consumerId,
    'total =', rows.length,
    'reportable =', filtered.length,
  )

  return filtered
}

// ============================================================================
// GET — issue types available to consumers
// ============================================================================
// NOTE: `service_issue_types` does not have a `consumer_reportable` column in
// the current schema, so this returns the same list as getServiceIssueTypes().
// If/when the column is added and populated, re-add the
//   .eq('consumer_reportable', true)
// filter to restrict this to consumer-safe issue types.

export async function getConsumerServiceIssueTypes(): Promise<IssueTypeOption[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('service_issue_types')
    .select('issue_type_id, issue_name, description, affects_billing, requires_job_order, default_job_type_id, approved_meter_status_id, target_type')
    .order('issue_name', { ascending: true })

  if (error) {
    console.error('[getConsumerServiceIssueTypes]', error)
    throw new Error('Failed to load issue types')
  }
  return (data ?? []) as IssueTypeOption[]
}

export async function createConsumerServiceReport(
  payload: CreateServiceReportData,
): Promise<ActionResult<{ report_id: string }>> {
  const supabase = await createClient()
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { status: 'error', message: 'Unauthorised' }

    const consumerId = await getConsumerId(supabase, user.id)
    if (!consumerId) return { status: 'error', message: 'No consumer profile found for this account' }

    const parsed = createServiceReportSchema.safeParse(payload)
    if (!parsed.success) {
      return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Invalid input' }
    }
    const { issue_type_id, meter_account_id, zone_id, report_description } = parsed.data

    // Ownership check — a consumer can only report against their own meter account
    if (meter_account_id) {
      const { data: owned } = await supabase
        .from('meter_accounts')
        .select('meter_account_id')
        .eq('meter_account_id', meter_account_id)
        .eq('consumer_id', consumerId)
        .maybeSingle()
      if (!owned) return { status: 'error', message: 'That meter account does not belong to you' }
    }

    const { data: issueType, error: itError } = await supabase
      .from('service_issue_types')
      .select('issue_type_id, issue_name')
      .eq('issue_type_id', issue_type_id)
      .single()
    if (itError || !issueType) return { status: 'error', message: 'Selected issue type was not found' }

    let resolvedZoneId: string | null = zone_id ?? null
    let barangayId: string | null = null

    if (meter_account_id) {
      const { data: ma } = await supabase
        .from('meter_accounts')
        .select('zone:zone_id ( zone_id, barangay_id )')
        .eq('meter_account_id', meter_account_id)
        .single()
      const zone = getFirst(ma?.zone)
      resolvedZoneId = zone?.zone_id ?? null
      barangayId = zone?.barangay_id ?? null
    } else if (zone_id) {
      const { data: zone, error: zoneError } = await supabase
        .from('zone')
        .select('zone_id, barangay_id')
        .eq('zone_id', zone_id)
        .single()
      if (zoneError || !zone) return { status: 'error', message: 'Zone not found' }
      barangayId = zone.barangay_id
    }

    const pendingStatusId = await getBulkStatusId(supabase, 'pending')
    if (!pendingStatusId) return { status: 'error', message: 'Report status "pending" is not configured' }

    // ── Guard: new accounts + unresolved reports (staff OR consumer) ─────
    try {
      const blocked = await validateReportTarget(supabase, {
        meterAccountId: meter_account_id,
        zoneId: meter_account_id ? null : resolvedZoneId,
      })
      if (blocked) return { status: 'error', message: blocked }
    } catch (validationError) {
      console.error('[createConsumerServiceReport] target validation:', validationError)
      return { status: 'error', message: 'Failed to validate the selected target' }
    }

    const { data: report, error: insError } = await supabase
      .from('service_reports')
      .insert({
        meter_account_id: meter_account_id ?? null,
        zone_id: resolvedZoneId,
        barangay_id: barangayId,
        issue_type_id,
        report_description: report_description || null,
        report_status_id: pendingStatusId,
        reported_by_consumer_id: consumerId,
      })
      .select('report_id')
      .single()

    if (insError || !report) {
      console.error('[createConsumerServiceReport] insert:', insError)
      return { status: 'error', message: insError?.message ?? 'Failed to create service report' }
    }

    await logServiceReportEvent(supabase, {
      reportId: report.report_id,
      eventType: 'REPORTED',
      body: `Consumer filed ${issueType.issue_name}`,
      toStatusId: pendingStatusId,
      actorConsumerId: consumerId,
    })

    if (payload.evidence?.length) {
      const attachErr = await attachReportEvidence({
        supabase,
        reportId: report.report_id,
        files: payload.evidence,
        uploadedByConsumer: consumerId,
      })
      if (attachErr) {
        return { status: 'error', message: attachErr }
      }
    }

    await createNotification(
      { consumerId },
      'SERVICE_REPORT_RECEIVED',
      { issue_name: issueType.issue_name, report_id: report.report_id },
      meter_account_id ?? null,
      report.report_id,
    )

    const consultantIds = await getUserIdsByRole(['consultant'])
    await createNotifications(
      consultantIds.map((id) => ({ userId: id })),
      'SERVICE_REPORT_NEW',
      { issue_name: issueType.issue_name, report_id: report.report_id },
      meter_account_id ?? null,
      report.report_id,
    )

    return { status: 'success', data: { report_id: report.report_id }, message: 'Service report submitted' }
  } catch (err) {
    console.error('[createConsumerServiceReport]', err)
    return { status: 'error', message: 'Failed to create service report' }
  }
}

export async function updateConsumerServiceReport(
  reportId: string,
  payload: Omit<UpdateServiceReportData, 'report_id'>,
): Promise<ActionResult<{ report_id: string }>> {
  const supabase = await createClient()
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { status: 'error', message: 'Unauthorised' }

    const consumerId = await getConsumerId(supabase, user.id)
    if (!consumerId) return { status: 'error', message: 'No consumer profile found for this account' }

    const { data: existing, error: fetchError } = await supabase
      .from('service_reports')
      .select('report_id, reported_by_consumer_id, report_status_id, report_status:report_status_id ( status_name )')
      .eq('report_id', reportId)
      .single()

    if (fetchError || !existing) return { status: 'error', message: 'Service report not found' }
    if (existing.reported_by_consumer_id !== consumerId) {
      return { status: 'error', message: 'You can only edit your own reports' }
    }
    const currentStatus = getFirst(existing.report_status)?.status_name?.toLowerCase()
    if (currentStatus !== 'pending') return { status: 'error', message: 'Only pending reports can be edited' }

    const parsed = updateServiceReportSchema.safeParse({ report_id: reportId, ...payload })
    if (!parsed.success) return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Invalid input' }
    const { issue_type_id, meter_account_id, zone_id, report_description } = parsed.data

    if (meter_account_id) {
      const { data: owned } = await supabase
        .from('meter_accounts')
        .select('meter_account_id')
        .eq('meter_account_id', meter_account_id)
        .eq('consumer_id', consumerId)
        .maybeSingle()
      if (!owned) return { status: 'error', message: 'That meter account does not belong to you' }
    }

    const { data: issueType, error: itError } = await supabase
      .from('service_issue_types')
      .select('issue_type_id, issue_name')
      .eq('issue_type_id', issue_type_id)
      .single()
    if (itError || !issueType) return { status: 'error', message: 'Selected issue type was not found' }

    let resolvedZoneId: string | null = zone_id ?? null
    let barangayId: string | null = null

    if (meter_account_id) {
      const { data: ma } = await supabase
        .from('meter_accounts')
        .select('zone:zone_id ( zone_id, barangay_id )')
        .eq('meter_account_id', meter_account_id)
        .single()
      const zone = getFirst(ma?.zone)
      resolvedZoneId = zone?.zone_id ?? null
      barangayId = zone?.barangay_id ?? null
    } else if (zone_id) {
      const { data: zone, error: zoneError } = await supabase
        .from('zone')
        .select('zone_id, barangay_id')
        .eq('zone_id', zone_id)
        .single()
      if (zoneError || !zone) return { status: 'error', message: 'Zone not found' }
      barangayId = zone.barangay_id
    }

    // ── Guard: new accounts + unresolved reports (ignoring this report) ──
    try {
      const blocked = await validateReportTarget(supabase, {
        meterAccountId: meter_account_id,
        zoneId: meter_account_id ? null : resolvedZoneId,
        excludeReportId: reportId,
      })
      if (blocked) return { status: 'error', message: blocked }
    } catch (validationError) {
      console.error('[updateConsumerServiceReport] target validation:', validationError)
      return { status: 'error', message: 'Failed to validate the selected target' }
    }

    const { error: updError } = await supabase
      .from('service_reports')
      .update({
        meter_account_id: meter_account_id ?? null,
        zone_id: resolvedZoneId,
        barangay_id: barangayId,
        issue_type_id,
        report_description: report_description || null,
        updated_at: new Date().toISOString(),
      })
      .eq('report_id', reportId)

    if (updError) return { status: 'error', message: updError.message }

    return { status: 'success', data: { report_id: reportId }, message: 'Service report updated' }
  } catch (err) {
    console.error('[updateConsumerServiceReport]', err)
    return { status: 'error', message: 'Failed to update service report' }
  }
}


export async function getMyServiceReports(): Promise<ServiceReport[]> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const consumerId = await getConsumerId(supabase, user.id)
  if (!consumerId) return []

  const { data, error } = await supabase
    .from('service_reports')
    .select(SERVICE_REPORT_SELECT)
    .eq('reported_by_consumer_id', consumerId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[getMyServiceReports]', error)
    throw new Error('Failed to fetch your service reports')
  }

  return Promise.all((data ?? []).map((row: any) => shapeServiceReport(supabase, row)))
}

// ============================================================================
// GET — my filed service reports (staff-scoped, e.g. meter reader's own list)
// ============================================================================

export async function getMyFiledServiceReports(): Promise<ServiceReport[]> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('service_reports')
    .select(SERVICE_REPORT_SELECT)
    .eq('report_by', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[getMyFiledServiceReports]', error)
    throw new Error('Failed to fetch your filed service reports')
  }

  return Promise.all((data ?? []).map((row: any) => shapeServiceReport(supabase, row)))
}