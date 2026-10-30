'use server'

/**
 * Consultant / clerk / field workflow for Defective Meter, Stolen Meter,
 * and Leak After Meter — no admin approval step.
 */

import { createClient } from '@/lib/supabase/server'
import { createAuditLog } from '@/lib/actions/audit.action'
import {
  createNotification,
  createNotifications,
  getUserIdsByRole,
} from '@/lib/actions/notifications/notifications'
import {
  findJobOrderForReport,
  getBulkStatusId,
  getFirst,
  latestMeterSerialFromMeters,
  logServiceReportEvent,
} from './service-report.helpers'
import type { ActionResult } from './service-report.actions'

// ============================================================================
// Types
// ============================================================================

export type CostShoulderedBy = 'CONSUMER' | 'UTILITY' | 'SHARED'

export interface ServiceReportTimelineStep {
  key: string
  label: string
  at: string | null
  actor: string | null
  done: boolean
  current: boolean
}

export interface ServiceReportDetail {
  report_id: string
  reference_no: string | null
  issue_name: string
  affects_billing: boolean
  requires_job_order: boolean
  status_name: string
  report_description: string | null
  created_at: string
  meter_account_id: string | null
  consumer_name: string | null
  contract_no: string | null
  zone_name: string | null
  barangay_name: string | null
  classification_name: string | null
  old_meter_serial: string | null
  new_meter_serial: string | null
  replacement_cost: number | null
  cost_shouldered_by: CostShoulderedBy | null
  allow_installment: boolean
  job_order_id: string | null
  job_order_no: string | null
  job_status_name: string | null
  assigned_worker: string | null
  scheduled_at: string | null
  field_completed_at: string | null
  confirmed_at: string | null
  resolved_at: string | null
  leak_confirmed: boolean | null
  leak_findings: string | null
  leak_inspected_by: string | null
  leak_inspected_at: string | null
  billing_adjustment: {
    original_amount: number
    adjusted_amount: number
    reason: string
    encoded_by: string
    encoded_at: string
  } | null
  attachments: {
    attachment_id: string
    file_name: string
    file_path: string
    attachment_kind: string
    created_at: string
  }[]
  timeline: ServiceReportTimelineStep[]
  events: {
    event_id: string
    event_type: string
    body: string | null
    actor: string | null
    created_at: string
  }[]
  can_create_job_order: boolean
  can_assign_worker: boolean
  can_confirm_completion: boolean
  can_adjust_bill: boolean
}

function fullName(u: any): string {
  if (!u) return '—'
  return [u.first_name, u.last_name].filter(Boolean).join(' ') || '—'
}

function buildTimeline(detail: {
  created_at: string
  reviewed_at: string | null
  reviewed_by_name: string | null
  job_created_at: string | null
  job_created_by: string | null
  assigned_at: string | null
  assigned_worker: string | null
  field_completed_at: string | null
  field_completed_by: string | null
  confirmed_at: string | null
  confirmed_by: string | null
  status_name: string
}): ServiceReportTimelineStep[] {
  const steps: Omit<ServiceReportTimelineStep, 'current'>[] = [
    {
      key: 'reported',
      label: 'Reported',
      at: detail.created_at,
      actor: null,
      done: true,
    },
    {
      key: 'job_created',
      label: 'Job order created',
      at: detail.job_created_at,
      actor: detail.job_created_by,
      done: !!detail.job_created_at,
    },
    {
      key: 'assigned',
      label: 'Assigned',
      at: detail.assigned_at,
      actor: detail.assigned_worker,
      done: !!detail.assigned_at,
    },
    {
      key: 'completed',
      label: 'Completed',
      at: detail.field_completed_at || detail.confirmed_at,
      actor: detail.confirmed_by || detail.field_completed_by,
      done: !!(detail.field_completed_at || detail.confirmed_at),
    },
  ]

  // Insert review between reported and job when reviewed
  const withReview: Omit<ServiceReportTimelineStep, 'current'>[] = [
    steps[0],
    {
      key: 'reviewed',
      label: 'Reviewed',
      at: detail.reviewed_at,
      actor: detail.reviewed_by_name,
      done: !!detail.reviewed_at,
    },
    ...steps.slice(1),
  ]

  const firstPending = withReview.findIndex((s) => !s.done)
  return withReview.map((s, i) => ({
    ...s,
    current:
      detail.status_name === 'resolved'
        ? s.key === 'completed'
        : firstPending === -1
          ? s.key === 'completed'
          : i === firstPending,
  }))
}

// ============================================================================
// GET — full detail for consultant / clerk / consumer views
// ============================================================================

