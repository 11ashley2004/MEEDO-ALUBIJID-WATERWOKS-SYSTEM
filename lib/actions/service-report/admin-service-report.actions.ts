'use server'

import { createClient } from '@/lib/supabase/server'
import { createAuditLog } from '@/lib/actions/audit.action'
import {
  getBulkStatusId,
  getJobOrderStatusId,
  findJobOrderForReport,
  updateMeterStatusForApprovedReport,
  logServiceReportEvent,
} from './service-report.helpers'
import type { ActionResult } from './service-report.actions'
import { createNotification } from '@/lib/actions/notifications/notifications'

// ============================================================================
// ADMIN — approve / reject a service report, and job-order requests
//
// Kept separate from service-report.actions.ts: this file is the review
// boundary. Anything that changes a report's approval state (and therefore
// its downstream job-order/meter-swap eligibility) lives here.
// ============================================================================

export type ApprovedReportOption = {
  report_id: string
  issue_name: string
  meter_serial_no: string | null
  consumer_name: string | null
  zone_name: string | null
  barangay_name: string | null
  default_job_type_id: string | null
  default_job_type_name: string | null
}
// ============================================================================
// APPROVE
// ============================================================================

export async function approveServiceReport(reportId: string): Promise<ActionResult> {
  const supabase = await createClient()
  try {
    const {
      data: { user: actor },
    } = await supabase.auth.getUser()
    if (!actor) return { status: 'error', message: 'Unauthorised' }

    const { data: report, error: fetchError } = await supabase
      .from('service_reports')
      .select(`
        report_id,
        report_status_id,
        meter_account_id,
        report_status:report_status_id ( status_name ),
        issue_type:issue_type_id (
          issue_name,
          affects_billing,
          approved_meter_status_id
        )
      `)
      .eq('report_id', reportId)
      .single()

    if (fetchError || !report) {
      return { status: 'error', message: 'Service report not found' }
    }
    const currentStatus = (Array.isArray(report.report_status) ? report.report_status[0] : report.report_status)
      ?.status_name?.toLowerCase()
    if (currentStatus !== 'pending') {
      return { status: 'error', message: 'Only pending reports can be approved' }
    }

    const approvedId = await getBulkStatusId(supabase, 'approved')
    if (!approvedId) return { status: 'error', message: 'Report status "approved" is not configured' }

    const nowIso = new Date().toISOString()
    const { error } = await supabase
      .from('service_reports')
      .update({
        report_status_id: approvedId,
        // Consultant review (no separate admin approval step)
        reviewed_by: actor.id,
        reviewed_at: nowIso,
        approved_by: actor.id,
        approved_at: nowIso,
        updated_at: nowIso,
      })
      .eq('report_id', reportId)

    if (error) {
      console.error('[approveServiceReport]', error)
      return { status: 'error', message: error.message }
    }

    await logServiceReportEvent(supabase, {
      reportId,
      eventType: 'REVIEWED',
      body: 'Consultant reviewed and accepted the report',
      fromStatusId: report.report_status_id,
      toStatusId: approvedId,
      actorUserId: actor.id,
    })

    await createAuditLog(actor.id, 'UPDATE', 'Reviewed service report', 'service_reports', reportId)

    // ── Downstream effects are driven entirely by the issue type row.
    // Non-fatal: the approval already succeeded, so failures come back
    // as a warning message instead of an error.
    const issueType = Array.isArray(report.issue_type) ? report.issue_type[0] : report.issue_type
    const approvedMeterStatusId: string | null = issueType?.approved_meter_status_id ?? null
    let warningMessage: string | null = null

    if (approvedMeterStatusId) {
      // Apply whatever meter status the issue type is configured with
      // (Stolen, Defective, Waterleak_After_Meter, ...).
      const { error: meterStatusError } = await updateMeterStatusForApprovedReport(supabase, {
        meterAccountId: report.meter_account_id,
        approvedMeterStatusId,
      })
      if (meterStatusError) warningMessage = meterStatusError

      // A billing-affecting issue means the meter is being pulled/replaced, so
      // its installment plan is no longer collectible. A consumer-side leak
      // (affects_billing = false) changes the meter status but leaves the
      // plan running.
      if (issueType?.affects_billing) {
        const installmentError = await terminateActiveInstallmentIfAny(supabase, report.meter_account_id)
        if (installmentError && !warningMessage) warningMessage = installmentError
      }
    }

    if (warningMessage) {
      return { status: 'success', message: warningMessage }
    }

    return { status: 'success', message: 'Service report approved' }
  } catch (err) {
    console.error('[approveServiceReport]', err)
    return { status: 'error', message: 'Failed to approve service report' }
  }
}

