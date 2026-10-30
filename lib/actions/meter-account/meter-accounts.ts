'use server'

import { createClient } from '@/lib/supabase/server'
import { createAuditLog } from '@/lib/actions/audit.action'

// ============================================================================
// Types
// ============================================================================

export interface MeterAccount {
  meter_account_id: string
  consumer_id: string
  consumer_name: string
  contract_no: string
  zone_id: string
  zone_name: string
  barangay_id: string
  barangay_name: string
  classification_id: string
  classification_name: string
  meter_status_name: string
  meter_serial_no: string | null
  meter_status_id: string | null
  meter_id: string | null
  total_connection_fee: number
  payment_status: boolean
  paid_at: string | null
  created_at: string
  updated_at: string
}

export interface MeterStatus {
  meter_status_id: string
  meter_status_name: string
  description: string | null
  created_at: string
}

export interface Barangay {
  barangay_id: string
  barangay_name: string
  is_active: boolean
  created_at: string
}

export interface Zone {
  zone_id: string
  zone_name: string
  barangay_id: string
  is_active: boolean
  created_at: string
}

export interface Classification {
  classification_id: string
  classification_name: string
  connection_fee: number
  description: string | null
  created_at: string
}

export interface ConsumerResult {
  consumer_id: string
  contract_no: string
  account_name: string
  label: string
}

// One entry = one meter account row (fee/payment fields now live on meter_accounts itself)
export interface CreateMeterAccountEntry {
  barangay_id: string
  zone_id: string
  classification_id: string
}

export interface CreateMeterAccountBatchData {
  consumer_id: string
  meter_accounts: CreateMeterAccountEntry[]
}

export interface ActionResult<T = null> {
  status: 'success' | 'error'
  data?: T
  message?: string
}

// ============================================================================
// Helpers
// ============================================================================

const getFirst = (val: unknown): any => (Array.isArray(val) ? val[0] ?? null : val ?? null)

function isPendingSerial(serial: string | null | undefined): boolean {
  return !serial || serial.startsWith('PENDING-')
}

// ============================================================================
// GET — lookups (unchanged)
// ============================================================================

export async function getAllBarangays(): Promise<Barangay[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('barangay')
    .select('barangay_id, barangay_name, is_active, created_at')
    .eq('is_active', true)
    .order('barangay_name', { ascending: true })

  if (error) throw new Error('Failed to fetch barangays')
  return data ?? []
}

export async function getZonesByBarangay(barangayId: string): Promise<Zone[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('zone')
    .select('zone_id, zone_name, barangay_id, is_active, created_at')
    .eq('barangay_id', barangayId)
    .eq('is_active', true)
    .order('zone_name', { ascending: true })

  if (error) throw new Error('Failed to fetch zones')
  return data ?? []
}

export async function getAllClassifications(): Promise<Classification[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('classifications')
    .select('classification_id, classification_name, connection_fee, description, created_at')
    .order('classification_name', { ascending: true })

  if (error) throw new Error('Failed to fetch classifications')
  return data ?? []
}

export async function searchConsumersForConnection(
  query: string,
  limit = 10,
): Promise<ConsumerResult[]> {
  if (!query.trim()) return []
  const supabase = await createClient()

  const term = query.trim()
  const { data, error } = await supabase
    .from('consumers')
    .select('consumer_id, contract_no, account_name')
    .or(`account_name.ilike.%${term}%,contract_no.ilike.%${term}%`)
    .eq('is_active', true)
    .limit(limit)

  if (error) throw new Error('Failed to search consumers')

  return (data ?? []).map((c) => ({
    consumer_id: c.consumer_id,
    contract_no: c.contract_no,
    account_name: c.account_name,
    label: `${c.contract_no} — ${c.account_name}`,
  }))
}

// ============================================================================
// GET — all meter accounts (payment fields now live directly on meter_accounts)
// ============================================================================

const METER_ACCOUNT_SELECT = `
  meter_account_id,
  consumer_id,
  payment_status,
  paid_at,
  total_connection_fee,
  created_at,
  updated_at,
  consumers:consumer_id ( account_name, contract_no ),
  zone:zone_id (
    zone_id, zone_name, barangay_id,
    barangay:barangay_id ( barangay_id, barangay_name )
  ),
  classifications:classification_id ( classification_id, classification_name ),
  meters:meters (
    meter_id, meter_serial_no, meter_status_id, created_at,
    meter_status:meter_status_id ( meter_status_id, meter_status_name )
  )
`

