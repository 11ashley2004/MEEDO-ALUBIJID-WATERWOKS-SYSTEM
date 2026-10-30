'use server'

import { createClient } from '@/lib/supabase/server'
import { createAuditLog } from '../audit.action'

// ============================================================================
// Types
// ============================================================================

interface CreateMeterData {
  meter_account_id: string
  meter_serial_no: string
  installation_date?: Date
}

interface UpdateMeterData {
  meter_serial_no?: string
  meter_account_id?: string
  installation_date?: Date
}

interface GetMetersParams {
  page: number
  pageSize: number
  search: string
  statusFilter: string
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

async function resolveMeterStatusId(
  supabase: any,
  statusName: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('meter_status')
    .select('meter_status_id')
    .ilike('meter_status_name', statusName)
    .single()

  if (error || !data) return null
  return data.meter_status_id
}

async function validateSerialUnique(
  supabase: any,
  serialNo: string,
  excludeMeterId?: string
): Promise<boolean> {
  let query = supabase
    .from('meters')
    .select('meter_id')
    .eq('meter_serial_no', serialNo)

  if (excludeMeterId) {
    query = query.neq('meter_id', excludeMeterId)
  }

  const { data } = await query.maybeSingle()
  return !data // true = is unique
}

// ─── Check if meter account already has an active/non-removed meter ──────────────
async function meterAccountHasActiveMeter(
  supabase: any,
  meterAccountId: string,
  excludeMeterId?: string
): Promise<{ hasActiveMeter: boolean; existingMeterStatus?: string }> {
  let query = supabase
    .from('meters')
    .select(`
      meter_id,
      meter_status:meter_status_id ( meter_status_name )
    `)
    .eq('meter_account_id', meterAccountId)

  if (excludeMeterId) {
    query = query.neq('meter_id', excludeMeterId)
  }

  const { data } = await query

  if (!data || data.length === 0) {
    return { hasActiveMeter: false }
  }

  // Check for any meter that is NOT "Removed"
  const activeMeter = data.find((item: any) => {
    const status = Array.isArray(item.meter_status)
      ? item.meter_status[0]?.meter_status_name?.toUpperCase()
      : item.meter_status?.meter_status_name?.toUpperCase()
    return status !== 'REMOVED'
  })

  if (activeMeter) {
    const status = Array.isArray(activeMeter.meter_status)
      ? activeMeter.meter_status[0]?.meter_status_name
      : activeMeter.meter_status?.meter_status_name
    return { hasActiveMeter: true, existingMeterStatus: status || 'Active' }
  }

  return { hasActiveMeter: false }
}

// ============================================================================
// CREATE — Add a new meter (status defaults to Pending)
// ============================================================================

export async function createMeter(meterData: CreateMeterData) {
  const supabase = await createClient()

  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const {
      data: { user: actorUser },
    } = await supabase.auth.getUser()
    if (!actorUser) return { status: 'error', message: 'Unauthorized' }

    // ── 1. Validate meter account exists and is Connected/Active ─────────────────────────
    const { data: meterAccount, error: maError } = await supabase
      .from('meter_accounts')
      .select(`
        meter_account_id,
        account_status:account_status_id ( status_name ),
        consumer:consumer_id ( account_name )
      `)
      .eq('meter_account_id', meterData.meter_account_id)
      .single()

    if (maError || !meterAccount) {
      return { status: 'error', message: 'Meter account not found.' }
    }

    const accountStatus = Array.isArray(meterAccount.account_status)
      ? meterAccount.account_status[0]
      : meterAccount.account_status

    const statusName = accountStatus?.status_name?.toUpperCase()
    if (statusName !== 'CONNECTED' && statusName !== 'ACTIVE') {
      return {
        status: 'error',
        message: 'Meters can only be assigned to Connected/Active meter accounts.',
      }
    }

    // ── 2. Check if meter account already has an active meter ─────────────────────
    const { hasActiveMeter, existingMeterStatus } = await meterAccountHasActiveMeter(
      supabase,
      meterData.meter_account_id
    )

    if (hasActiveMeter) {
      return {
        status: 'error',
        message: `This meter account already has an active meter (${existingMeterStatus}). Only one active meter is allowed per account.`,
      }
    }

    // ── 3. Validate serial number uniqueness ──────────────────────────────────
    const isUnique = await validateSerialUnique(supabase, meterData.meter_serial_no)
    if (!isUnique) {
      return {
        status: 'error',
        message: `Meter serial number "${meterData.meter_serial_no}" is already in use.`,
      }
    }

    // ── 4. Resolve Pending status id ──────────────────────────────────────────
    const pendingStatusId = await resolveMeterStatusId(supabase, 'Pending')
    if (!pendingStatusId) {
      return {
        status: 'error',
        message: 'Could not resolve meter status. Please check the meter_status table.',
      }
    }

    // ── 5. Insert meter ───────────────────────────────────────────────────────
    const insertData: any = {
      meter_account_id: meterData.meter_account_id,
      meter_serial_no: meterData.meter_serial_no,
      meter_status_id: pendingStatusId,
    }

    if (meterData.installation_date) {
      insertData.installation_date = meterData.installation_date.toISOString()
    }

    const { data: meter, error: insertError } = await supabase
      .from('meters')
      .insert(insertData)
      .select()
      .single()

    if (insertError) {
      console.error('Error inserting meter:', insertError)
      return { status: 'error', message: insertError.message }
    }

    // ── 6. Audit log ──────────────────────────────────────────────────────────
    const consumer = Array.isArray(meterAccount.consumer)
      ? meterAccount.consumer[0]
      : meterAccount.consumer

    await createAuditLog(
      actorUser.id,
      'CREATE',
      `Created meter #${meterData.meter_serial_no} for meter account ${meterAccount.meter_account_id}` +
        (consumer ? ` (${consumer.account_name})` : ''),
      'meters',
      meter.meter_id
    )

    return {
      status: 'success',
      data: meter,
      message: `Meter ${meterData.meter_serial_no} created successfully`,
    }
  } catch (error) {
    console.error('Error creating meter:', error)
    return { status: 'error', message: 'Failed to create meter' }
  }
}

