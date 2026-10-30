'use server'

import { createClient } from '@/lib/supabase/server'

// ============================================================================
// Types
// ============================================================================

export type ProcessType = 'Installation' | 'Reconnection' | 'Disconnection' | 'Service Report' | 'Other'

export interface JobTypeOption {
  job_type_id: string
  job_type_name: string
  job_type_code: string
}

export interface JobOrder {
  job_order_id: string
  job_order_no: string | null
  job_type_id: string | null        // ← ADDED
  job_type_name: string
  job_type_code: string
  process_type: ProcessType
  process_id: string | null
  barangay_name: string
  job_status_id: string
  job_status_name: string
  meter_account_id: string | null
  meter_serial_no: string | null
  consumer_name: string
  zone_name: string
  issue_name: string | null
  created_by_name: string
  request_date: string
  completion_date: string | null
}

export interface JobOrderDetails extends JobOrder {
  process_id: string | null
  completion_date: string | null
  assigned_to_id: string | null
  assigned_to_name: string | null
  reported_by_name: string | null
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

function deriveProcessType(row: any): { process_type: ProcessType; process_id: string | null } {
  if (row.installation_id) return { process_type: 'Installation', process_id: row.installation_id }
  if (row.reconnection_id) return { process_type: 'Reconnection', process_id: row.reconnection_id }
  if (row.disconnection_id) return { process_type: 'Disconnection', process_id: row.disconnection_id }
  if (row.service_report_id) return { process_type: 'Service Report', process_id: row.service_report_id }
  return { process_type: 'Other', process_id: null }
}

// ============================================================================
// GET — job types lookup (for dynamic filters on the Job Orders page)
//
// Reads straight from `job_types`, so the filter dropdown always matches
// what the DB actually contains. Inserting a new job type is enough to make
// it appear in the filter — no code change required.
// ============================================================================

export async function getJobTypesForFilter(): Promise<JobTypeOption[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('job_types')
    .select('job_type_id, job_type_name, job_type_code')
    .order('job_type_name', { ascending: true })

  if (error) {
    console.error('[getJobTypesForFilter]', error)
    return []
  }
  return data ?? []
}

// ============================================================================
// GET — all job orders
// ============================================================================

const JOB_ORDER_SELECT = `
  job_order_id,
  job_order_no,
  request_date,
  completion_date,
  installation_id,
  reconnection_id,
  disconnection_id,
  service_report_id,
  meter_account_id,
  job_type_id,
  job_type:job_type_id ( job_type_name, job_type_code ),
  barangay:barangay_id ( barangay_name ),
  job_order_status:job_status_id ( job_status_id, job_status_name ),
  meter_accounts:meter_account_id (
    consumers:consumer_id ( account_name ),
    zone:zone_id ( zone_name )
  ),
  creator:created_by ( first_name, last_name ),
  reconnections:reconnection_id (
    payment_status:payment_status_id ( billing_status_name )
  ),
  service_reports:service_report_id (
    zone:zone_id ( zone_name ),
    issue_type:issue_type_id ( issue_name ),
    report_by,
    reported_by_consumer_id,
    reporter:report_by ( first_name, last_name ),
    reporter_consumer:reported_by_consumer_id ( account_name )
  ),
  job_assignment_orders (
    job_assignment_id,
    job_assignments:job_assignment_id (
      assigned_to,
      assigned_to_user:assigned_to ( user_id, first_name, last_name )
    )
  )
`

export async function getAllJobOrders(filters?: {
  processType?: ProcessType | 'all'
  statusName?: string
}): Promise<JobOrder[]> {
  const supabase = await createClient()

  const { data: jobOrders, error } = await supabase
    .from('job_orders')
    .select(JOB_ORDER_SELECT)
    .order('request_date', { ascending: false })

  if (error) {
    console.error('[getAllJobOrders]', error)
    throw new Error('Failed to fetch job orders')
  }

  const rows = jobOrders ?? []
  const DISPATCHABLE_PAYMENT_STATUSES = ['paid', 'partial']

  let shaped: JobOrder[] = rows.map((row: any) => {
    const jobType = getFirst(row.job_type)
    const barangay = getFirst(row.barangay)
    const status = getFirst(row.job_order_status)
    const meterAccount = getFirst(row.meter_accounts)
    const consumer = getFirst(meterAccount?.consumers)
    const zone = getFirst(meterAccount?.zone)
    const creator = getFirst(row.creator)
    const { process_type, process_id } = deriveProcessType(row)

    const reconnectionPaymentStatus =
      process_type === 'Reconnection'
        ? getFirst(getFirst(row.reconnections)?.payment_status)?.billing_status_name ?? null
        : null

    const serviceReport = getFirst(row.service_reports)
    const srZone = getFirst(serviceReport?.zone)
    const srIssueType = getFirst(serviceReport?.issue_type)

    return {
      job_order_id: row.job_order_id,
      job_order_no: row.job_order_no,
      job_type_id: row.job_type_id ?? null,        // ← ADDED
      job_type_name: jobType?.job_type_name ?? '—',
      job_type_code: jobType?.job_type_code ?? '—',
      process_type,
      process_id,
      barangay_name: barangay?.barangay_name ?? '—',
      job_status_id: status?.job_status_id ?? '',
      job_status_name: status?.job_status_name ?? '—',
      meter_account_id: row.meter_account_id,
      meter_serial_no: meterAccount?.meter_serial_no ?? '—',
      consumer_name: consumer?.account_name ?? '—',
      zone_name: zone?.zone_name ?? srZone?.zone_name ?? '—',
      issue_name: process_type === 'Service Report' ? (srIssueType?.issue_name ?? null) : null,
      created_by_name: fullName(creator),
      request_date: row.request_date,
      completion_date: row.completion_date,
      _reconnectionPaymentStatus: reconnectionPaymentStatus,
    }
  })

  shaped = shaped.filter((jo: any) => {
    if (jo.process_type !== 'Reconnection') return true
    return DISPATCHABLE_PAYMENT_STATUSES.includes(jo._reconnectionPaymentStatus)
  })

  shaped = shaped.map(({ _reconnectionPaymentStatus, ...jo }: any) => jo)

  if (filters?.processType && filters.processType !== 'all') {
    shaped = shaped.filter((jo) => jo.process_type === filters.processType)
  }
  if (filters?.statusName) {
    shaped = shaped.filter((jo) => jo.job_status_name === filters.statusName)
  }

  return shaped
}

// ============================================================================
// GET — single job order (details dialog)
// ============================================================================

export async function getJobOrderDetails(jobOrderId: string): Promise<JobOrderDetails | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('job_orders')
    .select(JOB_ORDER_SELECT)
    .eq('job_order_id', jobOrderId)
    .single()

