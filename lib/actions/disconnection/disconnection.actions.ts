// lib/actions/disconnection/disconnection.actions.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { createAuditLog } from '../audit.action'

// ============================================================================
// Types
// ============================================================================

export interface DisconnectionRecord {
  disconnection_id: string
  meter_account_id: string
  meter_serial_no: string | null
  consumer_name: string
  barangay_name: string
  zone_name: string
  is_voluntary: boolean
  status_name: string
  requested_date: string
  disconnected_at: string | null
  processed_by: string
  processed_by_name: string
  notice_meter_account_id: string | null
  created_at: string
}

export interface DisconnectionStatus {
  disconnection_status_id: string
  status_name: string
  description: string | null
}

export interface CreateDisconnectionPayload {
  meter_account_id: string
  is_voluntary: boolean
  notice_meter_account_id?: string | null
  processed_by: string
}

export interface DisconnectionCandidate {
  meter_account_id: string
  meter_serial_no: string | null
  consumer_id: string
  consumer_name: string
  zone_name: string
  barangay_name: string
  barangay_id: string
  has_notice: boolean
  is_unpaid: boolean
  notice_meter_account_id?: string | null
  billing_id?: string | null
}

type NoticeRef = { notice_meter_account_id: string; billing_id: string }

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

function buildConsumerName(consumer: any): string {
  if (!consumer) return '—'
  return consumer.account_name || '—'
}

// ----------------------------------------------------------------------------
// Current (latest) reading period — same definition as the notice page:
// the reading period of the most recently created billing row.
// ----------------------------------------------------------------------------
async function getCurrentReadingPeriodId(supabase: any): Promise<string | null> {
  const { data, error } = await supabase
    .from('billing')
    .select('reading_period_id')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data?.reading_period_id) return null
  return data.reading_period_id
}

// ----------------------------------------------------------------------------
// Latest notice row per meter account, ONLY from notices that belong to the
// current reading period. Older periods' notices are ignored.
// ----------------------------------------------------------------------------
async function getCurrentPeriodNoticeMap(
  supabase: any,
  meterAccountIds: string[],
): Promise<Map<string, NoticeRef>> {
  const map = new Map<string, NoticeRef>()
  if (meterAccountIds.length === 0) return map

  const periodId = await getCurrentReadingPeriodId(supabase)
  if (!periodId) return map

  const { data: notices } = await supabase
    .from('notice_of_disconnection')
    .select('notice_id')
    .eq('reading_period_id', periodId)

  const noticeIds = (notices ?? []).map((n: any) => n.notice_id)
  if (noticeIds.length === 0) return map

  const { data: rows } = await supabase
    .from('notice_meter_accounts')
    .select('notice_meter_account_id, meter_account_id, billing_id, created_at')
    .in('notice_id', noticeIds)
    .in('meter_account_id', meterAccountIds)
    .order('created_at', { ascending: false })

  for (const r of rows ?? []) {
    if (!map.has(r.meter_account_id)) {
      map.set(r.meter_account_id, {
        notice_meter_account_id: r.notice_meter_account_id,
        billing_id: r.billing_id,
      })
    }
  }

  return map
}

// ----------------------------------------------------------------------------
// Meter accounts whose LATEST billing is paid (not "ever had a paid billing")
// ----------------------------------------------------------------------------
async function getPaidMeterAccountIds(
  supabase: any,
  meterAccountIds: string[],
): Promise<Set<string>> {
  const paidIds = new Set<string>()
  if (meterAccountIds.length === 0) return paidIds

  const { data: paidStatus } = await supabase
    .from('billing_status')
    .select('billing_status_id')
    .eq('billing_status_name', 'paid')
    .maybeSingle()

  if (!paidStatus) return paidIds

  const { data: billings } = await supabase
    .from('billing')
    .select('meter_account_id, billing_status_id, created_at')
    .in('meter_account_id', meterAccountIds)
    .order('created_at', { ascending: false })

  const seen = new Set<string>()
  for (const b of billings ?? []) {
    if (seen.has(b.meter_account_id)) continue
    seen.add(b.meter_account_id)
    if (b.billing_status_id === paidStatus.billing_status_id) {
      paidIds.add(b.meter_account_id)
    }
  }

  return paidIds
}

