//worker-job-order.actions.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import {
  createNotification,
  createNotifications,
  getUserIdsByRole,
} from '../notifications/notifications'
import {
  getBulkStatusId,
  logServiceReportEvent,
  markServiceReportFieldCompleted,
} from '@/lib/actions/service-report/service-report.helpers'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

// ─── Manila-date helpers ──────────────────────────────────────────────────────
// Not exported: 'use server' files can only export async functions.
// YYYY-MM-DD strings compare correctly as plain strings.

const toManilaYMD = (d: Date | string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date(d))

const todayManilaYMD = () => toManilaYMD(new Date())

// Noon Manila time so the stored timestamp can't slip a day in UTC.
const ymdToIso = (ymd: string) => new Date(`${ymd}T12:00:00+08:00`).toISOString()

// Completion date must be: present, valid, and — depending on who's saving —
// either on/after the trip's scheduled date (worker) or today-or-later
// (admin). Workers can't backdate or postdate; admins can schedule
// completion for a future date (e.g. planning ahead) but not for the past.
//
// NOTE: this is only ever called for the admin path now. The worker path
// skips validation entirely and uses `now` (see runSaveProgress).
function validateCompletionDate(
  completedDate: string | null | undefined,
  scheduledAt: string | null,
  asAdmin = false,
): string | null {
  if (!completedDate) return 'Completion date is required'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(completedDate)) return 'Invalid completion date'

  if (asAdmin) {
    if (completedDate < todayManilaYMD()) return "Completion date can't be in the past"
    return null
  }

  if (scheduledAt) {
    const scheduledYMD = toManilaYMD(scheduledAt)
    if (completedDate < scheduledYMD) {
      return `Completion date can't be before the scheduled date (${scheduledYMD})`
    }
  }
  if (completedDate > todayManilaYMD()) return "Completion date can't be in the future"
  return null
}

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface WorkerJobOrder {
  assignment_order_id: string
  job_assignment_id: string
  job_order_id: string
  job_order_no: string | null
  job_type_id: string
  job_type_name: string
  job_type_code: string
  barangay_name: string | null
  meter_account_id: string | null
  consumer_name: string
  zone_name: string | null
  meter_serial_no: string | null
  meter_status_name: string | null
  status_code: string
  job_status_name: string
  scheduled_at: string | null
  is_leader: boolean
  is_service_report: boolean
  is_transfer: boolean
  issue_name: string | null
  reported_by_name: string | null
}

export type AssignmentStatus = 'SCHEDULED' | 'ONPROGRESS' | 'COMPLETED' | 'CANCELLED'

export interface WorkerJobAssignment {
  job_assignment_id: string
  scheduled_at: string | null
  started_at: string | null
  is_leader: boolean
  assignment_status: AssignmentStatus
  barangay_name: string | null
  job_orders: WorkerJobOrder[]
}

export interface CompletedRequest {
  requestId: string   // an assignment_order_id
  serialNo?: string
  action?: 'complete' | 'cancel'
  completedDate?: string // YYYY-MM-DD, required when action is 'complete' AND the caller is an admin
  /** Required when completing a Leak After Meter service-report job. */
  leakConfirmed?: boolean
  leakFindings?: string
}

export interface ActionResult {
  status: 'success' | 'error'
  message?: string
}

// What the update dialog needs to decide which inputs to show.
export interface AssignmentOrderRequirements {
  job_type_code: string
  meter_status_name: string | null
  issue_name: string | null
}

// ─── Internal Types ───────────────────────────────────────────────────────────

interface StatusLookups {
  assignCompletedId: string | null
  assignCancelledId: string | null
  meterActiveId: string | null
  meterRemovedId: string | null
  meterDisconnectedId: string | null
  disconnectionDisconnectedId: string | null
  disconnectionCancelledId: string | null
  reconnectionReconnectedId: string | null
  reconnectionCancelledId: string | null
  installationCompletedId: string | null
  installationCancelledId: string | null
  installmentActiveId: string | null
  installmentPendingId: string | null
  installmentPausedId: string | null
  jobStatusCompletedId: string | null
  jobStatusCancelledId: string | null
}

interface MeterRow {
  meter_id: string
  meter_account_id: string
  meter_serial_no: string | null
  meter_status_id: string | null
  created_at: string
  meter_status_name: string | null
}

interface AssignmentOrderContext {
  assignment_order_id: string
  job_assignment_id: string
  currentStatusCode: string
  job_order_id: string
  job_type_code: string
  meter_account_id: string | null
  installation_id: string | null
  disconnection_id: string | null
  reconnection_id: string | null
  transfer_id: string | null
  job_order_no: string | null
  job_type_name: string
  meter_serial_no: string | null
  consumer_id: string | null
  service_report_id: string | null
}

interface AssignmentHeaderInfo {
  allIds: string[]
  leaderIds: Set<string>
  scheduledMap: Map<string, string | null>
  startedMap: Map<string, string | null>
}

// ─── Generic Lookup Helper ─────────────────────────────────────────────────────

async function lookupId(
  client: SupabaseClient,
  table: string,
  idColumn: string,
  matchColumn: string,
  value: string,
  matchType: 'eq' | 'ilike' = 'eq'
): Promise<string | null> {
  const query = client.from(table).select(idColumn)
  const { data, error } =
    matchType === 'ilike' ? await query.ilike(matchColumn, value).single() : await query.eq(matchColumn, value).single()

  if (error || !data) return null
  const row = data as unknown as { [key: string]: string }
  return row[idColumn] ?? null
}