  if (error || !data) {
    console.error('[getJobOrderDetails]', error)
    return null
  }

  const jobType = getFirst((data as any).job_type)
  const barangay = getFirst((data as any).barangay)
  const status = getFirst((data as any).job_order_status)
  const meterAccount = getFirst((data as any).meter_accounts)
  const consumer = getFirst(meterAccount?.consumers)
  const zone = getFirst(meterAccount?.zone)
  const creator = getFirst((data as any).creator)
  const { process_type, process_id } = deriveProcessType(data)

  const serviceReport = getFirst((data as any).service_reports)
  const srZone = getFirst(serviceReport?.zone)
  const srIssueType = getFirst(serviceReport?.issue_type)
  const srReporter = getFirst(serviceReport?.reporter)
  const srReporterConsumer = getFirst(serviceReport?.reporter_consumer)

  // "Reported by" only applies to job orders from a service report — staff
  // filer takes precedence, otherwise the consumer who filed it.
  let reportedByName: string | null = null
  if (process_type === 'Service Report') {
    if (srReporter) reportedByName = fullName(srReporter)
    else if (srReporterConsumer) reportedByName = srReporterConsumer.account_name ?? null
  }

  const assignmentOrders = getFirst((data as any).job_assignment_orders)
  const jobAssignment = getFirst(assignmentOrders?.job_assignments)
  const assignedToUser = getFirst(jobAssignment?.assigned_to_user)

  return {
    job_order_id: (data as any).job_order_id,
    job_order_no: (data as any).job_order_no,
    job_type_id: (data as any).job_type_id ?? null,   // ← ADDED
    job_type_name: jobType?.job_type_name ?? '—',
    job_type_code: jobType?.job_type_code ?? '—',
    process_type,
    process_id,
    barangay_name: barangay?.barangay_name ?? '—',
    job_status_id: status?.job_status_id ?? '',
    job_status_name: status?.job_status_name ?? '—',
    meter_account_id: (data as any).meter_account_id,
    meter_serial_no: meterAccount?.meter_serial_no ?? '—',
    consumer_name: consumer?.account_name ?? '—',
    zone_name: zone?.zone_name ?? srZone?.zone_name ?? '—',
    issue_name: process_type === 'Service Report' ? (srIssueType?.issue_name ?? null) : null,
    created_by_name: fullName(creator),
    request_date: (data as any).request_date,
    completion_date: (data as any).completion_date,
    assigned_to_id: assignedToUser?.user_id ?? null,
    assigned_to_name: assignedToUser ? fullName(assignedToUser) : null,
    reported_by_name: reportedByName,
  }
}