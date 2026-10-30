'use server'

import { createClient } from '@/lib/supabase/server'
import { sendJobAssignmentEmails } from '@/lib/email/job-assignment-email'
import { createNotifications } from '../notifications/notifications'

// ============================================================================
// Types
// ============================================================================

export interface AssignableBarangay {
  barangay_id: string
  barangay_name: string
}

export interface AssignableJobOrder {
  job_order_id: string
  job_order_no: string | null
  job_type_name: string
  process_type: 'Installation' | 'Reconnection' | 'Disconnection' | 'Service Report' | 'Other'
  meter_serial_no: string | null
  consumer_name: string | null
  zone_name: string | null
  issue_name: string | null
  job_status_name: string
}

export interface FieldWorker {
  user_id: string
  full_name: string
  role_name: string
}

export interface CreateJobAssignmentPayload {
  barangay_id: string
  job_order_ids: string[]
  assigned_to: string
  scheduled_at: string
  helper_ids?: string[]
}

export interface ActionResult<T = null> {
  status: 'success' | 'error'
  data?: T
  message?: string
}

// ============================================================================
// Helpers

function latestMeterSerialFromMeters(meters: unknown): string | null {
  const list = Array.isArray(meters) ? meters : meters ? [meters] : []
  if (!list.length) return null
  let best: any = list[0]
  for (const m of list) {
    const bt = best?.created_at ? new Date(best.created_at).getTime() : 0
    const mt = m?.created_at ? new Date(m.created_at).getTime() : 0
    if (mt >= bt) best = m
  }
  return best?.meter_serial_no ?? null
}
// ============================================================================

const getFirst = (val: unknown): any => (Array.isArray(val) ? val[0] ?? null : val ?? null)

function fullName(u: any): string {
  if (!u) return '—'
  return [u.first_name, u.last_name].filter(Boolean).join(' ') || '—'
}

export interface JobTypeOption {
  job_type_id: string
  job_type_name: string
  job_type_code: string
}

export async function getJobTypes(): Promise<JobTypeOption[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('job_types')
    .select('job_type_id, job_type_name, job_type_code')
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[getJobTypes]', error)
    throw new Error('Failed to fetch job types')
  }
  return data ?? []
}

// ============================================================================
// GET — barangays that currently have at least one assignable (Pending)
// job order. Keeps the barangay picker from listing places with nothing to
// assign.
// ============================================================================

export async function getAssignableBarangays(): Promise<AssignableBarangay[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('job_orders')
    .select(`
      barangay_id,
      barangay:barangay_id ( barangay_id, barangay_name ),
      job_order_status:job_status_id ( job_status_name ),
      reconnection_id,
      reconnections:reconnection_id (
        payment_status:payment_status_id ( billing_status_name )
      )
    `)

  if (error) {
    console.error('[getAssignableBarangays]', error)
    throw new Error('Failed to fetch barangays with assignable job orders')
  }

  const DISPATCHABLE_PAYMENT_STATUSES = ['paid', 'partial']

  const seen = new Map<string, AssignableBarangay>()
  for (const row of data ?? []) {
    const status = getFirst((row as any).job_order_status)
    if (status?.job_status_name !== 'Pending') continue

    // Reconnection job orders only count toward "assignable" once payment
    // is at least partial — an unpaid/forwarded one shouldn't make a
    // barangay show up as having work to dispatch.
    if ((row as any).reconnection_id) {
      const paymentStatus = getFirst(getFirst((row as any).reconnections)?.payment_status)?.billing_status_name
      if (!DISPATCHABLE_PAYMENT_STATUSES.includes(paymentStatus)) continue
    }

    const barangay = getFirst((row as any).barangay)
    if (!barangay || seen.has(barangay.barangay_id)) continue

    seen.set(barangay.barangay_id, {
      barangay_id: barangay.barangay_id,
      barangay_name: barangay.barangay_name,
    })
  }

  return Array.from(seen.values()).sort((a, b) => a.barangay_name.localeCompare(b.barangay_name))
}

// ============================================================================
// GET — job orders in a barangay that are still assignable
// (Pending status only — Assigned/Completed/Cancelled are excluded because
// they either already have an open assignment or are finished.)
// ============================================================================