// ============================================================================
// GET — Paginated meters list with filters
// ============================================================================

export async function getMeters({
  page,
  pageSize,
  search,
  statusFilter,
}: GetMetersParams) {
  const supabase = await createClient()

  try {
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    const selectString = `
      meter_id,
      meter_account_id,
      meter_serial_no,
      installation_date,
      updated_at,
      meter_status:meter_status_id (
        meter_status_id,
        meter_status_name
      ),
      meter_account:meter_account_id (
        meter_account_id,
        consumer:consumer_id ( consumer_id, account_name ),
        zone:zone_id (
          zone_id, zone_name,
          barangay:barangay_id ( barangay_id, barangay_name )
        ),
        classification:classification_id ( classification_id, classification_name )
      )
    `

    const applyFilters = (query: any) => {
      if (search) {
        query = query.ilike('meter_serial_no', `%${search}%`)
      }
      return query
    }

    const [{ data: rawData, error }, { count, error: countError }] = await Promise.all([
      applyFilters(
        supabase
          .from('meters')
          .select(selectString)
          .order('updated_at', { ascending: false })
          .range(from, to)
      ),
      applyFilters(
        supabase
          .from('meters')
          .select(selectString, { count: 'exact', head: true })
      ),
    ])

    if (error) throw error
    if (countError) throw countError

    const normalize = (item: any) => {
      const ma = Array.isArray(item.meter_account)
        ? item.meter_account[0]
        : item.meter_account

      return {
        ...item,
        meter_status: Array.isArray(item.meter_status)
          ? item.meter_status[0]
          : item.meter_status,
        meter_account: ma
          ? {
              ...ma,
              consumer: Array.isArray(ma.consumer) ? ma.consumer[0] : ma.consumer,
              zone: (() => {
                const z = Array.isArray(ma.zone) ? ma.zone[0] : ma.zone
                if (!z) return z
                return {
                  ...z,
                  barangay: Array.isArray(z.barangay) ? z.barangay[0] : z.barangay,
                }
              })(),
              classification: Array.isArray(ma.classification)
                ? ma.classification[0]
                : ma.classification,
            }
          : ma,
      }
    }

    let normalized = (rawData || []).map(normalize)

    // Apply status filter client-side (nested relation filter limitation)
    if (statusFilter !== 'all') {
      normalized = normalized.filter(
        (m: any) =>
          m.meter_status?.meter_status_name?.toLowerCase() === statusFilter.toLowerCase()
      )
    }

    return {
      data: normalized,
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    }
  } catch (error) {
    console.error('Error fetching meters:', error)
    throw new Error('Failed to fetch meters')
  }
}

