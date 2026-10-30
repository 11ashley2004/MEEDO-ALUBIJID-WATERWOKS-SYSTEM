'use server'

import { createClient } from '@/lib/supabase/server'
import { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { createNotification, createNotifications, getUserIdsByRole } from '../notifications/notifications'

// ============================================================
// TYPES
// ============================================================

export interface MeterReadingAdjustmentRecord {
  reading_adjustment_id: string
  reading_id:            string
  original_reading:      number
  adjusted_reading:      number
  proof_image_url:       string | null
  requested_by:          string
  approved_by:           string | null
  requested_date:        string | null
  approved_at:           string | null
  status_id:             string | null
  reason:                string | null

  adjustment_status: {
    status_id:   string
    status_name: string
  } | null

  requested_by_user: {
    user_id:     string
    first_name:  string
    last_name:   string
    middle_name: string | null
  }

  approved_by_user: {
    user_id:     string
    first_name:  string
    last_name:   string
    middle_name: string | null
  } | null

  meter_reading: {
    reading_id:           string
    reading_period_id:    string
    present_reading:      number | null
    reading_date:         string | null
    reading_status: {
      status_code: string | null
    } | null
    meter: {
      meter_id:        string
      meter_serial_no: string | null
      meter_account: {
        meter_account_id: string
        meter_serial_no?: string | null
        consumer: {
          consumer_id:  string
          account_name: string
        }
        zone: {
          zone_id:   string
          zone_name: string
          barangay: {
            barangay_id:   string
            barangay_name: string
          }
        }
      }
    }
  }
}

// ============================================================
// CONSTANTS
// ============================================================

const STATUS = {
  PENDING:   'pending',
  APPROVED:  'approved',
  REJECTED:  'rejected',
  CANCELLED: 'cancelled',
} as const

const PROOF_BUCKET      = 'adjustment-proofs'
const PROOF_MAX_SIZE    = 5 * 1024 * 1024 // 5 MB
const PROOF_MIME_TYPES  = ['image/png', 'image/jpeg']
const PROOF_SIGNED_TTL  = 3600 // 1 hour

// ============================================================
// HELPERS
// ============================================================

function unwrap<T>(val: T | T[] | null | undefined): T | null {
  if (val == null) return null
  return Array.isArray(val) ? (val[0] ?? null) : val
}

async function resolveStatusId(
  supabase: SupabaseClient,
  statusName: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('bulk_status')
    .select('status_id')
    .ilike('status_name', statusName)
    .single()
  return data?.status_id ?? null
}

// Latest reading period id, by period_start descending. Used to decide
// whether an adjustment request is still against the current period, or
// against a historical one that has already been closed out.
async function getLatestPeriodId(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase
    .from('reading_periods')
    .select('reading_period_id')
    .order('period_start', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.reading_period_id ?? null
}

function normalizeRow(row: any): MeterReadingAdjustmentRecord | null {
  const adjustmentStatus = unwrap(row.adjustment_status)
  const requestedByUser  = unwrap(row.requested_by_user)
  const approvedByUser   = unwrap(row.approved_by_user)
  const meterReading     = unwrap(row.meter_reading)

  if (!requestedByUser || !meterReading) return null

  const meter = unwrap(meterReading.meter)
  if (!meter) return null

  const meterAccount = unwrap(meter.meter_account)
  if (!meterAccount) return null

  const consumer = unwrap(meterAccount.consumer)
  const zone = unwrap(meterAccount.zone)
  const barangay = unwrap(zone?.barangay)
  if (!consumer || !zone || !barangay) return null

  const readingStatus = unwrap(meterReading.reading_status)

  return {
    reading_adjustment_id: row.reading_adjustment_id,
    reading_id:            row.reading_id,
    original_reading:      Number(row.original_reading),
    adjusted_reading:      Number(row.adjusted_reading),
    proof_image_url:       row.proof_image_url ?? null,
    requested_by:          row.requested_by,
    approved_by:           row.approved_by ?? null,
    requested_date:        row.requested_date ?? null,
    approved_at:           row.approved_at ?? null,
    status_id:             row.status_id ?? null,
    reason:                row.reason ?? null,

    adjustment_status: adjustmentStatus
      ? { status_id: adjustmentStatus.status_id, status_name: adjustmentStatus.status_name }
      : null,

    requested_by_user: {
      user_id:     requestedByUser.user_id,
      first_name:  requestedByUser.first_name,
      last_name:   requestedByUser.last_name,
      middle_name: requestedByUser.middle_name ?? null,
    },

    approved_by_user: approvedByUser
      ? {
          user_id:     approvedByUser.user_id,
          first_name:  approvedByUser.first_name,
          last_name:   approvedByUser.last_name,
          middle_name: approvedByUser.middle_name ?? null,
        }
      : null,

    meter_reading: {
      reading_id:           meterReading.reading_id,
      reading_period_id:    meterReading.reading_period_id,
      reading_status: readingStatus
        ? { status_code: readingStatus.status_code ?? null }
        : null,
      present_reading: meterReading.present_reading != null ? Number(meterReading.present_reading) : null,
      reading_date: meterReading.reading_date ?? null,
      meter: {
        meter_id:        meter.meter_id,
        meter_serial_no: meter.meter_serial_no,
        meter_account: {
          meter_account_id:   meterAccount.meter_account_id,
          consumer: {
            consumer_id: consumer.consumer_id,
            account_name: consumer.account_name,
          },
          zone: {
            zone_id:   zone.zone_id,
            zone_name: zone.zone_name,
            barangay: {
              barangay_id:   barangay.barangay_id,
              barangay_name: barangay.barangay_name,
            },
          },
        },
      },
    },
  }
}

// ============================================================
// PROOF IMAGE HELPERS
// ============================================================

function validateProofFile(file: File): string | null {
  if (!file || file.size === 0) return 'Proof image is required.'
  if (file.size > PROOF_MAX_SIZE) return 'Proof image must be 5 MB or less.'
  if (!PROOF_MIME_TYPES.includes(file.type)) return 'Only PNG and JPG images are allowed.'
  return null
}

async function uploadAdjustmentProof(
  supabase: SupabaseClient,
  userId: string,
  file: File,
): Promise<string | null> {
  const err = validateProofFile(file)
  if (err) return null

  const ext = file.name.split('.').pop()
  const fileName = `${userId}/${crypto.randomUUID()}.${ext}`

  const { error } = await supabase.storage
    .from(PROOF_BUCKET)
    .upload(fileName, file, { contentType: file.type })

  if (error) {
    console.error('[uploadAdjustmentProof]', error)
    return null
  }

  const { data } = supabase.storage
    .from(PROOF_BUCKET)
    .getPublicUrl(fileName)

  return data.publicUrl
}

async function deleteAdjustmentProof(
  supabase: SupabaseClient,
  url: string,
): Promise<void> {
  try {
    const pathIndex = url.indexOf(`/${PROOF_BUCKET}/`)
    if (pathIndex === -1) return
    const filePath = url.slice(pathIndex + `/${PROOF_BUCKET}/`.length)
    await supabase.storage.from(PROOF_BUCKET).remove([filePath])
  } catch (err) {
    console.error('[deleteAdjustmentProof]', err)
  }
}

async function getSignedProofUrl(
  supabase: SupabaseClient,
  proofUrl: string,
): Promise<string | null> {
  try {
    const pathIndex = proofUrl.indexOf(`/${PROOF_BUCKET}/`)
    if (pathIndex === -1) return null
    const filePath = proofUrl.slice(pathIndex + `/${PROOF_BUCKET}/`.length)
    const { data, error } = await supabase.storage
      .from(PROOF_BUCKET)
      .createSignedUrl(filePath, PROOF_SIGNED_TTL)
    if (error) return null
    return data.signedUrl
  } catch {
    return null
  }
}

// ============================================================
// SHARED SELECT
// ============================================================

const ADJUSTMENT_SELECT = `
  reading_adjustment_id,
  reading_id,
  original_reading,
  adjusted_reading,
  proof_image_url,
  requested_by,
  approved_by,
  requested_date,
  approved_at,
  status_id,
  reason,
  adjustment_status:bulk_status (
    status_id,
    status_name
  ),
  requested_by_user:users!requested_by (
    user_id, first_name, last_name, middle_name
  ),
  approved_by_user:users!approved_by (
    user_id, first_name, last_name, middle_name
  ),
  meter_reading:meter_readings (
    reading_id,
    reading_period_id,
    present_reading,
    reading_date,
    reading_status:reading_status_id (
      status_code
    ),
    meter:meter_id (
      meter_id,
      meter_serial_no,
      meter_account:meter_account_id (
        meter_account_id,
        consumer:consumer_id (
          consumer_id, account_name
        ),
        zone:zone_id (
          zone_id, zone_name,
          barangay:barangay_id (
            barangay_id, barangay_name
          )
        )
      )
    )
  )
`

// ============================================================
// AUTH GUARD
// ============================================================

async function requireAuth(supabase: SupabaseClient) {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw { __authError: true }
  return user
}

// ============================================================
// getAdjustmentByReadingId
// ============================================================

export async function getAdjustmentByReadingId(readingId: string): Promise<{
  status:   'success' | 'error'
  data?:    MeterReadingAdjustmentRecord | null
  message?: string
}> {
  const supabase = await createClient()

  try {
    await requireAuth(supabase)

    const pendingId = await resolveStatusId(supabase, STATUS.PENDING)
    if (!pendingId) return { status: 'success', data: null }

    const { data, error } = await supabase
      .from('meter_reading_adjustments')
      .select(ADJUSTMENT_SELECT)
      .eq('reading_id', readingId)
      .eq('status_id', pendingId)
      .order('requested_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error

    return { status: 'success', data: data ? normalizeRow(data) : null }
  } catch (err: any) {
    if (err?.__authError) return { status: 'error', message: 'User not authenticated' }
    console.error('[getAdjustmentByReadingId]', err)
    return { status: 'error', message: err?.message ?? 'Failed to load adjustment' }
  }
}

// ============================================================
// getAdjustmentsByReadingIds
// ============================================================

export async function getAdjustmentsByReadingIds(readingIds: string[]): Promise<{
  status:   'success' | 'error'
  data?:    Map<string, MeterReadingAdjustmentRecord>
  message?: string
}> {
  if (readingIds.length === 0) return { status: 'success', data: new Map() }

  const supabase = await createClient()

  try {
    await requireAuth(supabase)

    const pendingId = await resolveStatusId(supabase, STATUS.PENDING)
    if (!pendingId) return { status: 'success', data: new Map() }

    const { data, error } = await supabase
      .from('meter_reading_adjustments')
      .select(ADJUSTMENT_SELECT)
      .in('reading_id', readingIds)
      .eq('status_id', pendingId)
      .order('requested_date', { ascending: false })

    if (error) throw error

    const map = new Map<string, MeterReadingAdjustmentRecord>()
    for (const row of data ?? []) {
      const normalized = normalizeRow(row)
      if (normalized && !map.has(normalized.reading_id)) {
        map.set(normalized.reading_id, normalized)
      }
    }

    return { status: 'success', data: map }
  } catch (err: any) {
    if (err?.__authError) return { status: 'error', message: 'User not authenticated' }
    console.error('[getAdjustmentsByReadingIds]', err)
    return { status: 'error', message: err?.message ?? 'Failed to load adjustments' }
  }
}

// ============================================================
// submitMeterReadingAdjustment
// ============================================================

export async function submitMeterReadingAdjustment(payload: {
  reading_id:        string
  original_reading:  number
  adjusted_reading:  number
  reason:            string
  proof?:            File | null   // ← now optional (admin can skip it)
}): Promise<{ status: 'success' | 'error'; message?: string; data?: { reading_adjustment_id: string } }> {
  const supabase = await createClient()

  try {
    const user = await requireAuth(supabase)

    // ── 0. Validate proof only if one was provided ──
    const hasProof = !!payload.proof && payload.proof.size > 0
    if (hasProof) {
      const proofErr = validateProofFile(payload.proof!)
      if (proofErr) return { status: 'error', message: proofErr }
    }

    const { data: reading, error: readingErr } = await supabase
      .from('meter_readings')
      .select(`
        reading_id,
        present_reading,
        reading_date,
        reading_status:reading_status_id (
          status_code
        )
      `)
      .eq('reading_id', payload.reading_id)
      .single()

    if (readingErr || !reading) {
      console.error('Reading error:', readingErr)
      return { status: 'error', message: 'Reading not found.' }
    }
    if (!reading.reading_status) {
      return { status: 'error', message: 'Cannot adjust an unrecorded reading.' }
    }

    const pendingId = await resolveStatusId(supabase, STATUS.PENDING)

    if (pendingId) {
      const { data: existing } = await supabase
        .from('meter_reading_adjustments')
        .select('reading_adjustment_id')
        .eq('reading_id', payload.reading_id)
        .eq('status_id', pendingId)
        .maybeSingle()

      if (existing) {
        return { status: 'error', message: 'This reading already has a pending adjustment request.' }
      }
    }

    // ── Upload proof only if provided; otherwise proceed without it ──
    let proofImageUrl: string | null = null
    if (hasProof) {
      proofImageUrl = await uploadAdjustmentProof(supabase, user.id, payload.proof!)
      if (!proofImageUrl) {
        return { status: 'error', message: 'Failed to upload proof image. Please try again.' }
      }
    }

    const { data: inserted, error: insertErr } = await supabase
      .from('meter_reading_adjustments')
      .insert({
        reading_id:        payload.reading_id,
        original_reading:  payload.original_reading,
        adjusted_reading:  payload.adjusted_reading,
        requested_by:      user.id,
        reason:            payload.reason,
        requested_date:    new Date().toISOString(),
        status_id:         pendingId ?? null,
        proof_image_url:   proofImageUrl,   // may be null now
      })
      .select('reading_adjustment_id')
      .single()

    if (insertErr) {
      // Rollback: remove the orphaned upload, if any
      if (proofImageUrl) await deleteAdjustmentProof(supabase, proofImageUrl)
      console.error('Insert error:', insertErr)
      throw insertErr
    }

    await supabase.from('audit_logs').insert({
      user_id:      user.id,
      action:       'REQUEST_READING_ADJUSTMENT',
      description:  `Requested meter reading adjustment from ${payload.original_reading} to ${payload.adjusted_reading} m³${hasProof ? '' : ' (no proof attached)'}`,
      target_table: 'meter_reading_adjustments',
      target_id:    payload.reading_id,
    })

    const { data: acctInfo } = await supabase
      .from('meter_readings')
      .select(`
        meter:meter_id (
          meter_serial_no,
          meter_account:meter_account_id (
            meter_account_id
          )
        )
      `)
      .eq('reading_id', payload.reading_id)
      .single()

    const { data: requesterProfile } = await supabase
      .from('users')
      .select('first_name, last_name')
      .eq('user_id', user.id)
      .single()

    const meter = unwrap(acctInfo?.meter)
    const meterAccount = unwrap(meter?.meter_account)

    if (meterAccount) {
      const staffIds = await getUserIdsByRole(['admin', 'consultant'])

      await createNotifications(
        staffIds.map((id) => ({ userId: id })),
        'METER_READING_ADJUSTED_PENDING',
        {
          meter_serial_no: meter?.meter_serial_no ?? null,
          reader_name: requesterProfile
            ? `${requesterProfile.first_name} ${requesterProfile.last_name}`
            : 'A reader',
        },
        meterAccount.meter_account_id,
        inserted.reading_adjustment_id,
      )
    }

    revalidatePath('/meter-reading')
    return { status: 'success', data: { reading_adjustment_id: inserted.reading_adjustment_id } }
  } catch (err: any) {
    if (err?.__authError) return { status: 'error', message: 'User not authenticated' }
    console.error('[submitMeterReadingAdjustment]', err)
    return { status: 'error', message: err?.message ?? 'Failed to submit adjustment' }
  }
}

// ============================================================
// updateMeterReadingAdjustment
// ============================================================

export async function updateMeterReadingAdjustment(payload: {
  reading_adjustment_id: string
  adjusted_reading:      number
  reason:                string
  proof?:                File | null    // ← optional replacement
}): Promise<{ status: 'success' | 'error'; message?: string }> {
  const supabase = await createClient()

  try {
    const user = await requireAuth(supabase)

    const { data: adj, error: adjErr } = await supabase
      .from('meter_reading_adjustments')
      .select('reading_adjustment_id, status_id, proof_image_url')
      .eq('reading_adjustment_id', payload.reading_adjustment_id)
      .single()

    if (adjErr || !adj)
      return { status: 'error', message: 'Adjustment not found.' }

    const pendingId = await resolveStatusId(supabase, STATUS.PENDING)

    if (!pendingId || adj.status_id !== pendingId)
      return { status: 'error', message: 'Only pending adjustments can be edited.' }

    // ── Optional proof replacement ──
    let newProofUrl: string | null = null
    if (payload.proof && payload.proof.size > 0) {
      const proofErr = validateProofFile(payload.proof)
      if (proofErr) return { status: 'error', message: proofErr }

      newProofUrl = await uploadAdjustmentProof(supabase, user.id, payload.proof)
      if (!newProofUrl) return { status: 'error', message: 'Failed to upload new proof image.' }
    }

    const updatePayload: Record<string, any> = {
      adjusted_reading: payload.adjusted_reading,
      reason:           payload.reason,
    }
    if (newProofUrl) updatePayload.proof_image_url = newProofUrl

    const { error: updateErr } = await supabase
      .from('meter_reading_adjustments')
      .update(updatePayload)
      .eq('reading_adjustment_id', payload.reading_adjustment_id)

    if (updateErr) {
      // Rollback the new upload if the row update failed
      if (newProofUrl) await deleteAdjustmentProof(supabase, newProofUrl)
      throw updateErr
    }

    // Old proof no longer referenced — clean it up
    if (newProofUrl && adj.proof_image_url && adj.proof_image_url !== newProofUrl) {
      await deleteAdjustmentProof(supabase, adj.proof_image_url)
    }

    await supabase.from('audit_logs').insert({
      user_id:      user.id,
      action:       'UPDATE_READING_ADJUSTMENT',
      description:  `Updated pending adjustment to adjusted_reading=${payload.adjusted_reading} m³${newProofUrl ? ' (proof replaced)' : ''}`,
      target_table: 'meter_reading_adjustments',
      target_id:    payload.reading_adjustment_id,
    })

    revalidatePath('/meter-reading')
    return { status: 'success' }
  } catch (err: any) {
    if (err?.__authError) return { status: 'error', message: 'User not authenticated' }
    console.error('[updateMeterReadingAdjustment]', err)
    return { status: 'error', message: err?.message ?? 'Failed to update adjustment' }
  }
}

// ============================================================
// getAllReadingAdjustmentRequests
// ============================================================

export async function getAllReadingAdjustmentRequests(): Promise<{
  status:   'success' | 'error'
  data?:    MeterReadingAdjustmentRecord[]
  message?: string
}> {
  const supabase = await createClient()

  try {
    await requireAuth(supabase)

    const { data, error } = await supabase
      .from('meter_reading_adjustments')
      .select(ADJUSTMENT_SELECT)
      .order('requested_date', { ascending: false })

    if (error) throw error

    const normalized = (data ?? [])
      .map(normalizeRow)
      .filter((r): r is MeterReadingAdjustmentRecord => r !== null)

    return { status: 'success', data: normalized }
  } catch (err: any) {
    if (err?.__authError) return { status: 'error', message: 'User not authenticated' }
    console.error('[getAllReadingAdjustmentRequests]', err)
    return { status: 'error', message: err?.message ?? 'Failed to load adjustment requests' }
  }
}

// ============================================================
// approveReadingAdjustmentRequest
// ============================================================
// Approving an adjustment only makes sense while its reading still belongs
// to the LATEST reading period. Once a newer period has been started, the
// adjustment is stale: billing for that historical period has already been
// finalized, so recalculating it here would rewrite closed books.
//
// When a stale request is approved, it is automatically REJECTED instead,
// with a message the reviewer can act on. This keeps the adjustment queue
// honest without requiring the reviewer to know the period state.

export async function approveReadingAdjustmentRequest(
  adjustmentId: string,
): Promise<{ status: 'success' | 'error'; message?: string }> {
  const supabase = await createClient()

  try {
    const user = await requireAuth(supabase)

    const pendingId = await resolveStatusId(supabase, STATUS.PENDING)
    if (!pendingId)
      return { status: 'error', message: 'Status "pending" not configured.' }

    const approvedId = await resolveStatusId(supabase, STATUS.APPROVED)
    if (!approvedId)
      return { status: 'error', message: 'Status "approved" not configured.' }

    const rejectedId = await resolveStatusId(supabase, STATUS.REJECTED)
    if (!rejectedId)
      return { status: 'error', message: 'Status "rejected" not configured.' }

    const { data: adj, error: adjErr } = await supabase
      .from('meter_reading_adjustments')
      .select(`
        reading_adjustment_id,
        reading_id,
        original_reading,
        adjusted_reading,
        requested_by,
        status_id,
        adjustment_status:bulk_status (
          status_name
        ),
        meter_reading:meter_readings (
          reading_period_id,
          reading_status:reading_status_id (
            status_code
          ),
          meter:meter_id (
            meter_serial_no,
            meter_account:meter_account_id (
              meter_account_id
            )
          )
        )
      `)
      .eq('reading_adjustment_id', adjustmentId)
      .single()

    if (adjErr || !adj)
      return { status: 'error', message: 'Adjustment not found.' }

    if (adj.status_id !== pendingId) {
      const currentStatus = unwrap(adj.adjustment_status)
      const statusName = currentStatus?.status_name?.toLowerCase()

      const message = statusName
        ? statusName === 'approved'
          ? 'This adjustment request has already been approved.'
          : statusName === 'rejected'
            ? 'This adjustment request has already been rejected and can no longer be approved.'
            : statusName === 'cancelled'
              ? 'This adjustment request has already been cancelled by the requester and can no longer be approved.'
              : `This adjustment request is already "${statusName}" and can no longer be approved.`
        : 'This adjustment request is no longer pending and can no longer be approved.'

      return { status: 'error', message }
    }

    // ── Period guard ──────────────────────────────────────────────
    const meterReading = unwrap(adj.meter_reading)
    const readingPeriodId: string | null = meterReading?.reading_period_id ?? null

    if (!readingPeriodId) {
      return { status: 'error', message: 'This adjustment has no linked reading period.' }
    }

    const latestPeriodId = await getLatestPeriodId(supabase)
    if (!latestPeriodId) {
      return { status: 'error', message: 'No reading period found — cannot verify period state.' }
    }

    if (readingPeriodId !== latestPeriodId) {
      const nowIso = new Date().toISOString()

      const { error: autoRejectErr } = await supabase
        .from('meter_reading_adjustments')
        .update({
          status_id:   rejectedId,
          approved_by: user.id,
          approved_at: nowIso,
        })
        .eq('reading_adjustment_id', adjustmentId)

      if (autoRejectErr) {
        console.error('[approveReadingAdjustmentRequest] auto-reject failed:', autoRejectErr)
        return {
          status: 'error',
          message: 'Could not auto-reject the stale adjustment. Please try again.',
        }
      }

      await supabase.from('audit_logs').insert({
        user_id:      user.id,
        action:       'AUTO_REJECT_STALE_READING_ADJUSTMENT',
        description:  `Auto-rejected reading adjustment #${adjustmentId} — reading belongs to a past period`,
        target_table: 'meter_reading_adjustments',
        target_id:    adjustmentId,
      })

      const meter = unwrap((meterReading as any)?.meter)
      const meterAccount = unwrap(meter?.meter_account)

      if (meterAccount) {
        const staffIds = await getUserIdsByRole(['admin', 'consultant'])
        await createNotifications(
          [{ userId: adj.requested_by }, ...staffIds.map((id) => ({ userId: id }))],
          'METER_READING_ADJUSTED_REJECTED',
          { meter_serial_no: meter?.meter_serial_no ?? null, status: 'rejected' },
          meterAccount.meter_account_id,
          adjustmentId,
        )
      }

      revalidatePath('/admin/reading-adjustments')
      return {
        status: 'error',
        message: 'This adjustment is for a past reading period — it has been automatically rejected.',
      }
    }

    // ── From here on, the reading is in the current period. ────────
    const { error: readingUpdateErr } = await supabase
      .from('meter_readings')
      .update({ present_reading: adj.adjusted_reading })
      .eq('reading_id', adj.reading_id)

    if (readingUpdateErr) throw readingUpdateErr

    const { data: consumption, error: consumptionFetchErr } = await supabase
      .from('water_consumptions')
      .select('consumption_id, meter_account_id, previous_reading, billing_basis_id')
      .eq('reading_id', adj.reading_id)
      .maybeSingle()

    if (consumptionFetchErr) throw consumptionFetchErr
    if (!consumption)
      return { status: 'error', message: 'No consumption record found for this reading.' }

    const { consumption_id } = consumption
    const newConsumption = Math.max(0, adj.adjusted_reading - Number(consumption.previous_reading))

    // ── Estimated-billing guard ───────────────────────────────────
    // A water-leak reading (or any reading billed on an estimate, i.e.
    // billing_basis_id is set by the DB trigger) is billed on the 3-month
    // average / last normal consumption, NOT on the real reading. So the
    // adjustment only corrects the real consumption. billed_consumption,
    // the community breakdowns and the billing row stay exactly as they are.
    const readingStatus = unwrap((meterReading as any)?.reading_status)
    const isLeakReading = readingStatus?.status_code === 'LEAK_AFTER_METER'
    const keepEstimatedBilling = isLeakReading || consumption.billing_basis_id != null

    const { data: meterData, error: meterErr } = await supabase
      .from('meter_readings')
      .select(`
        meter:meter_id (
          meter_serial_no,
          meter_account:meter_account_id (
            meter_account_id,
            classification_id
          )
        )
      `)
      .eq('reading_id', adj.reading_id)
      .single()

    if (meterErr) throw meterErr

    const meter = unwrap(meterData.meter)
    const meterAccount = unwrap(meter?.meter_account)
    const meterAccountId = meterAccount?.meter_account_id

    if (!meterAccountId) {
      return { status: 'error', message: 'Meter account not found for this reading.' }
    }

    if (keepEstimatedBilling) {
      // Only the real values change. billed_consumption is NOT touched.
      const { error: consumptionUpdateErr } = await supabase
        .from('water_consumptions')
        .update({
          present_reading: adj.adjusted_reading,
          consumption:     newConsumption,
        })
        .eq('consumption_id', consumption_id)

      if (consumptionUpdateErr) throw consumptionUpdateErr
    } else {
      const { data: tiers, error: tiersErr } = await supabase
        .from('community_charges')
        .select('community_charge_id, min_consumption, max_consumption, multiplier')
        .eq('classification_id', meterAccount.classification_id)
        .order('min_consumption', { ascending: true })

      if (tiersErr || !tiers?.length)
        return { status: 'error', message: 'No charge tiers found for this classification.' }

      const blocks = computeBreakdownBlocks(newConsumption, tiers)
      const billedConsumptionFromBlocks = blocks.reduce((sum, b) => sum + b.units_used, 0)

      const { error: consumptionUpdateErr } = await supabase
        .from('water_consumptions')
        .update({
          present_reading:    adj.adjusted_reading,
          consumption:        newConsumption,
          billed_consumption: billedConsumptionFromBlocks,
        })
        .eq('consumption_id', consumption_id)

      if (consumptionUpdateErr) throw consumptionUpdateErr

      const { error: deleteBreakdownErr } = await supabase
        .from('billing_community_breakdowns')
        .delete()
        .eq('consumption_id', consumption_id)

      if (deleteBreakdownErr) throw deleteBreakdownErr

      if (blocks.length > 0) {
        const { error: insertBreakdownErr } = await supabase
          .from('billing_community_breakdowns')
          .insert(
            blocks.map((b) => ({
              consumption_id,
              community_charge_id: b.community_charge_id,
              block_order:         b.block_order,
              units_used:          b.units_used,
              rate_per_unit:       b.rate_per_unit,
              subtotal:            b.subtotal,
            })),
          )
        if (insertBreakdownErr) throw insertBreakdownErr
      }

      const { data: billingRow, error: billingFetchErr } = await supabase
        .from('billing')
        .select('billing_id, previous_balance, remaining_balance, total_billing, current_billing')
        .eq('consumption_id', consumption_id)
        .maybeSingle()

      if (billingFetchErr) throw billingFetchErr

      if (billingRow) {
        const new_current_billing = roundTwo(blocks.reduce((s, b) => s + b.subtotal, 0))

        const { data: penaltyRows } = await supabase
          .from('billing')
          .select('penalty_amount')
          .eq('billing_id', billingRow.billing_id)

        const penalty_total = roundTwo(
          (penaltyRows ?? []).reduce((s, p) => s + Number(p.penalty_amount), 0),
        )

        const { data: meterChargeRows } = await supabase
          .from('meter_installment_charges')
          .select('amount')
          .eq('billing_id', billingRow.billing_id)

        const meter_charge = roundTwo(
          (meterChargeRows ?? []).reduce((s, c) => s + Number(c.amount), 0),
        )

        const previous_balance = Number(billingRow.previous_balance ?? 0)
        const new_total_billing = roundTwo(
          new_current_billing + previous_balance + penalty_total + meter_charge,
        )

        const already_paid = roundTwo(
          Number(billingRow.total_billing) - Number(billingRow.remaining_balance),
        )
        const new_remaining_balance = roundTwo(Math.max(0, new_total_billing - already_paid))

        const new_billing_status_id = await resolveBillingStatusId(
          supabase,
          new_remaining_balance,
          already_paid,
        )

        const billingUpdate: Record<string, any> = {
          current_billing:   new_current_billing,
          total_billing:     new_total_billing,
          remaining_balance: new_remaining_balance,
          updated_at:        new Date().toISOString(),
        }
        if (new_billing_status_id) billingUpdate.billing_status_id = new_billing_status_id

        const { error: billingUpdateErr } = await supabase
          .from('billing')
          .update(billingUpdate)
          .eq('billing_id', billingRow.billing_id)

        if (billingUpdateErr) throw billingUpdateErr
      }
    }

    const { error: approveErr } = await supabase
      .from('meter_reading_adjustments')
      .update({
        status_id:   approvedId,
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      })
      .eq('reading_adjustment_id', adjustmentId)

    if (approveErr) throw approveErr

    await supabase.from('audit_logs').insert({
      user_id:      user.id,
      action:       'APPROVE_READING_ADJUSTMENT',
      description: keepEstimatedBilling
        ? `Approved reading adjustment from ${adj.original_reading} to ${adj.adjusted_reading} m³ — consumption updated, estimated billing left unchanged`
        : `Approved reading adjustment from ${adj.original_reading} to ${adj.adjusted_reading} m³ — breakdowns and billing recalculated`,
      target_table: 'meter_reading_adjustments',
      target_id:    adjustmentId,
    })

    const staffIds = await getUserIdsByRole(['admin', 'consultant'])

    await createNotifications(
      [{ userId: adj.requested_by }, ...staffIds.map((id) => ({ userId: id }))],
      'METER_READING_ADJUSTED_APPROVED',
      { meter_serial_no: meter?.meter_serial_no ?? null, status: 'approved' },
      meterAccountId,
      adjustmentId,
    )

    revalidatePath('/meter-reading')
    revalidatePath('/admin/reading-adjustments')
    return {
      status: 'success',
      message: keepEstimatedBilling
        ? 'Reading adjustment approved. Consumption updated; billing stays on the estimated average.'
        : 'Reading adjustment approved and billing recalculated.',
    }
  } catch (err: any) {
    if (err?.__authError) return { status: 'error', message: 'User not authenticated' }
    console.error('[approveReadingAdjustmentRequest]', err)
    return { status: 'error', message: err?.message ?? 'Failed to approve adjustment' }
  }
}

// ============================================================
// rejectReadingAdjustmentRequest
// ============================================================

export async function rejectReadingAdjustmentRequest(
  adjustmentId: string,
): Promise<{ status: 'success' | 'error'; message?: string }> {
  const supabase = await createClient()

  try {
    const user = await requireAuth(supabase)

    const pendingId = await resolveStatusId(supabase, STATUS.PENDING)
    if (!pendingId)
      return { status: 'error', message: 'Status "pending" not configured.' }

    const rejectedId = await resolveStatusId(supabase, STATUS.REJECTED)
    if (!rejectedId)
      return { status: 'error', message: 'Status "rejected" not configured.' }

    const { data: adj, error: adjErr } = await supabase
      .from('meter_reading_adjustments')
      .select(`
        reading_adjustment_id,
        requested_by,
        reading_id,
        status_id,
        adjustment_status:bulk_status (
          status_name
        ),
        meter_reading:meter_readings (
          meter:meter_id (
            meter_serial_no,
            meter_account:meter_account_id (
              meter_account_id
            )
          )
        )
      `)
      .eq('reading_adjustment_id', adjustmentId)
      .single()

    if (adjErr || !adj)
      return { status: 'error', message: 'Adjustment not found.' }

    if (adj.status_id !== pendingId) {
      const currentStatus = unwrap(adj.adjustment_status)
      const statusName = currentStatus?.status_name?.toLowerCase()

      const message = statusName
        ? statusName === 'approved'
          ? 'This adjustment request has already been approved and can no longer be rejected.'
          : statusName === 'rejected'
            ? 'This adjustment request has already been rejected.'
            : statusName === 'cancelled'
              ? 'This adjustment request has already been cancelled by the requester and can no longer be rejected.'
              : `This adjustment request is already "${statusName}" and can no longer be rejected.`
        : 'This adjustment request is no longer pending and can no longer be rejected.'

      return { status: 'error', message }
    }

    const { error: updateErr } = await supabase
      .from('meter_reading_adjustments')
      .update({
        status_id:   rejectedId,
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      })
      .eq('reading_adjustment_id', adjustmentId)

    if (updateErr) throw updateErr

    await supabase.from('audit_logs').insert({
      user_id:      user.id,
      action:       'REJECT_READING_ADJUSTMENT',
      description:  `Rejected reading adjustment #${adjustmentId}`,
      target_table: 'meter_reading_adjustments',
      target_id:    adjustmentId,
    })

    const meterReading = unwrap(adj.meter_reading)
    const meter = unwrap(meterReading?.meter)
    const meterAccount = unwrap(meter?.meter_account)

    if (meterAccount) {
      const staffIds = await getUserIdsByRole(['admin', 'consultant'])

      await createNotifications(
        [{ userId: adj.requested_by }, ...staffIds.map((id) => ({ userId: id }))],
        'METER_READING_ADJUSTED_REJECTED',
        { meter_serial_no: meter?.meter_serial_no ?? undefined, status: 'rejected' },
        meterAccount.meter_account_id,
        adjustmentId,
      )
    }

    revalidatePath('/admin/reading-adjustments')
    return { status: 'success', message: 'Adjustment request rejected.' }
  } catch (err: any) {
    if (err?.__authError) return { status: 'error', message: 'User not authenticated' }
    console.error('[rejectReadingAdjustmentRequest]', err)
    return { status: 'error', message: err?.message ?? 'Failed to reject adjustment' }
  }
}

// ============================================================
// PRIVATE HELPERS
// ============================================================

function roundTwo(n: number): number {
  return parseFloat(n.toFixed(2))
}

interface RawTier {
  community_charge_id: string
  min_consumption:     number | string
  max_consumption:     number | string | null
  multiplier:          number | string
}

interface BreakdownBlock {
  community_charge_id: string
  block_order:         number
  units_used:          number
  rate_per_unit:       number
  subtotal:            number
}

function computeBreakdownBlocks(consumption: number, tiers: RawTier[]): BreakdownBlock[] {
  const sorted = [...tiers].sort(
    (a, b) => Number(a.min_consumption) - Number(b.min_consumption),
  )

  const blocks: BreakdownBlock[] = []
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
      block_order:         i + 1,
      units_used:          units,
      rate_per_unit:       rate,
      subtotal:            roundTwo(units * rate),
    })
    remaining -= units
  }

  return blocks
}