export async function getServiceReportDetail(reportId: string): Promise<{
  status: 'success' | 'error'
  data?: ServiceReportDetail
  message?: string
}> {
  const supabase = await createClient()
  try {
    const { data: report, error } = await supabase
      .from('service_reports')
      .select(`
        report_id, reference_no, report_description, created_at, resolved_at,
        meter_account_id, replacement_cost, cost_shouldered_by, allow_installment,
        approved_at, approved_by, reviewed_at, reviewed_by,
        field_completed_at, field_completed_by, confirmed_at, confirmed_by,
        report_status:report_status_id ( status_name ),
        issue_type:issue_type_id ( issue_name, affects_billing, requires_job_order ),
        reviewer:reviewed_by ( first_name, last_name ),
        approver:approved_by ( first_name, last_name ),
        field_worker:field_completed_by ( first_name, last_name ),
        confirmer:confirmed_by ( first_name, last_name ),
        meter_account:meter_account_id (
          consumer:consumer_id ( account_name, contract_no ),
          classification:classification_id ( classification_name ),
          zone:zone_id (
            zone_name,
            barangay:barangay_id ( barangay_name )
          ),
          meters ( meter_serial_no, created_at, meter_status:meter_status_id ( meter_status_name ) )
        ),
        zone:zone_id ( zone_name ),
        barangay:barangay_id ( barangay_name )
      `)
      .eq('report_id', reportId)
      .single()

    if (error || !report) {
      return { status: 'error', message: 'Service report not found' }
    }

    const issue = getFirst(report.issue_type)
    const statusName = (getFirst(report.report_status)?.status_name ?? 'pending').toLowerCase()
    const ma = getFirst(report.meter_account)
    const consumer = getFirst(ma?.consumer)
    const zone = getFirst(ma?.zone) ?? getFirst(report.zone)
    const barangay = getFirst(zone?.barangay) ?? getFirst(report.barangay)
    const classification = getFirst(ma?.classification)

    const jo = await findJobOrderForReport(supabase, reportId)

    let assignedWorker: string | null = null
    let scheduledAt: string | null = null
    let jobCreatedBy: string | null = null
    if (jo?.job_order_id) {
      const { data: assign } = await supabase
        .from('job_assignment_orders')
        .select(`
          created_at,
          job_assignment:job_assignment_id (
            scheduled_at, assigned_date,
            worker:assigned_to ( first_name, last_name ),
            assigner:assign_by ( first_name, last_name )
          )
        `)
        .eq('job_order_id', jo.job_order_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const ja = getFirst(assign?.job_assignment)
      assignedWorker = fullName(getFirst(ja?.worker))
      scheduledAt = ja?.scheduled_at ?? ja?.assigned_date ?? null
      jobCreatedBy = fullName(getFirst(ja?.assigner))
    }

    // Meter swap
    let oldSerial: string | null = latestMeterSerialFromMeters(ma?.meters)
    let newSerial: string | null = null
    const { data: swap } = await supabase
      .from('report_meter_swaps')
      .select(`
        old_meter:old_meter_id ( meter_serial_no ),
        new_meter:new_meter_id ( meter_serial_no )
      `)
      .eq('report_id', reportId)
      .maybeSingle()
    if (swap) {
      oldSerial = getFirst(swap.old_meter)?.meter_serial_no ?? oldSerial
      newSerial = getFirst(swap.new_meter)?.meter_serial_no ?? null
    }

    // Leak inspection
    const { data: leak } = await supabase
      .from('report_leak_inspections')
      .select(`
        leak_confirmed, findings, inspected_at,
        inspector:inspected_by ( first_name, last_name )
      `)
      .eq('report_id', reportId)
      .maybeSingle()

    // Billing adjustment
    const { data: adj } = await supabase
      .from('report_billing_adjustments')
      .select(`
        original_amount, adjusted_amount, reason, encoded_at,
        encoder:encoded_by ( first_name, last_name )
      `)
      .eq('report_id', reportId)
      .order('encoded_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Attachments
    const { data: attachments } = await supabase
      .from('report_attachments')
      .select('attachment_id, file_name, file_path, attachment_kind, created_at')
      .eq('report_id', reportId)
      .order('created_at', { ascending: false })

    // Events
    const { data: events } = await supabase
      .from('service_report_events')
      .select(`
        event_id, event_type, body, created_at,
        actor_user:actor_user_id ( first_name, last_name ),
        actor_consumer:actor_consumer_id ( account_name )
      `)
      .eq('report_id', reportId)
      .order('created_at', { ascending: true })

    const reviewedAt = report.reviewed_at ?? report.approved_at
    const reviewedByName = fullName(getFirst(report.reviewer) ?? getFirst(report.approver))

    const timeline = buildTimeline({
      created_at: report.created_at,
      reviewed_at: reviewedAt,
      reviewed_by_name: reviewedByName !== '—' ? reviewedByName : null,
      job_created_at: jo ? (jo as any).request_date ?? report.approved_at : null,
      job_created_by: jobCreatedBy,
      assigned_at: scheduledAt,
      assigned_worker: assignedWorker !== '—' ? assignedWorker : null,
      field_completed_at: report.field_completed_at,
      field_completed_by: fullName(getFirst(report.field_worker)),
      confirmed_at: report.confirmed_at ?? report.resolved_at,
      confirmed_by: fullName(getFirst(report.confirmer)),
      status_name: statusName,
    })

    const jobStatus = getFirst(jo?.job_order_status)?.job_status_name ?? null
    const canCreateJo =
      statusName === 'approved' && !!issue?.requires_job_order && !jo
    const canAssign =
      !!jo && (jobStatus === 'Pending' || jobStatus === 'Assigned') && !report.field_completed_at
    const canConfirm =
      statusName === 'approved' &&
      !!report.field_completed_at &&
      !report.resolved_at &&
      issue?.issue_name !== 'Leak After Meter'
    const canAdjustBill =
      issue?.issue_name === 'Leak After Meter' &&
      leak?.leak_confirmed === true &&
      !adj

    return {
      status: 'success',
      data: {
        report_id: report.report_id,
        reference_no: report.reference_no,
        issue_name: issue?.issue_name ?? '—',
        affects_billing: !!issue?.affects_billing,
        requires_job_order: !!issue?.requires_job_order,
        status_name: statusName,
        report_description: report.report_description,
        created_at: report.created_at,
        meter_account_id: report.meter_account_id,
        consumer_name: consumer?.account_name ?? null,
        contract_no: consumer?.contract_no ?? null,
        zone_name: zone?.zone_name ?? null,
        barangay_name: barangay?.barangay_name ?? null,
        classification_name: classification?.classification_name ?? null,
        old_meter_serial: oldSerial,
        new_meter_serial: newSerial,
        replacement_cost: report.replacement_cost != null ? Number(report.replacement_cost) : null,
        cost_shouldered_by: report.cost_shouldered_by ?? null,
        allow_installment: !!report.allow_installment,
        job_order_id: jo?.job_order_id ?? null,
        job_order_no: jo?.job_order_no ?? null,
        job_status_name: jobStatus,
        assigned_worker: assignedWorker !== '—' ? assignedWorker : null,
        scheduled_at: scheduledAt,
        field_completed_at: report.field_completed_at,
        confirmed_at: report.confirmed_at ?? report.resolved_at,
        resolved_at: report.resolved_at,
        leak_confirmed: leak?.leak_confirmed ?? null,
        leak_findings: leak?.findings ?? null,
        leak_inspected_by: leak ? fullName(getFirst(leak.inspector)) : null,
        leak_inspected_at: leak?.inspected_at ?? null,
        billing_adjustment: adj
          ? {
              original_amount: Number(adj.original_amount),
              adjusted_amount: Number(adj.adjusted_amount),
              reason: adj.reason,
              encoded_by: fullName(getFirst(adj.encoder)),
              encoded_at: adj.encoded_at,
            }
          : null,
        attachments: (attachments ?? []).map((a) => ({
          attachment_id: a.attachment_id,
          file_name: a.file_name,
          file_path: a.file_path,
          attachment_kind: a.attachment_kind,
          created_at: a.created_at,
        })),
        timeline,
        events: (events ?? []).map((e) => ({
          event_id: e.event_id,
          event_type: e.event_type,
          body: e.body,
          actor: fullName(getFirst(e.actor_user)) !== '—'
            ? fullName(getFirst(e.actor_user))
            : getFirst(e.actor_consumer)?.account_name ?? null,
          created_at: e.created_at,
        })),
        can_create_job_order: canCreateJo,
        can_assign_worker: canAssign,
        can_confirm_completion: canConfirm,
        can_adjust_bill: canAdjustBill,
      },
    }
  } catch (err) {
    console.error('[getServiceReportDetail]', err)
    return { status: 'error', message: 'Failed to load report detail' }
  }
}

// ============================================================================
// CONSULTANT — confirm field completion (closes the report)
// ============================================================================

export async function confirmServiceReportCompletion(
  reportId: string,
): Promise<ActionResult> {
  const supabase = await createClient()
  try {
    const {
      data: { user: actor },
    } = await supabase.auth.getUser()
    if (!actor) return { status: 'error', message: 'Unauthorised' }

    const { data: report, error: fetchError } = await supabase
      .from('service_reports')
      .select(`
        report_id, reference_no, field_completed_at, resolved_at, meter_account_id,
        reported_by_consumer_id, report_status_id,
        report_status:report_status_id ( status_name ),
        issue_type:issue_type_id ( issue_name )
      `)
      .eq('report_id', reportId)
      .single()

    if (fetchError || !report) {
      return { status: 'error', message: 'Service report not found' }
    }

    const status = (getFirst(report.report_status)?.status_name ?? '').toLowerCase()
    if (status === 'resolved') {
      return { status: 'error', message: 'Report is already confirmed' }
    }
    if (!report.field_completed_at) {
      return { status: 'error', message: 'Field work has not been completed yet' }
    }

    const issueName = getFirst(report.issue_type)?.issue_name
    if (issueName === 'Leak After Meter') {
      return {
        status: 'error',
        message: 'Leak After Meter reports resolve automatically when the job order is completed.',
      }
    }

    const resolvedId = await getBulkStatusId(supabase, 'resolved')
    if (!resolvedId) return { status: 'error', message: 'Status "resolved" is not configured' }

    const nowIso = new Date().toISOString()
    const { error } = await supabase
      .from('service_reports')
      .update({
        report_status_id: resolvedId,
        confirmed_by: actor.id,
        confirmed_at: nowIso,
        resolved_at: nowIso,
        updated_at: nowIso,
      })
      .eq('report_id', reportId)

    if (error) {
      console.error('[confirmServiceReportCompletion]', error)
      return { status: 'error', message: error.message }
    }

    await logServiceReportEvent(supabase, {
      reportId,
      eventType: 'CONFIRMED',
      body: 'Consultant confirmed completion',
      fromStatusId: report.report_status_id,
      toStatusId: resolvedId,
      actorUserId: actor.id,
    })

    await createAuditLog(actor.id, 'UPDATE', 'Confirmed service report completion', 'service_reports', reportId)

    if (report.reported_by_consumer_id) {
      await createNotification(
        { consumerId: report.reported_by_consumer_id },
        'SERVICE_REPORT_CONFIRMED',
        { reference_no: report.reference_no, issue_name: issueName ?? null, report_id: reportId },
        report.meter_account_id,
        reportId,
      )
    }

    return { status: 'success', message: 'Completion confirmed' }
  } catch (err) {
    console.error('[confirmServiceReportCompletion]', err)
    return { status: 'error', message: 'Failed to confirm completion' }
  }
}

// ============================================================================
// Update stolen meter cost / shoulder / installment (consultant, pre-confirm)
// ============================================================================

export async function updateStolenMeterCostDetails(
  reportId: string,
  payload: {
    replacement_cost: number
    cost_shouldered_by: CostShoulderedBy
    allow_installment: boolean
  },
): Promise<ActionResult> {
  const supabase = await createClient()
  try {
    const {
      data: { user: actor },
    } = await supabase.auth.getUser()
    if (!actor) return { status: 'error', message: 'Unauthorised' }

    const { data: report } = await supabase
      .from('service_reports')
      .select('report_id, issue_type:issue_type_id ( issue_name )')
      .eq('report_id', reportId)
      .single()

    const issueName = getFirst(report?.issue_type)?.issue_name
    if (issueName !== 'Stolen Meter') {
      return { status: 'error', message: 'Cost details only apply to Stolen Meter reports' }
    }

    const { error } = await supabase
      .from('service_reports')
      .update({
        replacement_cost: payload.replacement_cost,
        cost_shouldered_by: payload.cost_shouldered_by,
        allow_installment: payload.allow_installment,
        updated_at: new Date().toISOString(),
      })
      .eq('report_id', reportId)

    if (error) return { status: 'error', message: error.message }

    await createAuditLog(actor.id, 'UPDATE', 'Updated stolen meter cost details', 'service_reports', reportId)
    return { status: 'success', message: 'Cost details saved' }
  } catch (err) {
    console.error('[updateStolenMeterCostDetails]', err)
    return { status: 'error', message: 'Failed to save cost details' }
  }
}

// ============================================================================
// FIELD — record leak inspection result
// ============================================================================

export async function recordLeakInspection(payload: {
  reportId: string
  jobOrderId?: string | null
  leakConfirmed: boolean
  findings?: string | null
  photoPaths?: { file_name: string; file_path: string; mime_type?: string }[]
}): Promise<ActionResult> {
  const supabase = await createClient()
  try {
    const {
      data: { user: actor },
    } = await supabase.auth.getUser()
    if (!actor) return { status: 'error', message: 'Unauthorised' }

    const { data: report } = await supabase
      .from('service_reports')
      .select(`
        report_id, reference_no, meter_account_id, reported_by_consumer_id,
        issue_type:issue_type_id ( issue_name )
      `)
      .eq('report_id', payload.reportId)
      .single()

    if (!report) return { status: 'error', message: 'Report not found' }
    if (getFirst(report.issue_type)?.issue_name !== 'Leak After Meter') {
      return { status: 'error', message: 'Inspection results only apply to Leak After Meter' }
    }

    const nowIso = new Date().toISOString()
    const { data: inspection, error } = await supabase
      .from('report_leak_inspections')
      .upsert(
        {
          report_id: payload.reportId,
          job_order_id: payload.jobOrderId ?? null,
          leak_confirmed: payload.leakConfirmed,
          findings: payload.findings ?? null,
          inspected_by: actor.id,
          inspected_at: nowIso,
        },
        { onConflict: 'report_id' },
      )
      .select('leak_inspection_id')
      .single()

    if (error) {
      console.error('[recordLeakInspection]', error)
      return { status: 'error', message: error.message }
    }

    if (payload.photoPaths?.length && inspection?.leak_inspection_id) {
      await supabase.from('report_attachments').insert(
        payload.photoPaths.map((p) => ({
          report_id: payload.reportId,
          leak_inspection_id: inspection.leak_inspection_id,
          file_name: p.file_name,
          file_path: p.file_path,
          mime_type: p.mime_type ?? null,
          attachment_kind: 'INSPECTION',
          uploaded_by: actor.id,
        })),
      )
    }

    await logServiceReportEvent(supabase, {
      reportId: payload.reportId,
      eventType: 'FIELD_COMPLETED',
      body: payload.leakConfirmed ? 'Leak confirmed' : 'Leak not confirmed',
      actorUserId: actor.id,
    })

    if (payload.leakConfirmed) {
      const clerkIds = await getUserIdsByRole(['clerk'])
      if (clerkIds.length) {
        await createNotifications(
          clerkIds.map((id) => ({ userId: id })),
          'LEAK_CONFIRMED_BILL_ADJUST',
          {
            reference_no: report.reference_no,
            report_id: payload.reportId,
            issue_name: 'Leak After Meter',
          },
          report.meter_account_id,
          payload.reportId,
        )
      }
    }

    await createAuditLog(
      actor.id,
      'CREATE',
      `Leak inspection: ${payload.leakConfirmed ? 'confirmed' : 'not confirmed'}`,
      'report_leak_inspections',
      inspection?.leak_inspection_id,
    )

    return { status: 'success', message: 'Inspection result recorded' }
  } catch (err) {
    console.error('[recordLeakInspection]', err)
    return { status: 'error', message: 'Failed to record inspection' }
  }
}

// ============================================================================
// CLERK — list leak reports ready for bill adjustment
// ============================================================================

export async function getLeakReportsForBillAdjustment(): Promise<{
  status: 'success' | 'error'
  data?: {
    report_id: string
    reference_no: string | null
    consumer_name: string | null
    contract_no: string | null
    zone_name: string | null
    barangay_name: string | null
    inspected_at: string | null
    findings: string | null
    has_adjustment: boolean
    billed_on_average: boolean
  }[]
  message?: string
}> {
  const supabase = await createClient()
  try {
    const { data, error } = await supabase
      .from('report_leak_inspections')
      .select(`
        leak_confirmed, findings, inspected_at,
        report:report_id (
          report_id, reference_no, meter_account_id, resolved_at,
          meter_account:meter_account_id (
            consumer:consumer_id ( account_name, contract_no ),
            zone:zone_id (
              zone_name,
              barangay:barangay_id ( barangay_name )
            )
          )
        )
      `)
      .eq('leak_confirmed', true)
      .order('inspected_at', { ascending: false })

    if (error) throw error

    const rows = []
    for (const row of data ?? []) {
      const report = getFirst(row.report)
      if (!report) continue
      const ma = getFirst(report.meter_account)
      const consumer = getFirst(ma?.consumer)
      const zone = getFirst(ma?.zone)
      const barangay = getFirst(zone?.barangay)

      const { count } = await supabase
        .from('report_billing_adjustments')
        .select('billing_adjustment_id', { count: 'exact', head: true })
        .eq('report_id', report.report_id)

      // Warn if any recent consumption on this account used AVERAGE basis
      let billedOnAverage = false
      if (report.meter_account_id) {
        const { data: avg } = await supabase
          .from('water_consumptions')
          .select('consumption_id, billing_basis:billing_basis_id ( basis_code )')
          .eq('meter_account_id', report.meter_account_id)
          .order('created_at', { ascending: false })
          .limit(3)
        billedOnAverage = (avg ?? []).some((c) => {
          const basis = getFirst(c.billing_basis)?.basis_code
          return basis === 'AVERAGE'
        })
      }

      rows.push({
        report_id: report.report_id,
        reference_no: report.reference_no,
        consumer_name: consumer?.account_name ?? null,
        contract_no: consumer?.contract_no ?? null,
        zone_name: zone?.zone_name ?? null,
        barangay_name: barangay?.barangay_name ?? null,
        inspected_at: row.inspected_at,
        findings: row.findings,
        has_adjustment: (count ?? 0) > 0,
        billed_on_average: billedOnAverage,
      })
    }

    return { status: 'success', data: rows }
  } catch (err) {
    console.error('[getLeakReportsForBillAdjustment]', err)
    return { status: 'error', message: 'Failed to load leak reports' }
  }
}

// ============================================================================
// CLERK — latest bill + consumption for leak adjustment (no picker)
// ============================================================================

function roundTwo(n: number): number {
  return parseFloat(n.toFixed(2))
}

type ChargeTier = {
  community_charge_id: string
  min_consumption: number | string
  max_consumption: number | string | null
  multiplier: number | string
}

function computeBreakdownBlocks(
  consumption: number,
  tiers: ChargeTier[],
): {
  community_charge_id: string
  block_order: number
  units_used: number
  rate_per_unit: number
  subtotal: number
}[] {
  const sorted = [...tiers].sort(
    (a, b) => Number(a.min_consumption) - Number(b.min_consumption),
  )
  const blocks: {
    community_charge_id: string
    block_order: number
    units_used: number
    rate_per_unit: number
    subtotal: number
  }[] = []
  let remaining = consumption

  for (let i = 0; i < sorted.length; i++) {
    if (remaining <= 0) break
    const tier = sorted[i]
    const min = Number(tier.min_consumption)
    const max = tier.max_consumption != null ? Number(tier.max_consumption) : null
    const blockSize = max != null ? max - min + 1 : Infinity
    const units = Math.min(remaining, blockSize)
    if (units <= 0) continue
    const rate = Number(tier.multiplier)
    blocks.push({
      community_charge_id: tier.community_charge_id,
      block_order: i + 1,
      units_used: units,
      rate_per_unit: rate,
      subtotal: roundTwo(units * rate),
    })
    remaining -= units
  }
  return blocks
}

async function resolveBillingStatusId(
  supabase: any,
  remainingBalance: number,
  alreadyPaid: number,
): Promise<string | undefined> {
  const { data: statusRows } = await supabase
    .from('billing_status')
    .select('billing_status_id, billing_status_name')
  const map = new Map(
    (statusRows ?? []).map((s: any) => [
      s.billing_status_name as string,
      s.billing_status_id as string,
    ]),
  )
  if (remainingBalance <= 0) return map.get('paid') as string | undefined
  if (alreadyPaid > 0) return map.get('partial') as string | undefined
  return map.get('unpaid') as string | undefined
}

export type LeakBillAdjustmentContext = {
  report_id: string
  billing_id: string
  consumption_id: string
  classification_id: string
  period_label: string
  previous_reading: number
  present_reading: number
  /** Actual metered usage (includes leak). Shown as default billed input. */
  actual_consumption: number
  /** Current billed_consumption on the row (may already differ). */
  current_billed_consumption: number
  previous_balance: number
  penalty_amount: number
  meter_charge: number
  current_billing: number
  total_billing: number
  remaining_balance: number
  already_paid: number
}

async function loadLatestLeakBillingTarget(
  supabase: any,
  reportId: string,
): Promise<
  | { status: 'success'; data: LeakBillAdjustmentContext; inspectionId: string; report: any }
  | { status: 'error'; message: string }
> {
  const { data: report } = await supabase
    .from('service_reports')
    .select(`
      report_id, reference_no, meter_account_id, reported_by_consumer_id,
      issue_type:issue_type_id ( issue_name ),
      meter_account:meter_account_id ( classification_id )
    `)
    .eq('report_id', reportId)
    .single()

  if (!report || getFirst(report.issue_type)?.issue_name !== 'Leak After Meter') {
    return { status: 'error', message: 'Only Leak After Meter reports can be adjusted here' }
  }
  if (!report.meter_account_id) {
    return { status: 'error', message: 'Report has no meter account' }
  }

  const { data: inspection } = await supabase
    .from('report_leak_inspections')
    .select('leak_inspection_id, leak_confirmed')
    .eq('report_id', reportId)
    .maybeSingle()

  if (!inspection?.leak_confirmed) {
    return { status: 'error', message: 'Leak must be confirmed before adjusting the bill' }
  }

  const { count: adjCount } = await supabase
    .from('report_billing_adjustments')
    .select('billing_adjustment_id', { count: 'exact', head: true })
    .eq('report_id', reportId)
  if ((adjCount ?? 0) > 0) {
    return { status: 'error', message: 'This report already has a bill adjustment' }
  }

  // Latest billed period only (no picker) — order by period end, then created_at
  const { data: billingRows, error: billingErr } = await supabase
    .from('billing')
    .select(`
      billing_id, consumption_id, current_billing, previous_balance,
      penalty_amount, total_billing, remaining_balance, created_at,
      reading_periods:reading_period_id ( period_start, period_end ),
      water_consumptions:consumption_id (
        consumption_id, consumption, billed_consumption,
        previous_reading, present_reading
      )
    `)
    .eq('meter_account_id', report.meter_account_id)
    .order('created_at', { ascending: false })
    .limit(12)

  if (billingErr) {
    console.error('[loadLatestLeakBillingTarget]', billingErr)
    return { status: 'error', message: 'Failed to load latest billing' }
  }

  const billing = (billingRows ?? [])
    .slice()
    .sort((a: any, b: any) => {
      const ae = getFirst(a.reading_periods)?.period_end
        ? new Date(getFirst(a.reading_periods).period_end).getTime()
        : 0
      const be = getFirst(b.reading_periods)?.period_end
        ? new Date(getFirst(b.reading_periods).period_end).getTime()
        : 0
      if (be !== ae) return be - ae
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })[0]

  if (!billing) {
    return { status: 'error', message: 'No billing record found for this meter account' }
  }

  const wc = getFirst(billing.water_consumptions)
  if (!wc) {
    return { status: 'error', message: 'No water consumption linked to the latest bill' }
  }

  const classificationId = getFirst(report.meter_account)?.classification_id
  if (!classificationId) {
    return { status: 'error', message: 'Meter account classification is missing' }
  }

  const { data: meterChargeRows } = await supabase
    .from('meter_installment_charges')
    .select('amount')
    .eq('billing_id', billing.billing_id)
  const meterCharge = roundTwo(
    (meterChargeRows ?? []).reduce((s: number, c: any) => s + Number(c.amount), 0),
  )

  const period = getFirst(billing.reading_periods)
  const periodLabel = period?.period_start
    ? new Date(period.period_start).toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric',
      })
    : 'Latest period'

  const total = Number(billing.total_billing) || 0
  const remaining = Number(billing.remaining_balance) || 0
  const alreadyPaid = roundTwo(Math.max(0, total - remaining))
  const actual = Number(wc.consumption) || 0

  return {
    status: 'success',
    inspectionId: inspection.leak_inspection_id,
    report,
    data: {
      report_id: reportId,
      billing_id: billing.billing_id,
      consumption_id: wc.consumption_id,
      classification_id: classificationId,
      period_label: periodLabel,
      previous_reading: Number(wc.previous_reading) || 0,
      present_reading: Number(wc.present_reading) || 0,
      actual_consumption: actual,
      current_billed_consumption: Number(wc.billed_consumption) || actual,
      previous_balance: Number(billing.previous_balance) || 0,
      penalty_amount: Number(billing.penalty_amount) || 0,
      meter_charge: meterCharge,
      current_billing: Number(billing.current_billing) || 0,
      total_billing: total,
      remaining_balance: remaining,
      already_paid: alreadyPaid,
    },
  }
}