// ----------------------------------------------------------------------------
// Validate that a notice row belongs to a notice of the CURRENT reading period
// and to the given meter account.
// ----------------------------------------------------------------------------
async function validateNoticeInCurrentPeriod(
  supabase: any,
  noticeMeterAccountId: string,
  meterAccountId: string,
): Promise<{ ok: boolean; error?: string }> {
  const currentPeriodId = await getCurrentReadingPeriodId(supabase)
  if (!currentPeriodId) {
    return { ok: false, error: 'No current reading period found' }
  }

  const { data, error } = await supabase
    .from('notice_meter_accounts')
    .select('meter_account_id, notice:notice_id ( reading_period_id )')
    .eq('notice_meter_account_id', noticeMeterAccountId)
    .maybeSingle()

  if (error || !data) {
    return { ok: false, error: 'Notice record not found' }
  }

  if (data.meter_account_id !== meterAccountId) {
    return { ok: false, error: 'Notice does not belong to this meter account' }
  }

  const notice = getFirst(data.notice)
  if (notice?.reading_period_id !== currentPeriodId) {
    return { ok: false, error: 'This notice is not from the current reading period' }
  }

  return { ok: true }
}

// ============================================================================
// GET — Disconnection Statuses
// ============================================================================

export async function getDisconnectionStatuses(): Promise<{
  success: boolean
  data?: DisconnectionStatus[]
  error?: string
}> {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from('disconnection_status')
      .select('disconnection_status_id, status_name, description')
      .order('status_name')

    if (error) throw error

    return { success: true, data: data ?? [] }
  } catch (err: any) {
    console.error('[getDisconnectionStatuses]', err)
    return { success: false, error: err.message }
  }
}

// ============================================================================
// GET — Pending Disconnections (for meter readers)
// ============================================================================

export async function getPendingDisconnections(): Promise<{
  success: boolean
  data?: DisconnectionRecord[]
  error?: string
}> {
  const supabase = await createClient()

  try {
    const { data: pendingStatus } = await supabase
      .from('disconnection_status')
      .select('disconnection_status_id')
      .ilike('status_name', 'pending')
      .single()

    if (!pendingStatus) {
      return { success: true, data: [] }
    }

    const { data, error } = await supabase
      .from('disconnections')
      .select(`
        disconnection_id,
        meter_account_id,
        notice_meter_account_id,
        is_voluntary,
        requested_date,
        disconnected_at,
        processed_by,
        created_at,
        disconnection_status:disconnection_status_id (
          status_name
        ),
        meter_account:meter_account_id (
          consumer:consumer_id (
            account_name
          ),
          zone:zone_id (
            zone_name,
            barangay:barangay_id (
              barangay_name
            )
          )
        ),
        processed_by_user:processed_by (
          user_id,
          first_name,
          last_name
        )
      `)
      .eq('disconnection_status_id', pendingStatus.disconnection_status_id)
      .order('requested_date', { ascending: true })

    if (error) throw error

    const records: DisconnectionRecord[] = (data ?? []).map((row: any) => {
      const status = getFirst(row.disconnection_status)
      const ma = getFirst(row.meter_account)
      const consumer = getFirst(ma?.consumer)
      const zone = getFirst(ma?.zone)
      const barangay = getFirst(zone?.barangay)
      const processedBy = getFirst(row.processed_by_user)

      return {
        disconnection_id: row.disconnection_id,
        meter_account_id: row.meter_account_id,
        meter_serial_no: ma?.meter_serial_no ?? '—',
        consumer_name: buildConsumerName(consumer),
        barangay_name: barangay?.barangay_name ?? '—',
        zone_name: zone?.zone_name ?? '—',
        is_voluntary: row.is_voluntary,
        status_name: status?.status_name ?? 'pending',
        requested_date: row.requested_date,
        disconnected_at: row.disconnected_at,
        processed_by: row.processed_by,
        processed_by_name: processedBy ? `${processedBy.first_name} ${processedBy.last_name}` : '—',
        notice_meter_account_id: row.notice_meter_account_id,
        created_at: row.created_at,
      }
    })

    return { success: true, data: records }
  } catch (err: any) {
    console.error('[getPendingDisconnections]', err)
    return { success: false, error: err.message }
  }
}

// ============================================================================
// GET — All Disconnections (with filters)
// ============================================================================