// ============================================================================
// REJECT
// ============================================================================

export async function rejectServiceReport(reportId: string): Promise<ActionResult> {
  const supabase = await createClient()
  try {
    const {
      data: { user: actor },
    } = await supabase.auth.getUser()
    if (!actor) return { status: 'error', message: 'Unauthorised' }

    const { data: report, error: fetchError } = await supabase
      .from('service_reports')
      .select('report_id, report_status_id, report_status:report_status_id ( status_name )')
      .eq('report_id', reportId)
      .single()

    if (fetchError || !report) {
      return { status: 'error', message: 'Service report not found' }
    }
    const currentStatus = (Array.isArray(report.report_status) ? report.report_status[0] : report.report_status)
      ?.status_name?.toLowerCase()
    if (currentStatus !== 'pending') {
      return { status: 'error', message: 'Only pending reports can be rejected' }
    }

    const rejectedId = await getBulkStatusId(supabase, 'rejected')
    if (!rejectedId) return { status: 'error', message: 'Report status "rejected" is not configured' }

    const { error } = await supabase
      .from('service_reports')
      .update({ report_status_id: rejectedId, updated_at: new Date().toISOString() })
      .eq('report_id', reportId)

    if (error) {
      console.error('[rejectServiceReport]', error)
      return { status: 'error', message: error.message }
    }

    // A rejected report shouldn't leave a dangling active job order behind.
    // This only updates a job order that already exists for this report —
    // it does not create one.
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

    await createAuditLog(actor.id, 'UPDATE', 'Rejected service report', 'service_reports', reportId)
    return { status: 'success', message: 'Service report rejected' }
  } catch (err) {
    console.error('[rejectServiceReport]', err)
    return { status: 'error', message: 'Failed to reject service report' }
  }
}

// ============================================================================
// JOB ORDER REQUEST — manual creation of a job order for an approved report
// Job type is derived automatically from the report's issue type — not
// selectable, so a leak-repair report can't accidentally get a
// reconnection JO. job_order_no is auto-generated by the database.
// ============================================================================

async function resolveBarangayIdForReport(supabase: any, reportId: string): Promise<string | null> {
  const { data: report } = await supabase
    .from('service_reports')
    .select(`
      report_id,
      barangay_id,
      meter_account_id,
      meter_account:meter_account_id ( zone_id, zone:zone_id ( barangay_id ) )
    `)
    .eq('report_id', reportId)
    .single()

  if (!report) return null

  // Zone-level report already has barangay_id captured at filing time.
  if (report.barangay_id) return report.barangay_id

  // Account-level report: derive via meter_account -> zone -> barangay.
  const meterAccount = Array.isArray(report.meter_account) ? report.meter_account[0] : report.meter_account
  const zone = meterAccount?.zone ? (Array.isArray(meterAccount.zone) ? meterAccount.zone[0] : meterAccount.zone) : null
  return zone?.barangay_id ?? null
}