async function recalculateFromBilledConsumption(
  supabase: any,
  ctx: LeakBillAdjustmentContext,
  billedConsumption: number,
): Promise<
  | {
      status: 'success'
      current_billing: number
      total_billing: number
      remaining_balance: number
      billed_consumption: number
      blocks: ReturnType<typeof computeBreakdownBlocks>
      billing_status_id?: string
    }
  | { status: 'error'; message: string }
> {
  if (!Number.isFinite(billedConsumption) || billedConsumption < 0) {
    return { status: 'error', message: 'Billed consumption must be 0 or greater' }
  }

  const { data: tiers, error: tiersErr } = await supabase
    .from('community_charges')
    .select('community_charge_id, min_consumption, max_consumption, multiplier')
    .eq('classification_id', ctx.classification_id)
    .order('min_consumption', { ascending: true })

  if (tiersErr || !tiers?.length) {
    return { status: 'error', message: 'No charge tiers found for this classification' }
  }

  const blocks = computeBreakdownBlocks(billedConsumption, tiers)
  const billedFromBlocks = blocks.reduce((s, b) => s + b.units_used, 0)
  const currentBilling = roundTwo(blocks.reduce((s, b) => s + b.subtotal, 0))
  const totalBilling = roundTwo(
    currentBilling + ctx.previous_balance + ctx.penalty_amount + ctx.meter_charge,
  )
  const remainingBalance = roundTwo(Math.max(0, totalBilling - ctx.already_paid))
  const billingStatusId = await resolveBillingStatusId(
    supabase,
    remainingBalance,
    ctx.already_paid,
  )

  return {
    status: 'success',
    current_billing: currentBilling,
    total_billing: totalBilling,
    remaining_balance: remainingBalance,
    billed_consumption: billedFromBlocks,
    blocks,
    billing_status_id: billingStatusId,
  }
}