export async function getDisconnections(filters?: {
  status_id?: string
  is_voluntary?: boolean
  barangay_id?: string
  date_from?: string
  date_to?: string
}): Promise<{
  success: boolean
  data?: DisconnectionRecord[]
  error?: string
}> {
  const supabase = await createClient()

  try {
    let query = supabase
      .from('disconnections')
      .select(`
        disconnection_id,
        meter_account_id,
        notice_meter_account_id,
        is_voluntary,
        requested_date,
        disconnected_at,
        processed_by,
        created_at,
        disconnection_status:disconnection_status_id (
          status_name
        ),
        meter_account:meter_account_id (
          consumer:consumer_id (
            account_name
          ),
          zone:zone_id (
            zone_name,
            barangay:barangay_id (
              barangay_name
            )
          )
        ),
        processed_by_user:processed_by (
          user_id,
          first_name,
          last_name
        )
      `)

    if (filters?.status_id) {
      query = query.eq('disconnection_status_id', filters.status_id)
    }

    if (filters?.is_voluntary !== undefined) {
      query = query.eq('is_voluntary', filters.is_voluntary)
    }

    if (filters?.barangay_id) {
      query = query.eq('meter_account.zone.barangay.barangay_id', filters.barangay_id)
    }

    if (filters?.date_from) {
      query = query.gte('requested_date', filters.date_from)
    }

    if (filters?.date_to) {
      query = query.lte('requested_date', filters.date_to)
    }

    const { data, error } = await query.order('requested_date', { ascending: false })

    if (error) throw error

    const records: DisconnectionRecord[] = (data ?? []).map((row: any) => {
      const status = getFirst(row.disconnection_status)
      const ma = getFirst(row.meter_account)
      const consumer = getFirst(ma?.consumer)
      const zone = getFirst(ma?.zone)
      const barangay = getFirst(zone?.barangay)
      const processedBy = getFirst(row.processed_by_user)

      return {
        disconnection_id: row.disconnection_id,
        meter_account_id: row.meter_account_id,
        meter_serial_no: ma?.meter_serial_no ?? '—',
        consumer_name: buildConsumerName(consumer),
        barangay_name: barangay?.barangay_name ?? '—',
        zone_name: zone?.zone_name ?? '—',
        is_voluntary: row.is_voluntary,
        status_name: status?.status_name ?? 'pending',
        requested_date: row.requested_date,
        disconnected_at: row.disconnected_at,
        processed_by: row.processed_by,
        processed_by_name: processedBy ? `${processedBy.first_name} ${processedBy.last_name}` : '—',
        notice_meter_account_id: row.notice_meter_account_id,
        created_at: row.created_at,
      }
    })

    return { success: true, data: records }
  } catch (err: any) {
    console.error('[getDisconnections]', err)
    return { success: false, error: err.message }
  }
}

// ============================================================================
// GET — Search Voluntary Consumers (ALL connected, no restrictions)
// Now uses meter_status to determine connected accounts
// ============================================================================

export async function searchVoluntaryConsumers(query: string): Promise<{
  success: boolean
  data?: DisconnectionCandidate[]
  error?: string
}> {
  const supabase = await createClient()

  try {
    // Get Active meter status ID
    const { data: activeStatus } = await supabase
      .from('meter_status')
      .select('meter_status_id')
      .eq('meter_status_name', 'Active')
      .maybeSingle()

    if (!activeStatus) {
      return { success: true, data: [] }
    }

    // Get meter accounts with Active meters
    const { data: activeMeters } = await supabase
      .from('meters')
      .select('meter_account_id')
      .eq('meter_status_id', activeStatus.meter_status_id)

    if (!activeMeters || activeMeters.length === 0) {
      return { success: true, data: [] }
    }

    const activeMeterAccountIds = activeMeters.map((m: any) => m.meter_account_id)

    const searchPattern = `%${query}%`

    const { data: meterAccounts, error } = await supabase
      .from('meter_accounts')
      .select(`
        meter_account_id,
        consumer:consumer_id (
          consumer_id,
          account_name
        ),
        zone:zone_id (
          zone_name,
          barangay:barangay_id (
            barangay_id,
            barangay_name
          )
        )
      `)
      .in('meter_account_id', activeMeterAccountIds)
      .filter('meters.meter_serial_no', 'ilike', searchPattern)
      .limit(20)

    let results = meterAccounts || []

    if (!results.length) {
      const { data: matchingConsumers } = await supabase
        .from('consumers')
        .select('consumer_id')
        .ilike('account_name', searchPattern)

      if (matchingConsumers?.length) {
        const consumerIds = matchingConsumers.map((c: any) => c.consumer_id)
        const { data: conns } = await supabase
          .from('meter_accounts')
          .select(`
            meter_account_id,
            consumer:consumer_id (
              consumer_id,
              account_name
            ),
            zone:zone_id (
              zone_name,
              barangay:barangay_id (
                barangay_id,
                barangay_name
              )
            )
          `)
          .in('meter_account_id', activeMeterAccountIds)
          .in('consumer_id', consumerIds)
          .limit(20)

        results = conns || []
      }
    }

    if (error && !results.length) {
      console.error('[searchVoluntaryConsumers] Query error:', error)
      return { success: false, error: error.message }
    }

    if (!results.length) return { success: true, data: [] }

    // Get already pending disconnections
    const { data: pendingStatus } = await supabase
      .from('disconnection_status')
      .select('disconnection_status_id')
      .ilike('status_name', 'pending')
      .single()

    let pendingIds = new Set<string>()
    if (pendingStatus) {
      const { data: pendingDisconnections } = await supabase
        .from('disconnections')
        .select('meter_account_id')
        .in('meter_account_id', results.map((c: any) => c.meter_account_id))
        .eq('disconnection_status_id', pendingStatus.disconnection_status_id)

      for (const pd of pendingDisconnections ?? []) {
        pendingIds.add(pd.meter_account_id)
      }
    }

    const result: DisconnectionCandidate[] = []

    for (const ma of results) {
      const m = ma as any

      if (pendingIds.has(m.meter_account_id)) continue

      const consumer = getFirst(m.consumer)
      const zone = getFirst(m.zone)
      const barangay = getFirst(zone?.barangay)

      result.push({
        meter_account_id: m.meter_account_id,
        meter_serial_no: m.meter_serial_no,
        consumer_id: consumer?.consumer_id ?? '',
        consumer_name: buildConsumerName(consumer),
        zone_name: zone?.zone_name ?? '—',
        barangay_name: barangay?.barangay_name ?? '—',
        barangay_id: barangay?.barangay_id ?? '',
        has_notice: false,
        is_unpaid: true,
        notice_meter_account_id: null,
        billing_id: null,
      })
    }

    return { success: true, data: result }
  } catch (err: any) {
    console.error('[searchVoluntaryConsumers]', err)
    return { success: false, error: err.message }
  }
}