function pickCurrentMeter(meters: unknown): any | null {
  const list = Array.isArray(meters) ? meters : meters ? [meters] : []

  const eligible = list.filter((m: any) => {
    const statusName = getFirst(m?.meter_status)?.meter_status_name
    return statusName !== 'Removed'
  })

  if (!eligible.length) return null

  return eligible.slice().sort((a: any, b: any) => {
    const da = a?.created_at ? new Date(a.created_at).getTime() : 0
    const db = b?.created_at ? new Date(b.created_at).getTime() : 0
    return db - da
  })[0]
}

function shapeMeterAccount(row: any): MeterAccount {
  const consumer = getFirst(row.consumers)
  const zone = getFirst(row.zone)
  const barangay = getFirst(zone?.barangay)
  const classification = getFirst(row.classifications)
  const meter = pickCurrentMeter(row.meters)
  const meterStatus = getFirst(meter?.meter_status)

  const rawSerial = meter?.meter_serial_no ?? null

  return {
    meter_account_id: row.meter_account_id,
    consumer_id: row.consumer_id,
    consumer_name: consumer?.account_name ?? '—',
    contract_no: consumer?.contract_no ?? '—',
    zone_id: zone?.zone_id ?? '',
    zone_name: zone?.zone_name ?? '—',
    barangay_id: barangay?.barangay_id ?? '',
    barangay_name: barangay?.barangay_name ?? '—',
    classification_id: classification?.classification_id ?? '',
    classification_name: classification?.classification_name ?? '—',
    meter_status_name: meterStatus?.meter_status_name ?? 'Pending',
    meter_serial_no: isPendingSerial(rawSerial) ? null : rawSerial,
    meter_status_id: meter?.meter_status_id ?? null,
    meter_id: meter?.meter_id ?? null,
    total_connection_fee: Number(row.total_connection_fee ?? 0),
    payment_status: row.payment_status ?? false,
    paid_at: row.paid_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export async function getAllMeterAccounts(): Promise<MeterAccount[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('meter_accounts')
    .select(METER_ACCOUNT_SELECT)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[getAllMeterAccounts]', error)
    throw new Error('Failed to fetch meter accounts')
  }
  return (data ?? []).map(shapeMeterAccount)
}

export async function getMeterAccountById(meterAccountId: string): Promise<MeterAccount | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('meter_accounts')
    .select(METER_ACCOUNT_SELECT)
    .eq('meter_account_id', meterAccountId)
    .single()

  if (error) {
    console.error('[getMeterAccountById]', error)
    return null
  }
  return shapeMeterAccount(data)
}

export async function getMeterAccountsByConsumer(consumerId: string): Promise<MeterAccount[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('meter_accounts')
    .select(METER_ACCOUNT_SELECT)
    .eq('consumer_id', consumerId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[getMeterAccountsByConsumer]', error)
    throw new Error('Failed to fetch meter accounts')
  }
  return (data ?? []).map(shapeMeterAccount)
}

// ============================================================================
// CREATE — batch meter accounts
// connection_fees table is gone: each entry now creates a single meter_accounts
// row carrying its own total_connection_fee / payment_status / paid_at.
// ============================================================================

