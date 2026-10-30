'use server'

import { createClient } from '@/lib/supabase/server'
import { createAuditLog } from '../audit.action'
import { revalidatePath } from 'next/cache'

// ============================================================================
// Types
// ============================================================================

export interface MeterTransferRecord {
  transfer_id: string
  meter_account_id: string
  meter_serial_no: string | null
  transfer_type: 'OWNERSHIP' | 'RELOCATION'

  transfer_status_id: string
  transfer_status_name: string

  previous_consumer_id: string | null
  previous_consumer_name: string | null
  new_consumer_id: string | null
  new_consumer_name: string | null
  old_zone_id: string | null
  old_zone_name: string | null
  new_zone_id: string | null
  new_zone_name: string | null
  transfer_reason: string | null
  transferred_by: string
  transferred_by_name: string
  transfer_date: string
}

export interface TransferHistoryItem {
  transfer_id: string
  transfer_type: 'OWNERSHIP' | 'RELOCATION'
  previous_value: string
  new_value: string
  transfer_reason: string | null
  transferred_by: string
  transfer_date: string
}

type ActionResult = { status: 'success' | 'error'; message?: string }

const NEW_ACCOUNT_TRANSFER_MESSAGE =
  'This meter account is new and has no meter reading or billing record yet, so it cannot be transferred.'

const PENDING_TRANSFER_MESSAGE =
  'This meter account already has a pending transfer. Complete or cancel it before creating another one.'

// ════════════════════════════════════════════════════════════════════════════
// Internal helpers
// ════════════════════════════════════════════════════════════════════════════

const unwrap = <T>(val: T | T[] | null): T | null => {
  if (!val) return null
  return Array.isArray(val) ? (val[0] ?? null) : val
}