// ============================================================================
// GET — Search Involuntary Consumers
// Only accounts with a notice in the CURRENT reading period whose latest
// billing is still unpaid.
// ============================================================================

export async function searchInvoluntaryConsumers(query: string): Promise<{
  success: boolean
  data?: DisconnectionCandidate[]
  error?: string
}> {
  const supabase = await createClient()

  try {
    // Get Active meter status ID
    const { data: activeStatus } = await supabase
      .from('meter_status')
      .select('meter_status_id')
      .eq('meter_status_name', 'Active')
      .maybeSingle()

    if (!activeStatus) {
      return { success: true, data: [] }
    }

    // Get meter accounts with Active meters
    const { data: activeMeters } = await supabase
      .from('meters')
      .select('meter_account_id')
      .eq('meter_status_id', activeStatus.meter_status_id)

    if (!activeMeters || activeMeters.length === 0) {
      return { success: true, data: [] }
    }

    const activeMeterAccountIds = Array.from(
      new Set(activeMeters.map((m: any) => m.meter_account_id)),
    ) as string[]

    // Notices from the CURRENT reading period only
    const latestNoticeMap = await getCurrentPeriodNoticeMap(supabase, activeMeterAccountIds)
    const noticeMeterAccountIds = Array.from(latestNoticeMap.keys())

    if (noticeMeterAccountIds.length === 0) {
      return { success: true, data: [] }
    }

    // Exclude accounts whose latest billing is already paid
    const paidIds = await getPaidMeterAccountIds(supabase, noticeMeterAccountIds)
    const unpaidMeterAccountIds = noticeMeterAccountIds.filter((id) => !paidIds.has(id))

    if (unpaidMeterAccountIds.length === 0) {
      return { success: true, data: [] }
    }

    // Search within unpaid meter accounts that have a current-period notice.
    // Consumer-name matching is resolved to consumer_ids first, because an
    // embedded-column filter inside .or() is not reliable in PostgREST.
    const searchPattern = `%${query}%`

    let orFilter = `meters.meter_serial_no.ilike.${searchPattern}`
    if (query.trim()) {
      const { data: matchingConsumers } = await supabase
        .from('consumers')
        .select('consumer_id')
        .ilike('account_name', searchPattern)

      const consumerIds = (matchingConsumers ?? []).map((c: any) => c.consumer_id)
      if (consumerIds.length > 0) {
        orFilter += `,consumer_id.in.(${consumerIds.join(',')})`
      }
    }

    const { data: meterAccounts, error } = await supabase
      .from('meter_accounts')
      .select(`
        meter_account_id,
        consumer:consumer_id (
          consumer_id,
          account_name
        ),
        zone:zone_id (
          zone_name,
          barangay:barangay_id (
            barangay_id,
            barangay_name
          )
        )
      `)
      .in('meter_account_id', unpaidMeterAccountIds)
      .or(orFilter)
      .limit(20)

    if (error) {
      console.error('[searchInvoluntaryConsumers] Query error:', error)
      return { success: false, error: error.message }
    }

    if (!meterAccounts?.length) return { success: true, data: [] }

    // Get already pending disconnections
    const { data: pendingStatus } = await supabase
      .from('disconnection_status')
      .select('disconnection_status_id')
      .ilike('status_name', 'pending')
      .single()

    let pendingIds = new Set<string>()
    if (pendingStatus) {
      const { data: pendingDisconnections } = await supabase
        .from('disconnections')
        .select('meter_account_id')
        .in('meter_account_id', meterAccounts.map((c: any) => c.meter_account_id))
        .eq('disconnection_status_id', pendingStatus.disconnection_status_id)

      for (const pd of pendingDisconnections ?? []) {
        pendingIds.add(pd.meter_account_id)
      }
    }

    const result: DisconnectionCandidate[] = []

    for (const ma of meterAccounts) {
      const m = ma as any

      if (pendingIds.has(m.meter_account_id)) continue

      const consumer = getFirst(m.consumer)
      const zone = getFirst(m.zone)
      const barangay = getFirst(zone?.barangay)
      const noticeData = latestNoticeMap.get(m.meter_account_id)

      result.push({
        meter_account_id: m.meter_account_id,
        meter_serial_no: m.meter_serial_no,
        consumer_id: consumer?.consumer_id ?? '',
        consumer_name: buildConsumerName(consumer),
        zone_name: zone?.zone_name ?? '—',
        barangay_name: barangay?.barangay_name ?? '—',
        barangay_id: barangay?.barangay_id ?? '',
        has_notice: true,
        is_unpaid: true,
        notice_meter_account_id: noticeData?.notice_meter_account_id ?? null,
        billing_id: noticeData?.billing_id ?? null,
      })
    }

    return { success: true, data: result }
  } catch (err: any) {
    console.error('[searchInvoluntaryConsumers]', err)
    return { success: false, error: err.message }
  }
}