// ============================================================================
// GET — Single meter by ID
// ============================================================================

export async function getMeterById(meterId: string) {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from('meters')
      .select(`
        *,
        meter_status:meter_status_id ( meter_status_id, meter_status_name ),
        meter_account:meter_account_id (
          meter_account_id,
          consumer:consumer_id ( consumer_id, account_name ),
          zone:zone_id (
            zone_id, zone_name,
            barangay:barangay_id ( barangay_id, barangay_name )
          ),
          classification:classification_id ( classification_id, classification_name )
        )
      `)
      .eq('meter_id', meterId)
      .single()

    if (error) throw error

    const ma = Array.isArray(data.meter_account)
      ? data.meter_account[0]
      : data.meter_account

    return {
      ...data,
      meter_status: Array.isArray(data.meter_status)
        ? data.meter_status[0]
        : data.meter_status,
      meter_account: ma
        ? {
            ...ma,
            consumer: Array.isArray(ma.consumer) ? ma.consumer[0] : ma.consumer,
            zone: (() => {
              const z = Array.isArray(ma.zone) ? ma.zone[0] : ma.zone
              if (!z) return z
              return { ...z, barangay: Array.isArray(z.barangay) ? z.barangay[0] : z.barangay }
            })(),
            classification: Array.isArray(ma.classification)
              ? ma.classification[0]
              : ma.classification,
          }
        : ma,
    }
  } catch (error) {
    console.error('Error fetching meter:', error)
    throw new Error('Failed to fetch meter')
  }
}

// ============================================================================
// UPDATE — Edit meter (serial number, meter account, installation date)
// ============================================================================