export async function getLeakBillAdjustmentContext(
  reportId: string,
): Promise<{ status: 'success' | 'error'; data?: LeakBillAdjustmentContext; message?: string }> {
  const supabase = await createClient()
  try {
    const loaded = await loadLatestLeakBillingTarget(supabase, reportId)
    if (loaded.status === 'error') return loaded
    return { status: 'success', data: loaded.data }
  } catch (err) {
    console.error('[getLeakBillAdjustmentContext]', err)
    return { status: 'error', message: 'Failed to load billing context' }
  }
}

export async function previewLeakBillAdjustment(payload: {
  reportId: string
  billedConsumption: number
}): Promise<{
  status: 'success' | 'error'
  data?: {
    billed_consumption: number
    current_billing: number
    total_billing: number
    remaining_balance: number
  }
  message?: string
}> {
  const supabase = await createClient()
  try {
    const loaded = await loadLatestLeakBillingTarget(supabase, payload.reportId)
    if (loaded.status === 'error') return loaded
    const calc = await recalculateFromBilledConsumption(
      supabase,
      loaded.data,
      payload.billedConsumption,
    )
    if (calc.status === 'error') return calc
    return {
      status: 'success',
      data: {
        billed_consumption: calc.billed_consumption,
        current_billing: calc.current_billing,
        total_billing: calc.total_billing,
        remaining_balance: calc.remaining_balance,
      },
    }
  } catch (err) {
    console.error('[previewLeakBillAdjustment]', err)
    return { status: 'error', message: 'Failed to preview bill' }
  }
}

