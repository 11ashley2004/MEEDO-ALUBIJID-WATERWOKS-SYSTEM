'use server'

import { createClient } from '@/lib/supabase/server'
import { createAuditLog } from '../audit.action'

export interface EligibleDisconnection {
  disconnection_id: string
  meter_account_id: string
  consumer_id: string
  consumer_name: string
  meter_serial_no: string | null
  zone_name: string
  barangay_name: string
  disconnected_at: string | null
  requested_date: string
  is_voluntary: boolean
  outstanding_balance: number
}

export interface PausedInstallmentInfo {
  installment_id: string
  total_cost: number
  monthly_amount: number
  total_months: number
  remaining_balance: number
}

export interface ChargeTypeOption {
  charge_type_id: string
  charge_name: string
  default_amount: number
}

export interface ReconnectionChargeInput {
  charge_type_id: string
  amount: number
  source_installment_id?: string
}

export interface CurrentMeterInfo {
  meter_id: string
  meter_serial_no: string
  meter_status_id: string
  meter_status_name: string
}

export interface MeterStatusUpdateInput {
  meter_id: string
  action: 'activate' | 'replace'
}

export interface ReconnectionListItem {
  reconnection_id: string
  reconnection_no: string
  disconnection_id: string
  meter_serial_no: string | null
  consumer_name: string
  zone_name: string
  barangay_name: string
  is_voluntary: boolean
  outstanding_balance: number
  total_amount: number
  remaining_balance: number
  payment_status_id: string
  payment_status_name: string
  reconnection_status_id: string
  reconnection_status_name: string
  created_at: string
}

// =====================
// HELPERS
// =====================

const getFirst = (val: unknown): any => {
  if (Array.isArray(val)) return val[0] ?? null
  return val ?? null
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

async function getChargeTypeIdByName(supabase: any, name: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('reconnection_charge_types')
    .select('charge_type_id')
    .eq('charge_name', name)
    .maybeSingle()
  if (error || !data) return null
  return data.charge_type_id
}

// One reconnection -> at most one job order, linked via job_orders.reconnection_id
async function findJobOrderForReconnection(supabase: any, reconnectionId: string) {
  const { data, error } = await supabase
    .from('job_orders')
    .select('job_order_id, job_order_no, job_status_id, job_order_status:job_status_id ( job_status_name )')
    .eq('reconnection_id', reconnectionId)
    .maybeSingle()

  if (error || !data) return null
  return data
}

// Auto-create the "Reconnection" job order for a freshly-created
// reconnection (job_type_code: RECONNECTION), linked via reconnection_id.
async function createJobOrderForReconnection(
  supabase: any,
  params: { meter_account_id: string; barangay_id: string; created_by: string; reconnection_id: string },
): Promise<{ success: boolean; job_order_id?: string; error?: string }> {
  const { data: jobType, error: jobTypeError } = await supabase
    .from('job_types')
    .select('job_type_id')
    .eq('job_type_code', 'RECONNECTION')
    .single()

  if (jobTypeError || !jobType) {
    console.error('[createJobOrderForReconnection] job type lookup:', jobTypeError)
    return { success: false, error: 'Job type "RECONNECTION" is not configured' }
  }

  const pendingStatusId = await getJobOrderStatusId(supabase, 'Pending')
  if (!pendingStatusId) {
    return { success: false, error: 'Job order status "Pending" is not configured' }
  }

  const { data: jobOrder, error: jobOrderError } = await supabase
    .from('job_orders')
    .insert({
      job_type_id: jobType.job_type_id,
      barangay_id: params.barangay_id,
      job_status_id: pendingStatusId,
      meter_account_id: params.meter_account_id,
      reconnection_id: params.reconnection_id, // direct FK link
      created_by: params.created_by,
    })
    .select('job_order_id')
    .single()

  if (jobOrderError || !jobOrder) {
    console.error('[createJobOrderForReconnection] insert:', jobOrderError)
    return { success: false, error: jobOrderError?.message ?? 'Failed to create job order' }
  }

  return { success: true, job_order_id: jobOrder.job_order_id }
}

// =====================
// LOOKUPS
// =====================

export async function getReconnectionChargeTypes(): Promise<ChargeTypeOption[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('reconnection_charge_types')
    .select('charge_type_id, charge_name, default_amount')
    .order('charge_name', { ascending: true })

  if (error) {
    console.error('Error fetching charge types:', error)
    return []
  }
  return (data || []).map(d => ({ ...d, default_amount: Number(d.default_amount) || 0 }))
}

// =====================
// CURRENT METER LOOKUP
// =====================
export async function getCurrentMeterForAccount(
  meterAccountId: string
): Promise<CurrentMeterInfo | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('meters')
    .select(`
      meter_id,
      meter_serial_no,
      meter_status_id,
      meter_status:meter_status_id ( meter_status_name )
    `)
    .eq('meter_account_id', meterAccountId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    if (error) console.error('Error fetching current meter:', error)
    return null
  }

  return {
    meter_id: data.meter_id,
    meter_serial_no: data.meter_serial_no,
    meter_status_id: data.meter_status_id,
    meter_status_name: (data.meter_status as any)?.meter_status_name ?? '',
  }
}

// =====================
// PAUSED INSTALLMENT LOOKUP
// Only ever looks at PAUSED installments. Once one is forwarded into a
// reconnection it moves to FORWARDED, so it naturally stops showing up
// here — preventing the same installment from being forwarded twice.
// =====================
export async function getPausedInstallmentForAccount(
  meterAccountId: string
): Promise<PausedInstallmentInfo | null> {
  const supabase = await createClient()

  const { data: pausedStatus, error: statusErr } = await supabase
    .from('installment_status')
    .select('installment_status_id')
    .eq('status_code', 'PAUSED')
    .single()

  if (statusErr || !pausedStatus) return null

  const { data, error } = await supabase
    .from('meter_installments')
    .select('installment_id, total_cost, monthly_amount, total_months, remaining_balance')
    .eq('meter_account_id', meterAccountId)
    .eq('status_id', pausedStatus.installment_status_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    if (error) console.error('Error fetching paused installment:', error)
    return null
  }

  return {
    installment_id: data.installment_id,
    total_cost: Number(data.total_cost) || 0,
    monthly_amount: Number(data.monthly_amount) || 0,
    total_months: data.total_months,
    remaining_balance: Number(data.remaining_balance) || 0,
  }
}

async function getInstallmentStatusIdByName(supabase: any, statusCode: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('installment_status')
    .select('installment_status_id')
    .eq('status_code', statusCode)
    .single()

  if (error || !data) return null
  return data.installment_status_id
}

async function getMeterStatusIdByName(supabase: any, name: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('meter_status')
    .select('meter_status_id')
    .eq('meter_status_name', name)
    .single()

  if (error || !data) return null
  return data.meter_status_id
}