export async function createMeterAccountBatch(
  payload: CreateMeterAccountBatchData,
): Promise<ActionResult<{
  meter_accounts: { meter_account_id: string }[]
}>> {
  const supabase = await createClient()

  try {
    const { data: { user: actor } } = await supabase.auth.getUser()
    if (!actor) return { status: 'error', message: 'Unauthorised' }

    if (!payload.meter_accounts.length) {
      return { status: 'error', message: 'At least one meter account is required' }
    }

    // ── 1. Validate every zone belongs to its stated barangay ──────────────
    for (const entry of payload.meter_accounts) {
      const { data: zone, error: zoneError } = await supabase
        .from('zone')
        .select('zone_id, barangay_id')
        .eq('zone_id', entry.zone_id)
        .single()

      if (zoneError || !zone) return { status: 'error', message: 'Invalid zone selected' }
      if (zone.barangay_id !== entry.barangay_id) {
        return { status: 'error', message: 'Zone does not belong to selected barangay' }
      }
    }

    // ── 2. Fetch classification fees ────────────────────────────────────────
    const classIds = [...new Set(payload.meter_accounts.map((c) => c.classification_id))]
    const { data: classifications, error: classError } = await supabase
      .from('classifications')
      .select('classification_id, connection_fee')
      .in('classification_id', classIds)

    if (classError || !classifications?.length) {
      return { status: 'error', message: 'Failed to fetch classification fees' }
    }
    const feeMap = Object.fromEntries(classifications.map((c) => [c.classification_id, Number(c.connection_fee)]))

    // ── 3. Get Pending meter status ID ──────────────────────────────────────
    const { data: pendingStatus, error: statusError } = await supabase
      .from('meter_status')
      .select('meter_status_id')
      .eq('meter_status_name', 'Pending')
      .single()

    if (statusError || !pendingStatus) {
      return { status: 'error', message: 'Could not find pending meter status' }
    }

    // ── 4. Create each meter account (+ pending meter with temp serial) ─────
    // meter_serial_no is NOT NULL; use PENDING-{uuid} until a real serial is set.
    const created: { meter_account_id: string }[] = []

    for (const entry of payload.meter_accounts) {
      const fee = feeMap[entry.classification_id] ?? 0

      const { data: newAccount, error: maError } = await supabase
        .from('meter_accounts')
        .insert({
          consumer_id: payload.consumer_id,
          zone_id: entry.zone_id,
          classification_id: entry.classification_id,
          created_by: actor.id,
          total_connection_fee: fee,
          payment_status: false,
        })
        .select('meter_account_id')
        .single()

      if (maError || !newAccount) {
        console.error('[createMeterAccountBatch] meter_accounts insert:', maError)
        await rollback(supabase, created)
        return { status: 'error', message: maError?.message ?? 'Failed to create meter account' }
      }

      const pendingSerial = `PENDING-${newAccount.meter_account_id.replace(/-/g, '')}`

      const { error: meterError } = await supabase
        .from('meters')
        .insert({
          meter_account_id: newAccount.meter_account_id,
          meter_serial_no: pendingSerial,
          meter_status_id: pendingStatus.meter_status_id,
          installation_date: null,
        })

      if (meterError) {
        console.error('[createMeterAccountBatch] meters insert:', meterError)
        await supabase.from('meter_accounts').delete().eq('meter_account_id', newAccount.meter_account_id)
        await rollback(supabase, created)
        return { status: 'error', message: meterError.message }
      }

      created.push({ meter_account_id: newAccount.meter_account_id })
    }

    await createAuditLog(
      actor.id,
      'CREATE',
      `Created ${created.length} meter account(s)`,
      'meter_accounts',
      created.map((c) => c.meter_account_id).join(','),
    )

    return {
      status: 'success',
      data: { meter_accounts: created },
      message: `${created.length} meter account(s) created successfully`,
    }
  } catch (err) {
    console.error('[createMeterAccountBatch]', err)
    return { status: 'error', message: 'Failed to create meter accounts' }
  }
}

async function rollback(
  supabase: any,
  created: { meter_account_id: string }[],
) {
  for (const c of created) {
    await supabase.from('meters').delete().eq('meter_account_id', c.meter_account_id)
    await supabase.from('meter_accounts').delete().eq('meter_account_id', c.meter_account_id)
  }
}

// ============================================================================
// NEW FUNCTION: Get meter account with full details including consumer info
// ============================================================================

export interface MeterAccountWithDetails extends MeterAccount {
  consumer: {
    consumer_id: string
    contract_no: string
    account_name: string
    email: string
    contact_number: string | null
    is_active: boolean
  }
  zone: {
    zone_id: string
    zone_name: string
    barangay_id: string
    barangay_name: string
  }
  classification: {
    classification_id: string
    classification_name: string
    connection_fee: number
  }
  meter: {
    meter_id: string
    meter_serial_no: string | null
    meter_status_id: string
    meter_status_name: string
    installation_date: string | null
    created_at: string
  } | null
}