export async function encodeLeakBillAdjustment(payload: {
  reportId: string
  billedConsumption: number
  reason?: string
  photoPaths?: { file_name: string; file_path: string; mime_type?: string }[]
}): Promise<ActionResult> {
  const supabase = await createClient()
  try {
    const {
      data: { user: actor },
    } = await supabase.auth.getUser()
    if (!actor) return { status: 'error', message: 'Unauthorised' }

    const loaded = await loadLatestLeakBillingTarget(supabase, payload.reportId)
    if (loaded.status === 'error') return loaded

    const calc = await recalculateFromBilledConsumption(
      supabase,
      loaded.data,
      payload.billedConsumption,
    )
    if (calc.status === 'error') return calc

    const ctx = loaded.data
    const original = ctx.total_billing
    const nowIso = new Date().toISOString()
    const reason = payload.reason?.trim() || 'Leak bill adjustment'

    // Tag LEAK_ADJUSTED so billed_consumption may differ from actual consumption
    const { data: leakBasis } = await supabase
      .from('billing_basis')
      .select('billing_basis_id')
      .eq('basis_code', 'LEAK_ADJUSTED')
      .maybeSingle()

    const wcUpdate: Record<string, any> = {
      billed_consumption: calc.billed_consumption,
    }
    if (leakBasis?.billing_basis_id) {
      wcUpdate.billing_basis_id = leakBasis.billing_basis_id
    }

    const { error: wcErr } = await supabase
      .from('water_consumptions')
      .update(wcUpdate)
      .eq('consumption_id', ctx.consumption_id)
    if (wcErr) {
      console.error('[encodeLeakBillAdjustment] consumption', wcErr)
      return { status: 'error', message: wcErr.message }
    }

    await supabase
      .from('billing_community_breakdowns')
      .delete()
      .eq('consumption_id', ctx.consumption_id)

    if (calc.blocks.length) {
      const { error: bdErr } = await supabase.from('billing_community_breakdowns').insert(
        calc.blocks.map((b) => ({
          consumption_id: ctx.consumption_id,
          community_charge_id: b.community_charge_id,
          block_order: b.block_order,
          units_used: b.units_used,
          rate_per_unit: b.rate_per_unit,
          subtotal: b.subtotal,
        })),
      )
      if (bdErr) {
        console.error('[encodeLeakBillAdjustment] breakdowns', bdErr)
        return { status: 'error', message: bdErr.message }
      }
    }

    const billingUpdate: Record<string, any> = {
      current_billing: calc.current_billing,
      total_billing: calc.total_billing,
      remaining_balance: calc.remaining_balance,
      updated_at: nowIso,
    }
    if (calc.billing_status_id) billingUpdate.billing_status_id = calc.billing_status_id

    const { error: billErr } = await supabase
      .from('billing')
      .update(billingUpdate)
      .eq('billing_id', ctx.billing_id)

    if (billErr) {
      console.error('[encodeLeakBillAdjustment] billing', billErr)
      return { status: 'error', message: billErr.message }
    }

    const { data: adj, error: adjErr } = await supabase
      .from('report_billing_adjustments')
      .insert({
        report_id: payload.reportId,
        billing_id: ctx.billing_id,
        leak_inspection_id: loaded.inspectionId,
        original_amount: original,
        adjusted_amount: calc.total_billing,
        reason,
        encoded_by: actor.id,
        encoded_at: nowIso,
      })
      .select('billing_adjustment_id')
      .single()

    if (adjErr) {
      console.error('[encodeLeakBillAdjustment] insert', adjErr)
      return { status: 'error', message: adjErr.message }
    }

    if (payload.photoPaths?.length && adj?.billing_adjustment_id) {
      await supabase.from('report_attachments').insert(
        payload.photoPaths.map((p) => ({
          report_id: payload.reportId,
          billing_adjustment_id: adj.billing_adjustment_id,
          file_name: p.file_name,
          file_path: p.file_path,
          mime_type: p.mime_type ?? null,
          attachment_kind: 'BILL_ADJUSTMENT',
          uploaded_by: actor.id,
        })),
      )
    }

    await logServiceReportEvent(supabase, {
      reportId: payload.reportId,
      eventType: 'BILL_ADJUSTED',
      body: `Billed ${calc.billed_consumption} m³ (actual ${ctx.actual_consumption} m³). ₱${original.toFixed(2)} → ₱${calc.total_billing.toFixed(2)}`,
      actorUserId: actor.id,
    })

    if (loaded.report.reported_by_consumer_id) {
      await createNotification(
        { consumerId: loaded.report.reported_by_consumer_id },
        'SERVICE_REPORT_BILL_ADJUSTED',
        {
          reference_no: loaded.report.reference_no,
          report_id: payload.reportId,
          original_amount: original,
          adjusted_amount: calc.total_billing,
        },
        loaded.report.meter_account_id,
        payload.reportId,
      )
    }

    await createAuditLog(
      actor.id,
      'CREATE',
      `Leak bill adjustment ${original} → ${calc.total_billing} (billed ${calc.billed_consumption} m³)`,
      'report_billing_adjustments',
      adj?.billing_adjustment_id,
    )

    return { status: 'success', message: 'Bill recalculated from billed consumption' }
  } catch (err) {
    console.error('[encodeLeakBillAdjustment]', err)
    return { status: 'error', message: 'Failed to encode bill adjustment' }
  }
}