function latestMeterSerialFromMeters(meters: unknown): string | null {
  const list = Array.isArray(meters) ? meters : meters ? [meters] : []
  if (!list.length) return null
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

// Strip characters that have special meaning inside a PostgREST `.or()`
// filter string, so user input can't break out of the ilike pattern.
const sanitizeFilterTerm = (term: string) => term.replace(/[,()]/g, ' ').trim()

// A meter account is "established" once it has at least one actual meter
// reading or at least one billing record. Totally new accounts have neither.
async function hasReadingOrBillingHistory(
  supabase: any,
  meterAccountId: string,
): Promise<boolean> {
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

// A meter account may only have ONE pending transfer at a time. Any new
// transfer (ownership or relocation) is blocked while one is still pending.
async function hasPendingTransfer(
  supabase: any,
  meterAccountId: string,
): Promise<boolean> {
  const { data: pendingStatus, error: statusErr } = await supabase
    .from('transfer_status')
    .select('transfer_status_id')
    .eq('status_name', 'Pending')
    .single()

  if (statusErr || !pendingStatus) {
    throw new Error('Transfer status "Pending" is not configured')
  }

  const { count, error } = await supabase
    .from('meter_transfers')
    .select('transfer_id', { count: 'exact', head: true })
    .eq('meter_account_id', meterAccountId)
    .eq('transfer_status_id', pendingStatus.transfer_status_id)

  if (error) throw error
  return (count ?? 0) > 0
}

const TRANSFER_SELECT = `
  transfer_id,
  meter_account_id,
  transfer_type,
  previous_consumer_id,
  new_consumer_id,
  old_zone_id,
  new_zone_id,
  transfer_reason,
  transferred_by,
  transfer_date,
  transfer_status_id,
  transfer_status:transfer_status_id (
    transfer_status_id,
    status_name
  ),
  meter_account:meter_account_id (
  ),
  previous_consumer:previous_consumer_id (
    consumer_id,
    account_name
  ),
  new_consumer:new_consumer_id (
    consumer_id,
    account_name
  ),
  old_zone:old_zone_id (
    zone_id,
    zone_name,
    barangay:barangay_id (
      barangay_name
    )
  ),
  new_zone:new_zone_id (
    zone_id,
    zone_name,
    barangay:barangay_id (
      barangay_name
    )
  ),
  transferred_by_user:transferred_by (
    user_id,
    first_name,
    last_name
  )
`

function mapTransferRow(row: any): MeterTransferRecord {
  const meterAccount = unwrap(row.meter_account)
  const prevConsumer = unwrap(row.previous_consumer)
  const newConsumer = unwrap(row.new_consumer)
  const oldZone = unwrap(row.old_zone)
  const newZone = unwrap(row.new_zone)
  const transferredByUser = unwrap(row.transferred_by_user)
  const transferStatus = unwrap(row.transfer_status)

  const oldZoneName = oldZone
    ? `Zone ${oldZone.zone_name}, ${oldZone.barangay?.barangay_name || ''}`
    : null
  const newZoneName = newZone
    ? `Zone ${newZone.zone_name}, ${newZone.barangay?.barangay_name || ''}`
    : null

  return {
    transfer_id: row.transfer_id,
    meter_account_id: row.meter_account_id,
    meter_serial_no: meterAccount?.meter_serial_no ?? '',
    transfer_type: row.transfer_type,
    transfer_status_id: row.transfer_status_id,
    transfer_status_name: transferStatus?.status_name ?? 'Pending',
    previous_consumer_id: row.previous_consumer_id,
    previous_consumer_name: prevConsumer?.account_name ?? null,
    new_consumer_id: row.new_consumer_id,
    new_consumer_name: newConsumer?.account_name ?? null,
    old_zone_id: row.old_zone_id,
    old_zone_name: oldZoneName,
    new_zone_id: row.new_zone_id,
    new_zone_name: newZoneName,
    transfer_reason: row.transfer_reason,
    transferred_by: row.transferred_by,
    transferred_by_name: transferredByUser
      ? `${transferredByUser.first_name} ${transferredByUser.last_name}`
      : 'Unknown',
    transfer_date: row.transfer_date,
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Lookups
// ════════════════════════════════════════════════════════════════════════════

export async function getAllBarangaysForSelect(): Promise<{ barangay_id: string; barangay_name: string }[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('barangay')
    .select('barangay_id, barangay_name')
    .eq('is_active', true)
    .order('barangay_name', { ascending: true })

  if (error) { console.error('[getAllBarangaysForSelect]', error); return [] }
  return data ?? []
}

export async function getZonesByBarangay(barangayId: string): Promise<{ zone_id: string; zone_name: string }[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('zone')
    .select('zone_id, zone_name')
    .eq('barangay_id', barangayId)
    .eq('is_active', true)
    .order('zone_name', { ascending: true })

  if (error) { console.error('[getZonesByBarangay]', error); return [] }
  return data ?? []
}

export async function searchConsumers(
  query: string,
  limit = 10,
  excludeConsumerId?: string
): Promise<{ consumer_id: string; label: string }[]> {
  const supabase = await createClient()

  const trimmed = query.trim()
  if (!trimmed) return []

  let q = supabase
    .from('consumers')
    .select('consumer_id, account_name')
    .or('is_active.eq.true,is_active.is.null')
    .ilike('account_name', `%${trimmed}%`)
    .order('account_name', { ascending: true })
    .limit(limit)

  if (excludeConsumerId) q = q.neq('consumer_id', excludeConsumerId)

  const { data, error } = await q
  if (error) { console.error('[searchConsumers]', error); return [] }
  return (data ?? []).map((c) => ({ consumer_id: c.consumer_id, label: c.account_name }))
}

export async function searchMeterAccounts(
  query: string,
  limit = 10
): Promise<{ meter_account_id: string; label: string }[]> {
  const supabase = await createClient()

  const trimmed = query.trim()
  if (!trimmed) return []

  const { data: matchingConsumers, error: consumerErr } = await supabase
    .from('consumers')
    .select('consumer_id')
    .ilike('account_name', `%${trimmed}%`)

  if (consumerErr) { console.error('[searchMeterAccounts:consumers]', consumerErr); return [] }

  const consumerIds = (matchingConsumers ?? []).map((c) => c.consumer_id)

  // The term is interpolated into an `.or()` string, so strip the characters
  // that would otherwise break the filter syntax.
  const safeTerm = sanitizeFilterTerm(trimmed)
  if (!safeTerm && consumerIds.length === 0) return []

  const filters: string[] = []
  if (safeTerm) filters.push(`meters.meter_serial_no.ilike.%${safeTerm}%`)
  if (consumerIds.length > 0) filters.push(`consumer_id.in.(${consumerIds.join(',')})`)

  const { data, error } = await supabase
    .from('meter_accounts')
    .select(`
      meter_account_id,
      consumer:consumer_id ( account_name, contract_no ),
      meters ( meter_serial_no, created_at )
    `)
    .or(filters.join(','))
    .limit(limit)

  if (error) { console.error('[searchMeterAccounts]', error); return [] }

  return (data ?? []).map((row: any) => {
    const consumer = unwrap(row.consumer)
    const serial = latestMeterSerialFromMeters(row.meters) ?? '—'
    return {
      meter_account_id: row.meter_account_id,
      label: consumer?.account_name
        ? `${serial} — ${consumer.account_name}`
        : serial,
    }
  })
}

// Lets the transfer form warn the user as soon as a meter account is picked.
// transferMeterAccount() enforces the same rules on the server regardless.
export async function checkMeterAccountTransferable(
  meterAccountId: string,
): Promise<{ transferable: boolean; message?: string }> {
  const supabase = await createClient()
  try {
    const hasHistory = await hasReadingOrBillingHistory(supabase, meterAccountId)
    if (!hasHistory) {
      return { transferable: false, message: NEW_ACCOUNT_TRANSFER_MESSAGE }
    }

    const hasPending = await hasPendingTransfer(supabase, meterAccountId)
    if (hasPending) {
      return { transferable: false, message: PENDING_TRANSFER_MESSAGE }
    }

    return { transferable: true }
  } catch (err: any) {
    console.error('[checkMeterAccountTransferable]', err)
    return { transferable: false, message: err?.message ?? 'Failed to validate meter account' }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Transfer history
// ════════════════════════════════════════════════════════════════════════════

export async function getTransferHistoryByMeterAccount(
  meterAccountId: string
): Promise<{ status: 'success' | 'error'; data?: MeterTransferRecord[]; message?: string }> {
  const supabase = await createClient()
  try {
    const { data, error } = await supabase
      .from('meter_transfers')
      .select(TRANSFER_SELECT)
      .eq('meter_account_id', meterAccountId)
      .order('transfer_date', { ascending: false })

    if (error) throw error
    return { status: 'success', data: (data ?? []).map(mapTransferRow) }
  } catch (err: any) {
    console.error('[getTransferHistoryByMeterAccount]', err)
    return { status: 'error', message: err?.message ?? 'Failed to load transfer history' }
  }
}

export async function getTransferHistoryByConsumer(
  consumerId: string
): Promise<{ status: 'success' | 'error'; data?: MeterTransferRecord[]; message?: string }> {
  const supabase = await createClient()
  try {
    const { data, error } = await supabase
      .from('meter_transfers')
      .select(TRANSFER_SELECT)
      .or(`previous_consumer_id.eq.${consumerId},new_consumer_id.eq.${consumerId}`)
      .order('transfer_date', { ascending: false })

    if (error) throw error
    return { status: 'success', data: (data ?? []).map(mapTransferRow) }
  } catch (err: any) {
    console.error('[getTransferHistoryByConsumer]', err)
    return { status: 'error', message: err?.message ?? 'Failed to load transfer history' }
  }
}

export async function getAllMeterTransfers(): Promise<{
  status: 'success' | 'error'
  data?: MeterTransferRecord[]
  message?: string
}> {
  const supabase = await createClient()
  try {
    const { data, error } = await supabase
      .from('meter_transfers')
      .select(TRANSFER_SELECT)
      .order('transfer_date', { ascending: false })

    if (error) throw error
    return { status: 'success', data: (data ?? []).map(mapTransferRow) }
  } catch (err: any) {
    console.error('[getAllMeterTransfers]', err)
    return { status: 'error', message: err?.message ?? 'Failed to load meter transfers' }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Meter account getters
// ════════════════════════════════════════════════════════════════════════════

export async function getMeterAccountById(meterAccountId: string) {
  const supabase = await createClient()
  try {
    const { data, error } = await supabase
      .from('meter_accounts')
      .select(`
        *,
        consumer:consumer_id ( consumer_id, account_name, contact_number, email ),
        zone:zone_id (
          zone_id, zone_name,
          barangay:barangay_id ( barangay_id, barangay_name )
        ),
        classification:classification_id (
          classification_id, classification_name, description, connection_fee
        ),
        meters (
          meter_id, meter_serial_no, meter_status_id,
          meter_status:meter_status_id ( meter_status_id, meter_status_name, description ),
          installation_date, created_at
        )
      `)
      .eq('meter_account_id', meterAccountId)
      .single()

    if (error) throw error
    return data
  } catch (error) {
    console.error('Error fetching meter account:', error)
    return null
  }
}

export async function getMeterAccountsByConsumer(consumerId: string) {
  const supabase = await createClient()
  try {
    const { data, error } = await supabase
      .from('meter_accounts')
      .select(`
        *,
        consumer:consumer_id ( consumer_id, account_name, contact_number, email ),
        zone:zone_id (
          zone_id, zone_name,
          barangay:barangay_id ( barangay_id, barangay_name )
        ),
        classification:classification_id (
          classification_id, classification_name, description, connection_fee
        ),
        meters (
          meter_id, meter_serial_no, meter_status_id,
          meter_status:meter_status_id ( meter_status_id, meter_status_name, description ),
          installation_date, created_at
        )
      `)
      .eq('consumer_id', consumerId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data ?? []
  } catch (error) {
    console.error('[getMeterAccountsByConsumer]', error)
    return []
  }
}

// ════════════════════════════════════════════════════════════════════════════
// CREATE — Transfer meter account
//
// Guards (apply to both transfer types):
//   1. A totally new meter account (no meter reading and no billing
//      record) cannot be transferred.
//   2. A meter account that still has a PENDING transfer cannot start
//      another transfer.
//
// OWNERSHIP  → completes immediately; meter_accounts.consumer_id flips now.
// RELOCATION → creates a Pending transfer AND auto-creates a
//              METER_RELOCATION job order. The assignment flow (which
//              carries its own scheduled_at) picks it up from there.
// ════════════════════════════════════════════════════════════════════════════

export async function transferMeterAccount(
  meterAccountId: string,
  payload: {
    transfer_type: 'OWNERSHIP' | 'RELOCATION'
    new_consumer_id?: string
    new_zone_id?: string
    transfer_reason?: string | null
  }
): Promise<{
  status: 'success' | 'error'
  message?: string
  data?: MeterTransferRecord
  job_order_id?: string
}> {
  const supabase = await createClient()

  try {
    const { data: { user: actorUser }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !actorUser) return { status: 'error', message: 'User not authenticated' }

    const [
      { data: completedStatus },
      { data: pendingStatus },
      { data: pendingJoStatus },
      { data: relocationJobType },
    ] = await Promise.all([
      supabase.from('transfer_status').select('transfer_status_id').eq('status_name', 'Completed').single(),
      supabase.from('transfer_status').select('transfer_status_id').eq('status_name', 'Pending').single(),
      supabase.from('job_order_status').select('job_status_id').eq('job_status_name', 'Pending').single(),
      supabase.from('job_types').select('job_type_id').eq('job_type_code', 'METER_RELOCATION').single(),
    ])

    if (!completedStatus || !pendingStatus) {
      return { status: 'error', message: 'Transfer status "Completed"/"Pending" is not configured' }
    }

    const { data: meterAccount, error: connErr } = await supabase
      .from('meter_accounts')
      .select(`
        meter_account_id,
        consumer_id,
        zone_id,
        consumer:consumer_id ( consumer_id, account_name ),
        zone:zone_id (
          zone_id, zone_name,
          barangay_id,
          barangay:barangay_id ( barangay_name )
        ),
        meters ( meter_serial_no, created_at )
      `)
      .eq('meter_account_id', meterAccountId)
      .single()

    if (connErr || !meterAccount) return { status: 'error', message: 'Meter account not found' }

    // ── Guard 1: totally new accounts cannot be transferred ──────────────
    const hasHistory = await hasReadingOrBillingHistory(supabase, meterAccountId)
    if (!hasHistory) {
      return { status: 'error', message: NEW_ACCOUNT_TRANSFER_MESSAGE }
    }

    // ── Guard 2: no new transfer while one is still pending ──────────────
    const hasPending = await hasPendingTransfer(supabase, meterAccountId)
    if (hasPending) {
      return { status: 'error', message: PENDING_TRANSFER_MESSAGE }
    }

    const consumer = unwrap(meterAccount.consumer)

    // ── OWNERSHIP ────────────────────────────────────────────────────────
    if (payload.transfer_type === 'OWNERSHIP') {
      if (!payload.new_consumer_id) {
        return { status: 'error', message: 'New consumer is required for ownership transfer' }
      }
      if (payload.new_consumer_id === meterAccount.consumer_id) {
        return { status: 'error', message: 'The new consumer is already the owner of this meter account' }
      }

      const { data: newConsumer } = await supabase
        .from('consumers')
        .select('consumer_id, account_name')
        .eq('consumer_id', payload.new_consumer_id)
        .single()
      if (!newConsumer) return { status: 'error', message: 'New consumer not found' }

      const now = new Date().toISOString()

      const { data: transferRow, error: transferErr } = await supabase
        .from('meter_transfers')
        .insert({
          meter_account_id: meterAccountId,
          transfer_type: 'OWNERSHIP',
          previous_consumer_id: meterAccount.consumer_id,
          new_consumer_id: payload.new_consumer_id,
          transfer_reason: payload.transfer_reason || null,
          transferred_by: actorUser.id,
          transfer_date: now,
          transfer_status_id: completedStatus.transfer_status_id,
        })
        .select('transfer_id')
        .single()

      if (transferErr || !transferRow) throw transferErr ?? new Error('Failed to create transfer')

      const { error: updateErr } = await supabase
        .from('meter_accounts')
        .update({ consumer_id: payload.new_consumer_id, updated_at: now })
        .eq('meter_account_id', meterAccountId)

      if (updateErr) {
        // Roll back the transfer record so we never log a "Completed"
        // transfer whose ownership change didn't actually happen.
        await supabase.from('meter_transfers').delete().eq('transfer_id', transferRow.transfer_id)
        throw updateErr
      }

      await createAuditLog(
        actorUser.id,
        'TRANSFER_OWNERSHIP',
        `Transferred meter account ${latestMeterSerialFromMeters(meterAccount.meters) ?? meterAccountId} from ${consumer?.account_name ?? 'Unknown'} to ${newConsumer.account_name}`,
        'meter_accounts',
        meterAccountId,
      )

      revalidatePath(`/admin/meter-accounts/${meterAccountId}`)
      revalidatePath(`/admin/consumers/${meterAccount.consumer_id}`)
      revalidatePath(`/admin/consumers/${payload.new_consumer_id}`)

      return { status: 'success', message: 'Meter account ownership transferred successfully' }
    }

    // ── RELOCATION ───────────────────────────────────────────────────────
    if (payload.transfer_type === 'RELOCATION') {
      if (!payload.new_zone_id) {
        return { status: 'error', message: 'New zone is required for relocation' }
      }
      if (payload.new_zone_id === meterAccount.zone_id) {
        return { status: 'error', message: 'The new zone is the same as the current zone of this meter account' }
      }
      if (!relocationJobType) {
        return { status: 'error', message: 'Job type "METER_RELOCATION" is not configured' }
      }
      if (!pendingJoStatus) {
        return { status: 'error', message: 'Job order status "Pending" is not configured' }
      }

      const { data: newZone } = await supabase
        .from('zone')
        .select('zone_id, barangay_id')
        .eq('zone_id', payload.new_zone_id)
        .single()
      if (!newZone) return { status: 'error', message: 'New zone not found' }

      const now = new Date().toISOString()

      // 1. Insert the transfer row (Pending)
      const { data: transferRow, error: transferErr } = await supabase
        .from('meter_transfers')
        .insert({
          meter_account_id: meterAccountId,
          transfer_type: 'RELOCATION',
          old_zone_id: meterAccount.zone_id,
          new_zone_id: payload.new_zone_id,
          transfer_reason: payload.transfer_reason || null,
          transferred_by: actorUser.id,
          transfer_date: now,
          transfer_status_id: pendingStatus.transfer_status_id,
        })
        .select('transfer_id')
        .single()

      if (transferErr || !transferRow) {
        console.error('[transferMeterAccount] relocation insert:', transferErr)
        // 23505 = unique violation. Only fires if a partial unique index on
        // pending transfers exists (see notes) — catches the double-click /
        // concurrent-request race the pre-check can't.
        if ((transferErr as any)?.code === '23505') {
          return { status: 'error', message: PENDING_TRANSFER_MESSAGE }
        }
        return { status: 'error', message: transferErr?.message ?? 'Failed to create transfer' }
      }

      // 2. Auto-create the METER_RELOCATION job order
      const { data: jo, error: joErr } = await supabase
        .from('job_orders')
        .insert({
          job_type_id: relocationJobType.job_type_id,
          barangay_id: newZone.barangay_id,
          job_status_id: pendingJoStatus.job_status_id,
          meter_account_id: meterAccountId,
          transfer_id: transferRow.transfer_id,
          created_by: actorUser.id,
        })
        .select('job_order_id')
        .single()

      if (joErr || !jo) {
        console.error('[transferMeterAccount] job order insert:', joErr)
        await supabase.from('meter_transfers').delete().eq('transfer_id', transferRow.transfer_id)
        return { status: 'error', message: joErr?.message ?? 'Failed to create relocation job order' }
      }

      await createAuditLog(
        actorUser.id,
        'TRANSFER_RELOCATION',
        `Requested relocation of meter account ${latestMeterSerialFromMeters(meterAccount.meters) ?? meterAccountId} — job order created`,
        'meter_accounts',
        meterAccountId,
      )
      await createAuditLog(
        actorUser.id,
        'CREATE',
        `Created METER_RELOCATION job order for transfer ${transferRow.transfer_id}`,
        'job_orders',
        jo.job_order_id,
      )

      revalidatePath(`/admin/meter-transfers`)
      revalidatePath(`/admin/meter-accounts/${meterAccountId}`)
      revalidatePath(`/admin/job-orders`)

      return {
        status: 'success',
        message: 'Relocation requested — job order created and awaiting assignment',
        job_order_id: jo.job_order_id,
      }
    }

    return { status: 'error', message: 'Invalid transfer type' }
  } catch (err: any) {
    console.error('[transferMeterAccount]', err)
    return { status: 'error', message: err?.message ?? 'Failed to transfer meter account' }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// CANCEL — a Pending RELOCATION transfer
// ════════════════════════════════════════════════════════════════════════════

export async function cancelMeterTransfer(
  transferId: string,
  reason?: string | null,
): Promise<ActionResult> {
  const supabase = await createClient()

  try {
    const { data: { user: actor }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !actor) return { status: 'error', message: 'Unauthorised' }

    const { data: transfer, error: fetchErr } = await supabase
      .from('meter_transfers')
      .select(`
        transfer_id,
        transfer_type,
        meter_account_id,
        transfer_status_id,
        transfer_status:transfer_status_id ( status_name ),
        meter_account:meter_account_id ( meter_account_id, meters ( meter_serial_no, created_at ) )
      `)
      .eq('transfer_id', transferId)
      .single()

    if (fetchErr || !transfer) return { status: 'error', message: 'Transfer not found' }

    const statusRow = unwrap(transfer.transfer_status)
    const currentStatus = (statusRow?.status_name ?? '').toLowerCase()

    if (transfer.transfer_type !== 'RELOCATION') {
      return { status: 'error', message: 'Only relocation transfers can be cancelled' }
    }
    if (currentStatus !== 'pending') {
      return {
        status: 'error',
        message: `Only pending transfers can be cancelled (current: ${statusRow?.status_name ?? 'unknown'})`,
      }
    }

    const { data: cancelledStatus } = await supabase
      .from('transfer_status')
      .select('transfer_status_id')
      .eq('status_name', 'Cancelled')
      .single()

    if (!cancelledStatus) {
      return { status: 'error', message: 'Transfer status "Cancelled" is not configured' }
    }

    // Look up the linked job order BEFORE touching the transfer, so we can
    // refuse the cancel if the work is already underway.
    const { data: jo } = await supabase
      .from('job_orders')
      .select(`
        job_order_id,
        job_status:job_status_id ( job_status_name )
      `)
      .eq('transfer_id', transferId)
      .maybeSingle()

    const joStatus = jo ? unwrap(jo.job_status) : null
    const joName = joStatus?.job_status_name

    if (jo && joName && !['Pending', 'Assigned', 'Cancelled'].includes(joName)) {
      return {
        status: 'error',
        message: `This transfer cannot be cancelled because its job order is already "${joName}"`,
      }
    }

    const now = new Date().toISOString()

    const { error: updateErr } = await supabase
      .from('meter_transfers')
      .update({
        transfer_status_id: cancelledStatus.transfer_status_id,
        transfer_reason: reason?.trim() ? reason.trim() : undefined,
        updated_at: now,
      })
      .eq('transfer_id', transferId)

    if (updateErr) {
      console.error('[cancelMeterTransfer] transfer update failed:', updateErr)
      return { status: 'error', message: updateErr.message }
    }

    if (jo && (joName === 'Pending' || joName === 'Assigned')) {
      const { data: cancelledJoStatus } = await supabase
        .from('job_order_status')
        .select('job_status_id')
        .eq('job_status_name', 'Cancelled')
        .single()

      if (cancelledJoStatus) {
        const { error: joErr } = await supabase
          .from('job_orders')
          .update({ job_status_id: cancelledJoStatus.job_status_id, updated_at: now })
          .eq('job_order_id', jo.job_order_id)

        if (joErr) {
          console.error('[cancelMeterTransfer] job order cancel failed:', joErr)
        } else {
          const { data: openLines } = await supabase
            .from('job_assignment_orders')
            .select(`
              assignment_order_id,
              status:status_id ( status_code )
            `)
            .eq('job_order_id', jo.job_order_id)

          const { data: cancelledAssignmentStatus } = await supabase
            .from('assignment_status')
            .select('assignment_status_id')
            .eq('status_code', 'CANCELLED')
            .single()

          if (cancelledAssignmentStatus) {
            const openLineIds = (openLines ?? [])
              .filter((row: any) => {
                const code = unwrap(row.status)?.status_code
                return code === 'SCHEDULED' || code === 'ONPROGRESS'
              })
              .map((row: any) => row.assignment_order_id)

            if (openLineIds.length > 0) {
              await supabase
                .from('job_assignment_orders')
                .update({
                  status_id: cancelledAssignmentStatus.assignment_status_id,
                  updated_at: now,
                })
                .in('assignment_order_id', openLineIds)
            }
          }
        }
      }
    }

    const meterAccount = unwrap(transfer.meter_account)

    await createAuditLog(
      actor.id,
      'UPDATE',
      `Cancelled relocation transfer for meter account ${latestMeterSerialFromMeters(meterAccount?.meters) ?? transfer.meter_account_id}${reason ? ` — ${reason}` : ''}`,
      'meter_transfers',
      transferId,
    )

    revalidatePath(`/admin/meter-transfers`)
    revalidatePath(`/admin/job-orders`)

    return { status: 'success', message: 'Transfer cancelled' }
  } catch (err: any) {
    console.error('[cancelMeterTransfer]', err)
    return { status: 'error', message: err?.message ?? 'Failed to cancel transfer' }
  }
}