// ============================================================================
// GET — Eligible Meter Accounts for Disconnection (legacy - keep for compatibility)
// Notice lookups are now scoped to the CURRENT reading period.
// ============================================================================

export async function getEligibleMeterAccountsForDisconnection(params: {
  barangay_id?: string
  is_voluntary: boolean
}): Promise<{
  success: boolean
  data?: DisconnectionCandidate[]
  error?: string
}> {
  const supabase = await createClient()

  try {
    // Get Active meter status ID
    const { data: activeStatus } = await supabase
      .from('meter_status')
      .select('meter_status_id')
      .eq('meter_status_name', 'Active')
      .maybeSingle()

    if (!activeStatus) {
      return { success: true, data: [] }
    }

    // Get meter accounts with Active meters
    const { data: meters, error } = await supabase
      .from('meters')
      .select(`
        meter_account_id,
        meter_accounts:meter_account_id (
          meter_account_id,
          consumer:consumer_id (
            consumer_id,
            account_name
          ),
          zone:zone_id (
            zone_name,
            barangay:barangay_id (
              barangay_id,
              barangay_name
            )
          )
        )
      `)
      .eq('meter_status_id', activeStatus.meter_status_id)

    if (error) throw error
    if (!meters?.length) return { success: true, data: [] }

    // Extract meter account data
    const meterAccounts: any[] = []
    const meterAccountIds: string[] = []
    for (const m of meters) {
      const ma = getFirst(m.meter_accounts)
      if (ma) {
        meterAccounts.push(ma)
        meterAccountIds.push(ma.meter_account_id)
      }
    }

    if (meterAccountIds.length === 0) return { success: true, data: [] }

    // Filter by barangay if specified
    let filteredMeterAccounts = meterAccounts
    if (params.barangay_id) {
      filteredMeterAccounts = meterAccounts.filter((ma: any) => {
        const zone = getFirst(ma.zone)
        const barangay = getFirst(zone?.barangay)
        return barangay?.barangay_id === params.barangay_id
      })
    }

    if (filteredMeterAccounts.length === 0) return { success: true, data: [] }

    const filteredIds = filteredMeterAccounts.map((ma: any) => ma.meter_account_id)

    // Notices from the CURRENT reading period only
    const latestNoticePerMeterAccount = await getCurrentPeriodNoticeMap(supabase, filteredIds)

    // Accounts whose latest billing is paid
    const paidIds = await getPaidMeterAccountIds(supabase, filteredIds)

    // Get already pending disconnections
    const { data: pendingStatus } = await supabase
      .from('disconnection_status')
      .select('disconnection_status_id')
      .ilike('status_name', 'pending')
      .single()

    let pendingIds = new Set<string>()
    if (pendingStatus) {
      const { data: pendingDisconnections } = await supabase
        .from('disconnections')
        .select('meter_account_id')
        .in('meter_account_id', filteredIds)
        .eq('disconnection_status_id', pendingStatus.disconnection_status_id)

      for (const pd of pendingDisconnections ?? []) {
        pendingIds.add(pd.meter_account_id)
      }
    }

    const result: DisconnectionCandidate[] = []

    for (const ma of filteredMeterAccounts) {
      const m = ma as any

      if (pendingIds.has(m.meter_account_id)) continue

      const consumer = getFirst(m.consumer)
      const zone = getFirst(m.zone)
      const barangay = getFirst(zone?.barangay)

      const hasNotice = latestNoticePerMeterAccount.has(m.meter_account_id)
      const isPaid = paidIds.has(m.meter_account_id)
      const isUnpaid = !isPaid

      let shouldInclude = false

      if (params.is_voluntary) {
        shouldInclude = !hasNotice
      } else {
        shouldInclude = hasNotice && isUnpaid
      }

      if (!shouldInclude) continue

      const noticeData = latestNoticePerMeterAccount.get(m.meter_account_id)

      result.push({
        meter_account_id: m.meter_account_id,
        meter_serial_no: m.meter_serial_no || '',
        consumer_id: consumer?.consumer_id ?? '',
        consumer_name: buildConsumerName(consumer),
        zone_name: zone?.zone_name ?? '—',
        barangay_name: barangay?.barangay_name ?? '—',
        barangay_id: barangay?.barangay_id ?? '',
        has_notice: hasNotice,
        is_unpaid: isUnpaid,
        notice_meter_account_id: noticeData?.notice_meter_account_id ?? null,
        billing_id: noticeData?.billing_id ?? null,
      })
    }

    return { success: true, data: result }
  } catch (err: any) {
    console.error('[getEligibleMeterAccountsForDisconnection]', err)
    return { success: false, error: err.message }
  }
}