export async function getAssignableJobOrders(barangayId: string): Promise<AssignableJobOrder[]> {
  const supabase = await createClient()

  if (!barangayId) return []

  const { data, error } = await supabase
    .from('job_orders')
    .select(`
      job_order_id,
      job_order_no,
      installation_id,
      reconnection_id,
      disconnection_id,
      service_report_id,
      job_type:job_type_id ( job_type_name ),
      job_order_status:job_status_id ( job_status_name ),
      reconnections:reconnection_id (
        payment_status:payment_status_id ( billing_status_name )
      ),
      meter_accounts:meter_account_id (
        consumers:consumer_id ( account_name, contract_no ),
        meters:meters ( meter_serial_no, created_at )
      ),
      service_reports:service_report_id (
        zone:zone_id ( zone_name ),
        issue_type:issue_type_id ( issue_name )
      )
    `)
    .eq('barangay_id', barangayId)
    .order('request_date', { ascending: true })

  if (error) {
    console.error('[getAssignableJobOrders]', error)
    throw new Error('Failed to fetch job orders for this barangay')
  }

  const DISPATCHABLE_PAYMENT_STATUSES = ['paid', 'partial']

  const deriveProcessType = (jo: any): AssignableJobOrder['process_type'] => {
    if (jo.installation_id) return 'Installation'
    if (jo.reconnection_id) return 'Reconnection'
    if (jo.disconnection_id) return 'Disconnection'
    if (jo.service_report_id) return 'Service Report'
    return 'Other'
  }

  return (data ?? [])
    .filter((row: any) => getFirst(row.job_order_status)?.job_status_name === 'Pending')
    .filter((row: any) => {
      if (!row.reconnection_id) return true
      const paymentStatus = getFirst(getFirst(row.reconnections)?.payment_status)?.billing_status_name
      return DISPATCHABLE_PAYMENT_STATUSES.includes(paymentStatus)
    })
    .map((row: any) => {
      const jobType = getFirst(row.job_type)
      const status = getFirst(row.job_order_status)
      const meterAccount = getFirst(row.meter_accounts)
      const consumer = getFirst(meterAccount?.consumers)
      const process_type = deriveProcessType(row)

      const serviceReport = getFirst(row.service_reports)
      const srZone = getFirst(serviceReport?.zone)
      const srIssueType = getFirst(serviceReport?.issue_type)

      const rawSerial = latestMeterSerialFromMeters(meterAccount?.meters)
      const meter_serial_no =
        rawSerial && !String(rawSerial).startsWith('PENDING-') ? rawSerial : null

      return {
        job_order_id: row.job_order_id,
        job_order_no: row.job_order_no,
        job_type_name: jobType?.job_type_name ?? '—',
        process_type,
        meter_serial_no,
        consumer_name: consumer?.account_name ?? null,
        zone_name: srZone?.zone_name ?? null,
        issue_name: process_type === 'Service Report' ? (srIssueType?.issue_name ?? null) : null,
        job_status_name: status?.job_status_name ?? '—',
      }
    })
}

// ============================================================================
// GET — active field workers to assign jobs (or helpers) to
// ============================================================================

export async function getFieldWorkers(): Promise<FieldWorker[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('users')
    .select('user_id, first_name, last_name, is_active, role:role_id!inner ( role_name )')
    .eq('is_active', true)
    .in('role.role_name', ['meter-reader', 'plumber'])
    .order('first_name', { ascending: true })

  if (error) {
    console.error('[getFieldWorkers]', error)
    throw new Error('Failed to fetch field workers')
  }

  return (data ?? []).map((row: any) => ({
    user_id: row.user_id,
    full_name: fullName(row),
    role_name: getFirst(row.role)?.role_name ?? '—',
  }))
}

// ============================================================================
// CREATE — validation helpers
// Each one is scoped to a single concern and returns an error message
// string on failure, or null/the cleaned data on success — so
// createJobAssignment can just call them in order and bail on the first
// non-null error.
// ============================================================================

function validatePayloadShape(payload: CreateJobAssignmentPayload): string | null {
  if (!payload.barangay_id) {
    return 'Barangay is required'
  }
  if (!payload.assigned_to) {
    return 'Please select a field worker to assign'
  }
  if (!payload.job_order_ids || payload.job_order_ids.length === 0) {
    return 'Select at least one job order to assign'
  }
  if (!payload.scheduled_at) {
    return 'Please pick a schedule date'
  }
  return null
}

// Re-fetch the selected job orders server-side — never trust the client's
// barangay/status filtering as the source of truth.
async function fetchSelectedJobOrders(
  supabase: any,
  jobOrderIds: string[],
): Promise<{ jobOrders: any[] | null; error: string | null }> {
  const { data, error } = await supabase
    .from('job_orders')
    .select(`
      job_order_id,
      barangay_id,
      job_status_id,
      installation_id,
      reconnection_id,
      job_order_status:job_status_id ( job_status_name ),
      reconnections:reconnection_id (
        payment_status:payment_status_id ( billing_status_name )
      )
    `)
    .in('job_order_id', jobOrderIds)

  if (error) {
    console.error('[createJobAssignment] job order lookup:', error)
    return { jobOrders: null, error: 'Failed to verify selected job orders' }
  }
  if (!data || data.length !== jobOrderIds.length) {
    return { jobOrders: null, error: 'One or more selected job orders could not be found' }
  }
  return { jobOrders: data, error: null }
}

function validateReconnectionsPaymentReady(jobOrders: any[]): string | null {
  const DISPATCHABLE_PAYMENT_STATUSES = ['paid', 'partial']

  const blocked = jobOrders.find((jo) => {
    if (!jo.reconnection_id) return false
    const paymentStatus = getFirst(getFirst(jo.reconnections)?.payment_status)?.billing_status_name
    return !DISPATCHABLE_PAYMENT_STATUSES.includes(paymentStatus)
  })

  return blocked
    ? 'One or more selected reconnections must be paid or partially paid before they can be dispatched'
    : null
}

// Every job order must belong to the SAME barangay as the payload.
function validateSameBarangay(jobOrders: any[], barangayId: string): string | null {
  const barangayIds = new Set(jobOrders.map((jo) => jo.barangay_id))
  if (barangayIds.size > 1 || !barangayIds.has(barangayId)) {
    return 'All selected job orders must belong to the same barangay'
  }
  return null
}