// =====================
// INSTALLMENT LIFECYCLE HELPERS
// A forwarded installment balance moves through: PAUSED -> FORWARDED -> COMPLETED.
// It can also bounce back FORWARDED -> PAUSED if the reconnection is cancelled
// before it's paid. We never zero remaining_balance until it's genuinely
// collected (finalize), so cancellation is always safe to revert.
// =====================

async function getForwardedInstallmentIds(supabase: any, reconnectionId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('reconnection_charges')
    .select('source_installment_id')
    .eq('reconnection_id', reconnectionId)
    .not('source_installment_id', 'is', null)

  if (error || !data) return []
  return data.map((r: any) => r.source_installment_id).filter(Boolean)
}

// Call when a reconnection with a forwarded installment charge becomes
// fully paid (remaining_balance hits 0). Marks the installment COMPLETED
// and finally zeroes its remaining_balance.
async function finalizeForwardedInstallments(supabase: any, reconnectionId: string) {
  const ids = await getForwardedInstallmentIds(supabase, reconnectionId)
  if (ids.length === 0) return

  const completedStatusId = await getInstallmentStatusIdByName(supabase, 'COMPLETED')
  if (!completedStatusId) {
    console.error('Installment status "COMPLETED" is not configured')
    return
  }

  const { error } = await supabase
    .from('meter_installments')
    .update({ status_id: completedStatusId, remaining_balance: 0, updated_at: new Date().toISOString() })
    .in('installment_id', ids)
    // Guard: only finalize installments still sitting in FORWARDED, so we
    // never touch one that's already COMPLETED or was reverted elsewhere.
    .eq('status_id', await getInstallmentStatusIdByName(supabase, 'FORWARDED'))

  if (error) console.error('Error finalizing forwarded installment(s):', error)
}

// Call when a reconnection that had forwarded an installment balance gets
// Cancelled before it was fully paid. Sends the installment back to PAUSED
// so it becomes eligible to be forwarded again on a future reconnection.
async function revertForwardedInstallments(supabase: any, reconnectionId: string) {
  const ids = await getForwardedInstallmentIds(supabase, reconnectionId)
  if (ids.length === 0) return

  const pausedStatusId = await getInstallmentStatusIdByName(supabase, 'PAUSED')
  const forwardedStatusId = await getInstallmentStatusIdByName(supabase, 'FORWARDED')
  if (!pausedStatusId) {
    console.error('Installment status "PAUSED" is not configured')
    return
  }

  const { error } = await supabase
    .from('meter_installments')
    .update({ status_id: pausedStatusId, updated_at: new Date().toISOString() })
    .in('installment_id', ids)
    // Guard: only revert installments still FORWARDED — if one was somehow
    // already finalized to COMPLETED (e.g. race with a payment), leave it.
    .eq('status_id', forwardedStatusId)

  if (error) console.error('Error reverting forwarded installment(s):', error)
}

// =====================
// SEARCH ELIGIBLE CONNECTIONS
// Source of truth for "is this account currently disconnected" is the
// meter's own status (meter_status_name = 'Disconnected'), not the
// disconnection record's status. This is a single lookup instead of the
// old "Disconnected" -> fallback "Completed" two-step chain.
//
// "Only one reconnectable disconnection per meter account" is enforced in
// processDisconnections below: latestByMeterAccount keeps just the newest
// disconnection per account, and takenDisconnectionIds excludes any that
// already has an active (Pending/Reconnected) reconnection.
// =====================

export async function searchReconnectableConnections(query: string): Promise<{
  success: boolean
  data?: EligibleDisconnection[]
  error?: string
}> {
  const supabase = await createClient()

  try {
    const { data: disconnectedMeterStatus, error: statusError } = await supabase
      .from('meter_status')
      .select('meter_status_id')
      .eq('meter_status_name', 'Disconnected')
      .maybeSingle()

    if (statusError || !disconnectedMeterStatus) {
      return { success: false, error: 'Meter status "Disconnected" is not configured' }
    }

    const { data: disconnectedMeters, error: metersError } = await supabase
      .from('meters')
      .select('meter_account_id')
      .eq('meter_status_id', disconnectedMeterStatus.meter_status_id)

    if (metersError) throw metersError
    if (!disconnectedMeters?.length) {
      return { success: true, data: [] }
    }

    const meterAccountIds = disconnectedMeters.map((m: any) => m.meter_account_id)

    const { data: rows, error } = await supabase
      .from('disconnections')
      .select(`
        disconnection_id,
        meter_account_id,
        is_voluntary,
        requested_date,
        disconnected_at,
        created_at,
        meter_accounts:meter_account_id (
          consumer_id,
          consumers:consumer_id ( account_name ),
          zone:zone_id (
            zone_name,
            barangay:barangay_id ( barangay_name )
          )
        )
      `)
      .in('meter_account_id', meterAccountIds)
      .order('created_at', { ascending: false })

    if (error) throw error
    return processDisconnections(rows, query)
  } catch (error) {
    console.error('Error searching reconnectable connections:', error)
    return { success: false, error: 'Failed to search connections' }
  }
}

async function processDisconnections(rows: any[], query: string): Promise<{
  success: boolean
  data?: EligibleDisconnection[]
  error?: string
}> {
  const supabase = await createClient()

  const latestByMeterAccount = new Map<string, any>()
  for (const row of rows || []) {
    if (!latestByMeterAccount.has(row.meter_account_id)) {
      latestByMeterAccount.set(row.meter_account_id, row)
    }
  }

  const disconnectionIds = Array.from(latestByMeterAccount.values()).map(r => r.disconnection_id)
  const meterAccountIds = Array.from(latestByMeterAccount.keys())

  const { data: allStatuses } = await supabase
    .from('reconnection_status')
    .select('reconnection_status_id, status_name')

  const statusMap = new Map(allStatuses?.map(s => [s.status_name, s.reconnection_status_id]) ?? [])

  const activeStatusIds = [
    statusMap.get('Pending'),
    statusMap.get('Reconnected'),
  ].filter(Boolean)

  let takenDisconnectionIds = new Set<string>()
  if (disconnectionIds.length > 0 && activeStatusIds.length > 0) {
    const { data: existingReconnections } = await supabase
      .from('reconnections')
      .select('disconnection_id, reconnection_status_id')
      .in('disconnection_id', disconnectionIds)
      .in('reconnection_status_id', activeStatusIds)

    takenDisconnectionIds = new Set(
      (existingReconnections || []).map(r => r.disconnection_id)
    )
  }

  const outstandingByMeterAccount = new Map<string, number>()
  if (meterAccountIds.length > 0) {
    const { data: billingRows } = await supabase
      .from('billing')
      .select('meter_account_id, remaining_balance, created_at')
      .in('meter_account_id', meterAccountIds)
      .order('created_at', { ascending: false })

    for (const b of billingRows || []) {
      if (!outstandingByMeterAccount.has(b.meter_account_id)) {
        outstandingByMeterAccount.set(b.meter_account_id, Number(b.remaining_balance) || 0)
      }
    }
  }

  const q = query.trim().toLowerCase()

  const results: EligibleDisconnection[] = Array.from(latestByMeterAccount.values())
    .filter(row => !takenDisconnectionIds.has(row.disconnection_id))
    .map((row: any) => {
      const ma = row.meter_accounts
      const consumer = ma?.consumers
      return {
        disconnection_id: row.disconnection_id,
        meter_account_id: row.meter_account_id,
        consumer_id: ma?.consumer_id ?? '',
        consumer_name: consumer?.account_name ?? 'Unknown Consumer',
        meter_serial_no: ma?.meter_serial_no ?? '',
        zone_name: ma?.zone?.zone_name ?? '',
        barangay_name: ma?.zone?.barangay?.barangay_name ?? '',
        disconnected_at: row.disconnected_at,
        requested_date: row.requested_date,
        is_voluntary: row.is_voluntary,
        outstanding_balance: outstandingByMeterAccount.get(row.meter_account_id) ?? 0,
      }
    })
    .filter(r =>
      !q ||
      r.consumer_name.toLowerCase().includes(q) ||
      r.meter_serial_no.toLowerCase().includes(q)
    )
    .slice(0, 20)

  return { success: true, data: results }
}

