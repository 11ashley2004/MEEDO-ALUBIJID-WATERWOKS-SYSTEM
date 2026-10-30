'use server'

import { createClient } from '@/lib/supabase/server'
import { createAuditLog } from '@/lib/actions/audit.action'

// ============================================================================
// Types
// ============================================================================

export interface InstallationStatus {
  installation_status_id: string
  status_name: string
  description: string | null
}

export interface Installation {
  installation_id: string
  meter_account_id: string
  meter_serial_no: string | null
  consumer_name: string
  barangay_name: string
  zone_name: string
  installation_status_id: string
  installation_status_name: string
  requested_by: string
  requested_by_name: string
  completed_by: string | null
  completed_by_name: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
  job_order_id: string | null
  job_order_no: string | null
  job_status_name: string | null
}

export interface MeterAccountOption {
  meter_account_id: string
  meter_serial_no: string | null
  consumer_name: string
  barangay_id: string
  barangay_name: string
  label: string
  // NEW — surfaced so the UI can flag unpaid accounts without hiding them
  payment_status: boolean
  total_connection_fee: number
}

export interface CreateInstallationData {
  meter_account_id: string
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

async function getInstallationStatusId(supabase: any, statusName: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('installation_status')
    .select('installation_status_id')
    .eq('status_name', statusName)
    .single()
  if (error || !data) return null
  return data.installation_status_id
}

async function getJobOrderStatusId(supabase: any, statusName: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('job_order_status')
    .select('job_status_id')
    .eq('job_status_name', statusName)
    .single()
  if (error || !data) return null
  return data.job_status_id
}

// Direct FK lookup now that job_orders.installation_id exists — no more
// guessing "which JO belongs to this installation" via meter_account_id +
// job_type_id. One installation -> at most one job order.
async function findJobOrderForInstallation(supabase: any, installationId: string) {
  const { data, error } = await supabase
    .from('job_orders')
    .select('job_order_id, job_order_no, job_status_id, job_order_status:job_status_id(job_status_name)')
    .eq('installation_id', installationId)
    .maybeSingle()

  if (error || !data) return null
  return data
}

// ============================================================================
// Auto-create a Job Order for a freshly-created installation
// (job_type: METER_INSTALLATION). Now links via installation_id directly.
// ============================================================================

export async function createJobOrderForMeterAccount(params: {
  meter_account_id: string
  barangay_id: string
  created_by: string
  installation_id: string
}): Promise<{ status: 'success' | 'error'; job_order_id?: string; message?: string }> {
  const supabase = await createClient()

  try {
    const { data: jobType, error: jobTypeError } = await supabase
      .from('job_types')
      .select('job_type_id')
      .eq('job_type_code', 'METER_INSTALLATION')
      .single()

    if (jobTypeError || !jobType) {
      console.error('[createJobOrderForMeterAccount] job type lookup:', jobTypeError)
      return { status: 'error', message: 'Job type "METER_INSTALLATION" is not configured' }
    }

    const { data: pendingStatus, error: statusError } = await supabase
      .from('job_order_status')
      .select('job_status_id')
      .eq('job_status_name', 'Pending')
      .single()

    if (statusError || !pendingStatus) {
      console.error('[createJobOrderForMeterAccount] status lookup:', statusError)
      return { status: 'error', message: 'Job order status "Pending" is not configured' }
    }

    const { data: jobOrder, error: jobOrderError } = await supabase
      .from('job_orders')
      .insert({
        job_type_id: jobType.job_type_id,
        barangay_id: params.barangay_id,
        job_status_id: pendingStatus.job_status_id,
        meter_account_id: params.meter_account_id,
        installation_id: params.installation_id, // NEW — direct FK link
        created_by: params.created_by,
      })
      .select('job_order_id')
      .single()

    if (jobOrderError || !jobOrder) {
      console.error('[createJobOrderForMeterAccount] job order insert:', jobOrderError)
      return { status: 'error', message: jobOrderError?.message ?? 'Failed to create job order' }
    }

    return { status: 'success', job_order_id: jobOrder.job_order_id }
  } catch (err) {
    console.error('[createJobOrderForMeterAccount]', err)
    return { status: 'error', message: 'Failed to create job order' }
  }
}

// ============================================================================
// GET — meter accounts that still need an installation
// (no meter serial yet, and no currently open installation record)
// Unpaid accounts are intentionally NOT filtered out here — they still need
// to be searchable/visible, they're just blocked at creation time below.
// ============================================================================

export async function getMeterAccountsNeedingInstallation(
  query: string,
  limit = 10,
): Promise<MeterAccountOption[]> {
  const supabase = await createClient()

  let req = supabase
    .from('meter_accounts')
    .select(`
      meter_account_id,
      payment_status,
      total_connection_fee,
      consumers:consumer_id ( account_name ),
      zone:zone_id ( barangay_id, barangay:barangay_id ( barangay_id, barangay_name ) ),
      meters:meters!inner (
        meter_id,
        meter_serial_no,
        meter_status:meter_status_id!inner ( meter_status_name )
      ),
      installations:installations ( installation_id, installation_status:installation_status_id ( status_name ) ),
      job_orders:job_orders (
        job_order_id,
        job_type:job_type_id ( job_type_code ),
        job_order_status:job_status_id ( job_status_name )
      )
    `)
    .eq('meters.meter_status.meter_status_name', 'Pending')
    .limit(limit)

  if (query.trim()) {
    req = req.ilike('meters.meter_serial_no', `%${query.trim()}%`)
  }

  const { data, error } = await req

  if (error) {
    console.error('[getMeterAccountsNeedingInstallation]', error)
    throw new Error('Failed to search meter accounts')
  }

  return (data ?? [])
    .filter((row: any) => {
      const installs = Array.isArray(row.installations) ? row.installations : (row.installations ? [row.installations] : [])
      const hasOpenInstallation = installs.some((i: any) => {
        const s = getFirst(i.installation_status)?.status_name
        return s === 'Pending'
      })

      const jobOrders = Array.isArray(row.job_orders) ? row.job_orders : (row.job_orders ? [row.job_orders] : [])
      const hasActiveInstallationJobOrder = jobOrders.some((jo: any) => {
        const jobTypeCode = getFirst(jo.job_type)?.job_type_code
        if (jobTypeCode !== 'METER_INSTALLATION') return false
        const status = getFirst(jo.job_order_status)?.job_status_name
        return status !== 'Completed' && status !== 'Cancelled'
      })

      return !hasOpenInstallation && !hasActiveInstallationJobOrder
    })
    .map((row: any) => {
      const consumer = getFirst(row.consumers)
      const zone = getFirst(row.zone)
      const barangay = getFirst(zone?.barangay)
      const pendingMeter = getFirst(row.meters)
      const serial = pendingMeter?.meter_serial_no ?? '—'
      return {
        meter_account_id: row.meter_account_id,
        meter_serial_no: serial,
        consumer_name: consumer?.account_name ?? '—',
        barangay_id: barangay?.barangay_id ?? '',
        barangay_name: barangay?.barangay_name ?? '—',
        label: `${serial} — ${consumer?.account_name ?? '—'}`,
        payment_status: !!row.payment_status,
        total_connection_fee: Number(row.total_connection_fee ?? 0),
      }
    })
}

// ============================================================================
// GET — all installations (joined view for the list page)
// ============================================================================

const INSTALLATION_SELECT = `
  installation_id,
  meter_account_id,
  installation_status_id,
  requested_by,
  completed_by,
  completed_at,
  created_at,
  updated_at,
  installation_status:installation_status_id ( status_name ),
  meter_accounts:meter_account_id (
    consumers:consumer_id ( account_name ),
    zone:zone_id ( zone_name, barangay:barangay_id ( barangay_name ) )
  ),
  requester:requested_by ( first_name, last_name ),
  completer:completed_by ( first_name, last_name )
`

function fullName(u: any): string {
  if (!u) return '—'
  return [u.first_name, u.last_name].filter(Boolean).join(' ') || '—'
}

async function shapeInstallation(supabase: any, row: any): Promise<Installation> {
  const status = getFirst(row.installation_status)
  const meterAccount = getFirst(row.meter_accounts)
  const consumer = getFirst(meterAccount?.consumers)
  const zone = getFirst(meterAccount?.zone)
  const barangay = getFirst(zone?.barangay)
  const requester = getFirst(row.requester)
  const completer = getFirst(row.completer)

  const jo = await findJobOrderForInstallation(supabase, row.installation_id)

  return {
    installation_id: row.installation_id,
    meter_account_id: row.meter_account_id,
    meter_serial_no: meterAccount?.meter_serial_no ?? '—',
    consumer_name: consumer?.account_name ?? '—',
    barangay_name: barangay?.barangay_name ?? '—',
    zone_name: zone?.zone_name ?? '—',
    installation_status_id: row.installation_status_id,
    installation_status_name: status?.status_name ?? 'Pending',
    requested_by: row.requested_by,
    requested_by_name: fullName(requester),
    completed_by: row.completed_by,
    completed_by_name: row.completed_by ? fullName(completer) : null,
    completed_at: row.completed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    job_order_id: jo?.job_order_id ?? null,
    job_order_no: jo?.job_order_no ?? null,
    job_status_name: jo ? getFirst(jo.job_order_status)?.job_status_name ?? null : null,
  }
}

export async function getAllInstallations(): Promise<Installation[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('installations')
    .select(INSTALLATION_SELECT)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[getAllInstallations]', error)
    throw new Error('Failed to fetch installations')
  }