// None can be Completed or Cancelled already.
function validateJobOrdersNotFinalized(jobOrders: any[]): string | null {
  const invalidStatus = jobOrders.find((jo) => {
    const s = getFirst(jo.job_order_status)?.job_status_name
    return s === 'Completed' || s === 'Cancelled'
  })
  return invalidStatus
    ? 'One or more selected job orders are already Completed or Cancelled and cannot be assigned'
    : null
}

// None may already have an OPEN (SCHEDULED/ONPROGRESS) assignment — enforced
// here since the DB can't express it as a partial index without hardcoding
// status UUIDs (see schema note on job_assignment_orders).
async function validateNoOpenAssignments(supabase: any, jobOrderIds: string[]): Promise<string | null> {
  const { data: openAssignments, error } = await supabase
    .from('job_assignment_orders')
    .select('job_order_id, status:status_id ( status_code )')
    .in('job_order_id', jobOrderIds)

  if (error) {
    console.error('[createJobAssignment] open-assignment lookup:', error)
    return 'Failed to verify existing assignments'
  }

  const alreadyAssigned = (openAssignments ?? []).find((row: any) => {
    const code = getFirst(row.status)?.status_code
    return code === 'SCHEDULED' || code === 'ONPROGRESS'
  })
  return alreadyAssigned ? 'One or more selected job orders already have an active assignment' : null
}

// The assigned worker must exist and be active.
async function validateAssignedWorker(supabase: any, userId: string): Promise<string | null> {
  const { data: worker, error } = await supabase
    .from('users')
    .select('user_id, is_active')
    .eq('user_id', userId)
    .single()

  if (error || !worker) return 'Selected field worker not found'
  if (!worker.is_active) return 'Selected field worker is not active'
  return null
}

// Helpers (if any) must also be real, active users, and can't include the
// same person as assigned_to. Returns the deduped/cleaned id list alongside
// any error, so the caller can use it regardless of which branch ran.
async function validateHelpers(
  supabase: any,
  helperIds: string[] | undefined,
  assignedTo: string,
): Promise<{ helperIds: string[]; error: string | null }> {
  const cleaned = Array.from(new Set(helperIds ?? [])).filter((id) => id !== assignedTo)
  if (cleaned.length === 0) return { helperIds: cleaned, error: null }

  const { data: helperUsers, error } = await supabase
    .from('users')
    .select('user_id, is_active')
    .in('user_id', cleaned)

  if (error || !helperUsers || helperUsers.length !== cleaned.length) {
    return { helperIds: cleaned, error: 'One or more selected helpers could not be found' }
  }
  if (helperUsers.some((h: any) => !h.is_active)) {
    return { helperIds: cleaned, error: 'One or more selected helpers are not active' }
  }
  return { helperIds: cleaned, error: null }
}

// Job orders created for a meter installation carry an installation_id —
// pull those out so we know which installations need to move to Scheduled.
function getLinkedInstallationIds(jobOrders: any[]): string[] {
  return Array.from(
    new Set(jobOrders.map((jo) => jo.installation_id).filter((id): id is string => Boolean(id))),
  )
}

// Only needed when at least one selected job order is installation-linked,
// so the caller should skip this (and the update below) when the id list is empty.
async function getScheduledInstallationStatusId(supabase: any): Promise<{ statusId: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from('installation_status')
    .select('installation_status_id')
    .eq('status_name', 'Scheduled')
    .single()

  if (error || !data) {
    return { statusId: null, error: 'Installation status "Scheduled" is not configured' }
  }
  return { statusId: data.installation_status_id, error: null }
}

// Flips every linked installation to Scheduled. Mirrors the job-order status
// update: non-fatal to the caller if it fails, since the core assignment has
// already been created by the time this runs.
async function updateInstallationsToScheduled(
  supabase: any,
  installationIds: string[],
  scheduledInstallationStatusId: string,
): Promise<string | null> {
  const { error } = await supabase
    .from('installations')
    .update({ installation_status_id: scheduledInstallationStatusId, updated_at: new Date().toISOString() })
    .in('installation_id', installationIds)

  if (error) {
    console.error('[createJobAssignment] installation status update:', error)
    return 'Assignment created but linked installation statuses failed to update'
  }
  return null
}

// Looks up the SCHEDULED assignment status + the "Assigned" job order status
// needed to write the new rows.
async function getRequiredStatuses(
  supabase: any,
): Promise<{ scheduledStatusId: string; assignedJoStatusId: string; error: null } | { scheduledStatusId: null; assignedJoStatusId: null; error: string }> {
  const [{ data: scheduledStatus, error: schedStatusError }, { data: assignedJoStatus, error: assignedJoError }] =
    await Promise.all([
      supabase.from('assignment_status').select('assignment_status_id').eq('status_code', 'SCHEDULED').single(),
      supabase.from('job_order_status').select('job_status_id').eq('job_status_name', 'Assigned').single(),
    ])

  if (schedStatusError || !scheduledStatus) {
    return { scheduledStatusId: null, assignedJoStatusId: null, error: 'Assignment status "SCHEDULED" is not configured' }
  }
  if (assignedJoError || !assignedJoStatus) {
    return { scheduledStatusId: null, assignedJoStatusId: null, error: 'Job order status "Assigned" is not configured' }
  }

  return {
    scheduledStatusId: scheduledStatus.assignment_status_id,
    assignedJoStatusId: assignedJoStatus.job_status_id,
    error: null,
  }
}