export async function getMeterAccountWithDetails(meterAccountId: string): Promise<MeterAccountWithDetails | null> {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from('meter_accounts')
      .select(`
        meter_account_id,
        consumer_id,
        payment_status,
        paid_at,
        total_connection_fee,
        created_at,
        updated_at,
        consumers:consumer_id (
          consumer_id,
          contract_no,
          account_name,
          email,
          contact_number,
          is_active
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
          classification_name,
          connection_fee
        ),
        meters:meters (
          meter_id,
          meter_serial_no,
          meter_status_id,
          installation_date,
          created_at,
          meter_status:meter_status_id (
            meter_status_id,
            meter_status_name
          )
        )
      `)
      .eq('meter_account_id', meterAccountId)
      .single()

    if (error) {
      console.error('[getMeterAccountWithDetails]', error)
      return null
    }

    if (!data) return null

    const consumer = getFirst(data.consumers)
    const zone = getFirst(data.zone)
    const barangay = getFirst(zone?.barangay)
    const classification = getFirst(data.classifications)

    const meters = Array.isArray(data.meters) ? data.meters : data.meters ? [data.meters] : []
    const currentMeter = meters
      .filter((m: any) => {
        const status = getFirst(m?.meter_status)
        return status?.meter_status_name !== 'Removed'
      })
      .sort((a: any, b: any) => {
        const da = a?.created_at ? new Date(a.created_at).getTime() : 0
        const db = b?.created_at ? new Date(b.created_at).getTime() : 0
        return db - da
      })[0] || null

    const meterStatus = getFirst(currentMeter?.meter_status)
    const rawSerial = currentMeter?.meter_serial_no ?? null
    const displaySerial = isPendingSerial(rawSerial) ? null : rawSerial

    return {
      meter_account_id: data.meter_account_id,
      consumer_id: data.consumer_id,
      consumer_name: consumer?.account_name ?? '—',
      contract_no: consumer?.contract_no ?? '—',
      zone_id: zone?.zone_id ?? '',
      zone_name: zone?.zone_name ?? '—',
      barangay_id: barangay?.barangay_id ?? '',
      barangay_name: barangay?.barangay_name ?? '—',
      classification_id: classification?.classification_id ?? '',
      classification_name: classification?.classification_name ?? '—',
      meter_status_name: meterStatus?.meter_status_name ?? 'Pending',
      meter_serial_no: displaySerial,
      meter_status_id: currentMeter?.meter_status_id ?? null,
      meter_id: currentMeter?.meter_id ?? null,
      total_connection_fee: Number(data.total_connection_fee ?? 0),
      payment_status: data.payment_status ?? false,
      paid_at: data.paid_at ?? null,
      created_at: data.created_at,
      updated_at: data.updated_at,
      consumer: {
        consumer_id: consumer?.consumer_id ?? '',
        contract_no: consumer?.contract_no ?? '—',
        account_name: consumer?.account_name ?? '—',
        email: consumer?.email ?? '',
        contact_number: consumer?.contact_number ?? null,
        is_active: consumer?.is_active ?? false,
      },
      zone: {
        zone_id: zone?.zone_id ?? '',
        zone_name: zone?.zone_name ?? '—',
        barangay_id: barangay?.barangay_id ?? '',
        barangay_name: barangay?.barangay_name ?? '—',
      },
      classification: {
        classification_id: classification?.classification_id ?? '',
        classification_name: classification?.classification_name ?? '—',
        connection_fee: Number(classification?.connection_fee ?? 0),
      },
      meter: currentMeter ? {
        meter_id: currentMeter.meter_id,
        meter_serial_no: displaySerial,
        meter_status_id: currentMeter.meter_status_id,
        meter_status_name: meterStatus?.meter_status_name ?? 'Pending',
        installation_date: currentMeter.installation_date,
        created_at: currentMeter.created_at,
      } : null,
    }
  } catch (error) {
    console.error('[getMeterAccountWithDetails]', error)
    return null
  }
}

export interface ConsumerMeterAccount {
  meter_account_id: string
  contract_no: string | null
  zone_name: string
  barangay_name: string
  classification_name: string
  meter_status_name: string
  meter_serial_no: string | null
  payment_status: boolean
  total_connection_fee: number
  created_at: string
}

/**
 * Returns all meter accounts belonging to the CURRENTLY AUTHENTICATED consumer.
 * No consumerId param needed — it's derived from the Supabase Auth session,
 * matched against the `consumers` table by email.
 *
 * NOTE: this assumes `consumers.email` is kept in sync with the email the
 * consumer used to sign up in Supabase Auth. If you link consumers to auth
 * users a different way (e.g. storing the auth user's UUID somewhere on the
 * consumers row), swap the lookup below to match on that column instead.
 */
