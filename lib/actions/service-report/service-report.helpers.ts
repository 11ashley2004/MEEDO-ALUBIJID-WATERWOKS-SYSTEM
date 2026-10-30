// Plain helper module — NOT 'use server'. Shared by service-report.actions.ts
// and admin-service-report.actions.ts so approve/reject/create/update all
// stay in sync on status lookups and duplicate-report checks.

export const getFirst = (val: unknown): any => (Array.isArray(val) ? val[0] ?? null : val ?? null)

export function latestMeterSerialFromMeters(meters: unknown): string | null {
  const list = Array.isArray(meters) ? meters : meters ? [meters] : []
  if (!list.length) return null

  // Prefer installation_date, then created_at — same rule as pickLatestMeterStatus
  // so report lists and account pickers agree on which meter is "current".
  const best = list.slice().sort((a: any, b: any) => {
    const da = a?.installation_date ? new Date(a.installation_date).getTime() : 0
    const db = b?.installation_date ? new Date(b.installation_date).getTime() : 0
    if (db !== da) return db - da
    const ca = a?.created_at ? new Date(a.created_at).getTime() : 0
    const cb = b?.created_at ? new Date(b.created_at).getTime() : 0
    return cb - ca
  })[0] as any

  return best?.meter_serial_no ?? null
}

export function fullName(u: any): string {
  if (!u) return '—'
  return [u.first_name, u.last_name].filter(Boolean).join(' ') || '—'
}

// service_reports.report_status_id and other *_status_id columns in this
// schema that point at the shared `bulk_status` lookup use lowercase status
// names ('pending', 'approved', 'rejected', 'cancel') — unlike job_order /
// installation status tables, which use Title Case. Keep the casing exact.
export async function getBulkStatusId(supabase: any, statusName: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('bulk_status')
    .select('status_id')
    .eq('status_name', statusName)
    .single()
  if (error || !data) return null
  return data.status_id
}

export async function getJobOrderStatusId(supabase: any, statusName: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('job_order_status')
    .select('job_status_id')
    .eq('job_status_name', statusName)
    .single()
  if (error || !data) return null
  return data.job_status_id
}

// meter_status uses Title/Pascal-ish names (e.g. 'Active', 'Defective',
// 'Stolen', 'Removed', 'Disconnected', 'Pending', 'Replacing') — match
// meter_status_name exactly as seeded.
export async function getMeterStatusId(supabase: any, statusName: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('meter_status')
    .select('meter_status_id')
    .eq('meter_status_name', statusName)
    .single()
  if (error || !data) return null
  return data.meter_status_id
}

// Looks up a job order already attached to this report — used by
// reject/cancel/resolve to keep an existing job order's status in sync.
// Neither actions file creates job orders; that happens elsewhere.
export async function findJobOrderForReport(supabase: any, reportId: string) {
  const { data, error } = await supabase
    .from('job_orders')
    .select('job_order_id, job_order_no, job_status_id, request_date, job_order_status:job_status_id ( job_status_name )')
    .eq('service_report_id', reportId)
    .maybeSingle()
  if (error || !data) return null
  return data
}

// Shared by create + update: is there already a pending report on this
// same target? `excludeReportId` lets update() ignore the row being edited.
export async function checkDuplicatePendingReport(
  supabase: any,
  opts: {
    meterAccountId?: string | null
    zoneId?: string | null
    excludeReportId?: string
    pendingStatusId: string
  },
): Promise<{ report_id: string; reference_no: string | null } | null> {
  if (opts.meterAccountId) {
    let req = supabase
      .from('service_reports')
      .select('report_id, reference_no')
      .eq('meter_account_id', opts.meterAccountId)
      .eq('report_status_id', opts.pendingStatusId)
    if (opts.excludeReportId) req = req.neq('report_id', opts.excludeReportId)
    const { data, error } = await req.maybeSingle()
    if (error) throw error
    return data ?? null
  }
  if (opts.zoneId) {
    let req = supabase
      .from('service_reports')
      .select('report_id, reference_no')
      .eq('zone_id', opts.zoneId)
      .is('meter_account_id', null)
      .eq('report_status_id', opts.pendingStatusId)
    if (opts.excludeReportId) req = req.neq('report_id', opts.excludeReportId)
    const { data, error } = await req.maybeSingle()
    if (error) throw error
    return data ?? null
  }
  return null
}

// Flips the meter's status when the report's issue type has an
// approved_meter_status_id configured (e.g. "Defective" -> Defective status,
// "Stolen" -> Stolen status). No-op for zone-level reports (no meter
// account) or issue types that don't drive a meter status change.
export async function updateMeterStatusForApprovedReport(
  supabase: any,
  params: { meterAccountId: string | null; approvedMeterStatusId: string | null },
): Promise<{ error: string | null }> {
  const { meterAccountId, approvedMeterStatusId } = params

  if (!meterAccountId || !approvedMeterStatusId) {
    return { error: null }
  }

  const { error } = await supabase
    .from('meters')
    .update({ meter_status_id: approvedMeterStatusId, updated_at: new Date().toISOString() })
    .eq('meter_account_id', meterAccountId)

  if (error) {
    console.error('[updateMeterStatusForApprovedReport]', error)
    return { error: 'Report approved, but the linked meter status could not be updated' }
  }
  return { error: null }
}

export type ServiceReportEventType =
  | 'REPORTED'
  | 'REVIEWED'
  | 'REJECTED'
  | 'JOB_CREATED'
  | 'ASSIGNED'
  | 'FIELD_COMPLETED'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'BILL_ADJUSTED'
  | 'INTERNAL_NOTE'
  | 'PUBLIC_REPLY'

/** Append-only timeline row. Non-fatal if the table is not migrated yet. */
export async function logServiceReportEvent(
  supabase: any,
  opts: {
    reportId: string
    eventType: ServiceReportEventType
    body?: string | null
    fromStatusId?: string | null
    toStatusId?: string | null
    actorUserId?: string | null
    actorConsumerId?: string | null
    isPublic?: boolean
  },
): Promise<void> {
  try {
    const { error } = await supabase.from('service_report_events').insert({
      report_id: opts.reportId,
      event_type: opts.eventType,
      body: opts.body ?? null,
      from_status_id: opts.fromStatusId ?? null,
      to_status_id: opts.toStatusId ?? null,
      actor_user_id: opts.actorUserId ?? null,
      actor_consumer_id: opts.actorConsumerId ?? null,
      is_public: opts.isPublic ?? true,
    })
    if (error) console.warn('[logServiceReportEvent]', error.message)
  } catch (err) {
    console.warn('[logServiceReportEvent] skipped', err)
  }
}

/**
 * Field worker finished the linked job order.
 * Does NOT close the report — consultant must confirm completion.
 */
export async function markServiceReportFieldCompleted(
  supabase: any,
  params: { serviceReportId: string; actorUserId: string; now: string },
): Promise<void> {
  const { serviceReportId, actorUserId, now } = params
  const { error } = await supabase
    .from('service_reports')
    .update({
      field_completed_at: now,
      field_completed_by: actorUserId,
      updated_at: now,
    })
    .eq('report_id', serviceReportId)

  if (error) {
    console.error('[markServiceReportFieldCompleted]', error)
    return
  }

  await logServiceReportEvent(supabase, {
    reportId: serviceReportId,
    eventType: 'FIELD_COMPLETED',
    body: 'Field work recorded — awaiting consultant confirmation',
    actorUserId,
  })
}