async function resolveBillingStatusId(
  supabase: SupabaseClient,
  remaining_balance: number,
  already_paid: number,
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

  if (remaining_balance <= 0) return map.get('paid')
  if (already_paid > 0) return map.get('partial')
  return map.get('unpaid')
}

// ============================================================
// MyAdjustmentRecord
// ============================================================

export interface MyAdjustmentRecord {
  reading_adjustment_id: string
  reading_id:            string
  original_reading:      number
  adjusted_reading:      number
  reason:                string | null
  status_name:           string
  requested_date:        string
  approved_at:           string | null
  approved_by:           string | null
  proof_image_url:       string | null
  proof_signed_url:      string | null
  meter_account_id:      string
  meter_serial_no: string | null
  consumer_name:         string
  reading_period_id:     string
  reading_period_start:  string
  reading_period_end:    string
  reading_period_due_date: string

  // ── Submit / Approve actor info (admin POV) ──
  requested_by_user: {
    user_id:     string
    first_name:  string
    last_name:   string
    middle_name: string | null
  } | null
  approved_by_user: {
    user_id:     string
    first_name:  string
    last_name:   string
    middle_name: string | null
  } | null
}

// ============================================================
// getMyReadingAdjustments
// ============================================================

export async function getMyReadingAdjustments(): Promise<{
  status: 'success' | 'error'
  data?: MyAdjustmentRecord[]
  message?: string
}> {
  const supabase = await createClient()

  try {
    const user = await requireAuth(supabase)

    const { data, error } = await supabase
      .from('meter_reading_adjustments')
      .select(`
        reading_adjustment_id,
        reading_id,
        original_reading,
        adjusted_reading,
        reason,
        proof_image_url,
        requested_date,
        approved_at,
        approved_by,
        adjustment_status:bulk_status (
          status_name
        ),
        requested_by_user:users!requested_by (
          user_id, first_name, last_name, middle_name
        ),
        approved_by_user:users!approved_by (
          user_id, first_name, last_name, middle_name
        ),
        meter_reading:meter_readings (
          reading_period_id,
          reading_periods:reading_period_id (
            period_start,
            period_end,
            due_date
          ),
          meter:meter_id (
            meter_serial_no,
            meter_account:meter_account_id (
              meter_account_id,
              consumer:consumer_id (
                account_name
              )
            )
          )
        )
      `)
      .eq('requested_by', user.id)
      .order('requested_date', { ascending: false })

    if (error) throw error

    const normalized: MyAdjustmentRecord[] = []

    for (const row of data ?? []) {
      const status = unwrap(row.adjustment_status)
      const meterReading = unwrap(row.meter_reading)
      if (!meterReading) continue

      const readingPeriod = unwrap(meterReading.reading_periods)
      if (!readingPeriod) continue

      const meter = unwrap(meterReading.meter)
      if (!meter) continue

      const meterAccount = unwrap(meter.meter_account)
      if (!meterAccount) continue

      const consumer = unwrap(meterAccount.consumer)
      if (!consumer) continue

      const requestedByUser = unwrap(row.requested_by_user)
      const approvedByUser  = unwrap(row.approved_by_user)

      const proofImageUrl = row.proof_image_url ?? null
      const proofSignedUrl = proofImageUrl
        ? await getSignedProofUrl(supabase, proofImageUrl)
        : null

      normalized.push({
        reading_adjustment_id: row.reading_adjustment_id,
        reading_id:            row.reading_id,
        original_reading:      Number(row.original_reading),
        adjusted_reading:      Number(row.adjusted_reading),
        reason:                row.reason,
        status_name:           status?.status_name?.toLowerCase() || 'pending',
        requested_date:        row.requested_date,
        approved_at:           row.approved_at,
        approved_by:           row.approved_by,
        proof_image_url:       proofImageUrl,
        proof_signed_url:      proofSignedUrl,
        meter_account_id:      meterAccount.meter_account_id,
        meter_serial_no:      meter.meter_serial_no,
        consumer_name:         consumer.account_name,
        reading_period_id:     meterReading.reading_period_id,
        reading_period_start:  readingPeriod.period_start,
        reading_period_end:    readingPeriod.period_end,
        reading_period_due_date: readingPeriod.due_date,

        requested_by_user: requestedByUser
          ? {
              user_id:     requestedByUser.user_id,
              first_name:  requestedByUser.first_name,
              last_name:   requestedByUser.last_name,
              middle_name: requestedByUser.middle_name ?? null,
            }
          : null,
        approved_by_user: approvedByUser
          ? {
              user_id:     approvedByUser.user_id,
              first_name:  approvedByUser.first_name,
              last_name:   approvedByUser.last_name,
              middle_name: approvedByUser.middle_name ?? null,
            }
          : null,
      })
    }

    return { status: 'success', data: normalized }
  } catch (err: any) {
    if (err?.__authError) return { status: 'error', message: 'User not authenticated' }
    console.error('[getMyReadingAdjustments]', err)
    return { status: 'error', message: err?.message ?? 'Failed to load adjustments' }
  }
}