// Date-only schedule: we now compare against the START OF TODAY, not
// `Date.now()`. With a date-only value like "2026-09-14T00:00:00+08:00",
// picking today would otherwise be rejected (Manila midnight is already
// in the past by the time the form submits). Comparing against the start
// of today allows today and any future date, while still rejecting
// genuinely past dates.
function validateScheduleNotPast(scheduledAt: string): string | null {
  const scheduledDate = new Date(scheduledAt)
  if (Number.isNaN(scheduledDate.getTime())) return 'Invalid schedule date'

  const toManilaYMD = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(d) // "YYYY-MM-DD"

  if (toManilaYMD(scheduledDate) < toManilaYMD(new Date())) {
    return 'Scheduled date cannot be in the past'
  }
  return null
}

// ============================================================================
// CREATE — bulk-assign a batch of job orders (same barangay) to one worker,
// with optional helpers riding along on the same trip
// ============================================================================

export async function createJobAssignment(
  payload: CreateJobAssignmentPayload,
): Promise<ActionResult<{ job_assignment_id: string }>> {
  const supabase = await createClient()

  try {
    const { data: { user: actor } } = await supabase.auth.getUser()
    if (!actor) return { status: 'error', message: 'Unauthorised' }

    // ── Run every validation, small function at a time, bailing on the
    // first failure ──
    const shapeError = validatePayloadShape(payload)
    if (shapeError) return { status: 'error', message: shapeError }

    const scheduleError = validateScheduleNotPast(payload.scheduled_at)
    if (scheduleError) return { status: 'error', message: scheduleError }  

    const uniqueJobOrderIds = Array.from(new Set(payload.job_order_ids))

    const { jobOrders, error: jobOrdersError } = await fetchSelectedJobOrders(supabase, uniqueJobOrderIds)
    if (jobOrdersError || !jobOrders) return { status: 'error', message: jobOrdersError! }

    const barangayError = validateSameBarangay(jobOrders, payload.barangay_id)
    if (barangayError) return { status: 'error', message: barangayError }

    const finalizedError = validateJobOrdersNotFinalized(jobOrders)
    if (finalizedError) return { status: 'error', message: finalizedError }

    const paymentError = validateReconnectionsPaymentReady(jobOrders)
    if (paymentError) return { status: 'error', message: paymentError }

    const openAssignmentError = await validateNoOpenAssignments(supabase, uniqueJobOrderIds)
    if (openAssignmentError) return { status: 'error', message: openAssignmentError }

    const workerError = await validateAssignedWorker(supabase, payload.assigned_to)
    if (workerError) return { status: 'error', message: workerError }

    const { helperIds, error: helperError } = await validateHelpers(supabase, payload.helper_ids, payload.assigned_to)
    if (helperError) return { status: 'error', message: helperError }

    const busyError = await validateWorkersNotBusy(supabase, payload.assigned_to, helperIds)
    if (busyError) return { status: 'error', message: busyError }

    const { scheduledStatusId, assignedJoStatusId, error: statusError } = await getRequiredStatuses(supabase)
    if (statusError) return { status: 'error', message: statusError }

    // ── Create the assignment ("the trip") ──
    const { data: assignment, error: assignmentError } = await supabase
      .from('job_assignments')
      .insert({
        assigned_to: payload.assigned_to,
        assign_by: actor.id,
        scheduled_at: payload.scheduled_at,
      })
      .select('job_assignment_id')
      .single()

    if (assignmentError || !assignment) {
      console.error('[createJobAssignment] assignment insert:', assignmentError)
      return { status: 'error', message: assignmentError?.message ?? 'Failed to create assignment' }
    }

    // ── Link every selected job order to it (the junction rows) ──
    const junctionRows = uniqueJobOrderIds.map((jobOrderId) => ({
      job_assignment_id: assignment.job_assignment_id,
      job_order_id: jobOrderId,
      status_id: scheduledStatusId,
    }))

    const { error: junctionError } = await supabase.from('job_assignment_orders').insert(junctionRows)

    if (junctionError) {
      console.error('[createJobAssignment] junction insert:', junctionError)
      // Roll back the orphaned assignment header
      await supabase.from('job_assignments').delete().eq('job_assignment_id', assignment.job_assignment_id)
      return { status: 'error', message: junctionError.message }
    }

    // ── Attach helpers, if any ──
    if (helperIds.length > 0) {
      const helperRows = helperIds.map((helperId) => ({
        job_assignment_id: assignment.job_assignment_id,
        helper_id: helperId,
      }))
      const { error: helperInsertError } = await supabase.from('job_assignment_helper').insert(helperRows)
      if (helperInsertError) {
        console.error('[createJobAssignment] helper insert:', helperInsertError)
        // Non-fatal: the core assignment already succeeded, so we warn but don't roll back
      }
    }

    // ── Flip every job order's status to Assigned ──
    const { error: statusUpdateError } = await supabase
      .from('job_orders')
      .update({ job_status_id: assignedJoStatusId, updated_at: new Date().toISOString() })
      .in('job_order_id', uniqueJobOrderIds)

    if (statusUpdateError) {
      console.error('[createJobAssignment] job order status update:', statusUpdateError)
      return { status: 'error', message: 'Assignment created but job order statuses failed to update' }
    }

    // ── Assign succeeded — now flip any linked installations to Scheduled ──
    const linkedInstallationIds = getLinkedInstallationIds(jobOrders)
    if (linkedInstallationIds.length > 0) {
      const { statusId: scheduledInstallationStatusId, error: installationStatusError } =
        await getScheduledInstallationStatusId(supabase)

      if (installationStatusError) {
        return { status: 'error', message: 'Assignment created but linked installation statuses failed to update' }
      }

      const installationUpdateError = await updateInstallationsToScheduled(
        supabase,
        linkedInstallationIds,
        scheduledInstallationStatusId!,
      )
      if (installationUpdateError) {
        return { status: 'error', message: installationUpdateError }
      }
    }

    // ── Notify the assigned worker + helpers about the new trip ──
    await createNotifications(
      [{ userId: payload.assigned_to }, ...helperIds.map((id) => ({ userId: id }))],
      'NEW_JOB_ASSIGNMENT',
      {
        job_order_count: uniqueJobOrderIds.length,
        scheduled_at: payload.scheduled_at,
      },
      null,
      assignment.job_assignment_id,
    )

    // ── Email meter reader / plumber (lead + helpers) via Resend ──
    try {
      const recipientIds = [payload.assigned_to, ...helperIds]
      const [{ data: workers }, { data: barangay }] = await Promise.all([
        supabase
          .from('users')
          .select('user_id, first_name, last_name, email, role:role_id ( role_name )')
          .in('user_id', recipientIds),
        supabase
          .from('barangay')
          .select('barangay_name')
          .eq('barangay_id', payload.barangay_id)
          .maybeSingle(),
      ])

      const emailRecipients = (workers ?? [])
        .filter((w: any) => typeof w.email === 'string' && w.email.trim())
        .map((w: any) => ({
          email: w.email as string,
          first_name: (w.first_name as string) ?? '',
          last_name: (w.last_name as string) ?? '',
          role_name: getFirst(w.role)?.role_name ?? 'meter-reader',
          is_lead: w.user_id === payload.assigned_to,
        }))

      if (emailRecipients.length > 0) {
        await sendJobAssignmentEmails(emailRecipients, {
          job_order_count: uniqueJobOrderIds.length,
          scheduled_at: payload.scheduled_at,
          barangay_name: barangay?.barangay_name ?? null,
          job_assignment_id: assignment.job_assignment_id,
        })
      }
    } catch (emailErr) {
      // Non-fatal — assignment already succeeded
      console.error('[createJobAssignment] email notify:', emailErr)
    }

    return {
      status: 'success',
      data: { job_assignment_id: assignment.job_assignment_id },
      message: `Assigned ${uniqueJobOrderIds.length} job order${uniqueJobOrderIds.length !== 1 ? 's' : ''}`,
    }
  } catch (err) {
    console.error('[createJobAssignment]', err)
    return { status: 'error', message: 'Failed to create job assignment' }
  }
}