export async function requestJobOrderForServiceReport(reportId: string): Promise<ActionResult> {
  const supabase = await createClient()
  try {
    const {
      data: { user: actor },
    } = await supabase.auth.getUser()
    if (!actor) return { status: 'error', message: 'Unauthorised' }

    const { data: report, error: fetchError } = await supabase
      .from('service_reports')
      .select(`
        report_id, meter_account_id, report_status_id,
        report_status:report_status_id ( status_name ),
        issue_type:issue_type_id ( issue_name, default_job_type_id )
      `)
      .eq('report_id', reportId)
      .single()

    if (fetchError || !report) {
      return { status: 'error', message: 'Service report not found' }
    }
    const currentStatus = (Array.isArray(report.report_status) ? report.report_status[0] : report.report_status)
      ?.status_name?.toLowerCase()
    if (currentStatus !== 'approved') {
      return { status: 'error', message: 'Only approved reports can have a job order requested' }
    }

    const issueType = Array.isArray(report.issue_type) ? report.issue_type[0] : report.issue_type
    if (!issueType?.default_job_type_id) {
      return { status: 'error', message: 'This issue type has no default job type configured' }
    }

    // Guard against duplicate JOs (uq_jo_service_report backs this up too).
    const existing = await findJobOrderForReport(supabase, reportId)
    if (existing) {
      return { status: 'error', message: 'A job order already exists for this report' }
    }

    const barangayId = await resolveBarangayIdForReport(supabase, reportId)
    if (!barangayId) {
      return { status: 'error', message: 'Could not resolve a barangay for this report — cannot create job order' }
    }

    const pendingJoStatusId = await getJobOrderStatusId(supabase, 'Pending')
    if (!pendingJoStatusId) {
      return { status: 'error', message: 'Job order status "Pending" is not configured' }
    }

    const { data: jobOrder, error } = await supabase
      .from('job_orders')
      .insert({
        job_type_id: issueType.default_job_type_id,
        barangay_id: barangayId,
        job_status_id: pendingJoStatusId,
        meter_account_id: report.meter_account_id, // null for zone-level reports
        service_report_id: reportId,
        created_by: actor.id,
      })
      .select('job_order_id')
      .single()

    if (error) {
      console.error('[requestJobOrderForServiceReport]', error)
      return { status: 'error', message: error.message }
    }

    await logServiceReportEvent(supabase, {
      reportId,
      eventType: 'JOB_CREATED',
      body: `Job order created (${issueType.issue_name})`,
      actorUserId: actor.id,
    })

    await createAuditLog(actor.id, 'CREATE', `Requested job order (${issueType.issue_name})`, 'job_orders', jobOrder.job_order_id)

    // Notify consumer that work will be scheduled
    const { data: fullReport } = await supabase
      .from('service_reports')
      .select('reference_no, reported_by_consumer_id, meter_account_id')
      .eq('report_id', reportId)
      .maybeSingle()

    if (fullReport?.reported_by_consumer_id) {
      await createNotification(
        { consumerId: fullReport.reported_by_consumer_id },
        'SERVICE_REPORT_JOB_SCHEDULED',
        {
          reference_no: fullReport.reference_no,
          issue_name: issueType.issue_name,
          report_id: reportId,
          job_order_id: jobOrder.job_order_id,
        },
        fullReport.meter_account_id,
        reportId,
      )
    }

    return { status: 'success', message: 'Job order created' }
  } catch (err) {
    console.error('[requestJobOrderForServiceReport]', err)
    return { status: 'error', message: 'Failed to request job order' }
  }
}

// ============================================================================
// Approved reports that still need a job order (for the request form)
// ============================================================================