// ============================================================================
// GET — Barangays for dropdown
// ============================================================================

export async function getBarangaysForDisconnection(): Promise<{
  success: boolean
  data?: { barangay_id: string; barangay_name: string }[]
  error?: string
}> {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from('barangay')
      .select('barangay_id, barangay_name')
      .eq('is_active', true)
      .order('barangay_name')

    if (error) throw error

    return { success: true, data: data ?? [] }
  } catch (err: any) {
    console.error('[getBarangaysForDisconnection]', err)
    return { success: false, error: err.message }
  }
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

// One disconnection -> at most one job order, linked via job_orders.disconnection_id
async function findJobOrderForDisconnection(supabase: any, disconnectionId: string) {
  const { data, error } = await supabase
    .from('job_orders')
    .select('job_order_id, job_order_no, job_status_id, job_order_status:job_status_id ( job_status_name )')
    .eq('disconnection_id', disconnectionId)
    .maybeSingle()

  if (error || !data) return null
  return data
}

// Auto-create the "Disconnection Request" job order for a freshly-created
// disconnection (job_type_code: DISCONNECTION), linked via disconnection_id.
async function createJobOrderForDisconnection(
  supabase: any,
  params: { meter_account_id: string; barangay_id: string; created_by: string; disconnection_id: string },
): Promise<{ success: boolean; job_order_id?: string; error?: string }> {
  const { data: jobType, error: jobTypeError } = await supabase
    .from('job_types')
    .select('job_type_id')
    .eq('job_type_code', 'DISCONNECTION')
    .single()

  if (jobTypeError || !jobType) {
    console.error('[createJobOrderForDisconnection] job type lookup:', jobTypeError)
    return { success: false, error: 'Job type "DISCONNECTION" is not configured' }
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
      disconnection_id: params.disconnection_id, // direct FK link — "Disconnection Request"
      created_by: params.created_by,
    })
    .select('job_order_id')
    .single()

  if (jobOrderError || !jobOrder) {
    console.error('[createJobOrderForDisconnection] insert:', jobOrderError)
    return { success: false, error: jobOrderError?.message ?? 'Failed to create job order' }
  }

  return { success: true, job_order_id: jobOrder.job_order_id }
}

// ============================================================================
// CREATE — Disconnection Request
// ============================================================================