// ============================================================================
// Types — assignment list
// ============================================================================

export interface JobAssignmentHelper {
  user_id: string
  full_name: string
}

export interface JobAssignmentJobOrder {
  assignment_order_id: string
  job_order_id: string
  job_order_no: string | null
  job_type_name: string
  job_type_id?: string | null
  job_type_code?: string | null
  process_type: 'Installation' | 'Reconnection' | 'Disconnection' | 'Service Report' | 'Other'
  meter_serial_no: string | null
  contract_no: string | null
  consumer_name: string | null
  zone_name: string | null
  issue_name: string | null
  account_zone_name?: string | null
  completion_date?: string | null
  meter_status_name?: string | null
  barangay_name: string
  status_code: 'SCHEDULED' | 'ONPROGRESS' | 'COMPLETED' | 'CANCELLED' | string
}
export interface JobAssignmentListItem {
  job_assignment_id: string
  assigned_to_id: string
  assigned_to_name: string
  assign_by_name: string
  scheduled_at: string | null
  started_at: string | null
  assigned_date: string
  helpers: JobAssignmentHelper[]
  job_orders: JobAssignmentJobOrder[]
}

// A user (leader or helper) counts as "busy" if they're attached — as
// assigned_to OR as a helper — to any OTHER job_assignment that still has
// at least one open (SCHEDULED/ONPROGRESS) job_assignment_orders line.
// excludeAssignmentId lets updateJobAssignment ignore the trip being edited
// (so re-saving the same trip with the same worker doesn't flag itself).
async function validateWorkersNotBusy(
  supabase: any,
  assignedTo: string,
  helperIds: string[],
  excludeAssignmentId?: string,
): Promise<string | null> {
  const allUserIds = Array.from(new Set([assignedTo, ...helperIds]))
  if (allUserIds.length === 0) return null

  const isActive = (orders: any[]) =>
    (orders ?? []).some((o: any) => {
      const code = getFirst(o.status)?.status_code
      return code === 'SCHEDULED' || code === 'ONPROGRESS'
    })

  // ── Busy as leader (assigned_to) ──
  let leaderQuery = supabase
    .from('job_assignments')
    .select(`
      job_assignment_id,
      assigned_to,
      orders:job_assignment_orders ( status:status_id ( status_code ) )
    `)
    .in('assigned_to', allUserIds)

  if (excludeAssignmentId) leaderQuery = leaderQuery.neq('job_assignment_id', excludeAssignmentId)

  const { data: leaderRows, error: leaderError } = await leaderQuery
  if (leaderError) {
    console.error('[validateWorkersNotBusy] leader lookup:', leaderError)
    return 'Failed to verify worker availability'
  }

  const busyAsLeader = new Set(
    (leaderRows ?? [])
      .filter((row: any) => isActive(row.orders))
      .map((row: any) => row.assigned_to),
  )

  // ── Busy as helper ──
  const { data: helperRows, error: helperError } = await supabase
    .from('job_assignment_helper')
    .select(`
      helper_id,
      job_assignment:job_assignment_id (
        job_assignment_id,
        orders:job_assignment_orders ( status:status_id ( status_code ) )
      )
    `)
    .in('helper_id', allUserIds)

  if (helperError) {
    console.error('[validateWorkersNotBusy] helper lookup:', helperError)
    return 'Failed to verify worker availability'
  }

  const busyAsHelper = new Set(
    (helperRows ?? [])
      .filter((row: any) => {
        const assignment = getFirst(row.job_assignment)
        if (excludeAssignmentId && assignment?.job_assignment_id === excludeAssignmentId) return false
        return isActive(assignment?.orders)
      })
      .map((row: any) => row.helper_id),
  )

  if (busyAsLeader.has(assignedTo) || busyAsHelper.has(assignedTo)) {
    return 'Selected field worker is already on an active assignment'
  }
  if (helperIds.some((id) => busyAsLeader.has(id) || busyAsHelper.has(id))) {
    return 'One or more selected helpers are already on an active assignment'
  }

  return null
}