export async function updateMeter(meterId: string, meterData: UpdateMeterData) {
  const supabase = await createClient()

  try {
    const {
      data: { user: actorUser },
    } = await supabase.auth.getUser()
    if (!actorUser) return { status: 'error', message: 'Unauthorized' }

    // ── Fetch original ─────────────────────────────────────────────────────────
    const { data: original, error: fetchError } = await supabase
      .from('meters')
      .select(`
        meter_id, 
        meter_serial_no, 
        meter_account_id,
        installation_date,
        meter_account:meter_account_id ( meter_account_id, meters ( meter_serial_no, created_at ) )
      `)
      .eq('meter_id', meterId)
      .single()

    if (fetchError || !original) {
      return { status: 'error', message: 'Meter not found' }
    }

    // ── Validate serial uniqueness if changing ─────────────────────────────────
    if (
      meterData.meter_serial_no &&
      meterData.meter_serial_no !== original.meter_serial_no
    ) {
      const isUnique = await validateSerialUnique(
        supabase,
        meterData.meter_serial_no,
        meterId
      )
      if (!isUnique) {
        return {
          status: 'error',
          message: `Serial number "${meterData.meter_serial_no}" is already in use.`,
        }
      }
    }

    // ── Validate new meter account if reassigning ─────────────────────────────────
    if (meterData.meter_account_id && meterData.meter_account_id !== original.meter_account_id) {
      // First, check if the new meter account already has an active meter
      const { hasActiveMeter, existingMeterStatus } = await meterAccountHasActiveMeter(
        supabase,
        meterData.meter_account_id,
        meterId
      )

      if (hasActiveMeter) {
        return {
          status: 'error',
          message: `Target meter account already has an active meter (${existingMeterStatus}). Cannot reassign to an account with an existing active meter.`,
        }
      }

      // Then validate the meter account is Connected/Active
      const { data: newMA } = await supabase
        .from('meter_accounts')
        .select(`
          meter_account_id,
          account_status:account_status_id ( status_name )
        `)
        .eq('meter_account_id', meterData.meter_account_id)
        .single()

      if (!newMA) {
        return { status: 'error', message: 'New meter account not found.' }
      }

      const newStatus = Array.isArray(newMA.account_status)
        ? newMA.account_status[0]
        : newMA.account_status

      const statusName = newStatus?.status_name?.toUpperCase()
      if (statusName !== 'CONNECTED' && statusName !== 'ACTIVE') {
        return {
          status: 'error',
          message: 'Meters can only be assigned to Connected/Active meter accounts.',
        }
      }
    }

    // ── Prepare update data ────────────────────────────────────────────────────
    const updateData: any = {
      updated_at: new Date().toISOString()
    }

    if (meterData.meter_serial_no !== undefined) {
      updateData.meter_serial_no = meterData.meter_serial_no
    }
    if (meterData.meter_account_id !== undefined) {
      updateData.meter_account_id = meterData.meter_account_id
    }
    if (meterData.installation_date !== undefined) {
      updateData.installation_date = meterData.installation_date?.toISOString() || null
    }

    // ── Update ─────────────────────────────────────────────────────────────────
    const { data: updated, error: updateError } = await supabase
      .from('meters')
      .update(updateData)
      .eq('meter_id', meterId)
      .select()
      .single()

    if (updateError) throw updateError

    // ── Audit log ──────────────────────────────────────────────────────────────
    const originalMA = Array.isArray(original.meter_account)
      ? original.meter_account[0]
      : original.meter_account

    const changes = Object.keys(updateData)
      .filter(k => k !== 'updated_at')
      .map((k) => `${k}: updated`)
      .join(', ')

    await createAuditLog(
      actorUser.id,
      'UPDATE',
      `Updated meter #${original.meter_serial_no}: ${changes}`,
      'meters',
      meterId
    )

    return { status: 'success', data: updated, message: 'Meter updated successfully' }
  } catch (error) {
    console.error('Error updating meter:', error)
    return { status: 'error', message: 'Failed to update meter' }
  }
}

// ============================================================================
// UPDATE — Change meter status (Active / Defective / Removed / Pending)
// ============================================================================

export async function updateMeterStatus(meterId: string, newStatusName: string) {
  const supabase = await createClient()

  try {
    const {
      data: { user: actorUser },
    } = await supabase.auth.getUser()
    if (!actorUser) return { status: 'error', message: 'Unauthorized' }

    // Resolve target status
    const newStatusId = await resolveMeterStatusId(supabase, newStatusName)
    if (!newStatusId) {
      return { status: 'error', message: `Status "${newStatusName}" not found in meter_status table.` }
    }

    // Fetch original for audit
    const { data: original } = await supabase
      .from('meters')
      .select(`
        meter_serial_no,
        meter_status:meter_status_id ( meter_status_name ),
        meter_account:meter_account_id ( meter_account_id, meters ( meter_serial_no, created_at ) )
      `)
      .eq('meter_id', meterId)
      .single()

    const { data: updated, error: updateError } = await supabase
      .from('meters')
      .update({ 
        meter_status_id: newStatusId, 
        updated_at: new Date().toISOString() 
      })
      .eq('meter_id', meterId)
      .select()
      .single()

    if (updateError) throw updateError

    if (original) {
      const oldStatus = Array.isArray(original.meter_status)
        ? original.meter_status[0]
        : original.meter_status
      const ma = Array.isArray(original.meter_account)
        ? original.meter_account[0]
        : original.meter_account

      await createAuditLog(
        actorUser.id,
        'STATUS_CHANGE',
        `Changed meter #${original.meter_serial_no} status from ${oldStatus?.meter_status_name} to ${newStatusName}` +
          (ma ? ` (meter account ${ma.meter_account_id})` : ''),
        'meters',
        meterId
      )
    }

    return {
      status: 'success',
      data: updated,
      message: `Meter status updated to ${newStatusName}`,
    }
  } catch (error) {
    console.error('Error updating meter status:', error)
    return { status: 'error', message: 'Failed to update meter status' }
  }
}