// =====================
// CREATE RECONNECTION
// =====================

async function generateReconnectionNo(supabase: any) {
  const now = new Date()
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
  const prefix = `RC-${yyyymm}-`

  const { count } = await supabase
    .from('reconnections')
    .select('reconnection_id', { count: 'exact', head: true })
    .like('reconnection_no', `${prefix}%`)

  return `${prefix}${String((count ?? 0) + 1).padStart(5, '0')}`
}

// =====================
// CREATE RECONNECTION
// Zero-balance reconnections are marked "paid" immediately.
// =====================

export async function createReconnection(payload: {
  disconnection_id: string
  outstanding_balance: number
  charges: ReconnectionChargeInput[]
  meter_status_update?: MeterStatusUpdateInput
}) {
  const supabase = await createClient()

  try {
    if (!payload.disconnection_id) {
      return { status: 'error', message: 'No connection selected' }
    }

    if (!payload.meter_status_update) {
      return { status: 'error', message: 'Meter status update is required. Please select Activate or Replace.' }
    }
    if (!payload.meter_status_update.meter_id) {
      return { status: 'error', message: 'Invalid meter selection' }
    }
    if (!payload.meter_status_update.action || !['activate', 'replace'].includes(payload.meter_status_update.action)) {
      return { status: 'error', message: 'Invalid meter status action. Please select Activate or Replace.' }
    }

    const seenTypes = new Set<string>()
    for (const c of payload.charges) {
      if (seenTypes.has(c.charge_type_id)) {
        return { status: 'error', message: 'Duplicate charge type detected — each charge type can only be added once' }
      }
      seenTypes.add(c.charge_type_id)
    }

    // Pull the disconnection once — used both to gate the Reconnection Fee
    // (only applies to involuntary disconnections) and to resolve the
    // barangay for the job order created below.
    const { data: disconnection, error: disErr } = await supabase
      .from('disconnections')
      .select(`
        disconnection_id,
        is_voluntary,
        meter_account_id,
        meter_account:meter_account_id ( zone:zone_id ( barangay_id ) )
      `)
      .eq('disconnection_id', payload.disconnection_id)
      .single()

    if (disErr || !disconnection) {
      return { status: 'error', message: 'Disconnection record not found' }
    }

    // The Reconnection Fee (connection fee) only ever applies to
    // involuntary disconnections — never to voluntary ones, and it's
    // mandatory when involuntary. Enforced server-side so a direct call
    // can't bypass the UI's own gating.
    const reconnectionFeeTypeId = await getChargeTypeIdByName(supabase, 'Reconnection Fee')
    const hasReconnectionFeeCharge = reconnectionFeeTypeId
      ? payload.charges.some(c => c.charge_type_id === reconnectionFeeTypeId && Number(c.amount) > 0)
      : false

    if (disconnection.is_voluntary && hasReconnectionFeeCharge) {
      return { status: 'error', message: 'Reconnection Fee does not apply to voluntary disconnections' }
    }
    if (!disconnection.is_voluntary && !hasReconnectionFeeCharge) {
      return { status: 'error', message: 'Reconnection Fee is required for involuntary disconnections' }
    }

    const barangayId = getFirst((disconnection as any).meter_account?.zone)?.barangay_id
    if (!barangayId) {
      return { status: 'error', message: 'Could not resolve barangay for this meter account' }
    }

    const outstandingBalance = Number(payload.outstanding_balance) || 0
    const chargesTotal = payload.charges.reduce((sum, c) => sum + (Number(c.amount) || 0), 0)
    const totalAmount = parseFloat((outstandingBalance + chargesTotal).toFixed(2))

    if (totalAmount < 0) {
      return { status: 'error', message: 'Total amount cannot be negative' }
    }

    // Nothing to collect (e.g. voluntary reconnection with no balance and
    // no charges) -> mark it paid immediately instead of rejecting it.
    const isZeroBalance = totalAmount <= 0.01

    const { data: { user: actorUser } } = await supabase.auth.getUser()
    if (!actorUser) {
      return { status: 'error', message: 'User not authenticated' }
    }

    const { data: paymentStatus } = await supabase
      .from('billing_status')
      .select('billing_status_id')
      .eq('billing_status_name', isZeroBalance ? 'paid' : 'unpaid')
      .single()

    const { data: pendingStatus } = await supabase
      .from('reconnection_status')
      .select('reconnection_status_id')
      .eq('status_name', 'Pending')
      .single()

    if (!paymentStatus || !pendingStatus) {
      return { status: 'error', message: 'Required lookup statuses are not configured' }
    }

    const reconnectionNo = await generateReconnectionNo(supabase)

    const { data: reconnection, error: reconnectionError } = await supabase
      .from('reconnections')
      .insert({
        reconnection_no: reconnectionNo,
        disconnection_id: payload.disconnection_id,
        outstanding_balance: outstandingBalance,
        payment_status_id: paymentStatus.billing_status_id,
        reconnection_status_id: pendingStatus.reconnection_status_id,
        total_amount: totalAmount,
        remaining_balance: isZeroBalance ? 0 : totalAmount,
        processed_by: actorUser.id,
      })
      .select()
      .single()

    if (reconnectionError) throw reconnectionError

    // NOTE: source_installment_id is nullable — only the auto-forwarded
    // installment row carries one. Every other charge row leaves it null.
    const chargeRows = payload.charges
      .filter(c => Number(c.amount) > 0)
      .map(c => ({
        reconnection_id: reconnection.reconnection_id,
        charge_type_id: c.charge_type_id,
        amount: c.amount,
        source_installment_id: c.source_installment_id ?? null,
      }))

    if (chargeRows.length > 0) {
      const { error: chargesError } = await supabase.from('reconnection_charges').insert(chargeRows)
      if (chargesError) throw chargesError
    }

    // If a paused installment balance was forwarded into this reconnection,
    // move it to FORWARDED (not COMPLETED). It only becomes COMPLETED once
    // the reconnection is actually paid — see finalizeForwardedInstallments.
    // This keeps the real remaining_balance intact so a later cancellation
    // can safely revert it back to PAUSED instead of losing the balance.
    const forwardedInstallmentIds = payload.charges
      .filter(c => c.source_installment_id && Number(c.amount) > 0)
      .map(c => c.source_installment_id as string)

    if (forwardedInstallmentIds.length > 0) {
      const forwardedStatusId = await getInstallmentStatusIdByName(supabase, 'FORWARDED')

      if (forwardedStatusId) {
        const { error: installmentUpdateError } = await supabase
          .from('meter_installments')
          .update({
            status_id: forwardedStatusId,
            updated_at: new Date().toISOString(),
          })
          .in('installment_id', forwardedInstallmentIds)

        if (installmentUpdateError) {
          console.error('Error marking forwarded installment(s):', installmentUpdateError)
        }
      } else {
        console.error('Installment status "FORWARDED" is not configured — run the migration that adds it')
      }

      // Already fully paid on creation -> close out the forwarded installment too.
      if (isZeroBalance) {
        await finalizeForwardedInstallments(supabase, reconnection.reconnection_id)
      }
    }

    if (payload.meter_status_update) {
      const targetName = payload.meter_status_update.action === 'activate' ? 'Active' : 'Replacing'
      const statusId = await getMeterStatusIdByName(supabase, targetName)

      if (statusId) {
        const { error: meterUpdateError } = await supabase
          .from('meters')
          .update({ meter_status_id: statusId, updated_at: new Date().toISOString() })
          .eq('meter_id', payload.meter_status_update.meter_id)

        if (meterUpdateError) {
          console.error('Error updating meter status:', meterUpdateError)
        }
      } else {
        console.error(`Meter status "${targetName}" is not configured`)
      }
    }

    // Create the linked job order for this reconnection. Rolled back if it
    // fails so we never leave a reconnection without a matching job order.
    const joResult = await createJobOrderForReconnection(supabase, {
      meter_account_id: disconnection.meter_account_id,
      barangay_id: barangayId,
      created_by: actorUser.id,
      reconnection_id: reconnection.reconnection_id,
    })

    if (!joResult.success) {
      await supabase.from('reconnection_charges').delete().eq('reconnection_id', reconnection.reconnection_id)
      await supabase.from('reconnections').delete().eq('reconnection_id', reconnection.reconnection_id)
      return { status: 'error', message: joResult.error ?? 'Failed to create job order for reconnection' }
    }

    await createAuditLog(
      actorUser.id,
      'CREATE',
      `Created reconnection ${reconnectionNo} (total ₱${totalAmount.toFixed(2)}${isZeroBalance ? ', auto-marked paid' : ''})`,
      'reconnections',
      reconnection.reconnection_id
    )

    return { status: 'success', data: reconnection, job_order_id: joResult.job_order_id }
  } catch (error) {
    console.error('Error creating reconnection:', error)
    return { status: 'error', message: 'Failed to create reconnection' }
  }
}