// ============================================================================
// GET — every assignment ("trip"), with its job orders + helpers nested
// ============================================================================

export async function getJobAssignments(): Promise<JobAssignmentListItem[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('job_assignments')
    .select(`
      job_assignment_id,
      scheduled_at,
      started_at,
      assigned_date,
      assigned_to_user:assigned_to ( user_id, first_name, last_name ),
      assign_by_user:assign_by ( first_name, last_name ),
      helpers:job_assignment_helper (
        helper:helper_id ( user_id, first_name, last_name )
      ),
      orders:job_assignment_orders (
        assignment_order_id,
        status:status_id ( status_code ),
        job_order:job_order_id (
          job_order_id,
          job_order_no,
          job_type_id,
          completion_date,
          installation_id,
          reconnection_id,
          disconnection_id,
          service_report_id,
          job_type:job_type_id ( job_type_name ),
          barangay:barangay_id ( barangay_name ),
          meter_accounts:meter_account_id (
            zone:zone_id ( zone_name ),
            consumers:consumer_id ( account_name, contract_no ),
            meters:meters ( meter_serial_no, created_at )
          ),
          service_reports:service_report_id (
            zone:zone_id ( zone_name ),
            issue_type:issue_type_id ( issue_name )
          )
        )
      )
    `)
    .order('assigned_date', { ascending: false })

  if (error) {
    console.error('[getJobAssignments]', error)
    throw new Error('Failed to fetch job assignments')
  }

  const deriveProcessType = (jo: any): JobAssignmentJobOrder['process_type'] => {
    if (jo.installation_id) return 'Installation'
    if (jo.reconnection_id) return 'Reconnection'
    if (jo.disconnection_id) return 'Disconnection'
    if (jo.service_report_id) return 'Service Report'
    return 'Other'
  }

  return (data ?? []).map((row: any) => {
    const assignedTo = getFirst(row.assigned_to_user)
    const assignBy = getFirst(row.assign_by_user)

    const helpers: JobAssignmentHelper[] = (row.helpers ?? [])
      .map((h: any) => getFirst(h.helper))
      .filter(Boolean)
      .map((u: any) => ({ user_id: u.user_id, full_name: fullName(u) }))

    const jobOrders: JobAssignmentJobOrder[] = (row.orders ?? []).map((o: any) => {
      const jo = getFirst(o.job_order)
      const jobType = getFirst(jo?.job_type)
      const barangay = getFirst(jo?.barangay)
      const meterAccount = getFirst(jo?.meter_accounts)
      const accountZone = getFirst(meterAccount?.zone)
      const consumer = getFirst(meterAccount?.consumers)
      const status = getFirst(o.status)
      const process_type = deriveProcessType(jo ?? {})

      const serviceReport = getFirst(jo?.service_reports)
      const srZone = getFirst(serviceReport?.zone)
      const srIssueType = getFirst(serviceReport?.issue_type)

      const rawSerial = latestMeterSerialFromMeters(meterAccount?.meters)
      const meter_serial_no =
        rawSerial && !String(rawSerial).startsWith('PENDING-') ? rawSerial : null

      return {
        assignment_order_id: o.assignment_order_id,
        job_order_id: jo?.job_order_id,
        job_order_no: jo?.job_order_no ?? null,
        job_type_id: jo?.job_type_id ?? null,
        job_type_name: jobType?.job_type_name ?? '—',
        process_type,
        meter_serial_no,
        contract_no: consumer?.contract_no ?? null,
        consumer_name: consumer?.account_name ?? null,
        zone_name: srZone?.zone_name ?? null,
        account_zone_name: accountZone?.zone_name ?? null,
        issue_name: process_type === 'Service Report' ? (srIssueType?.issue_name ?? null) : null,
        barangay_name: barangay?.barangay_name ?? '—',
        status_code: status?.status_code ?? 'SCHEDULED',
        completion_date: jo?.completion_date ?? null,
      }
    })

    return {
      job_assignment_id: row.job_assignment_id,
      assigned_to_id: assignedTo?.user_id ?? '',
      assigned_to_name: fullName(assignedTo),
      assign_by_name: fullName(assignBy),
      scheduled_at: row.scheduled_at,
      started_at: row.started_at,
      assigned_date: row.assigned_date,
      helpers,
      job_orders: jobOrders,
    }
  })
}

