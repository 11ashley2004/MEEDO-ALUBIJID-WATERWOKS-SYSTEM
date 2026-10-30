'use server'

import { createClient } from '@/lib/supabase/server'
import { createAuditLog } from '../audit.action'

// ============================================================================
// Types
// ============================================================================

export interface MeterAccount {
  meter_account_id: string
  consumer_id: string
  consumer_name: string
  zone_id: string
  zone_name: string
  barangay_id: string
  barangay_name: string
  classification_id: string
  classification_name: string
  meter_type: boolean
  account_status_name: string
  meter_serial_no: string | null
  connection_fee_id: string | null
  connection_fee: number | null
  created_at: string
}

export type Barangay = {
  barangay_id: string
  barangay_name: string
}

export type Zone = {
  zone_id: string
  zone_name: string
  barangay_id: string
}

export type Classification = {
  classification_id: string
  classification_name: string
  connection_fee: number
}

export type ConsumerResult = {
  consumer_id: string
  account_name: string
  label: string
}

export type CreateMeterAccountData = {
  consumer_id: string
  barangay_id: string
  zone_id: string
  classification_id: string
}

export type CreateMeterAccountBatchData = {
  consumer_id: string
  meter_accounts: {
    barangay_id: string
    zone_id: string
    classification_id: string
  }[]
}

export type ActionResult<T = null> =
  | { status: 'success'; data: T; message?: string }
  | { status: 'error'; message: string }

export type ApplicationWithConnections = {
  application_id: string
  connection_no: string
  total_connection_fee: number
  total_fee: number
  application_status: boolean
  paid_at: string | null
  created_at: string
  consumer: {
    consumer_id: string
    consumer_name: string
  }
  connections: {
    meter_account_id: string
    meter_serial_no: string | null
    classification_id: string
    classification_name: string
    zone_id: string
    zone_name: string
    barangay_id: string
    barangay_name: string
    connection_fee: number
    created_at: string
  }[]
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

const getFirst = (val: unknown): any => {
  if (Array.isArray(val)) return val[0] ?? null
  return val ?? null
}

// ============================================================================
// GET — all barangays
// ============================================================================

export async function getAllBarangays(): Promise<Barangay[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('barangay')
    .select('barangay_id, barangay_name')
    .eq('is_active', true)
    .order('barangay_name', { ascending: true })

  if (error) throw new Error('Failed to fetch barangays')
  return data ?? []
}

// ============================================================================
// GET — zones by barangay
// ============================================================================

export async function getZonesByBarangay(barangayId: string): Promise<Zone[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('zone')
    .select('zone_id, zone_name, barangay_id')
    .eq('barangay_id', barangayId)
    .eq('is_active', true)
    .order('zone_name', { ascending: true })

  if (error) throw new Error('Failed to fetch zones')
  return data ?? []
}

// ============================================================================
// GET — all classifications
// ============================================================================

export async function getAllClassifications(): Promise<Classification[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('classifications')
    .select('classification_id, classification_name, connection_fee')
    .order('classification_name', { ascending: true })

  if (error) throw new Error('Failed to fetch classifications')
  return data ?? []
}

// ============================================================================
// SEARCH — consumers
// ============================================================================

export async function searchConsumersForConnection(
  query: string,
  limit = 10,
): Promise<ConsumerResult[]> {
  if (!query.trim()) return []
  const supabase = await createClient()
  const term = query.trim()

  const { data, error } = await supabase
    .from('consumers')
    .select('consumer_id, account_name')
    .ilike('account_name', `%${term}%`)
    .eq('is_active', true)
    .limit(limit)

  if (error) throw new Error('Failed to search consumers')

  return (data ?? []).map((c) => ({
    consumer_id: c.consumer_id,
    account_name: c.account_name,
    label: c.account_name,
  }))
}

// ============================================================================
// GET — all meter accounts with joined data
// ============================================================================

export async function getAllMeterAccounts(): Promise<MeterAccount[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('meter_accounts')
    .select(`
      meter_account_id,
      consumer_id,
      meter_type,
      created_at,
      consumers:consumer_id (
        account_name
      ),
      zone:zone_id (
        zone_id,
        zone_name,
        barangay_id,
        barangay:barangay_id (
          barangay_id,
          barangay_name
        )
      ),
      classifications:classification_id (
        classification_id,
        classification_name
      ),
      account_status:account_status_id (
        account_status_id,
        status_name
      ),
      connection_fees:connection_fees (
        connection_fee_id,
        connection_fee,
        application_id,
        connection_applications:application_id (
          application_id,
          connection_no,
          total_connection_fee,
          total_fee,
          application_status,
          paid_at
        )
      ),
      meters:meters (
        meter_serial_no
      )
    `)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[getAllMeterAccounts]', error)
    throw new Error('Failed to fetch meter accounts')
  }

  return (data ?? []).map((row: any) => {
    const c = getFirst(row.consumers)
    const fee = getFirst(row.connection_fees)
    const app = getFirst(fee?.connection_applications)
    const zone = getFirst(row.zone)
    const barangay = getFirst(zone?.barangay)
    const accountStatus = getFirst(row.account_status)
    const meter = getFirst(row.meters)

    return {
      meter_account_id: row.meter_account_id,
      consumer_id: row.consumer_id,
      consumer_name: c?.account_name ?? '—',
      zone_id: zone?.zone_id ?? '',
      zone_name: zone?.zone_name ?? '—',
      barangay_id: barangay?.barangay_id ?? '',
      barangay_name: barangay?.barangay_name ?? '—',
      classification_id: row.classifications?.classification_id ?? '',
      classification_name: row.classifications?.classification_name ?? '—',
      meter_type: row.meter_type,
      account_status_name: accountStatus?.status_name ?? '—',
      meter_serial_no: latestMeterSerialFromMeters(row.meters) ?? meter?.meter_serial_no ?? null,
      connection_fee_id: fee?.connection_fee_id ?? null,
      connection_fee: fee?.connection_fee ?? null,
      created_at: row.created_at,
    }
  })
}