export async function createDisconnection(payload: CreateDisconnectionPayload): Promise<{
  success: boolean
  data?: { disconnection_id: string; job_order_id: string | null }
  error?: string
}> {
  const supabase = await createClient()

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: 'User not authenticated' }
    }

    // Notice-based (involuntary): the notice must be from the CURRENT reading period
    if (!payload.is_voluntary) {
      if (!payload.notice_meter_account_id) {
        return { success: false, error: 'A notice is required for a notice-based disconnection' }
      }

      const noticeCheck = await validateNoticeInCurrentPeriod(
        supabase,
        payload.notice_meter_account_id,
        payload.meter_account_id,
      )
      if (!noticeCheck.ok) {
        return { success: false, error: noticeCheck.error }
      }
    }

    // Get pending status ID
    const { data: pendingStatus } = await supabase
      .from('disconnection_status')
      .select('disconnection_status_id')
      .ilike('status_name', 'pending')
      .single()

    if (!pendingStatus) {
      return { success: false, error: 'Disconnection status "pending" not found' }
    }

    // Check if there's already a pending disconnection for this meter account
    const { data: existing } = await supabase
      .from('disconnections')
      .select('disconnection_id')
      .eq('meter_account_id', payload.meter_account_id)
      .eq('disconnection_status_id', pendingStatus.disconnection_status_id)
      .maybeSingle()

    if (existing) {
      return { success: false, error: 'This meter account already has a pending disconnection request' }
    }

    // Need the barangay for the job order — resolve it from the meter account's zone
    const { data: meterAccount, error: maError } = await supabase
      .from('meter_accounts')
      .select('meter_account_id, zone:zone_id ( barangay_id )')
      .eq('meter_account_id', payload.meter_account_id)
      .single()

    if (maError || !meterAccount) {
      return { success: false, error: 'Meter account not found' }
    }

    const barangayId = getFirst(meterAccount.zone)?.barangay_id
    if (!barangayId) {
      return { success: false, error: 'Could not resolve barangay for this meter account' }
    }

    const { data: inserted, error: insertErr } = await supabase
      .from('disconnections')
      .insert({
        meter_account_id: payload.meter_account_id,
        notice_meter_account_id: payload.is_voluntary ? null : payload.notice_meter_account_id ?? null,
        is_voluntary: payload.is_voluntary,
        disconnection_status_id: pendingStatus.disconnection_status_id,
        requested_date: new Date().toISOString().split('T')[0],
        processed_by: payload.processed_by || user.id,
      })
      .select('disconnection_id')
      .single()

    if (insertErr) throw insertErr

    // Create the linked "Disconnection Request" job order
    const joResult = await createJobOrderForDisconnection(supabase, {
      meter_account_id: payload.meter_account_id,
      barangay_id: barangayId,
      created_by: payload.processed_by || user.id,
      disconnection_id: inserted.disconnection_id,
    })

    if (!joResult.success) {
      // Roll back the disconnection so we never leave one without a job order
      await supabase.from('disconnections').delete().eq('disconnection_id', inserted.disconnection_id)
      return { success: false, error: joResult.error ?? 'Failed to create job order for disconnection' }
    }

    await createAuditLog(
      user.id,
      'CREATE',
      `Created Disconnection Request (${payload.is_voluntary ? 'voluntary' : 'involuntary'}) for meter account ${payload.meter_account_id}`,
      'disconnections',
      inserted.disconnection_id,
    )

    return {
      success: true,
      data: { disconnection_id: inserted.disconnection_id, job_order_id: joResult.job_order_id ?? null }
    }
  } catch (err: any) {
    console.error('[createDisconnection]', err)
    return { success: false, error: err.message }
  }
}

// ============================================================================
// UPDATE — Cancel Disconnection
// ============================================================================

export async function cancelDisconnection(disconnectionId: string): Promise<{
  success: boolean
  error?: string
}> {
  const supabase = await createClient()

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: 'User not authenticated' }
    }

    // Get cancelled status ID
    const { data: cancelledStatus } = await supabase
      .from('disconnection_status')
      .select('disconnection_status_id')
      .ilike('status_name', 'cancelled')
      .single()

    if (!cancelledStatus) {
      return { success: false, error: 'Disconnection status "cancelled" not found' }
    }

    const { error: updateErr } = await supabase
      .from('disconnections')
      .update({
        disconnection_status_id: cancelledStatus.disconnection_status_id,
        updated_at: new Date().toISOString(),
      })
      .eq('disconnection_id', disconnectionId)

    if (updateErr) throw updateErr

    // Cancel the linked "Disconnection Request" job order too
    const jo = await findJobOrderForDisconnection(supabase, disconnectionId)
    if (jo) {
      const cancelledJoStatusId = await getJobOrderStatusId(supabase, 'Cancelled')
      if (cancelledJoStatusId) {
        await supabase
          .from('job_orders')
          .update({ job_status_id: cancelledJoStatusId, updated_at: new Date().toISOString() })
          .eq('job_order_id', jo.job_order_id)
      }
    }

    await createAuditLog(
      user.id,
      'UPDATE',
      `Cancelled Disconnection Request ${disconnectionId}`,
      'disconnections',
      disconnectionId,
    )

    return { success: true }
  } catch (err: any) {
    console.error('[cancelDisconnection]', err)
    return { success: false, error: err.message }
  }
}

// ============================================================
// GET — Disconnection for Edit
// ============================================================

export interface DisconnectionEditDetails {
  disconnection_id: string
  meter_account_id: string
  meter_serial_no: string | null
  consumer_name: string
  zone_name: string
  barangay_name: string
  is_voluntary: boolean
  requested_date: string
  notice_meter_account_id: string | null
  status_name: string
}