// ============================================================
// getReadingAdjustmentById
// ============================================================

export async function getReadingAdjustmentById(adjustmentId: string): Promise<{
  status: 'success' | 'error'
  data?: MyAdjustmentRecord
  message?: string
}> {
  const supabase = await createClient()

  try {
    await requireAuth(supabase)

    const { data, error } = await supabase
      .from('meter_reading_adjustments')
      .select(`
        reading_adjustment_id,
        reading_id,
        original_reading,
        adjusted_reading,
        reason,
        proof_image_url,
        requested_date,
        approved_at,
        approved_by,
        adjustment_status:bulk_status (
          status_name
        ),
        requested_by_user:users!requested_by (
          user_id, first_name, last_name, middle_name
        ),
        approved_by_user:users!approved_by (
          user_id, first_name, last_name, middle_name
        ),
        meter_reading:meter_readings (
          reading_period_id,
          reading_periods:reading_period_id (
            period_start,
            period_end,
            due_date
          ),
          meter:meter_id (
            meter_serial_no,
            meter_account:meter_account_id (
              meter_account_id,
              consumer:consumer_id (
                account_name
              )
            )
          )
        )
      `)
      .eq('reading_adjustment_id', adjustmentId)
      .single()

    if (error) throw error
    if (!data) return { status: 'error', message: 'Adjustment not found' }

    const status       = unwrap(data.adjustment_status)
    const meterReading = unwrap(data.meter_reading)
    if (!meterReading) return { status: 'error', message: 'Reading not found' }

    const readingPeriod = unwrap(meterReading.reading_periods)
    if (!readingPeriod) return { status: 'error', message: 'Reading period not found' }

    const meter = unwrap(meterReading.meter)
    if (!meter) return { status: 'error', message: 'Meter not found' }

    const meterAccount = unwrap(meter.meter_account)
    if (!meterAccount) return { status: 'error', message: 'Meter account not found' }

    const consumer = unwrap(meterAccount.consumer)
    if (!consumer) return { status: 'error', message: 'Consumer not found' }

    const requestedByUser = unwrap(data.requested_by_user)
    const approvedByUser  = unwrap(data.approved_by_user)

    const proofImageUrl = data.proof_image_url ?? null
    const proofSignedUrl = proofImageUrl
      ? await getSignedProofUrl(supabase, proofImageUrl)
      : null

    const normalized: MyAdjustmentRecord = {
      reading_adjustment_id:   data.reading_adjustment_id,
      reading_id:              data.reading_id,
      original_reading:        Number(data.original_reading),
      adjusted_reading:        Number(data.adjusted_reading),
      reason:                  data.reason,
      status_name:             status?.status_name?.toLowerCase() || 'pending',
      requested_date:          data.requested_date ?? '',
      approved_at:             data.approved_at,
      approved_by:             data.approved_by,
      proof_image_url:         proofImageUrl,
      proof_signed_url:        proofSignedUrl,
      meter_account_id:        meterAccount.meter_account_id,
      meter_serial_no:        meter.meter_serial_no,
      consumer_name:           consumer.account_name,
      reading_period_id:       meterReading.reading_period_id,
      reading_period_start:    readingPeriod.period_start,
      reading_period_end:      readingPeriod.period_end,
      reading_period_due_date: readingPeriod.due_date,

      requested_by_user: requestedByUser
        ? {
            user_id:     requestedByUser.user_id,
            first_name:  requestedByUser.first_name,
            last_name:   requestedByUser.last_name,
            middle_name: requestedByUser.middle_name ?? null,
          }
        : null,
      approved_by_user: approvedByUser
        ? {
            user_id:     approvedByUser.user_id,
            first_name:  approvedByUser.first_name,
            last_name:   approvedByUser.last_name,
            middle_name: approvedByUser.middle_name ?? null,
          }
        : null,
    }

    return { status: 'success', data: normalized }
  } catch (err: any) {
    if (err?.__authError) return { status: 'error', message: 'User not authenticated' }
    console.error('[getReadingAdjustmentById]', err)
    return { status: 'error', message: err?.message ?? 'Failed to load adjustment' }
  }
}