// ============================================================================
// CREATE — batch meter accounts (one application, N meter accounts)
// ============================================================================

export async function createMeterAccountBatch(
  payload: CreateMeterAccountBatchData,
): Promise<ActionResult<{
  application_id: string
  connection_no: string
  meter_accounts: { meter_account_id: string }[]
}>> {
  const supabase = await createClient()

  try {
    const { data: { user: actor } } = await supabase.auth.getUser()
    if (!actor) return { status: 'error', message: 'Unauthorised' }

    if (!payload.meter_accounts.length)
      return { status: 'error', message: 'At least one meter account is required' }

    // ── 1. Validate every zone belongs to its stated barangay ───────────────
    for (const conn of payload.meter_accounts) {
      const { data: zone, error: zoneError } = await supabase
        .from('zone')
        .select('zone_id, barangay_id')
        .eq('zone_id', conn.zone_id)
        .single()

      if (zoneError || !zone)
        return { status: 'error', message: 'Invalid zone selected' }

      if (zone.barangay_id !== conn.barangay_id)
        return { status: 'error', message: 'Zone does not belong to selected barangay' }
    }

    // ── 2. Fetch all classification fees in one query ───────────────────────
    const classIds = [...new Set(payload.meter_accounts.map((c) => c.classification_id))]
    const { data: classifications, error: classError } = await supabase
      .from('classifications')
      .select('classification_id, connection_fee')
      .in('classification_id', classIds)

    if (classError || !classifications?.length)
      return { status: 'error', message: 'Failed to fetch classification fees' }

    const feeMap = Object.fromEntries(
      classifications.map((c) => [c.classification_id, Number(c.connection_fee)])
    )

    // ── 3. Compute total connection fee ─────────────────────────────────────
    const totalConnFee = payload.meter_accounts.reduce(
      (sum, c) => sum + (feeMap[c.classification_id] ?? 0), 0
    )

    // ── 4. Look up pending status ───────────────────────────────────────────
    const { data: statusRow, error: statusError } = await supabase
      .from('account_status')
      .select('account_status_id')
      .ilike('status_name', 'pending')
      .single()

    if (statusError || !statusRow)
      return { status: 'error', message: 'Could not find pending status' }

    // ── 5. Create one connection_application for the whole batch ────────────
    // Note: connection_no is auto-generated by trigger
    const { data: application, error: appError } = await supabase
      .from('connection_applications')
      .insert({
        consumer_id: payload.consumer_id,
        applied_by: actor.id,
        total_connection_fee: Number(totalConnFee),
        application_status: false,
      })
      .select('application_id, connection_no')
      .single()

    if (appError || !application) {
      console.error('[createMeterAccountBatch] application insert:', appError)
      return { status: 'error', message: appError?.message ?? 'Failed to create application' }
    }

    // ── 6. Insert each meter_account + connection_fee ──────────────────
    const createdMeterAccounts: { meter_account_id: string }[] = []

    for (const conn of payload.meter_accounts) {
      // Insert meter account
      const { data: newAccount, error: connError } = await supabase
        .from('meter_accounts')
        .insert({
          consumer_id: payload.consumer_id,
          zone_id: conn.zone_id,
          classification_id: conn.classification_id,
          meter_type: true,
          account_status_id: statusRow.account_status_id,
        })
        .select('meter_account_id')
        .single()

      if (connError || !newAccount) {
        console.error('[createMeterAccountBatch] meter account insert:', connError)
        // Roll back: delete all created accounts + the application
        for (const c of createdMeterAccounts) {
          await supabase.from('meter_accounts').delete().eq('meter_account_id', c.meter_account_id)
        }
        await supabase.from('connection_applications').delete().eq('application_id', application.application_id)
        return { status: 'error', message: connError?.message ?? 'Failed to create meter account' }
      }

      // Insert connection_fee
      const { error: feeError } = await supabase
        .from('connection_fees')
        .insert({
          application_id: application.application_id,
          meter_account_id: newAccount.meter_account_id,
          connection_fee: feeMap[conn.classification_id] ?? 0,
        })

      if (feeError) {
        console.error('[createMeterAccountBatch] fee insert:', feeError)
        await supabase.from('meter_accounts').delete().eq('meter_account_id', newAccount.meter_account_id)
        for (const c of createdMeterAccounts) {
          await supabase.from('meter_accounts').delete().eq('meter_account_id', c.meter_account_id)
        }
        await supabase.from('connection_applications').delete().eq('application_id', application.application_id)
        return { status: 'error', message: feeError.message }
      }

      createdMeterAccounts.push(newAccount)
    }

    // ── 7. Audit log ────────────────────────────────────────────────────────
    await createAuditLog(
      actor.id,
      'CREATE',
      `Created ${createdMeterAccounts.length} meter account(s) [${createdMeterAccounts.map((c) => c.meter_account_id).join(', ')}] under application ${application.connection_no}`,
      'meter_accounts',
      createdMeterAccounts.map((c) => c.meter_account_id).join(','),
    )

    return {
      status: 'success',
      data: { application_id: application.application_id, connection_no: application.connection_no, meter_accounts: createdMeterAccounts },
      message: `${createdMeterAccounts.length} meter account(s) created successfully`,
    }
  } catch (err) {
    console.error('[createMeterAccountBatch]', err)
    return { status: 'error', message: 'Failed to create meter accounts' }
  }
}