export async function getApprovedServiceReportsNeedingJobOrder(
  query: string,
): Promise<ApprovedReportOption[]> {
  const supabase = await createClient()

  const toArray = (v: any): any[] => (Array.isArray(v) ? v : v ? [v] : [])
  const first = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null)

  // Filter by status in the database, so older approved reports aren't cut off.
  const approvedId = await getBulkStatusId(supabase, 'approved')
  if (!approvedId) {
    console.error('[getApprovedServiceReportsNeedingJobOrder] "approved" status not configured')
    return []
  }

  const { data, error } = await supabase
    .from('service_reports')
    .select(`
      report_id,
      meter_account:meter_account_id (
        consumer:consumer_id ( account_name ),
        meters ( meter_serial_no )
      ),
      zone:zone_id ( zone_name ),
      barangay:barangay_id ( barangay_name ),
      issue_type:issue_type_id ( issue_name, default_job_type_id, job_type:default_job_type_id ( job_type_name ) )
    `)
    .eq('report_status_id', approvedId)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) {
    console.error('[getApprovedServiceReportsNeedingJobOrder]', error)
    return []
  }

  const rows = data ?? []
  if (rows.length === 0) return []

  // Which of these already have a job order (chunked to keep the URL short).
  const reportIds = rows.map((r: any) => r.report_id)
  const reportIdsWithJo = new Set<string>()
  for (let i = 0; i < reportIds.length; i += 100) {
    const chunk = reportIds.slice(i, i + 100)
    const { data: jos, error: joError } = await supabase
      .from('job_orders')
      .select('service_report_id')
      .in('service_report_id', chunk)

    if (joError) {
      console.error('[getApprovedServiceReportsNeedingJobOrder:job_orders]', joError)
      return []
    }
    for (const jo of jos ?? []) {
      if (jo.service_report_id) reportIdsWithJo.add(jo.service_report_id)
    }
  }

  const q = query.trim().toLowerCase()

  return rows
    .filter((r: any) => !reportIdsWithJo.has(r.report_id))
    .map((r: any): ApprovedReportOption => {
      const meterAccount = first(r.meter_account)
      const consumer = first(meterAccount?.consumer)
      const zone = first(r.zone)
      const barangay = first(r.barangay)
      const issueType = first(r.issue_type)
      const jobType = first(issueType?.job_type)
      const serials = toArray(meterAccount?.meters)
        .map((m: any) => m?.meter_serial_no)
        .filter(Boolean)

      return {
        report_id: r.report_id,
        issue_name: issueType?.issue_name ?? 'Unknown issue',
        meter_serial_no: serials.length ? serials.join(', ') : null,
        consumer_name: consumer?.account_name ?? null,
        zone_name: zone?.zone_name ?? null,
        barangay_name: barangay?.barangay_name ?? null,
        default_job_type_id: issueType?.default_job_type_id ?? null,
        default_job_type_name: jobType?.job_type_name ?? null,
      }
    })
    .filter((r) => {
      if (!q) return true
      return [
        r.issue_name,
        r.meter_serial_no,
        r.consumer_name,
        r.zone_name,
        r.barangay_name,
      ].some((v) => v?.toLowerCase().includes(q))
    })
    .slice(0, 50)
}

// installment_status has a TERMINATED code ("Stopped permanently due to
// defective meter or equipment failure"), which is what this flow sets.
// CANCELLED is reserved for plans stopped prematurely for other reasons.
export async function terminateActiveInstallmentIfAny(
  supabase: any,
  meterAccountId: string | null,
): Promise<string | null> {
  if (!meterAccountId) return null

  const [{ data: activeStatus }, { data: terminatedStatus }] = await Promise.all([
    supabase.from('installment_status').select('installment_status_id').eq('status_code', 'ACTIVE').single(),
    supabase.from('installment_status').select('installment_status_id').eq('status_code', 'TERMINATED').single(),
  ])

  if (!activeStatus || !terminatedStatus) {
    return 'Installment status "ACTIVE" or "TERMINATED" is not configured'
  }

  const { data: activeInstallment, error: fetchError } = await supabase
    .from('meter_installments')
    .select('installment_id')
    .eq('meter_account_id', meterAccountId)
    .eq('status_id', activeStatus.installment_status_id)
    .maybeSingle()

  if (fetchError) {
    console.error('[terminateActiveInstallmentIfAny] fetch:', fetchError)
    return 'Failed to check installment plan status'
  }
  if (!activeInstallment) return null

  const { error: updateError } = await supabase
    .from('meter_installments')
    .update({ status_id: terminatedStatus.installment_status_id })
    .eq('installment_id', activeInstallment.installment_id)

  if (updateError) {
    console.error('[terminateActiveInstallmentIfAny] update:', updateError)
    return 'Failed to terminate the active installment plan'
  }

  return null
}