// ============================================================================
// GET — All meters by meter account (for meter account detail view)
// ============================================================================

export async function getMetersByMeterAccount(meterAccountId: string) {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from('meters')
      .select(`
        meter_id, 
        meter_serial_no, 
        installation_date,
        updated_at,
        meter_status:meter_status_id ( meter_status_id, meter_status_name )
      `)
      .eq('meter_account_id', meterAccountId)
      .order('updated_at', { ascending: false })

    if (error) throw error

    return (data || []).map((item: any) => ({
      ...item,
      meter_status: Array.isArray(item.meter_status)
        ? item.meter_status[0]
        : item.meter_status,
    }))
  } catch (error) {
    console.error('Error fetching meters by meter account:', error)
    throw new Error('Failed to fetch meters')
  }
}

// ============================================================================
// GET — Connected/Active meter accounts (for combobox) - only accounts WITHOUT an existing active meter
// ============================================================================

export async function getConnectedMeterAccounts() {
  const supabase = await createClient()

  try {
    // Resolve Connected/Active status id
    const { data: statusData, error: statusError } = await supabase
      .from('account_status')
      .select('account_status_id')
      .ilike('status_name', 'connected')
      .maybeSingle()

    let activeStatusId = statusData?.account_status_id

    if (!activeStatusId) {
      const { data: altStatus } = await supabase
        .from('account_status')
        .select('account_status_id')
        .ilike('status_name', 'active')
        .maybeSingle()
      activeStatusId = altStatus?.account_status_id
    }

    if (!activeStatusId) {
      throw new Error('Could not resolve Connected/Active status')
    }

    // Get all Connected/Active meter accounts
    const { data: meterAccounts, error } = await supabase
      .from('meter_accounts')
      .select(`
        meter_account_id,
        consumer:consumer_id ( account_name ),
        zone:zone_id (
          zone_name,
          barangay:barangay_id ( barangay_name )
        )
      `)
      .eq('account_status_id', activeStatusId)
      .order('meter_account_id', { ascending: true })

    if (error) throw error

    // Filter out meter accounts that already have an active meter (status != REMOVED)
    const filteredAccounts = []
    
    for (const ma of meterAccounts || []) {
      const { hasActiveMeter } = await meterAccountHasActiveMeter(
        supabase,
        ma.meter_account_id
      )
      
      if (!hasActiveMeter) {
        filteredAccounts.push(ma)
      }
    }

    return filteredAccounts.map((item: any) => {
      const consumer = Array.isArray(item.consumer) ? item.consumer[0] : item.consumer
      const zone = Array.isArray(item.zone) ? item.zone[0] : item.zone
      const barangay = zone
        ? Array.isArray(zone.barangay)
          ? zone.barangay[0]
          : zone.barangay
        : null

      const consumerName = consumer?.account_name || 'Unknown Consumer'

      return {
        meter_account_id: item.meter_account_id,
        meter_serial_no: item.meter_serial_no,
        consumer_name: consumerName,
        location: barangay
          ? `${barangay.barangay_name} — Zone ${zone?.zone_name}`
          : zone
          ? `Zone ${zone.zone_name}`
          : 'Unknown Location',
      }
    })
  } catch (error) {
    console.error('Error fetching connected meter accounts:', error)
    throw new Error('Failed to fetch connected meter accounts')
  }
}