// ============================================================================
// GET — all applications grouped by application
// ============================================================================

export async function getAllApplications(): Promise<ApplicationWithConnections[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('connection_applications')
    .select(`
      application_id,
      connection_no,
      total_connection_fee,
      total_fee,
      application_status,
      paid_at,
      created_at,
      consumer:consumer_id (
        consumer_id,
        account_name
      ),
      applied_by:applied_by (
        user_id,
        first_name,
        last_name
      ),
      connection_fees!inner (
        connection_fee,
        meter_account:meter_account_id (
          meter_account_id,
          classification:classification_id (
            classification_id,
            classification_name
          ),
          zone:zone_id (
            zone_id,
            zone_name,
            barangay:barangay_id (
              barangay_id,
              barangay_name
            )
          )
        )
      )
    `)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[getAllApplications]', error)
    throw new Error('Failed to fetch applications')
  }

  return (data ?? []).map((row: any) => {
    const consumer = getFirst(row.consumer)
    const consumerName = consumer?.account_name ?? '—'

    const connections = (row.connection_fees ?? []).map((cf: any) => {
      const account = getFirst(cf.meter_account)
      const classification = getFirst(account?.classification)
      const zone = getFirst(account?.zone)
      const barangay = getFirst(zone?.barangay)

      return {
        meter_account_id: account?.meter_account_id ?? '',
        meter_serial_no: account?.meter_serial_no ?? '—',
        classification_id: classification?.classification_id ?? '',
        classification_name: classification?.classification_name ?? '—',
        zone_id: zone?.zone_id ?? '',
        zone_name: zone?.zone_name ?? '—',
        barangay_id: barangay?.barangay_id ?? '',
        barangay_name: barangay?.barangay_name ?? '—',
        connection_fee: Number(cf.connection_fee ?? 0),
        created_at: account?.created_at ?? row.created_at,
      }
    })

    return {
      application_id: row.application_id,
      connection_no: row.connection_no,
      total_connection_fee: Number(row.total_connection_fee),
      total_fee: Number(row.total_fee),
      application_status: row.application_status,
      paid_at: row.paid_at,
      created_at: row.created_at,
      consumer: {
        consumer_id: consumer?.consumer_id ?? '',
        consumer_name: consumerName,
      },
      connections,
    }
  })
}