async function loadStatusLookups(client: SupabaseClient): Promise<StatusLookups> {
  const [
    assignCompletedId,
    assignCancelledId,
    meterActiveId,
    meterRemovedId,
    meterDisconnectedId,
    disconnectionDisconnectedId,
    disconnectionCancelledId,
    reconnectionReconnectedId,
    reconnectionCancelledId,
    installationCompletedId,
    installationCancelledId,
    installmentActiveId,
    installmentPendingId,
    installmentPausedId,
    jobStatusCompletedId,
    jobStatusCancelledId,
  ] = await Promise.all([
    lookupId(client, 'assignment_status', 'assignment_status_id', 'status_code', 'COMPLETED'),
    lookupId(client, 'assignment_status', 'assignment_status_id', 'status_code', 'CANCELLED'),
    lookupId(client, 'meter_status', 'meter_status_id', 'meter_status_name', 'Active'),
    lookupId(client, 'meter_status', 'meter_status_id', 'meter_status_name', 'Removed'),
    lookupId(client, 'meter_status', 'meter_status_id', 'meter_status_name', 'Disconnected'),
    lookupId(client, 'disconnection_status', 'disconnection_status_id', 'status_name', 'Disconnected', 'ilike'),
    lookupId(client, 'disconnection_status', 'disconnection_status_id', 'status_name', 'Cancelled', 'ilike'),
    lookupId(client, 'reconnection_status', 'reconnection_status_id', 'status_name', 'Reconnected', 'ilike'),
    lookupId(client, 'reconnection_status', 'reconnection_status_id', 'status_name', 'Cancelled', 'ilike'),
    lookupId(client, 'installation_status', 'installation_status_id', 'status_name', 'Completed'),
    lookupId(client, 'installation_status', 'installation_status_id', 'status_name', 'Cancelled'),
    lookupId(client, 'installment_status', 'installment_status_id', 'status_code', 'ACTIVE'),
    lookupId(client, 'installment_status', 'installment_status_id', 'status_code', 'PENDING'),
    lookupId(client, 'installment_status', 'installment_status_id', 'status_code', 'PAUSED'),
    lookupId(client, 'job_order_status', 'job_status_id', 'job_status_name', 'Completed'),
    lookupId(client, 'job_order_status', 'job_status_id', 'job_status_name', 'Cancelled'),
  ])

  return {
    assignCompletedId,
    assignCancelledId,
    meterActiveId,
    meterRemovedId,
    meterDisconnectedId,
    disconnectionDisconnectedId,
    disconnectionCancelledId,
    reconnectionReconnectedId,
    reconnectionCancelledId,
    installationCompletedId,
    installationCancelledId,
    installmentActiveId,
    installmentPendingId,
    installmentPausedId,
    jobStatusCompletedId,
    jobStatusCancelledId,
  }
}

function extractRelationName(relation: unknown, nameKey: string): string | null {
  if (!relation) return null
  if (Array.isArray(relation)) return (relation[0] as Record<string, string> | undefined)?.[nameKey] ?? null
  return (relation as Record<string, string>)[nameKey] ?? null
}

function getFirst(val: unknown): any {

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
  return Array.isArray(val) ? val[0] ?? null : val ?? null
}