// =====================
// UPDATE RECONNECTION (Pending only)
// A total of 0 is allowed and results in a "paid" payment status.
// =====================
export async function updateReconnection(payload: {
  reconnection_id: string
  outstanding_balance: number
  charges: ReconnectionChargeInput[]
  meter_status_update?: MeterStatusUpdateInput
}) {
  const supabase = await createClient()

  try {
    if (!payload.reconnection_id) {
      return { status: 'error', message: 'No reconnection specified' }
    }

    if (payload.meter_status_update) {
      if (!payload.meter_status_update.meter_id) {
        return { status: 'error', message: 'Invalid meter selection' }
      }
      if (!['activate', 'replace'].includes(payload.meter_status_update.action)) {
        return { status: 'error', message: 'Invalid meter status action. Please select Activate or Replace.' }
      }
    }

    const seenTypes = new Set<string>()
    for (const c of payload.charges) {
      if (seenTypes.has(c.charge_type_id)) {
        return { status: 'error', message: 'Duplicate charge type detected — each charge type can only be added once' }
      }
      seenTypes.add(c.charge_type_id)
    }

    const { data: { user: actorUser } } = await supabase.auth.getUser()
    if (!actorUser) {
      return { status: 'error', message: 'User not authenticated' }
    }

    const { data: current, error: currentError } = await supabase
      .from('reconnections')
      .select(`
        reconnection_no,
        disconnection_id,
        payment_status:payment_status_id ( billing_status_name ),
        reconnection_status:reconnection_status_id ( status_name ),
        disconnections:disconnection_id ( is_voluntary )
      `)
      .eq('reconnection_id', payload.reconnection_id)
      .single()

    if (currentError || !current) {
      return { status: 'error', message: 'Reconnection not found' }
    }

    const statusName = (current as any).reconnection_status?.status_name ?? ''
    if (statusName !== 'Pending') {
      return { status: 'error', message: 'Only pending reconnections can be edited' }
    }

    // Same Reconnection Fee <-> voluntary/involuntary gating as create,
    // re-validated here since the charge set can be changed on edit too.
    const isVoluntary = (current as any).disconnections?.is_voluntary ?? false
    const reconnectionFeeTypeId = await getChargeTypeIdByName(supabase, 'Reconnection Fee')
    const hasReconnectionFeeCharge = reconnectionFeeTypeId
      ? payload.charges.some(c => c.charge_type_id === reconnectionFeeTypeId && Number(c.amount) > 0)
      : false

    if (isVoluntary && hasReconnectionFeeCharge) {
      return { status: 'error', message: 'Reconnection Fee does not apply to voluntary disconnections' }
    }
    if (!isVoluntary && !hasReconnectionFeeCharge) {
      return { status: 'error', message: 'Reconnection Fee is required for involuntary disconnections' }
    }

    const outstandingBalance = Number(payload.outstanding_balance) || 0
    const chargesTotal = payload.charges.reduce((sum, c) => sum + (Number(c.amount) || 0), 0)
    const newTotal = parseFloat((outstandingBalance + chargesTotal).toFixed(2))

    if (newTotal < 0) {
      return { status: 'error', message: 'Total amount cannot be negative' }
    }

    const { data: paymentRows } = await supabase
      .from('reconnection_payments')
      .select('amount_paid')
      .eq('reconnection_id', payload.reconnection_id)

    const paidSoFar = (paymentRows || []).reduce((sum, p: any) => sum + (Number(p.amount_paid) || 0), 0)

    if (paidSoFar > newTotal + 0.01) {
      return {
        status: 'error',
        message: `New total (₱${newTotal.toFixed(2)}) is less than the ₱${paidSoFar.toFixed(2)} already paid`,
      }
    }

    const newRemaining = Math.max(0, parseFloat((newTotal - paidSoFar).toFixed(2)))

    const updateData: any = {
      outstanding_balance: outstandingBalance,
      total_amount: newTotal,
      remaining_balance: newRemaining,
      updated_at: new Date().toISOString(),
    }

    // A zero total (nothing paid, nothing owed) satisfies paidSoFar >= newTotal,
    // so it resolves to "paid" here automatically.
    const currentPaymentStatusName = (current as any).payment_status?.billing_status_name ?? 'unpaid'
    if (currentPaymentStatusName !== 'forwarded') {
      let nextPaymentStatusName: 'unpaid' | 'partial' | 'paid' = 'unpaid'
      if (paidSoFar >= newTotal - 0.01) nextPaymentStatusName = 'paid'
      else if (paidSoFar > 0) nextPaymentStatusName = 'partial'

      const { data: paymentStatus } = await supabase
        .from('billing_status')
        .select('billing_status_id')
        .eq('billing_status_name', nextPaymentStatusName)
        .single()

      if (paymentStatus) {
        updateData.payment_status_id = paymentStatus.billing_status_id
      }
    }

    // Before replacing charge rows, work out which installments were
    // forwarded under the OLD charge set vs the NEW one the user submitted.
    // If the user removed the forwarded-installment row during edit, that
    // installment needs to go back to PAUSED (same as a cancellation would).
    const oldForwardedIds = new Set(await getForwardedInstallmentIds(supabase, payload.reconnection_id))
    const newForwardedIds = new Set(
      payload.charges.filter(c => c.source_installment_id).map(c => c.source_installment_id as string)
    )
    const droppedInstallmentIds = [...oldForwardedIds].filter(id => !newForwardedIds.has(id))

    const { error: updateError } = await supabase
      .from('reconnections')
      .update(updateData)
      .eq('reconnection_id', payload.reconnection_id)

    if (updateError) throw updateError

    const { error: deleteError } = await supabase
      .from('reconnection_charges')
      .delete()
      .eq('reconnection_id', payload.reconnection_id)

    if (deleteError) throw deleteError

    const chargeRows = payload.charges
      .filter(c => Number(c.amount) > 0)
      .map(c => ({
        reconnection_id: payload.reconnection_id,
        charge_type_id: c.charge_type_id,
        amount: c.amount,
        source_installment_id: c.source_installment_id ?? null,
      }))

    if (chargeRows.length > 0) {
      const { error: insertError } = await supabase.from('reconnection_charges').insert(chargeRows)
      if (insertError) throw insertError
    }

    if (droppedInstallmentIds.length > 0) {
      const pausedStatusId = await getInstallmentStatusIdByName(supabase, 'PAUSED')
      const forwardedStatusId = await getInstallmentStatusIdByName(supabase, 'FORWARDED')
      if (pausedStatusId) {
        await supabase
          .from('meter_installments')
          .update({ status_id: pausedStatusId, updated_at: new Date().toISOString() })
          .in('installment_id', droppedInstallmentIds)
          .eq('status_id', forwardedStatusId)
      }
    }

    if (payload.meter_status_update) {
      const targetName = payload.meter_status_update.action === 'activate' ? 'Active' : 'Replacing'
      const statusId = await getMeterStatusIdByName(supabase, targetName)

      if (statusId) {
        const { error: meterUpdateError } = await supabase
          .from('meters')
          .update({ meter_status_id: statusId, updated_at: new Date().toISOString() })
          .eq('meter_id', payload.meter_status_update.meter_id)

        if (meterUpdateError) {
          console.error('Error updating meter status:', meterUpdateError)
        }
      } else {
        console.error(`Meter status "${targetName}" is not configured`)
      }
    }

    // If this edit brought the reconnection to fully paid (including a
    // zero total), finalize any forwarded installment still in the charge set.
    if (newRemaining <= 0.01) {
      await finalizeForwardedInstallments(supabase, payload.reconnection_id)
    }

    await createAuditLog(
      actorUser.id,
      'UPDATE',
      `Updated reconnection ${current.reconnection_no ?? ''} (new total ₱${newTotal.toFixed(2)})`,
      'reconnections',
      payload.reconnection_id
    )

    return { status: 'success' }
  } catch (error) {
    console.error('Error updating reconnection:', error)
    return { status: 'error', message: 'Failed to update reconnection' }
  }
}