// ============================================================================
// GET — application by ID
// ============================================================================

export async function getApplicationById(applicationId: string): Promise<ApplicationWithConnections | null> {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from('connection_applications')
      .select(`
        application_id,
        connection_no,
        total_connection_fee,
        total_fee,
        application_status,
        paid_at,
        created_at,
        consumer:consumer_id (
          consumer_id,
          account_name
        ),
        connection_fees!inner (
          connection_fee,
          meter_account:meter_account_id (
            meter_account_id,
            classification:classification_id (
              classification_id,
              classification_name
            ),
            zone:zone_id (
              zone_id,
              zone_name,
              barangay:barangay_id (
                barangay_id,
                barangay_name
              )
            )
          )
        )
      `)
      .eq('application_id', applicationId)
      .single()

    if (error) throw error

    const consumer = getFirst(data.consumer)
    const consumerName = consumer?.account_name ?? '—'

    const connections = (data.connection_fees ?? []).map((cf: any) => {
      const account = getFirst(cf.meter_account)
      const classification = getFirst(account?.classification)
      const zone = getFirst(account?.zone)
      const barangay = getFirst(zone?.barangay)

      return {
        meter_account_id: account?.meter_account_id ?? '',
        meter_serial_no: account?.meter_serial_no ?? '—',
        classification_id: classification?.classification_id ?? '',
        classification_name: classification?.classification_name ?? '—',
        connection_fee: Number(cf.connection_fee ?? 0),
        zone_id: zone?.zone_id ?? '',
        zone_name: zone?.zone_name ?? '—',
        barangay_id: barangay?.barangay_id ?? '',
        barangay_name: barangay?.barangay_name ?? '—',
        created_at: account?.created_at ?? data.created_at,
      }
    })

    return {
      application_id: data.application_id,
      connection_no: data.connection_no,
      total_connection_fee: Number(data.total_connection_fee),
      total_fee: Number(data.total_fee),
      application_status: data.application_status,
      paid_at: data.paid_at,
      created_at: data.created_at,
      consumer: {
        consumer_id: consumer?.consumer_id ?? '',
        consumer_name: consumerName,
      },
      connections,
    }
  } catch (error) {
    console.error('[getApplicationById]', error)
    return null
  }
}

// ============================================================================
// UPDATE — application meter accounts (only when unpaid)
// ============================================================================

export async function updateApplicationMeterAccounts(
  applicationId: string,
  meterAccounts: {
    meter_account_id?: string
    barangay_id: string
    zone_id: string
    classification_id: string
    connection_fee: number
  }[]
): Promise<ActionResult<null>> {
  const supabase = await createClient()

  try {
    const { data: { user: actor } } = await supabase.auth.getUser()
    if (!actor) return { status: 'error', message: 'Unauthorized' }

    // ── 1. Guard: confirm application exists and is unpaid ─────────────────
    const { data: application, error: appErr } = await supabase
      .from('connection_applications')
      .select('application_id, application_status, consumer_id')
      .eq('application_id', applicationId)
      .single()

    if (appErr || !application) {
      return { status: 'error', message: 'Application not found' }
    }

    if (application.application_status === true) {
      return { status: 'error', message: 'Cannot edit a paid application' }
    }

    // ── 2. Get existing meter account IDs for this application ──────────────
    const { data: existingFees, error: fetchErr } = await supabase
      .from('connection_fees')
      .select('meter_account_id, connection_fee_id')
      .eq('application_id', applicationId)

    if (fetchErr) {
      console.error('[updateApplicationMeterAccounts] fetch existing fees:', fetchErr)
      return { status: 'error', message: 'Failed to fetch existing meter accounts' }
    }

    const existingAccountIds = new Set(existingFees?.map(f => f.meter_account_id) || [])
    const submittedAccountIds = new Set(meterAccounts.filter(c => c.meter_account_id).map(c => c.meter_account_id))

    // ── 3. Handle deletions ──────────────────────────────────────────────────
    const toDelete = Array.from(existingAccountIds).filter(id => !submittedAccountIds.has(id))
    
    for (const accountId of toDelete) {
      await supabase.from('connection_fees').delete()
        .eq('meter_account_id', accountId)
        .eq('application_id', applicationId)

      await supabase.from('meter_accounts').delete()
        .eq('meter_account_id', accountId)
    }

    // ── 4. Update existing and create new ────────────────────────────────────
    for (const account of meterAccounts) {
      if (account.meter_account_id && existingAccountIds.has(account.meter_account_id)) {
        // UPDATE existing
        await supabase
          .from('meter_accounts')
          .update({
            zone_id: account.zone_id,
            classification_id: account.classification_id,
            updated_at: new Date().toISOString(),
          })
          .eq('meter_account_id', account.meter_account_id)

        await supabase
          .from('connection_fees')
          .update({ connection_fee: account.connection_fee })
          .eq('meter_account_id', account.meter_account_id)
          .eq('application_id', applicationId)
      } else {
        // CREATE new
        const { data: newAccount } = await supabase
          .from('meter_accounts')
          .insert({
            consumer_id: application.consumer_id,
            zone_id: account.zone_id,
            classification_id: account.classification_id,
            meter_type: true,
            account_status_id: 'pending',
          })
          .select('meter_account_id')
          .single()

        if (newAccount) {
          await supabase
            .from('connection_fees')
            .insert({
              application_id: applicationId,
              meter_account_id: newAccount.meter_account_id,
              connection_fee: account.connection_fee,
            })
        }
      }
    }

    // ── 5. Recalculate total ──────────────────────────────────────────────────
    const newTotalConnectionFee = meterAccounts.reduce((sum, c) => sum + c.connection_fee, 0)

    await supabase
      .from('connection_applications')
      .update({
        total_connection_fee: newTotalConnectionFee,
        updated_at: new Date().toISOString(),
      })
      .eq('application_id', applicationId)

    await createAuditLog(
      actor.id,
      'UPDATE',
      `Updated application ${applicationId}. New total connection fee: ₱${newTotalConnectionFee.toFixed(2)}`,
      'connection_applications',
      applicationId,
    )

    return { status: 'success', data: null, message: 'Application updated successfully' }
  } catch (err) {
    console.error('[updateApplicationMeterAccounts]', err)
    return { status: 'error', message: 'Failed to update application' }
  }
}