// ============================================================================
// UPDATE — flip one job order's status *within* an assignment
// (job_assignment_orders.status_id) and cascade the side effects that
// status implies onto job_orders / installations.
// ============================================================================

type AssignmentOrderStatus = 'ONPROGRESS' | 'COMPLETED' | 'CANCELLED'

async function getAssignmentOrderContext(supabase: any, assignmentOrderId: string) {
  const { data, error } = await supabase
    .from('job_assignment_orders')
    .select(`
      assignment_order_id,
      job_assignment_id,
      status:status_id ( status_code ),
      job_order:job_order_id ( job_order_id, job_status_id, installation_id )
    `)
    .eq('assignment_order_id', assignmentOrderId)
    .single()

  if (error || !data) return { row: null, error: 'Assignment line item not found' }
  return { row: data, error: null }
}

async function getStatusIds(supabase: any, newStatus: AssignmentOrderStatus) {
  const [{ data: assignStatus, error: assignErr }, { data: joStatuses, error: joErr }] = await Promise.all([
    supabase.from('assignment_status').select('assignment_status_id').eq('status_code', newStatus).single(),
    supabase.from('job_order_status').select('job_status_id, job_status_name').in('job_status_name', ['Pending', 'Completed']),
  ])

  if (assignErr || !assignStatus) return { error: `Assignment status "${newStatus}" is not configured` }
  const pending = (joStatuses ?? []).find((s: any) => s.job_status_name === 'Pending')
  const completed = (joStatuses ?? []).find((s: any) => s.job_status_name === 'Completed')
  if (!pending || !completed) return { error: 'Job order statuses "Pending"/"Completed" are not configured' }

  return {
    error: null,
    assignmentStatusId: assignStatus.assignment_status_id as string,
    pendingJoStatusId: pending.job_status_id as string,
    completedJoStatusId: completed.job_status_id as string,
  }
}