// =====================
// LIST RECONNECTIONS
// =====================

export async function getAllReconnections(): Promise<ReconnectionListItem[]> {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from('reconnections')
      .select(`
        reconnection_id,
        reconnection_no,
        disconnection_id,
        outstanding_balance,
        total_amount,
        remaining_balance,
        created_at,
        reconnection_status:reconnection_status_id ( 
          reconnection_status_id, 
          status_name 
        ),
        payment_status:payment_status_id ( 
          billing_status_id, 
          billing_status_name 
        ),
        disconnections:disconnection_id (
          is_voluntary,
          meter_accounts:meter_account_id (
            consumers:consumer_id ( account_name ),
            zone:zone_id (
              zone_name,
              barangay:barangay_id ( barangay_name )
            )
          )
        )
      `)
      .order('created_at', { ascending: false })

    if (error) throw error

    return (data || []).map((row: any) => {
      const ma = row.disconnections?.meter_accounts
      const consumer = ma?.consumers
      return {
        reconnection_id: row.reconnection_id,
        reconnection_no: row.reconnection_no,
        disconnection_id: row.disconnection_id,
        meter_serial_no: ma?.meter_serial_no ?? '',
        consumer_name: consumer?.account_name ?? 'Unknown Consumer',
        zone_name: ma?.zone?.zone_name ?? '',
        barangay_name: ma?.zone?.barangay?.barangay_name ?? '',
        is_voluntary: row.disconnections?.is_voluntary ?? false,
        outstanding_balance: Number(row.outstanding_balance) || 0,
        total_amount: Number(row.total_amount) || 0,
        remaining_balance: Number(row.remaining_balance) || 0,
        payment_status_id: row.payment_status?.billing_status_id ?? '',
        payment_status_name: row.payment_status?.billing_status_name ?? '',
        reconnection_status_id: row.reconnection_status?.reconnection_status_id ?? '',
        reconnection_status_name: row.reconnection_status?.status_name ?? '',
        created_at: row.created_at,
      }
    })
  } catch (error) {
    console.error('Error fetching reconnections:', error)
    throw new Error('Failed to fetch reconnections')
  }
}