export async function getConsumerMeterAccounts(): Promise<ConsumerMeterAccount[]> {
  const supabase = await createClient()

  try {
    // 1. Get the logged-in auth user
    const { data: { user: actor }, error: authError } = await supabase.auth.getUser()
    if (authError || !actor) {
      console.error('[getConsumerMeterAccounts] no authenticated user', authError)
      return []
    }

    // 2. Resolve the consumers row tied to this auth user
    const { data: consumer, error: consumerError } = await supabase
      .from('consumers')
      .select('consumer_id, contract_no')
      .eq('email', actor.email)
      .single()

    if (consumerError || !consumer) {
      console.error('[getConsumerMeterAccounts] consumer lookup failed', consumerError)
      return []
    }

    const consumerId = consumer.consumer_id
    const contractNo = (consumer as any).contract_no ?? null

    // 3. Fetch that consumer's meter accounts
    const { data, error } = await supabase
      .from('meter_accounts')
      .select(`
        meter_account_id,
        payment_status,
        total_connection_fee,
        created_at,
        zone:zone_id (
          zone_name,
          barangay:barangay_id (
            barangay_name
          )
        ),
        classifications:classification_id (
          classification_name
        ),
        meters:meters (
          meter_serial_no,
          meter_status:meter_status_id (
            meter_status_name
          )
        )
      `)
      .eq('consumer_id', consumerId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[getConsumerMeterAccounts]', error)
      return []
    }

    return (data ?? []).map((account: any) => {
      const zone = Array.isArray(account.zone) ? account.zone[0] : account.zone
      const barangay = zone?.barangay
      const classification = Array.isArray(account.classifications)
        ? account.classifications[0]
        : account.classifications

      const meters = Array.isArray(account.meters) ? account.meters : account.meters ? [account.meters] : []
      const activeMeter = meters
        .filter((m: any) => {
          const status = Array.isArray(m.meter_status) ? m.meter_status[0] : m.meter_status
          return status?.meter_status_name !== 'Removed'
        })
        .sort((a: any, b: any) => {
          const da = a?.created_at ? new Date(a.created_at).getTime() : 0
          const db = b?.created_at ? new Date(b.created_at).getTime() : 0
          return db - da
        })[0]

      const meterStatus = activeMeter?.meter_status
      const statusName = Array.isArray(meterStatus) ? meterStatus[0] : meterStatus
      const rawSerial = activeMeter?.meter_serial_no ?? null

      return {
        meter_account_id: account.meter_account_id,
        contract_no: contractNo,
        zone_name: zone?.zone_name ?? '—',
        barangay_name: barangay?.barangay_name ?? '—',
        classification_name: classification?.classification_name ?? '—',
        meter_status_name: statusName?.meter_status_name ?? 'Pending',
        meter_serial_no: isPendingSerial(rawSerial) ? null : rawSerial,
        payment_status: account.payment_status ?? false,
        total_connection_fee: Number(account.total_connection_fee ?? 0),
        created_at: account.created_at,
      }
    })
  } catch (error) {
    console.error('[getConsumerMeterAccounts]', error)
    return []
  }
}

export async function updateMeterSerialNo(
  meterId: string,
  serialNo: string,
): Promise<ActionResult> {
  const supabase = await createClient()

  try {
    const { data: { user: actor } } = await supabase.auth.getUser()
    if (!actor) return { status: 'error', message: 'Unauthorised' }

    const serial = serialNo.trim()
    if (!serial) return { status: 'error', message: 'Serial number is required' }
    if (serial.length > 100) {
      return { status: 'error', message: 'Serial number must be 100 characters or less' }
    }

    const { data: meter, error: fetchError } = await supabase
      .from('meters')
      .select(`
        meter_id, meter_serial_no, meter_account_id,
        meter_status:meter_status_id ( meter_status_name )
      `)
      .eq('meter_id', meterId)
      .single()

    if (fetchError || !meter) return { status: 'error', message: 'Meter not found' }

    const statusName = getFirst(meter.meter_status)?.meter_status_name
    if (statusName === 'Removed') {
      return { status: 'error', message: 'A removed meter cannot be edited' }
    }
    // Allow replacing PENDING-* placeholders; block once a real serial is set
    if (meter.meter_serial_no && !isPendingSerial(meter.meter_serial_no)) {
      return { status: 'error', message: 'This meter already has a serial number' }
    }

    // meter_serial_no is UNIQUE, so check first for a friendly message.
    const { data: duplicate } = await supabase
      .from('meters')
      .select('meter_id')
      .eq('meter_serial_no', serial)
      .maybeSingle()

    if (duplicate) {
      return { status: 'error', message: 'This serial number is already used by another meter' }
    }

    const { error } = await supabase
      .from('meters')
      .update({ meter_serial_no: serial, updated_at: new Date().toISOString() })
      .eq('meter_id', meterId)

    if (error) {
      console.error('[updateMeterSerialNo]', error)
      // 23505 = unique violation (race between the check and the update)
      if ((error as any).code === '23505') {
        return { status: 'error', message: 'This serial number is already used by another meter' }
      }
      return { status: 'error', message: error.message }
    }

    await createAuditLog(
      actor.id,
      'UPDATE',
      `Set meter serial number to ${serial}`,
      'meters',
      meterId,
    )

    return { status: 'success', message: 'Serial number saved' }
  } catch (err) {
    console.error('[updateMeterSerialNo]', err)
    return { status: 'error', message: 'Failed to save serial number' }
  }
}