export async function updateJobAssignmentOrderStatus(
  assignmentOrderId: string,
  newStatus: AssignmentOrderStatus,
): Promise<ActionResult> {
  const supabase = await createClient()

  try {
    const { data: { user: actor } } = await supabase.auth.getUser()
    if (!actor) return { status: 'error', message: 'Unauthorised' }

    const { row, error: rowError } = await getAssignmentOrderContext(supabase, assignmentOrderId)
    if (rowError || !row) return { status: 'error', message: rowError! }

    const currentStatus = getFirst(row.status)?.status_code
    if (currentStatus === 'COMPLETED' || currentStatus === 'CANCELLED') {
      return { status: 'error', message: `This job order is already ${currentStatus.toLowerCase()} and can't be changed` }
    }
    if (currentStatus === newStatus) {
      return { status: 'error', message: `Already ${newStatus.toLowerCase()}` }
    }

    const statusIds = await getStatusIds(supabase, newStatus)
    if (statusIds.error) return { status: 'error', message: statusIds.error }

    // ── flip the line item itself ──
    const { error: lineError } = await supabase
      .from('job_assignment_orders')
      .update({ status_id: statusIds.assignmentStatusId, updated_at: new Date().toISOString() })
      .eq('assignment_order_id', assignmentOrderId)

    if (lineError) {
      console.error('[updateJobAssignmentOrderStatus] line update:', lineError)
      return { status: 'error', message: 'Failed to update status' }
    }

    const jobOrder = getFirst(row.job_order)

    if (newStatus === 'ONPROGRESS') {
      // First line to start on this trip marks the trip itself as started
      await supabase
        .from('job_assignments')
        .update({ started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('job_assignment_id', row.job_assignment_id)
        .is('started_at', null)
    }

    if (newStatus === 'COMPLETED' && jobOrder) {
      const { error: joError } = await supabase
        .from('job_orders')
        .update({ job_status_id: statusIds.completedJoStatusId, completion_date: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('job_order_id', jobOrder.job_order_id)
      if (joError) console.error('[updateJobAssignmentOrderStatus] job order → Completed:', joError)

      if (jobOrder.installation_id) {
        const { data: completedInstallStatus } = await supabase
          .from('installation_status')
          .select('installation_status_id')
          .eq('status_name', 'Completed')
          .single()

        if (completedInstallStatus) {
          await supabase
            .from('installations')
            .update({
              installation_status_id: completedInstallStatus.installation_status_id,
              completed_by: actor.id,
              completed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('installation_id', jobOrder.installation_id)
        }
      }
    }

    if (newStatus === 'CANCELLED' && jobOrder) {
      // Revert the job order to Pending so it's assignable again on another trip
      const { error: joError } = await supabase
        .from('job_orders')
        .update({ job_status_id: statusIds.pendingJoStatusId, updated_at: new Date().toISOString() })
        .eq('job_order_id', jobOrder.job_order_id)
      if (joError) console.error('[updateJobAssignmentOrderStatus] job order → Pending:', joError)
    }

    return { status: 'success', message: `Marked as ${newStatus === 'ONPROGRESS' ? 'in progress' : newStatus.toLowerCase()}` }
  } catch (err) {
    console.error('[updateJobAssignmentOrderStatus]', err)
    return { status: 'error', message: 'Failed to update job order status' }
  }
}

export interface UpdateJobAssignmentPayload {
  assigned_to: string
  scheduled_at: string
  helper_ids?: string[]
}

export async function updateJobAssignment(
  jobAssignmentId: string,
  payload: UpdateJobAssignmentPayload,
): Promise<ActionResult> {
  const supabase = await createClient()
 
  try {
    const { data: { user: actor } } = await supabase.auth.getUser()
    if (!actor) return { status: 'error', message: 'Unauthorised' }
 
    if (!jobAssignmentId) return { status: 'error', message: 'Missing assignment id' }
    if (!payload.assigned_to) return { status: 'error', message: 'Please select a field worker to assign' }
    if (!payload.scheduled_at) return { status: 'error', message: 'Please pick a schedule date' }

    const scheduleError = validateScheduleNotPast(payload.scheduled_at)
    if (scheduleError) return { status: 'error', message: scheduleError }
 
    // ── Assignment must exist ──
    const { data: existing, error: existingError } = await supabase
      .from('job_assignments')
      .select('job_assignment_id')
      .eq('job_assignment_id', jobAssignmentId)
      .single()
 
    if (existingError || !existing) {
      return { status: 'error', message: 'Assignment not found' }
    }
 
    // ── Don't allow editing a trip that's already fully wrapped up ──
    const { data: lineStatuses, error: lineStatusError } = await supabase
      .from('job_assignment_orders')
      .select('status:status_id ( status_code )')
      .eq('job_assignment_id', jobAssignmentId)
 
    if (lineStatusError) {
      console.error('[updateJobAssignment] line status lookup:', lineStatusError)
      return { status: 'error', message: 'Failed to verify assignment status' }
    }
 
    const activeLines = (lineStatuses ?? []).filter((row: any) => {
      const code = getFirst(row.status)?.status_code
      return code !== 'CANCELLED'
    })
    const allDone = activeLines.length > 0 && activeLines.every((row: any) => {
      const code = getFirst(row.status)?.status_code
      return code === 'COMPLETED'
    })
    if (activeLines.length === 0 || allDone) {
      return { status: 'error', message: 'This trip is already finished and can no longer be edited' }
    }
 
    // ── Re-validate the worker + helpers exactly like create does ──
    const workerError = await validateAssignedWorker(supabase, payload.assigned_to)
    if (workerError) return { status: 'error', message: workerError }
 
    const { helperIds, error: helperError } = await validateHelpers(supabase, payload.helper_ids, payload.assigned_to)
    if (helperError) return { status: 'error', message: helperError }

    const busyError = await validateWorkersNotBusy(supabase, payload.assigned_to, helperIds, jobAssignmentId)
    if (busyError) return { status: 'error', message: busyError }
 
    // ── Update the assignment header ──
    const { error: updateError } = await supabase
      .from('job_assignments')
      .update({
        assigned_to: payload.assigned_to,
        scheduled_at: payload.scheduled_at,
        updated_at: new Date().toISOString(),
      })
      .eq('job_assignment_id', jobAssignmentId)
 
    if (updateError) {
      console.error('[updateJobAssignment] header update:', updateError)
      return { status: 'error', message: 'Failed to update assignment' }
    }
 
    // ── Replace the helper set (delete then re-insert is simplest/safest) ──
    const { error: deleteHelpersError } = await supabase
      .from('job_assignment_helper')
      .delete()
      .eq('job_assignment_id', jobAssignmentId)
 
    if (deleteHelpersError) {
      console.error('[updateJobAssignment] helper delete:', deleteHelpersError)
      return { status: 'error', message: 'Assignment updated but failed to update helpers' }
    }
 
    if (helperIds.length > 0) {
      const { error: insertHelpersError } = await supabase
        .from('job_assignment_helper')
        .insert(helperIds.map((helper_id) => ({ job_assignment_id: jobAssignmentId, helper_id })))
 
      if (insertHelpersError) {
        console.error('[updateJobAssignment] helper insert:', insertHelpersError)
        return { status: 'error', message: 'Assignment updated but failed to update helpers' }
      }
    }
 
    return { status: 'success', message: 'Assignment updated' }
  } catch (err) {
    console.error('[updateJobAssignment]', err)
    return { status: 'error', message: 'Failed to update job assignment' }
  }
}