function pickLatestMeter(meters: unknown): { meter_serial_no: string | null; meter_status_name: string | null } | null {
  const meterList = Array.isArray(meters) ? meters : meters ? [meters] : []
  if (!meterList.length) return null

  const latest = meterList
    .slice()
    .sort((a: any, b: any) => {
      const da = a?.installation_date ? new Date(a.installation_date).getTime() : 0
      const db = b?.installation_date ? new Date(b.installation_date).getTime() : 0
      return db - da
    })[0] as any

  return {
    meter_serial_no: latest?.meter_serial_no ?? null,
    meter_status_name: extractRelationName(latest?.meter_status, 'meter_status_name'),
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── Get My Job Orders (flat, per job order) ──────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

async function getAssignmentHeaderInfo(client: SupabaseClient, userId: string): Promise<AssignmentHeaderInfo> {
  const [{ data: leaderAssignments }, { data: helperAssignments }] = await Promise.all([
    client.from('job_assignments').select('job_assignment_id, scheduled_at, started_at').eq('assigned_to', userId),
    client
      .from('job_assignment_helper')
      .select(`job_assignment_id, job_assignments!inner ( job_assignment_id, scheduled_at, started_at )`)
      .eq('helper_id', userId),
  ])

  const leaderIds = new Set<string>((leaderAssignments ?? []).map((a) => a.job_assignment_id))

  const scheduledMap = new Map<string, string | null>()
  const startedMap = new Map<string, string | null>()

  for (const a of leaderAssignments ?? []) {
    scheduledMap.set(a.job_assignment_id, a.scheduled_at ?? null)
    startedMap.set(a.job_assignment_id, a.started_at ?? null)
  }
  for (const h of helperAssignments ?? []) {
    const ja = getFirst(h.job_assignments)
    if (ja?.job_assignment_id) {
      scheduledMap.set(ja.job_assignment_id, ja.scheduled_at ?? null)
      startedMap.set(ja.job_assignment_id, ja.started_at ?? null)
    }
  }

  const helperIds = (helperAssignments ?? [])
    .map((h) => getFirst(h.job_assignments)?.job_assignment_id)
    .filter((id): id is string => Boolean(id))

  const allIds = [...new Set([...leaderIds, ...helperIds])]
  return { allIds, leaderIds, scheduledMap, startedMap }
}

function fullName(u: any): string {
  if (!u) return '—'
  return [u.first_name, u.last_name].filter(Boolean).join(' ') || '—'
}

function mapAssignmentOrderRow(
  row: any,
  leaderIds: Set<string>,
  scheduledMap: Map<string, string | null>,
): WorkerJobOrder {
  const jo = getFirst(row.job_order)
  const jobType = getFirst(jo?.job_type)
  const barangay = getFirst(jo?.barangay)
  const jobStatus = getFirst(jo?.job_status)
  const status = getFirst(row.status)
  const meterAccount = getFirst(jo?.meter_accounts)
  const consumer = getFirst(meterAccount?.consumers)
  const zone = getFirst(meterAccount?.zone)
  const latestMeter = pickLatestMeter(meterAccount?.meters)

  const isServiceReport = Boolean(jo?.service_report_id)
  const isTransfer = Boolean(jo?.transfer_id)
  const serviceReport = getFirst(jo?.service_reports)
  const srZone = getFirst(serviceReport?.zone)
  const srIssueType = getFirst(serviceReport?.issue_type)
  const srReporter = getFirst(serviceReport?.reporter)
  const srReporterConsumer = getFirst(serviceReport?.reporter_consumer)

  let reportedByName: string | null = null
  if (isServiceReport) {
    if (srReporter) reportedByName = fullName(srReporter)
    else if (srReporterConsumer) reportedByName = srReporterConsumer.account_name ?? null
  }

  return {
    assignment_order_id: row.assignment_order_id,
    job_assignment_id: row.job_assignment_id,
    job_order_id: jo?.job_order_id ?? '',
    job_order_no: jo?.job_order_no ?? null,
    job_type_id: jobType?.job_type_id ?? '',
    job_type_name: jobType?.job_type_name ?? '',
    job_type_code: jobType?.job_type_code ?? '',
    barangay_name: barangay?.barangay_name ?? null,
    meter_account_id: jo?.meter_account_id ?? null,
    consumer_name: consumer?.account_name ?? '—',
    zone_name: zone?.zone_name ?? srZone?.zone_name ?? null,
    meter_serial_no: latestMeter?.meter_serial_no ?? null,
    meter_status_name: latestMeter?.meter_status_name ?? null,
    status_code: status?.status_code ?? 'SCHEDULED',
    job_status_name: jobStatus?.job_status_name ?? 'Pending',
    scheduled_at: scheduledMap.get(row.job_assignment_id) ?? null,
    is_leader: leaderIds.has(row.job_assignment_id),
    is_service_report: isServiceReport,
    is_transfer: isTransfer,
    issue_name: isServiceReport ? (srIssueType?.issue_name ?? null) : null,
    reported_by_name: reportedByName,
  }
}

const JOB_ORDER_LINE_SELECT = `
  assignment_order_id,
  job_assignment_id,
  status:status_id ( status_code ),
  job_order:job_order_id (
    job_order_id,
    job_order_no,
    meter_account_id,
    service_report_id,
    transfer_id,
    job_type:job_type_id ( job_type_id, job_type_name, job_type_code ),
    barangay:barangay_id ( barangay_name ),
    job_status:job_status_id ( job_status_name ),
    meter_accounts:meter_account_id (
      consumers:consumer_id ( account_name ),
      zone:zone_id ( zone_name ),
      meters (
        meter_id,
        meter_serial_no,
        installation_date,
        meter_status_id,
        meter_status:meter_status_id ( meter_status_name )
      )
    ),
    service_reports:service_report_id (
      zone:zone_id ( zone_name ),
      issue_type:issue_type_id ( issue_name ),
      report_by,
      reported_by_consumer_id,
      reporter:report_by ( first_name, last_name ),
      reporter_consumer:reported_by_consumer_id ( account_name )
    )
  )
`

export async function getMyJobOrders(): Promise<WorkerJobOrder[]> {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return []

    const { allIds, leaderIds, scheduledMap } = await getAssignmentHeaderInfo(supabase, user.id)
    if (!allIds.length) return []

    const { data, error } = await supabase
      .from('job_assignment_orders')
      .select(JOB_ORDER_LINE_SELECT)
      .in('job_assignment_id', allIds)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[getMyJobOrders] Error:', error)
      return []
    }

    return (data ?? []).map((row) => mapAssignmentOrderRow(row, leaderIds, scheduledMap))
  } catch (err) {
    console.error('[getMyJobOrders] Unexpected error:', err)
    return []
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── Get My Job Assignments (grouped by trip) ─────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function computeAssignmentStatus(orders: WorkerJobOrder[], startedAt: string | null): AssignmentStatus {
  if (!orders.length) return 'SCHEDULED'

  const allCancelled = orders.every((o) => o.status_code === 'CANCELLED')
  if (allCancelled) return 'CANCELLED'

  const allResolved = orders.every((o) => o.status_code === 'COMPLETED' || o.status_code === 'CANCELLED')
  if (allResolved) return 'COMPLETED'

  const anyResolved = orders.some((o) => o.status_code === 'COMPLETED' || o.status_code === 'CANCELLED')
  if (startedAt || anyResolved) return 'ONPROGRESS'

  return 'SCHEDULED'
}

export async function getMyJobAssignments(): Promise<WorkerJobAssignment[]> {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return []

    const { allIds, leaderIds, scheduledMap, startedMap } = await getAssignmentHeaderInfo(supabase, user.id)
    if (!allIds.length) return []

    const { data, error } = await supabase
      .from('job_assignment_orders')
      .select(JOB_ORDER_LINE_SELECT)
      .in('job_assignment_id', allIds)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[getMyJobAssignments] Error:', error)
      return []
    }

    const grouped = new Map<string, WorkerJobOrder[]>()
    for (const row of data ?? []) {
      const jobOrder = mapAssignmentOrderRow(row, leaderIds, scheduledMap)
      const list = grouped.get(row.job_assignment_id) ?? []
      list.push(jobOrder)
      grouped.set(row.job_assignment_id, list)
    }

    for (const id of allIds) {
      if (!grouped.has(id)) grouped.set(id, [])
    }

    return Array.from(grouped.entries()).map(([jobAssignmentId, orders]) => {
      const startedAt = startedMap.get(jobAssignmentId) ?? null
      return {
        job_assignment_id: jobAssignmentId,
        scheduled_at: scheduledMap.get(jobAssignmentId) ?? null,
        started_at: startedAt,
        is_leader: leaderIds.has(jobAssignmentId),
        assignment_status: computeAssignmentStatus(orders, startedAt),
        barangay_name: orders.find((o) => o.barangay_name)?.barangay_name ?? null,
        job_orders: orders,
      }
    })
  } catch (err) {
    console.error('[getMyJobAssignments] Unexpected error:', err)
    return []
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── Save Progress ────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

async function ensureUserIsLeader(
  client: SupabaseClient,
  jobAssignmentId: string,
  userId: string,
): Promise<ActionResult | null> {
  const { data: assignment, error } = await client
    .from('job_assignments')
    .select('assigned_to')
    .eq('job_assignment_id', jobAssignmentId)
    .single()

  if (error || !assignment) {
    return { status: 'error', message: 'Job assignment not found' }
  }

  if (assignment.assigned_to === userId) return null

  const { data: helperRow } = await client
    .from('job_assignment_helper')
    .select('assignment_helper_id')
    .eq('job_assignment_id', jobAssignmentId)
    .eq('helper_id', userId)
    .maybeSingle()

  if (helperRow) {
    return { status: 'error', message: 'Only the assigned plumber can update progress' }
  }

  return { status: 'error', message: 'This job assignment was reassigned to another plumber' }
}

async function fetchAssignmentOrderContexts(
  client: SupabaseClient,
  assignmentOrderIds: string[],
): Promise<Map<string, AssignmentOrderContext>> {
  const { data, error } = await client
    .from('job_assignment_orders')
    .select(
      `
      assignment_order_id,
      job_assignment_id,
      status:status_id ( status_code ),
      job_order:job_order_id (
        job_order_id,
        job_order_no,
        meter_account_id,
        installation_id,
        disconnection_id,
        reconnection_id,
        transfer_id,
        service_report_id,
        job_type:job_type_id ( job_type_name, job_type_code ),
        meter_accounts:meter_account_id ( consumer_id, meters ( meter_serial_no, created_at ) )
      )
    `,
    )
    .in('assignment_order_id', assignmentOrderIds)

  if (error) throw new Error(`Failed to fetch assignment order lines: ${error.message}`)

  const map = new Map<string, AssignmentOrderContext>()
  for (const row of data ?? []) {
    const jo = getFirst((row as any).job_order)
    const jobType = getFirst(jo?.job_type)
    const status = getFirst((row as any).status)
    const meterAccount = getFirst(jo?.meter_accounts)

    map.set((row as any).assignment_order_id, {
      assignment_order_id: (row as any).assignment_order_id,
      job_assignment_id: (row as any).job_assignment_id,
      currentStatusCode: status?.status_code ?? 'SCHEDULED',
      job_order_id: jo?.job_order_id ?? '',
      job_type_code: jobType?.job_type_code ?? '',
      meter_account_id: jo?.meter_account_id ?? null,
      installation_id: jo?.installation_id ?? null,
      disconnection_id: jo?.disconnection_id ?? null,
      reconnection_id: jo?.reconnection_id ?? null,
      transfer_id: jo?.transfer_id ?? null,
      job_order_no: jo?.job_order_no ?? null,
      job_type_name: jobType?.job_type_name ?? '',
      meter_serial_no: meterAccount?.meter_serial_no ?? null,
      consumer_id: meterAccount?.consumer_id ?? null,
      service_report_id: jo?.service_report_id ?? null,
    })
  }
  return map
}

async function fetchLatestMetersByAccount(client: SupabaseClient, meterAccountIds: string[]): Promise<Map<string, MeterRow>> {
  if (!meterAccountIds.length) return new Map()

  const { data, error } = await client
    .from('meters')
    .select(
      `meter_id, meter_account_id, meter_serial_no, meter_status_id, created_at, meter_status:meter_status_id ( meter_status_name )`
    )
    .in('meter_account_id', meterAccountIds)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to fetch meters: ${error.message}`)

  const latestByAccount = new Map<string, MeterRow>()
  for (const row of (data ?? []) as any[]) {
    if (latestByAccount.has(row.meter_account_id)) continue
    latestByAccount.set(row.meter_account_id, {
      meter_id: row.meter_id,
      meter_account_id: row.meter_account_id,
      meter_serial_no: row.meter_serial_no,
      meter_status_id: row.meter_status_id,
      created_at: row.created_at,
      meter_status_name: extractRelationName(row.meter_status, 'meter_status_name'),
    })
  }
  return latestByAccount
}

// ─── Requirements lookup for the update dialog ───────────────────────────────
// The admin/consultant job-assignment list doesn't always carry job_type_code
// or meter_status_name on each job order, so the update dialog asks the server
// directly. This is what decides whether the serial-number field (and the
// Completed/Cancelled picker) is shown, so it never depends on list data.

export async function getAssignmentOrderRequirements(
  assignmentOrderId: string,
): Promise<AssignmentOrderRequirements | null> {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null

    const contexts = await fetchAssignmentOrderContexts(supabase, [assignmentOrderId])
    const ctx = contexts.get(assignmentOrderId)
    if (!ctx) return null

    let meterStatusName: string | null = null
    if (ctx.meter_account_id) {
      const latest = await fetchLatestMetersByAccount(supabase, [ctx.meter_account_id])
      meterStatusName = latest.get(ctx.meter_account_id)?.meter_status_name ?? null
    }

    let issueName: string | null = null
    if (ctx.service_report_id) {
      const { data: sr } = await supabase
        .from('service_reports')
        .select('issue_type:issue_type_id ( issue_name )')
        .eq('report_id', ctx.service_report_id)
        .maybeSingle()
      issueName = Array.isArray(sr?.issue_type)
        ? sr?.issue_type[0]?.issue_name ?? null
        : (sr as any)?.issue_type?.issue_name ?? null
    }

    return {
      job_type_code: ctx.job_type_code,
      meter_status_name: meterStatusName,
      issue_name: issueName,
    }
  } catch (err) {
    console.error('[getAssignmentOrderRequirements] Unexpected error:', err)
    return null
  }
}

// ─── Shared meter-write primitives ─────────────────────────────────────────────

async function markMeterRemoved(client: SupabaseClient, params: { currentMeter: MeterRow; lookups: StatusLookups; now: string }): Promise<void> {
  const { currentMeter, lookups, now } = params
  if (!lookups.meterRemovedId) return
  await client.from('meters').update({ meter_status_id: lookups.meterRemovedId, updated_at: now }).eq('meter_id', currentMeter.meter_id)
}

async function insertActiveMeter(
  client: SupabaseClient,
  params: { meterAccountId: string; serialNo?: string; lookups: StatusLookups; now: string }
): Promise<ActionResult> {
  const { meterAccountId, serialNo, lookups, now } = params
  if (!serialNo) return { status: 'success' }
 
  const { error } = await client.from('meters').insert({
    meter_account_id: meterAccountId,
    meter_serial_no: serialNo,
    meter_status_id: lookups.meterActiveId,
    installation_date: now,
    updated_at: now,
  })
 
  if (error) {
    return {
      status: 'error',
      message: error.code === '23505' ? 'Meter serial number already exists' : error.message,
    }
  }
  return { status: 'success' }
}


async function isSerialTaken(
  client: SupabaseClient,
  serialNo: string,
  excludeMeterId?: string,
): Promise<boolean> {
  // Escape LIKE wildcards so ilike behaves as an exact, case-insensitive match.
  const escaped = serialNo.trim().replace(/[\\%_]/g, '\\$&')
 
  let query = client
    .from('meters')
    .select('meter_id')
    .ilike('meter_serial_no', escaped)
    .limit(1)
 
  if (excludeMeterId) query = query.neq('meter_id', excludeMeterId)
 
  const { data, error } = await query
  if (error) throw new Error(`Failed to verify serial number: ${error.message}`)
  return (data?.length ?? 0) > 0
}

async function activateExistingMeter(
  client: SupabaseClient,
  params: { serialNo?: string; currentMeter?: MeterRow; lookups: StatusLookups; now: string }
): Promise<ActionResult> {
  const { serialNo, currentMeter, lookups, now } = params
  if (!currentMeter || !serialNo) return { status: 'success' }
 
  const { error } = await client
    .from('meters')
    .update({ meter_status_id: lookups.meterActiveId, meter_serial_no: serialNo, installation_date: now, updated_at: now })
    .eq('meter_id', currentMeter.meter_id)
 
  if (error) {
    return {
      status: 'error',
      message: error.code === '23505' ? 'Meter serial number already exists' : error.message,
    }
  }
  return { status: 'success' }
}

async function updateInstallmentStatusTo(
  client: SupabaseClient,
  params: { meterAccountId: string; fromId: string | null; toId: string | null; now: string; label: string }
): Promise<void> {
  const { meterAccountId, fromId, toId, now, label } = params
  if (!fromId || !toId) {
    console.warn(`[updateInstallmentStatusTo${label}] installment status ids not found`)
    return
  }

  const { data: matching, error: fetchError } = await client
    .from('meter_installments')
    .select('installment_id')
    .eq('meter_account_id', meterAccountId)
    .eq('status_id', fromId)

  if (fetchError) {
    console.error(`[updateInstallmentStatusTo${label}] fetch failed:`, fetchError)
    return
  }
  if (!matching?.length) return

  const ids = matching.map((i) => i.installment_id)
  const { error: updateError } = await client
    .from('meter_installments')
    .update({ status_id: toId, updated_at: now })
    .in('installment_id', ids)

  if (updateError) console.error(`[updateInstallmentStatusTo${label}] update failed:`, updateError)
}

// ─── Installation / Replacement ────────────────────────────────────────────────

async function processInstallationOrReplacement(
  client: SupabaseClient,
  params: {
    ctx: AssignmentOrderContext
    serialNo?: string
    currentMeter?: MeterRow
    lookups: StatusLookups
    actorId: string
    now: string
  }
): Promise<ActionResult> {
  const { ctx, serialNo, currentMeter, lookups, actorId, now } = params
  if (!ctx.meter_account_id) return { status: 'error', message: 'Job order has no linked meter account' }
  if (!lookups.meterActiveId) return { status: 'error', message: 'Meter status "Active" not found' }

  // GUARD: installation / replacement can never complete without a serial.
  // Without this, a replacement would mark the old meter Removed and then
  // silently insert nothing, leaving the account with no usable meter.
  // Runs before any meter write.
  if (!serialNo?.trim()) {
    return { status: 'error', message: 'Meter serial number is required' }
  }

  const isReplacement = ctx.job_type_code === 'METER_REPLACEMENT'
  const shouldReplace = isReplacement && Boolean(currentMeter)

  const meterResult = shouldReplace
    ? await (async () => {
        await markMeterRemoved(client, { currentMeter: currentMeter as MeterRow, lookups, now })
        return insertActiveMeter(client, { meterAccountId: ctx.meter_account_id!, serialNo: serialNo.trim(), lookups, now })
      })()
    : await activateExistingMeter(client, { serialNo: serialNo.trim(), currentMeter, lookups, now })

  if (meterResult.status === 'error') return meterResult

  await updateInstallmentStatusTo(client, {
    meterAccountId: ctx.meter_account_id,
    fromId: lookups.installmentPendingId,
    toId: lookups.installmentActiveId,
    now,
    label: 'Active',
  })

  if (ctx.installation_id && ctx.job_type_code === 'METER_INSTALLATION' && lookups.installationCompletedId) {
    await client
      .from('installations')
      .update({
        installation_status_id: lookups.installationCompletedId,
        completed_by: actorId,
        completed_at: now,
        updated_at: now,
      })
      .eq('installation_id', ctx.installation_id)
  }

  return { status: 'success' }
}

async function cancelInstallationIfLinked(
  client: SupabaseClient,
  params: { ctx: AssignmentOrderContext; lookups: StatusLookups; now: string }
): Promise<void> {
  const { ctx, lookups, now } = params
  if (!ctx.installation_id || ctx.job_type_code !== 'METER_INSTALLATION' || !lookups.installationCancelledId) return

  await client
    .from('installations')
    .update({ installation_status_id: lookups.installationCancelledId, updated_at: now })
    .eq('installation_id', ctx.installation_id)
}

// ─── Disconnection ──────────────────────────────────────────────────────────────

async function processDisconnection(
  client: SupabaseClient,
  params: { ctx: AssignmentOrderContext; isCancelled: boolean; currentMeter?: MeterRow; lookups: StatusLookups; now: string }
): Promise<ActionResult> {
  const { ctx, isCancelled, currentMeter, lookups, now } = params
  if (!ctx.disconnection_id) return { status: 'success' }

  const targetStatusId = isCancelled ? lookups.disconnectionCancelledId : lookups.disconnectionDisconnectedId
  if (targetStatusId) {
    const { error } = await client
      .from('disconnections')
      .update({ disconnection_status_id: targetStatusId, disconnected_at: isCancelled ? null : now, updated_at: now })
      .eq('disconnection_id', ctx.disconnection_id)
    if (error) {
      console.error('[processDisconnection] disconnection update failed:', error)
      return { status: 'error', message: error.message }
    }
  }

  if (isCancelled || !ctx.meter_account_id) return { status: 'success' }

  if (currentMeter && lookups.meterDisconnectedId) {
    const { error } = await client
      .from('meters')
      .update({ meter_status_id: lookups.meterDisconnectedId, updated_at: now })
      .eq('meter_id', currentMeter.meter_id)
    if (error) {
      console.error('[processDisconnection] meter update failed:', error)
      return { status: 'error', message: error.message }
    }
  }

  await updateInstallmentStatusTo(client, {
    meterAccountId: ctx.meter_account_id,
    fromId: lookups.installmentActiveId,
    toId: lookups.installmentPausedId,
    now,
    label: 'Paused',
  })

  return { status: 'success' }
}

// ─── Reconnection ───────────────────────────────────────────────────────────────

async function processReconnection(
  client: SupabaseClient,
  params: { ctx: AssignmentOrderContext; serialNo?: string; isCancelled: boolean; currentMeter?: MeterRow; lookups: StatusLookups; now: string }
): Promise<ActionResult> {
  const { ctx, serialNo, isCancelled, currentMeter, lookups, now } = params
  if (!ctx.reconnection_id) return { status: 'success' }

  if (
    !isCancelled &&
    currentMeter?.meter_status_name?.toUpperCase() === 'REPLACING' &&
    !serialNo?.trim()
  ) {
    return { status: 'error', message: 'Meter serial number is required to replace a flagged meter' }
  }

  const targetStatusId = isCancelled ? lookups.reconnectionCancelledId : lookups.reconnectionReconnectedId
  if (targetStatusId) {
    const { error } = await client
      .from('reconnections')
      .update({ reconnection_status_id: targetStatusId, updated_at: now })
      .eq('reconnection_id', ctx.reconnection_id)
    if (error) {
      console.error('[processReconnection] reconnection update failed:', error)
      return { status: 'error', message: error.message }
    }
  }

  if (isCancelled || !ctx.meter_account_id || !currentMeter) return { status: 'success' }

  const isReplacingFlagged = currentMeter.meter_status_name?.toUpperCase() === 'REPLACING'

  if (isReplacingFlagged) {
    if (!lookups.meterActiveId) return { status: 'success' }
    await markMeterRemoved(client, { currentMeter, lookups, now })
    if (serialNo) {
      await client.from('meters').insert({
        meter_account_id: ctx.meter_account_id,
        meter_serial_no: serialNo,
        meter_status_id: lookups.meterActiveId,
        installation_date: now,
        updated_at: now,
      })
    }
  } else if (lookups.meterActiveId) {
    await client.from('meters').update({ meter_status_id: lookups.meterActiveId, updated_at: now }).eq('meter_id', currentMeter.meter_id)
  }

  await updateInstallmentStatusTo(client, {
    meterAccountId: ctx.meter_account_id,
    fromId: lookups.installmentPendingId,
    toId: lookups.installmentActiveId,
    now,
    label: 'Active',
  })

  return { status: 'success' }
}

// ─── Service report field completion (consultant confirms later) ───────────────

async function markLinkedServiceReportFieldDone(
  client: SupabaseClient,
  params: {
    serviceReportId: string
    jobOrderId?: string | null
    actorId: string
    now: string
    leakConfirmed?: boolean
    leakFindings?: string
  },
): Promise<ActionResult> {
  const { serviceReportId, actorId, now } = params

  const { data: report } = await client
    .from('service_reports')
    .select('reference_no, reported_by_consumer_id, meter_account_id, issue_type:issue_type_id ( issue_name )')
    .eq('report_id', serviceReportId)
    .maybeSingle()

  const issueName = Array.isArray(report?.issue_type)
    ? report?.issue_type[0]?.issue_name
    : (report as any)?.issue_type?.issue_name

  // Leak After Meter: auto-record leak confirmed on job complete (no worker prompt).
  // That unlocks clerk Leak Bill Adjustments.
  if (issueName === 'Leak After Meter') {
    const leakConfirmed = params.leakConfirmed ?? true
    const { error: leakErr } = await client
      .from('report_leak_inspections')
      .upsert(
        {
          report_id: serviceReportId,
          job_order_id: params.jobOrderId ?? null,
          leak_confirmed: leakConfirmed,
          findings: params.leakFindings?.trim() || null,
          inspected_by: actorId,
          inspected_at: now,
        },
        { onConflict: 'report_id' },
      )

    if (leakErr) {
      console.error('[markLinkedServiceReportFieldDone] leak inspection:', leakErr)
      return { status: 'error', message: leakErr.message || 'Failed to save leak inspection' }
    }

    if (leakConfirmed) {
      try {
        const clerkIds = await getUserIdsByRole(['clerk'])
        if (clerkIds.length) {
          await createNotifications(
            clerkIds.map((id) => ({ userId: id })),
            'LEAK_CONFIRMED_BILL_ADJUST',
            {
              reference_no: report?.reference_no ?? null,
              report_id: serviceReportId,
              issue_name: 'Leak After Meter',
            },
            report?.meter_account_id ?? null,
            serviceReportId,
          )
        }
      } catch (err) {
        console.warn('[markLinkedServiceReportFieldDone] clerk notify failed', err)
      }
    }
  }

  await markServiceReportFieldCompleted(client, {
    serviceReportId,
    actorUserId: actorId,
    now,
  })

  // Leak After Meter: resolve immediately on job complete (no consultant confirm step).
  // Clerk can still adjust billing when leak_confirmed is true.
  if (issueName === 'Leak After Meter') {
    const resolvedId = await getBulkStatusId(client, 'resolved')
    if (resolvedId) {
      const { data: current } = await client
        .from('service_reports')
        .select('report_status_id')
        .eq('report_id', serviceReportId)
        .maybeSingle()

      await client
        .from('service_reports')
        .update({
          report_status_id: resolvedId,
          confirmed_by: actorId,
          confirmed_at: now,
          resolved_at: now,
          updated_at: now,
        })
        .eq('report_id', serviceReportId)

      await logServiceReportEvent(client, {
        reportId: serviceReportId,
        eventType: 'CONFIRMED',
        body: 'Resolved automatically after leak job completion',
        fromStatusId: current?.report_status_id ?? null,
        toStatusId: resolvedId,
        actorUserId: actorId,
      })
    }

    try {
      if (report?.reported_by_consumer_id) {
        await createNotification(
          { consumerId: report.reported_by_consumer_id },
          'SERVICE_REPORT_CONFIRMED',
          {
            reference_no: report.reference_no ?? null,
            issue_name: issueName,
            report_id: serviceReportId,
          },
          report.meter_account_id ?? null,
          serviceReportId,
        )
      }
    } catch (err) {
      console.warn('[markLinkedServiceReportFieldDone] leak resolve notify failed', err)
    }

    return { status: 'success' }
  }

  // Other issue types: notify consultants that field result awaits confirm
  try {
    const consultantIds = await getUserIdsByRole(['consultant'])

    if (consultantIds.length) {
      await createNotifications(
        consultantIds.map((id) => ({ userId: id })),
        'SERVICE_REPORT_FIELD_RESULT',
        {
          reference_no: report?.reference_no ?? null,
          issue_name: issueName ?? null,
          report_id: serviceReportId,
        },
        report?.meter_account_id ?? null,
        serviceReportId,
      )
    }

    if (report?.reported_by_consumer_id) {
      await createNotification(
        { consumerId: report.reported_by_consumer_id },
        'SERVICE_REPORT_WORK_COMPLETED',
        {
          reference_no: report.reference_no ?? null,
          issue_name: issueName ?? null,
          report_id: serviceReportId,
        },
        report.meter_account_id ?? null,
        serviceReportId,
      )
    }
  } catch (err) {
    console.warn('[markLinkedServiceReportFieldDone] notify failed', err)
  }

  return { status: 'success' }
}

// ─── Meter transfer (relocation) resolution ─────────────────────────────────
async function resolveLinkedMeterTransfer(
  client: SupabaseClient,
  params: { transferId: string | null; meterAccountId: string | null; now: string },
): Promise<void> {
  const { transferId, meterAccountId, now } = params

  // ── 1. Look up the Completed status id ──
  const { data: completedStatus, error: statusLookupError } = await client
    .from('transfer_status')
    .select('transfer_status_id')
    .eq('status_name', 'Completed')
    .maybeSingle()

  if (statusLookupError) {
    console.error('[resolveLinkedMeterTransfer] transfer_status lookup error:', statusLookupError)
    return
  }
  if (!completedStatus) {
    console.warn('[resolveLinkedMeterTransfer] transfer_status "Completed" not found')
    return
  }

  type TransferRow = {
    transfer_id: string
    meter_account_id: string
    new_zone_id: string | null
    transfer_type: string
  }

  let transfer: TransferRow | null = null

  // ── 2a. Primary: direct link via job_orders.transfer_id ──
  if (transferId) {
    const { data, error } = await client
      .from('meter_transfers')
      .select('transfer_id, meter_account_id, new_zone_id, transfer_type')
      .eq('transfer_id', transferId)
      .maybeSingle()

    if (error) {
      console.error('[resolveLinkedMeterTransfer] primary lookup error:', error)
    }
    transfer = (data as TransferRow | null) ?? null
    console.log('[resolveLinkedMeterTransfer] primary lookup →', transfer)
  }

  // ── 2b. Fallback: newest Pending RELOCATION on this meter account ──
  if (!transfer && meterAccountId) {
    const { data: candidates, error } = await client
      .from('meter_transfers')
      .select(`
        transfer_id,
        meter_account_id,
        new_zone_id,
        transfer_type,
        transfer_status:transfer_status_id ( status_name )
      `)
      .eq('meter_account_id', meterAccountId)
      .eq('transfer_type', 'RELOCATION')
      .order('transfer_date', { ascending: false })
      .limit(5)

    if (error) {
      console.error('[resolveLinkedMeterTransfer] fallback lookup error:', error)
    }
    console.log('[resolveLinkedMeterTransfer] fallback candidates →', candidates)

    const pending = (candidates ?? []).find((row: any) => {
      const st = Array.isArray(row.transfer_status) ? row.transfer_status[0] : row.transfer_status
      return (st?.status_name ?? '').toLowerCase() === 'pending'
    })

    if (pending) {
      transfer = {
        transfer_id: pending.transfer_id,
        meter_account_id: pending.meter_account_id,
        new_zone_id: pending.new_zone_id,
        transfer_type: pending.transfer_type,
      }
    }
  }

  if (!transfer) {
    console.warn('[resolveLinkedMeterTransfer] no matching Pending transfer found', {
      transferId,
      meterAccountId,
    })
    return
  }

  // ── 3. Apply the zone change (RELOCATION only) ──
  if (transfer.transfer_type === 'RELOCATION' && transfer.new_zone_id) {
    const { error: zoneErr } = await client
      .from('meter_accounts')
      .update({ zone_id: transfer.new_zone_id, updated_at: now })
      .eq('meter_account_id', transfer.meter_account_id)

    if (zoneErr) {
      console.error('[resolveLinkedMeterTransfer] zone update failed:', zoneErr)
      return
    }
    console.log('[resolveLinkedMeterTransfer] zone updated →', transfer.new_zone_id)
  }

  // ── 4. Flip transfer_status to Completed ──
  const { error: statusErr } = await client
    .from('meter_transfers')
    .update({
      transfer_status_id: completedStatus.transfer_status_id,
      updated_at: now,
    })
    .eq('transfer_id', transfer.transfer_id)

  if (statusErr) {
    console.error('[resolveLinkedMeterTransfer] status update failed:', statusErr)
    return
  }

  console.log('[resolveLinkedMeterTransfer] transfer marked Completed →', transfer.transfer_id)
}

// ─── Per-line dispatch ─────────────────────────────────────────────────────────

async function applyJobTypeSideEffects(
  client: SupabaseClient,
  params: {
    ctx: AssignmentOrderContext
    req: CompletedRequest
    isCancelled: boolean
    currentMeter?: MeterRow
    lookups: StatusLookups
    actorId: string
    now: string
  }
): Promise<ActionResult> {
  const { ctx, req, isCancelled, currentMeter, lookups, actorId, now } = params
  const needsMeter = ctx.job_type_code === 'METER_INSTALLATION' || ctx.job_type_code === 'METER_REPLACEMENT'

  if (!isCancelled && needsMeter) {
    const result = await processInstallationOrReplacement(client, { ctx, serialNo: req.serialNo, currentMeter, lookups, actorId, now })
    if (result.status === 'error') return result
  }
  if (isCancelled && needsMeter) {
    await cancelInstallationIfLinked(client, { ctx, lookups, now })
  }

  if (ctx.job_type_code === 'DISCONNECTION') {
    const result = await processDisconnection(client, { ctx, isCancelled, currentMeter, lookups, now })
    if (result.status === 'error') return result
  }

  if (ctx.job_type_code === 'RECONNECTION') {
    const result = await processReconnection(client, { ctx, serialNo: req.serialNo, isCancelled, currentMeter, lookups, now })
    if (result.status === 'error') return result
  }

  return { status: 'success' }
}

async function processCompletedRequest(
  client: SupabaseClient,
  params: {
    req: CompletedRequest
    contexts: Map<string, AssignmentOrderContext>
    latestMetersByAccount: Map<string, MeterRow>
    lookups: StatusLookups
    actorId: string
    now: string
    asAdmin: boolean
  }
): Promise<ActionResult & { jobOrderCompleted?: AssignmentOrderContext }> {
  const { req, contexts, latestMetersByAccount, lookups, actorId, now, asAdmin } = params
  const ctx = contexts.get(req.requestId)
  if (!ctx) return { status: 'error', message: 'Job order line not found on this trip' }

  if (ctx.currentStatusCode === 'COMPLETED' || ctx.currentStatusCode === 'CANCELLED') {
    return { status: 'error', message: 'This job order has already been resolved and can no longer be updated.' }
  }

  const isCancelled = req.action === 'cancel'
  const currentMeter = ctx.meter_account_id ? latestMetersByAccount.get(ctx.meter_account_id) : undefined

  // eventAt = the moment work happened. For workers without a picked date,
  // this falls back to `now` (server wall clock at the instant of the tap).
  const eventAt = !isCancelled && req.completedDate ? ymdToIso(req.completedDate) : now

  const sideEffectResult = await applyJobTypeSideEffects(client, {
    ctx, req, isCancelled, currentMeter, lookups, actorId, now: eventAt,
  })
  if (sideEffectResult.status === 'error') return sideEffectResult

  const targetAssignStatusId = isCancelled ? lookups.assignCancelledId : lookups.assignCompletedId
  if (targetAssignStatusId) {
    const { error } = await client
      .from('job_assignment_orders')
      .update({ status_id: targetAssignStatusId, updated_at: now })
      .eq('assignment_order_id', ctx.assignment_order_id)
    if (error) {
      console.error('[processCompletedRequest] assignment order status update failed:', error)
      return { status: 'error', message: 'Failed to update job order status' }
    }
  }

  const targetJoStatusId = isCancelled ? lookups.jobStatusCancelledId : lookups.jobStatusCompletedId
  if (targetJoStatusId) {
    const { error } = await client
      .from('job_orders')
      .update({ job_status_id: targetJoStatusId, completion_date: eventAt, updated_at: now })
      .eq('job_order_id', ctx.job_order_id)
    if (error) console.error('[processCompletedRequest] job order status update failed:', error)
  }

  if (!isCancelled && ctx.service_report_id) {
    const fieldResult = await markLinkedServiceReportFieldDone(client, {
      serviceReportId: ctx.service_report_id,
      jobOrderId: ctx.job_order_id,
      actorId,
      now: eventAt,
      leakConfirmed: req.leakConfirmed,
      leakFindings: req.leakFindings,
    })
    if (fieldResult.status === 'error') return fieldResult
  }

  // Relocation-transfer-derived job order → apply the zone change and
  // flip the transfer to Completed.
  //
  // Workers always stamp the *actual* moment of completion (real time),
  // ignoring any picked date. Admins keep the picked / eventAt value.
  //
  // The fallback path (meter_account_id) also runs so legacy JOs that
  // weren't linked to a transfer_id at insert still resolve.
  if (!isCancelled && (ctx.transfer_id || ctx.meter_account_id)) {
    const transferCompletedAt = asAdmin ? eventAt : now
    await resolveLinkedMeterTransfer(client, {
      transferId: ctx.transfer_id,
      meterAccountId: ctx.meter_account_id,
      now: transferCompletedAt,
    })
  }

  return { status: 'success', jobOrderCompleted: isCancelled ? undefined : ctx }
}

// ─── Main entry points ──────────────────────────────────────────────────────────

type SaveParams = { completedRequests: CompletedRequest[] }

// Roles allowed to complete job orders on behalf of a worker (e.g. worker has no phone)
const OFFICE_COMPLETION_ROLES = ['admin', 'consultant']

export async function saveMeterProgress(params: SaveParams): Promise<ActionResult> {
  return runSaveProgress(params, { asAdmin: false })
}

export async function saveJobProgressAsAdmin(params: SaveParams): Promise<ActionResult> {
  return runSaveProgress(params, { asAdmin: true })
}

async function runSaveProgress(params: SaveParams, opts: { asAdmin: boolean }): Promise<ActionResult> {
  const { completedRequests } = params
  if (!completedRequests.length) return { status: 'success' }
 
  try {
    const supabase = await createClient()
 
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { status: 'error', message: 'Unauthorized' }
 
    if (opts.asAdmin) {
      const { data: me } = await supabase
        .from('users')
        .select('role:role_id ( role_name )')
        .eq('user_id', user.id)
        .single()
      const roleName = getFirst((me as any)?.role)?.role_name
      if (!roleName || !OFFICE_COMPLETION_ROLES.includes(roleName)) {
        return { status: 'error', message: 'Only admins and consultants can update progress here' }
      }
    }
 
    const requestIds = completedRequests.map((r) => r.requestId)
    const contexts = await fetchAssignmentOrderContexts(supabase, requestIds)
    const jobAssignmentIds = [...new Set([...contexts.values()].map((c) => c.job_assignment_id))]
 
    if (!opts.asAdmin) {
      for (const jaId of jobAssignmentIds) {
        const leaderError = await ensureUserIsLeader(supabase, jaId, user.id)
        if (leaderError) return leaderError
      }
    }
 
    // ── Pre-flight validation (runs before any writes) ──
    const { data: trips, error: tripsError } = await supabase
      .from('job_assignments')
      .select('job_assignment_id, scheduled_at')
      .in('job_assignment_id', jobAssignmentIds)
 
    if (tripsError) {
      console.error('[runSaveProgress] scheduled date lookup failed:', tripsError)
      return { status: 'error', message: 'Failed to verify scheduled date' }
    }
 
    const scheduledByTrip = new Map<string, string | null>(
      (trips ?? []).map((t) => [t.job_assignment_id, t.scheduled_at ?? null]),
    )
 
    // Read-only; loaded up front so the serial check knows each account's current meter.
    const meterAccountIds = [
      ...new Set(
        [...contexts.values()]
          .map((c) => c.meter_account_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ]
    const latestMetersByAccount = await fetchLatestMetersByAccount(supabase, meterAccountIds)
 
    // Tracks serials used in this save so the same one can't appear on two lines.
    const serialsInBatch = new Set<string>()
 
    for (const req of completedRequests) {
      if (req.action === 'cancel') continue
      const ctx = contexts.get(req.requestId)
      if (!ctx) continue
 
      const isMeterJob =
        ctx.job_type_code === 'METER_INSTALLATION' || ctx.job_type_code === 'METER_REPLACEMENT'
 
      // Installation / replacement can't be completed without a serial.
      // Checked up front so a multi-line save can't half-apply.
      if (isMeterJob && !req.serialNo?.trim()) {
        return { status: 'error', message: 'Meter serial number is required' }
      }
 
      // Admins/consultants must supply a date. Workers never see a date picker —
      // for them the server treats the moment of tapping Complete as the
      // completion date (eventAt = now).
      if (opts.asAdmin) {
        const dateError = validateCompletionDate(
          req.completedDate,
          scheduledByTrip.get(ctx.job_assignment_id) ?? null,
          true,
        )
        if (dateError) return { status: 'error', message: dateError }
      }
 
      // ── Serial number uniqueness ──
      const currentMeter = ctx.meter_account_id
        ? latestMetersByAccount.get(ctx.meter_account_id)
        : undefined
 
      // A reconnection only writes a serial when replacing a flagged meter.
      const isReplacingFlagged =
        ctx.job_type_code === 'RECONNECTION' &&
        currentMeter?.meter_status_name?.toUpperCase() === 'REPLACING'
 
      const serial = req.serialNo?.trim()
 
      if (serial && (isMeterJob || isReplacingFlagged)) {
        const key = serial.toLowerCase()
 
        if (serialsInBatch.has(key)) {
          return {
            status: 'error',
            message: `Serial number "${serial}" is used more than once in this update`,
          }
        }
        serialsInBatch.add(key)
 
        // A plain installation updates the account's existing meter in place,
        // so that meter may keep its own serial. Every other case inserts a
        // new meter row and must be globally unique.
        const excludeMeterId =
          ctx.job_type_code === 'METER_INSTALLATION' ? currentMeter?.meter_id : undefined
 
        if (await isSerialTaken(supabase, serial, excludeMeterId)) {
          return {
            status: 'error',
            message: `Meter serial number "${serial}" already exists. Please check the serial and try again.`,
          }
        }
      }
    }
 
    const now = new Date().toISOString()
    const lookups = await loadStatusLookups(supabase)
 
    if (!lookups.assignCompletedId) {
      return { status: 'error', message: 'Assignment status "COMPLETED" is not configured' }
    }
 
    for (const jaId of jobAssignmentIds) {
      await supabase.from('job_assignments').update({ started_at: now }).eq('job_assignment_id', jaId).is('started_at', null)
    }
 
    const completedJobOrders: AssignmentOrderContext[] = []
 
    for (const req of completedRequests) {
      const result = await processCompletedRequest(supabase, {
        req,
        contexts,
        latestMetersByAccount,
        lookups,
        actorId: user.id,
        now,
        asAdmin: opts.asAdmin,
      })
      if (result.status === 'error') return result
      if (result.jobOrderCompleted) completedJobOrders.push(result.jobOrderCompleted)
    }
 
    if (completedJobOrders.length > 0) {
      const staffIds = await getUserIdsByRole(['admin', 'consultant', 'clerk'])
 
      for (const jo of completedJobOrders) {
        await createNotifications(
          [
            ...staffIds.map((id) => ({ userId: id })),
            ...(jo.consumer_id ? [{ consumerId: jo.consumer_id }] : []),
          ],
          'JOB_ORDER_COMPLETED',
          {
            job_order_no: jo.job_order_no ?? '',
            job_type_name: jo.job_type_name,
            meter_serial_no: jo.meter_serial_no,
          },
          jo.meter_account_id,
          jo.job_order_id,
        )
      }
    }
 
    return { status: 'success' }
  } catch (err) {
    console.error('[runSaveProgress] Unexpected error:', err)
    return { status: 'error', message: err instanceof Error ? err.message : 'Unexpected error' }
  }
}