  return Promise.all((data ?? []).map((row: any) => shapeInstallation(supabase, row)))
}

// ============================================================================
// CREATE — request an installation for a meter account
// Now validates connection-fee payment status up front and rejects with a
// clear message instead of silently allowing unpaid accounts through.
// ============================================================================

export async function createInstallation(
  payload: CreateInstallationData,
): Promise<ActionResult<{ installation_id: string; job_order_id: string | null }>> {
  const supabase = await createClient()

  try {
    const { data: { user: actor } } = await supabase.auth.getUser()
    if (!actor) return { status: 'error', message: 'Unauthorised' }

    if (!payload.meter_account_id) {
      return { status: 'error', message: 'Meter account is required' }
    }

    const { data: meterAccount, error: maError } = await supabase
      .from('meter_accounts')
      .select('meter_account_id, payment_status, total_connection_fee, zone:zone_id ( barangay_id )')
      .eq('meter_account_id', payload.meter_account_id)
      .single()

    if (maError || !meterAccount) {
      return { status: 'error', message: 'Meter account not found' }
    }

    // NEW — block unpaid connection fees with a clear, actionable message
    if (!meterAccount.payment_status) {
      const fee = Number(meterAccount.total_connection_fee ?? 0).toLocaleString('en-PH', {
        minimumFractionDigits: 2,
      })
      return {
        status: 'error',
        message: `Cannot request installation — the connection fee of ₱${fee} for meter account ${payload.meter_account_id} has not been paid yet. Please process the connection fee payment first.`,
      }
    }

    // Guard: block a second open installation for the same meter account.
    // (Checked via the installations table itself, not job_orders, since an
    // installation always exists before its JO does.)
    const { data: existingOpenInstallation } = await supabase
      .from('installations')
      .select('installation_id, installation_status:installation_status_id ( status_name )')
      .eq('meter_account_id', payload.meter_account_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const existingStatusName = getFirst(existingOpenInstallation?.installation_status)?.status_name
    if (existingOpenInstallation && existingStatusName === 'Pending') {
      return { status: 'error', message: 'This meter account already has an open installation request' }
    }

    const pendingId = await getInstallationStatusId(supabase, 'Pending')
    if (!pendingId) {
      return { status: 'error', message: 'Installation status "Pending" is not configured' }
    }

    const barangayId = getFirst(meterAccount.zone)?.barangay_id
    if (!barangayId) {
      return { status: 'error', message: 'Could not resolve barangay for this meter account' }
    }

    const { data: installation, error: insError } = await supabase
      .from('installations')
      .insert({
        meter_account_id: payload.meter_account_id,
        installation_status_id: pendingId,
        requested_by: actor.id,
      })
      .select('installation_id')
      .single()

    if (insError || !installation) {
      console.error('[createInstallation] insert:', insError)
      return { status: 'error', message: insError?.message ?? 'Failed to create installation' }
    }

    const joResult = await createJobOrderForMeterAccount({
      meter_account_id: payload.meter_account_id,
      barangay_id: barangayId,
      created_by: actor.id,
      installation_id: installation.installation_id, // NEW — direct FK link
    })

    if (joResult.status === 'error') {
      // Roll back the installation row so we never leave an orphan with no JO
      await supabase.from('installations').delete().eq('installation_id', installation.installation_id)
      return { status: 'error', message: joResult.message ?? 'Failed to create job order for installation' }
    }

    await createAuditLog(
      actor.id,
      'CREATE',
      `Requested installation for meter account`,
      'installations',
      installation.installation_id,
    )

    return {
      status: 'success',
      data: { installation_id: installation.installation_id, job_order_id: joResult.job_order_id ?? null },
      message: 'Installation requested',
    }
  } catch (err) {
    console.error('[createInstallation]', err)
    return { status: 'error', message: 'Failed to create installation' }
  }
}

// ============================================================================
// CANCEL
// ============================================================================

export async function cancelInstallation(
  installationId: string,
  reason: string,
): Promise<ActionResult> {
  const supabase = await createClient()

  try {
    const { data: { user: actor } } = await supabase.auth.getUser()
    if (!actor) return { status: 'error', message: 'Unauthorised' }

    if (!reason.trim()) {
      return { status: 'error', message: 'Cancellation reason is required' }
    }

    const { data: installation, error: fetchError } = await supabase
      .from('installations')
      .select('installation_id, meter_account_id')
      .eq('installation_id', installationId)
      .single()

    if (fetchError || !installation) {
      return { status: 'error', message: 'Installation not found' }
    }

    const cancelledId = await getInstallationStatusId(supabase, 'Cancelled')
    if (!cancelledId) {
      return { status: 'error', message: 'Installation status "Cancelled" is not configured' }
    }

    const { error: updateError } = await supabase
      .from('installations')
      .update({
        installation_status_id: cancelledId,
        updated_at: new Date().toISOString(),
      })
      .eq('installation_id', installationId)

    if (updateError) {
      console.error('[cancelInstallation] update:', updateError)
      return { status: 'error', message: updateError.message }
    }

    // Cancel the linked JO too, via the direct FK now.
    const jo = await findJobOrderForInstallation(supabase, installationId)
    if (jo) {
      const cancelledJoStatusId = await getJobOrderStatusId(supabase, 'Cancelled')
      if (cancelledJoStatusId) {
        await supabase
          .from('job_orders')
          .update({ job_status_id: cancelledJoStatusId, updated_at: new Date().toISOString() })
          .eq('job_order_id', jo.job_order_id)
      }
    }

    await createAuditLog(actor.id, 'UPDATE', `Cancelled installation: ${reason.trim()}`, 'installations', installationId)

    return { status: 'success', message: 'Installation cancelled' }
  } catch (err) {
    console.error('[cancelInstallation]', err)
    return { status: 'error', message: 'Failed to cancel installation' }
  }
}

// ============================================================================
// COMPLETE
// ============================================================================

export async function completeInstallation(
  installationId: string,
  meterSerialNo: string,
): Promise<ActionResult> {
  const supabase = await createClient()

  try {
    const { data: { user: actor } } = await supabase.auth.getUser()
    if (!actor) return { status: 'error', message: 'Unauthorised' }

    if (!meterSerialNo.trim()) {
      return { status: 'error', message: 'Meter serial number is required' }
    }

    const { data: installation, error: fetchError } = await supabase
      .from('installations')
      .select('installation_id, meter_account_id')
      .eq('installation_id', installationId)
      .single()

    if (fetchError || !installation) {
      return { status: 'error', message: 'Installation not found' }
    }

    const [completedId, activeStatus] = await Promise.all([
      getInstallationStatusId(supabase, 'Completed'),
      supabase.from('meter_status').select('meter_status_id').eq('meter_status_name', 'Active').single(),
    ])

    if (!completedId) {
      return { status: 'error', message: 'Installation status "Completed" is not configured' }
    }
    if (activeStatus.error || !activeStatus.data) {
      return { status: 'error', message: 'Meter status "Active" is not configured' }
    }

    const nowIso = new Date().toISOString()

    const { error: meterError } = await supabase
      .from('meters')
      .update({
        meter_serial_no: meterSerialNo.trim(),
        meter_status_id: activeStatus.data.meter_status_id,
        installation_date: nowIso,
        updated_at: nowIso,
      })
      .eq('meter_account_id', installation.meter_account_id)

    if (meterError) {
      console.error('[completeInstallation] meter update:', meterError)
      return { status: 'error', message: meterError.message }
    }

    const { error: instError } = await supabase
      .from('installations')
      .update({
        installation_status_id: completedId,
        completed_by: actor.id,
        completed_at: nowIso,
        updated_at: nowIso,
      })
      .eq('installation_id', installationId)

    if (instError) {
      console.error('[completeInstallation] installation update:', instError)
      return { status: 'error', message: instError.message }
    }

    // Close the linked JO too, via the direct FK now.
    const jo = await findJobOrderForInstallation(supabase, installationId)
    if (jo) {
      const completedJoStatusId = await getJobOrderStatusId(supabase, 'Completed')
      if (completedJoStatusId) {
        await supabase
          .from('job_orders')
          .update({ job_status_id: completedJoStatusId, completion_date: nowIso, updated_at: nowIso })
          .eq('job_order_id', jo.job_order_id)
      }
    }

    await createAuditLog(
      actor.id,
      'UPDATE',
      `Completed installation — meter serial ${meterSerialNo.trim()}`,
      'installations',
      installationId,
    )

    return { status: 'success', message: 'Installation completed' }
  } catch (err) {
    console.error('[completeInstallation]', err)
    return { status: 'error', message: 'Failed to complete installation' }
  }
}