export async function getDisconnectionForEdit(
  disconnectionId: string
): Promise<{ success: boolean; data?: DisconnectionEditDetails; error?: string }> {
  const supabase = await createClient()

  try {
    const { data: row, error } = await supabase
      .from('disconnections')
      .select(`
        disconnection_id,
        meter_account_id,
        is_voluntary,
        requested_date,
        notice_meter_account_id,
        disconnection_status:disconnection_status_id ( status_name ),
        meter_account:meter_account_id (
          consumer:consumer_id ( account_name ),
          zone:zone_id (
            zone_name,
            barangay:barangay_id ( barangay_name )
          )
        )
      `)
      .eq('disconnection_id', disconnectionId)
      .single()

    if (error || !row) {
      return { success: false, error: 'Disconnection not found' }
    }

    const status = getFirst((row as any).disconnection_status)
    const statusName = status?.status_name ?? ''

    // Case-insensitive check
    if (statusName.toLowerCase() !== 'pending') {
      return { success: false, error: 'Only pending disconnections can be edited' }
    }

    const ma = getFirst((row as any).meter_account)
    const consumer = getFirst(ma?.consumer)
    const zone = getFirst(ma?.zone)
    const barangay = getFirst(zone?.barangay)

    return {
      success: true,
      data: {
        disconnection_id: row.disconnection_id,
        meter_account_id: row.meter_account_id,
        meter_serial_no: ma?.meter_serial_no ?? '—',
        consumer_name: buildConsumerName(consumer),
        zone_name: zone?.zone_name ?? '—',
        barangay_name: barangay?.barangay_name ?? '—',
        is_voluntary: row.is_voluntary,
        requested_date: row.requested_date,
        notice_meter_account_id: row.notice_meter_account_id,
        status_name: statusName,
      },
    }
  } catch (err: any) {
    console.error('[getDisconnectionForEdit]', err)
    return { success: false, error: err.message }
  }
}

// ============================================================================
// UPDATE — Disconnection (pending only)
// ============================================================================

export async function updateDisconnection(payload: {
  disconnection_id: string
  is_voluntary: boolean
  requested_date: string
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: 'User not authenticated' }
    }

    if (!payload.disconnection_id) {
      return { success: false, error: 'No disconnection specified' }
    }

    if (!payload.requested_date) {
      return { success: false, error: 'Requested date is required' }
    }

    // Re-check status server-side — only pending disconnections are editable
    const { data: current, error: currentError } = await supabase
      .from('disconnections')
      .select(`
        meter_account_id,
        is_voluntary,
        notice_meter_account_id,
        disconnection_status:disconnection_status_id ( status_name )
      `)
      .eq('disconnection_id', payload.disconnection_id)
      .single()

    if (currentError || !current) {
      return { success: false, error: 'Disconnection not found' }
    }

    const statusName = getFirst((current as any).disconnection_status)?.status_name ?? ''

    // Case-insensitive check
    if (statusName.toLowerCase() !== 'pending') {
      return { success: false, error: 'Only pending disconnections can be edited' }
    }

    let noticeMeterAccountId: string | null = current.notice_meter_account_id

    if (payload.is_voluntary) {
      // Voluntary disconnections don't carry a notice reference
      noticeMeterAccountId = null
    } else if (!current.is_voluntary && current.notice_meter_account_id) {
      // Was already involuntary with a notice attached — keep it as-is
      noticeMeterAccountId = current.notice_meter_account_id
    } else {
      // Switching voluntary → involuntary: re-validate against the CURRENT
      // reading period's notice and the latest billing, same as creation time
      const noticeMap = await getCurrentPeriodNoticeMap(supabase, [current.meter_account_id])
      const latestNotice = noticeMap.get(current.meter_account_id)

      if (!latestNotice) {
        return {
          success: false,
          error: 'This meter account has no disconnection notice in the current reading period — cannot mark as involuntary',
        }
      }

      const paidIds = await getPaidMeterAccountIds(supabase, [current.meter_account_id])
      if (paidIds.has(current.meter_account_id)) {
        return { success: false, error: 'This meter account is already paid — cannot mark as involuntary' }
      }

      noticeMeterAccountId = latestNotice.notice_meter_account_id
    }

    const { error: updateErr } = await supabase
      .from('disconnections')
      .update({
        is_voluntary: payload.is_voluntary,
        requested_date: payload.requested_date,
        notice_meter_account_id: noticeMeterAccountId,
        updated_at: new Date().toISOString(),
      })
      .eq('disconnection_id', payload.disconnection_id)

    if (updateErr) throw updateErr

    await createAuditLog(
      user.id,
      'UPDATE',
      `Updated disconnection ${payload.disconnection_id} (${payload.is_voluntary ? 'voluntary' : 'involuntary'}, requested ${payload.requested_date})`,
      'disconnections',
      payload.disconnection_id,
    )

    return { success: true }
  } catch (err: any) {
    console.error('[updateDisconnection]', err)
    return { success: false, error: err.message }
  }
}