// ============================================================================
// GET — meter accounts by consumer
// ============================================================================

export async function getMeterAccountsByConsumer(consumerId: string): Promise<MeterAccount[]> {
  const supabase = await createClient()

  let query = supabase
    .from('meter_accounts')
    .select(`
      meter_account_id,
      consumer_id,
      meter_type,
      created_at,
      updated_at,
      consumer:consumer_id (
        consumer_id,
        account_name
      ),
      zone:zone_id (
        zone_id,
        zone_name,
        barangay:barangay_id (
          barangay_id,
          barangay_name
        )
      ),
      classification:classification_id (
        classification_id,
        classification_name
      ),
      account_status:account_status_id (
        account_status_id,
        status_name
      ),
      connection_fees (
        connection_fee_id,
        connection_fee,
        application_id,
        connection_applications:application_id (
          application_id,
          connection_no,
          total_connection_fee,
          total_fee,
          application_status,
          paid_at
        )
      ),
      meters:meters!left (
        meter_serial_no,
        meter_status_id
      )
    `)
    .eq('consumer_id', consumerId)
    .order('created_at', { ascending: false })

  const { data, error } = await query

  if (error) {
    console.error('[getMeterAccountsByConsumer]', error)
    throw new Error('Failed to fetch meter accounts')
  }

  return (data ?? []).map((row: any) => {
    const consumer = getFirst(row.consumer)
    const consumerName = consumer?.account_name ?? '—'
    const zone = getFirst(row.zone)
    const barangay = getFirst(zone?.barangay)
    const classification = getFirst(row.classification)
    const accountStatus = getFirst(row.account_status)
    const connectionFee = getFirst(row.connection_fees)
    const application = getFirst(connectionFee?.connection_applications)
    
    let meter = null
    if (row.meters) {
      if (Array.isArray(row.meters) && row.meters.length > 0) {
        meter = row.meters[0]
      } else if (!Array.isArray(row.meters)) {
        meter = row.meters
      }
    }

    return {
      meter_account_id: row.meter_account_id,
      consumer_id: row.consumer_id,
      consumer_name: consumerName,
      zone_id: zone?.zone_id ?? '',
      zone_name: zone?.zone_name ?? '—',
      barangay_id: barangay?.barangay_id ?? '',
      barangay_name: barangay?.barangay_name ?? '—',
      classification_id: classification?.classification_id ?? '',
      classification_name: classification?.classification_name ?? '—',
      meter_type: row.meter_type,
      account_status_name: accountStatus?.status_name ?? '—',
      meter_serial_no: latestMeterSerialFromMeters(row.meters) ?? meter?.meter_serial_no ?? null,
      connection_fee_id: connectionFee?.connection_fee_id ?? null,
      connection_fee: connectionFee?.connection_fee ?? null,
      created_at: row.created_at,
    }
  })
}