// ============================================================
// cancelReadingAdjustmentRequest
// ============================================================

export async function cancelReadingAdjustmentRequest(
  adjustmentId: string,
): Promise<{ status: 'success' | 'error'; message?: string }> {
  const supabase = await createClient()

  try {
    const user = await requireAuth(supabase)

    const pendingId = await resolveStatusId(supabase, STATUS.PENDING)
    if (!pendingId)
      return { status: 'error', message: 'Status "pending" not configured.' }

    const { data: adj, error: adjErr } = await supabase
      .from('meter_reading_adjustments')
      .select(`
        reading_adjustment_id,
        requested_by,
        status_id,
        adjustment_status:bulk_status (
          status_name
        ),
        meter_reading:meter_readings (
          meter:meter_id (
            meter_serial_no,
            meter_account:meter_account_id (
              meter_account_id
            )
          )
        )
      `)
      .eq('reading_adjustment_id', adjustmentId)
      .single()

    if (adjErr || !adj)
      return { status: 'error', message: 'Adjustment not found.' }

    if (adj.requested_by !== user.id)
      return { status: 'error', message: 'You can only cancel your own adjustment requests.' }

    if (adj.status_id !== pendingId) {
      const currentStatus = unwrap(adj.adjustment_status)
      const statusName = currentStatus?.status_name?.toLowerCase()

      const message = statusName
        ? statusName === 'approved'
          ? 'This adjustment request has already been approved and can no longer be cancelled.'
          : statusName === 'rejected'
            ? 'This adjustment request has already been rejected and can no longer be cancelled.'
            : statusName === 'cancelled'
              ? 'This adjustment request has already been cancelled.'
              : `This adjustment request is already "${statusName}" and can no longer be cancelled.`
        : 'This adjustment request is no longer pending and can no longer be cancelled.'

      return { status: 'error', message }
    }

    const cancelledId = await resolveStatusId(supabase, STATUS.CANCELLED)
    if (!cancelledId)
      return { status: 'error', message: '"Cancelled" status is not configured. Please contact an admin.' }

    const { error: updateErr } = await supabase
      .from('meter_reading_adjustments')
      .update({
        status_id:   cancelledId,
        approved_at: new Date().toISOString(),
      })
      .eq('reading_adjustment_id', adjustmentId)

    if (updateErr) throw updateErr

    await supabase.from('audit_logs').insert({
      user_id:      user.id,
      action:       'CANCEL_READING_ADJUSTMENT',
      description:  `Cancelled own pending reading adjustment request #${adjustmentId}`,
      target_table: 'meter_reading_adjustments',
      target_id:    adjustmentId,
    })

    const meterReading = unwrap(adj.meter_reading)
    const meter = unwrap(meterReading?.meter)
    const meterAccount = unwrap(meter?.meter_account)

    if (meterAccount) {
      const staffIds = await getUserIdsByRole(['admin', 'consultant'])

      await createNotifications(
        staffIds.map((id) => ({ userId: id })),
        'METER_READING_ADJUSTED_CANCELLED',
        { meter_serial_no: meter?.meter_serial_no ?? null, status: 'cancelled' },
        meterAccount.meter_account_id,
        adjustmentId,
      )
    }

    revalidatePath('/meter-reading')
    return { status: 'success', message: 'Adjustment request cancelled.' }
  } catch (err: any) {
    if (err?.__authError) return { status: 'error', message: 'User not authenticated' }
    console.error('[cancelReadingAdjustmentRequest]', err)
    return { status: 'error', message: err?.message ?? 'Failed to cancel adjustment' }
  }
}