// =====================
// UPDATE STATUS
// =====================

export async function updateReconnectionStatus(
  reconnectionId: string,
  statusName: 'Pending' | 'Reconnected' | 'Cancelled'
) {
  const supabase = await createClient()

  try {
    const { data: status, error: statusError } = await supabase
      .from('reconnection_status')
      .select('reconnection_status_id')
      .eq('status_name', statusName)
      .single()

    if (statusError || !status) {
      return { status: 'error', message: `Status "${statusName}" is not configured` }
    }

    const { data: { user: actorUser } } = await supabase.auth.getUser()
    if (!actorUser) {
      return { status: 'error', message: 'User not authenticated' }
    }

    const updateData: any = { 
      reconnection_status_id: status.reconnection_status_id, 
      updated_at: new Date().toISOString() 
    }

    if (statusName === 'Reconnected') {
      const { data: paidStatus } = await supabase
        .from('billing_status')
        .select('billing_status_id')
        .eq('billing_status_name', 'paid')
        .single()

      if (paidStatus) {
        updateData.payment_status_id = paidStatus.billing_status_id
        updateData.remaining_balance = 0
      }
    }

    const { data, error } = await supabase
      .from('reconnections')
      .update(updateData)
      .eq('reconnection_id', reconnectionId)
      .select()
      .single()

    if (error) throw error

    // If this reconnection carried a forwarded installment balance and it
    // is being cancelled before that balance was ever collected, send the
    // installment back to PAUSED instead of leaving its balance stranded.
    // If it becomes Reconnected, finalize any forwarded installment that
    // wasn't already closed out through a payment (e.g. staff jumped
    // straight to Reconnected without going through processReconnectionPayment).
    //
    // The linked job order is kept in sync the same way: Cancelled mirrors
    // to the job order's Cancelled status, Reconnected mirrors to Completed.
    //
    // On Cancelled we also revert the account's current meter back to
    // "Disconnected" — cancelling undoes the activate/replace action taken
    // at create time, and otherwise the meter would be stranded in
    // Active/Replacing with no live reconnection to justify it.
    if (statusName === 'Cancelled') {
      await revertForwardedInstallments(supabase, reconnectionId)

      // Resolve the meter account behind this reconnection, then revert
      // its latest meter back to "Disconnected".
      const { data: reconRow } = await supabase
        .from('reconnections')
        .select(`
          disconnections:disconnection_id ( meter_account_id )
        `)
        .eq('reconnection_id', reconnectionId)
        .single()

      const meterAccountId = getFirst((reconRow as any)?.disconnections)?.meter_account_id

      if (meterAccountId) {
        const disconnectedStatusId = await getMeterStatusIdByName(supabase, 'Disconnected')

        if (disconnectedStatusId) {
          const { data: currentMeter } = await supabase
            .from('meters')
            .select('meter_id')
            .eq('meter_account_id', meterAccountId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (currentMeter?.meter_id) {
            const { error: meterRevertError } = await supabase
              .from('meters')
              .update({
                meter_status_id: disconnectedStatusId,
                updated_at: new Date().toISOString(),
              })
              .eq('meter_id', currentMeter.meter_id)

            if (meterRevertError) {
              console.error('Error reverting meter status to Disconnected:', meterRevertError)
            }
          } else {
            console.error('No current meter found when cancelling reconnection', reconnectionId)
          }
        } else {
          console.error('Meter status "Disconnected" is not configured')
        }
      } else {
        console.error('Could not resolve meter account when cancelling reconnection', reconnectionId)
      }

      const jo = await findJobOrderForReconnection(supabase, reconnectionId)
      if (jo) {
        const cancelledJoStatusId = await getJobOrderStatusId(supabase, 'Cancelled')
        if (cancelledJoStatusId) {
          await supabase
            .from('job_orders')
            .update({ job_status_id: cancelledJoStatusId, updated_at: new Date().toISOString() })
            .eq('job_order_id', jo.job_order_id)
        }
      }
    } else if (statusName === 'Reconnected') {
      await finalizeForwardedInstallments(supabase, reconnectionId)

      const jo = await findJobOrderForReconnection(supabase, reconnectionId)
      if (jo) {
        const completedJoStatusId = await getJobOrderStatusId(supabase, 'Completed')
        if (completedJoStatusId) {
          await supabase
            .from('job_orders')
            .update({
              job_status_id: completedJoStatusId,
              completion_date: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('job_order_id', jo.job_order_id)
        }
      }
    }

    await createAuditLog(
      actorUser.id,
      'STATUS_CHANGE',
      `Updated reconnection ${data.reconnection_no} status to ${statusName}`,
      'reconnections',
      reconnectionId
    )

    return { status: 'success', data }
  } catch (error) {
    console.error('Error updating reconnection status:', error)
    return { status: 'error', message: 'Failed to update reconnection status' }
  }
}

// =====================
// UPDATE PAYMENT STATUS
// =====================

export async function updateReconnectionPaymentStatus(
  reconnectionId: string,
  paymentStatusName: 'unpaid' | 'partial' | 'paid' | 'forwarded'
) {
  const supabase = await createClient()

  try {
    const { data: status, error: statusError } = await supabase
      .from('billing_status')
      .select('billing_status_id')
      .eq('billing_status_name', paymentStatusName)
      .single()

    if (statusError || !status) {
      return { status: 'error', message: `Payment status "${paymentStatusName}" is not configured` }
    }

    const { data: { user: actorUser } } = await supabase.auth.getUser()
    if (!actorUser) {
      return { status: 'error', message: 'User not authenticated' }
    }

    const { data: reconnection, error: fetchError } = await supabase
      .from('reconnections')
      .select('reconnection_no')
      .eq('reconnection_id', reconnectionId)
      .single()

    if (fetchError || !reconnection) {
      return { status: 'error', message: 'Reconnection not found' }
    }

    const updateData: any = {
      payment_status_id: status.billing_status_id,
      updated_at: new Date().toISOString()
    }

    if (paymentStatusName === 'paid' || paymentStatusName === 'forwarded') {
      updateData.remaining_balance = 0
    }

    const { data, error } = await supabase
      .from('reconnections')
      .update(updateData)
      .eq('reconnection_id', reconnectionId)
      .select()
      .single()

    if (error) throw error

    // Manually marking paid/forwarded is, in effect, declaring the balance
    // collected — so finalize any forwarded installment the same way a real
    // payment would.
    if (paymentStatusName === 'paid' || paymentStatusName === 'forwarded') {
      await finalizeForwardedInstallments(supabase, reconnectionId)
    }

    await createAuditLog(
      actorUser.id,
      'PAYMENT_STATUS_CHANGE',
      `Updated reconnection ${reconnection.reconnection_no} payment status to ${paymentStatusName}`,
      'reconnections',
      reconnectionId
    )

    return { status: 'success', data }
  } catch (error) {
    console.error('Error updating reconnection payment status:', error)
    return { status: 'error', message: 'Failed to update payment status' }
  }
}

// =====================
// PROCESS RECONNECTION PAYMENT
// =====================

export interface ReconnectionPaymentInput {
  reconnection_id: string
  amount_paid: number
  receipt_number?: string
}

export async function processReconnectionPayment(payload: ReconnectionPaymentInput) {
  const supabase = await createClient()

  try {
    const { data: { user: actorUser } } = await supabase.auth.getUser()
    if (!actorUser) {
      return { status: 'error', message: 'User not authenticated' }
    }

    if (payload.amount_paid <= 0) {
      return { status: 'error', message: 'Amount must be greater than zero' }
    }

    const { data: reconnection, error: recErr } = await supabase
      .from('reconnections')
      .select(`
        reconnection_id,
        reconnection_no,
        remaining_balance,
        payment_status_id,
        reconnection_status_id
      `)
      .eq('reconnection_id', payload.reconnection_id)
      .single()

    if (recErr || !reconnection) {
      return { status: 'error', message: 'Reconnection record not found' }
    }

    const currentRemaining = Number(reconnection.remaining_balance)

    if (currentRemaining <= 0) {
      return { status: 'error', message: 'This reconnection has already been fully paid' }
    }

    if (payload.amount_paid > currentRemaining + 0.01) {
      return {
        status: 'error',
        message: `Amount exceeds remaining balance of ₱${currentRemaining.toFixed(2)}`,
      }
    }

    const { data: paymentType } = await supabase
      .from('payment_type')
      .select('payment_type_id')
      .eq('payment_type_name', 'reconnection')
      .single()

    if (!paymentType) {
      return { status: 'error', message: 'Payment type "reconnection" not found' }
    }

    let receiptNumber = payload.receipt_number
    if (!receiptNumber) {
      const year = new Date().getFullYear()
      const random = Math.floor(10000 + Math.random() * 90000)
      receiptNumber = `OR-${year}-${random}`

      const { data: existingReceipt } = await supabase
        .from('payments')
        .select('payment_id')
        .eq('receipt_number', receiptNumber)
        .maybeSingle()

      if (existingReceipt) {
        const newRandom = Math.floor(10000 + Math.random() * 90000)
        receiptNumber = `OR-${year}-${newRandom}`
      }
    }

    const { data: paymentRow, error: paymentErr } = await supabase
      .from('payments')
      .insert({
        receipt_number: receiptNumber,
        payment_type_id: paymentType.payment_type_id,
        payment_date: new Date().toISOString().split('T')[0],
        recieved_by: actorUser.id,
      })
      .select('payment_id, receipt_number')
      .single()

    if (paymentErr || !paymentRow) {
      console.error('[processReconnectionPayment] payment insert error:', paymentErr)
      throw paymentErr ?? new Error('Failed to create payment record')
    }

    const { data: reconnectionPaymentRow, error: insertErr } = await supabase
      .from('reconnection_payments')
      .insert({
        reconnection_id: payload.reconnection_id,
        payment_id: paymentRow.payment_id,
        amount_paid: payload.amount_paid,
      })
      .select('reconnection_payment_id')
      .single()

    if (insertErr || !reconnectionPaymentRow) {
      console.error('[processReconnectionPayment] reconnection_payments insert error:', insertErr)
      throw insertErr ?? new Error('Failed to link reconnection payment')
    }

    const newRemaining = parseFloat((currentRemaining - payload.amount_paid).toFixed(2))
    const isFullyPaid = newRemaining <= 0.01
    const newPaymentStatusName = isFullyPaid ? 'paid' : 'partial'

    const { data: newPaymentStatus } = await supabase
      .from('billing_status')
      .select('billing_status_id')
      .eq('billing_status_name', newPaymentStatusName)
      .single()

    const updateData: any = {
      remaining_balance: isFullyPaid ? 0 : newRemaining,
      payment_status_id: newPaymentStatus?.billing_status_id,
      updated_at: new Date().toISOString(),
    }

    const { error: updateErr } = await supabase
      .from('reconnections')
      .update(updateData)
      .eq('reconnection_id', payload.reconnection_id)

    if (updateErr) {
      console.error('[processReconnectionPayment] reconnection update error:', updateErr)
      throw updateErr
    }

    // Only finalize the forwarded installment once the reconnection is
    // genuinely fully paid — a partial payment does NOT close it out.
    if (isFullyPaid) {
      await finalizeForwardedInstallments(supabase, payload.reconnection_id)
    }

    await createAuditLog(
      actorUser.id,
      'PAYMENT',
      `Processed payment of ₱${payload.amount_paid.toFixed(2)} for reconnection ${reconnection.reconnection_no}`,
      'reconnections',
      payload.reconnection_id
    )

    return {
      status: 'success',
      data: {
        reconnection_payment_id: reconnectionPaymentRow.reconnection_payment_id,
        receipt_number: paymentRow.receipt_number,
        amount_paid: payload.amount_paid,
        is_fully_paid: isFullyPaid,
        remaining_balance: isFullyPaid ? 0 : newRemaining,
        payment_status: newPaymentStatusName,
      },
    }
  } catch (err: any) {
    console.error('[processReconnectionPayment]', err)
    return { status: 'error', message: err?.message ?? 'Failed to process reconnection payment' }
  }
}

// =====================
// RECONNECTION DETAILS (for View modal)
// =====================

export interface ReconnectionChargeDetail {
  reconnection_charge_id: string
  charge_type_id: string
  charge_name: string
  amount: number
}

export interface ReconnectionPaymentDetail {
  reconnection_payment_id: string
  receipt_number: string
  amount_paid: number
  payment_date: string
}

export interface ReconnectionDetails extends ReconnectionListItem {
  requested_date: string | null
  disconnected_at: string | null
  charges: ReconnectionChargeDetail[]
  payments: ReconnectionPaymentDetail[]
}

export async function getReconnectionDetails(
  reconnectionId: string
): Promise<{ success: boolean; data?: ReconnectionDetails; error?: string }> {
  const supabase = await createClient()

  try {
    const { data: row, error } = await supabase
      .from('reconnections')
      .select(`
        reconnection_id,
        reconnection_no,
        disconnection_id,
        outstanding_balance,
        total_amount,
        remaining_balance,
        created_at,
        reconnection_status:reconnection_status_id (
          reconnection_status_id,
          status_name
        ),
        payment_status:payment_status_id (
          billing_status_id,
          billing_status_name
        ),
        disconnections:disconnection_id (
          is_voluntary,
          requested_date,
          disconnected_at,
          meter_accounts:meter_account_id (
            consumers:consumer_id ( account_name ),
            zone:zone_id (
              zone_name,
              barangay:barangay_id ( barangay_name )
            )
          )
        )
      `)
      .eq('reconnection_id', reconnectionId)
      .single()

    if (error || !row) {
      return { success: false, error: 'Reconnection not found' }
    }

    const { data: chargeRows } = await supabase
      .from('reconnection_charges')
      .select(`
        reconnection_charge_id,
        amount,
        charge_type:charge_type_id ( charge_type_id, charge_name )
      `)
      .eq('reconnection_id', reconnectionId)

    const { data: paymentRows } = await supabase
      .from('reconnection_payments')
      .select(`
        reconnection_payment_id,
        amount_paid,
        payment:payment_id ( receipt_number, payment_date )
      `)
      .eq('reconnection_id', reconnectionId)
      .order('reconnection_payment_id', { ascending: true })

    const ma = (row as any).disconnections?.meter_accounts
    const consumer = ma?.consumers

    const details: ReconnectionDetails = {
      reconnection_id: row.reconnection_id,
      reconnection_no: row.reconnection_no,
      disconnection_id: row.disconnection_id,
      meter_serial_no: ma?.meter_serial_no ?? '',
      consumer_name: consumer?.account_name ?? 'Unknown Consumer',
      zone_name: ma?.zone?.zone_name ?? '',
      barangay_name: ma?.zone?.barangay?.barangay_name ?? '',
      is_voluntary: (row as any).disconnections?.is_voluntary ?? false,
      outstanding_balance: Number(row.outstanding_balance) || 0,
      total_amount: Number(row.total_amount) || 0,
      remaining_balance: Number(row.remaining_balance) || 0,
      payment_status_id: (row as any).payment_status?.billing_status_id ?? '',
      payment_status_name: (row as any).payment_status?.billing_status_name ?? '',
      reconnection_status_id: (row as any).reconnection_status?.reconnection_status_id ?? '',
      reconnection_status_name: (row as any).reconnection_status?.status_name ?? '',
      created_at: row.created_at,
      requested_date: (row as any).disconnections?.requested_date ?? null,
      disconnected_at: (row as any).disconnections?.disconnected_at ?? null,
      charges: (chargeRows || []).map((c: any) => ({
        reconnection_charge_id: c.reconnection_charge_id,
        charge_type_id: c.charge_type?.charge_type_id ?? '',
        charge_name: c.charge_type?.charge_name ?? 'Charge',
        amount: Number(c.amount) || 0,
      })),
      payments: (paymentRows || []).map((p: any) => ({
        reconnection_payment_id: p.reconnection_payment_id,
        receipt_number: p.payment?.receipt_number ?? '',
        amount_paid: Number(p.amount_paid) || 0,
        payment_date: p.payment?.payment_date ?? '',
      })),
    }

    return { success: true, data: details }
  } catch (err) {
    console.error('Error fetching reconnection details:', err)
    return { success: false, error: 'Failed to fetch reconnection details' }
  }
}

// ============================================================
// EDIT RECONNECTION (Pending only)
// ============================================================

export interface ReconnectionEditCharge {
  row_id: string
  charge_type_id: string
  amount: string
  is_default?: boolean
  source_installment_id?: string
}

export interface ReconnectionEditDetails {
  reconnection_id: string
  reconnection_no: string
  disconnection_id: string
  meter_account_id: string
  meter_serial_no: string | null
  consumer_name: string
  zone_name: string
  barangay_name: string
  is_voluntary: boolean
  outstanding_balance: number
  reconnection_status_name: string
  charges: ReconnectionEditCharge[]
}

export async function getReconnectionForEdit(
  reconnectionId: string
): Promise<{ success: boolean; data?: ReconnectionEditDetails; error?: string }> {
  const supabase = await createClient()

  try {
    const { data: row, error } = await supabase
      .from('reconnections')
      .select(`
        reconnection_id,
        reconnection_no,
        disconnection_id,
        outstanding_balance,
        reconnection_status:reconnection_status_id ( status_name ),
        disconnections:disconnection_id (
          is_voluntary,
          meter_accounts:meter_account_id (
            meter_account_id,
            consumers:consumer_id ( account_name ),
            zone:zone_id (
              zone_name,
              barangay:barangay_id ( barangay_name )
            )
          )
        )
      `)
      .eq('reconnection_id', reconnectionId)
      .single()

    if (error || !row) {
      return { success: false, error: 'Reconnection not found' }
    }

    const statusName = (row as any).reconnection_status?.status_name ?? ''
    if (statusName !== 'Pending') {
      return { success: false, error: 'Only pending reconnections can be edited' }
    }

    const { data: chargeRows } = await supabase
      .from('reconnection_charges')
      .select(`
        reconnection_charge_id,
        amount,
        source_installment_id,
        charge_type:charge_type_id ( charge_type_id, charge_name )
      `)
      .eq('reconnection_id', reconnectionId)

    const ma = (row as any).disconnections?.meter_accounts
    const consumer = ma?.consumers

    // FIX: a row is "default/locked" if it's the Reconnection Fee OR it
    // carries a source_installment_id (the forwarded installment balance).
    // Previously only the fee name was checked, so the forwarded balance
    // row could be edited/deleted like a normal charge — that desyncs it
    // from the installment record it's tied to.
    const charges: ReconnectionEditCharge[] = (chargeRows || []).map((c: any) => ({
      row_id: c.reconnection_charge_id,
      charge_type_id: c.charge_type?.charge_type_id ?? '',
      amount: String(Number(c.amount) || 0),
      is_default: c.charge_type?.charge_name === 'Reconnection Fee' || !!c.source_installment_id,
      source_installment_id: c.source_installment_id ?? undefined,
    }))

    return {
      success: true,
      data: {
        reconnection_id: row.reconnection_id,
        reconnection_no: row.reconnection_no,
        disconnection_id: row.disconnection_id,
        meter_account_id: ma?.meter_account_id ?? '',
        meter_serial_no: ma?.meter_serial_no ?? '',
        consumer_name: consumer?.account_name ?? 'Unknown Consumer',
        zone_name: ma?.zone?.zone_name ?? '',
        barangay_name: ma?.zone?.barangay?.barangay_name ?? '',
        is_voluntary: (row as any).disconnections?.is_voluntary ?? false,
        outstanding_balance: Number(row.outstanding_balance) || 0,
        reconnection_status_name: statusName,
        charges,
      },
    }
  } catch (err) {
    console.error('Error fetching reconnection for edit:', err)
    return { success: false, error: 'Failed to fetch reconnection' }
  }
}

async function getCurrentMeterIdForAccount(
  supabase: any,
  meterAccountId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('meters')
    .select('meter_id')
    .eq('meter_account_id', meterAccountId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  return data.meter_id
}