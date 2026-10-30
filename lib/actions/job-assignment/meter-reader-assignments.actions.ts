'use server'

import { createClient } from '@/lib/supabase/server'
import { createAuditLog } from '../audit.action'

export type TableConsumer = {
  meter_account_id:      string
  contract_no:        string
  consumer_name:         string
  barangay_name:         string
  zone_name:             string
  classification_name:   string
  meter_serial_no:       string | null
  meter_status_name:     string | null  // �… New: Physical meter status
}

export type Zone = {
  zone_id:       string
  zone_name:     string
  barangay_name: string
}

export interface Assignment {
  assignment_id: string
  user_id:       string
  zone_id:       string
  is_active:     boolean
  assigned_date: string
  user?: {
    user_id:    string
    first_name: string
    last_name:  string
    email:      string
  } | null
  zone?: {
    zone_id:   string
    zone_name: string
    barangay: {
      barangay_id:   string
      barangay_name: string
    }
  } | null
}

export interface Barangay {
  barangay_id:   string
  barangay_name: string
  is_active:     boolean
  created_at:    string
}

export interface UserOption {
  user_id:    string
  first_name: string
  last_name:  string
  email:      string
}

export interface BarangayOption {
  barangay_id:   string
  barangay_name: string
}

export interface ZoneOption {
  zone_id:   string
  zone_name: string
}

// ── New types for the reader-first workflow ─────────────────────────────────

export interface MeterReaderRow {
  user_id:            string
  first_name:         string
  last_name:          string
  email:              string
  active_zone_count:  number
  total_zone_count:   number
}

export interface ReaderZoneAssignment {
  assignment_id: string
  zone_id:       string
  zone_name:     string
  barangay_name: string
  is_active:     boolean
  assigned_date: string
}

export interface EligibleReader {
  user_id:        string
  first_name:     string
  last_name:      string
  email:          string
  assignment_id:  string | null
  status:         'new' | 'reactivate'
}

export interface ActiveZoneHolder {
  assignment_id: string
  user_id:       string
  first_name:    string
  last_name:     string
  email:         string
}

// ============================================================================
// Helpers
// ============================================================================

function unwrap<T>(val: T | T[] | null | undefined): T | null {
  if (val == null) return null
  return Array.isArray(val) ? (val[0] ?? null) : val
}

async function getCurrentUserId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user.id
}

// ─── Main Action for Table Data ──────────────────────────────────────────────

export async function getAssignedConsumersTableData(): Promise<{
  status:   'success' | 'error'
  data?:    TableConsumer[]
  message?: string
}> {
  const supabase = await createClient()

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { status: 'error', message: 'Not authenticated' }
    }

    // Resolve zones assigned to this meter reader
    const { data: assignmentRows, error: assignError } = await supabase
      .from('meter_reader_assignments')
      .select('zone_id')
      .eq('user_id', user.id)
      .eq('is_active', true)

    if (assignError) throw assignError

    const assignedZoneIds: string[] = (assignmentRows ?? []).map((r: any) => r.zone_id)
    if (assignedZoneIds.length === 0) {
      return { status: 'success', data: [] }
    }

    // Fetch meter accounts for assigned zones
    const { data: meterAccounts, error: connError } = await supabase
      .from('meter_accounts')
      .select(`
        meter_account_id,
        consumer:consumer_id (
          account_name,
          contract_no
        ),
        zone:zone_id (
          zone_name,
          barangay:barangay_id (
            barangay_name
          )
        ),
        classification:classification_id (
          classification_name
        ),
        meters (
          meter_serial_no,
          meter_status:meter_status_id (
            meter_status_name
          )
        )
      `)
      .in('zone_id', assignedZoneIds)

    if (connError) throw connError

    if (!meterAccounts || meterAccounts.length === 0) {
      return { status: 'success', data: [] }
    }

    const tableData: TableConsumer[] = []

    for (const ma of meterAccounts) {
      const consumer     = unwrap<any>(ma.consumer)
      if (!consumer) continue

      const zone         = unwrap<any>(ma.zone)
      if (!zone) continue

      const barangay     = unwrap<any>(zone.barangay)
      const classification = unwrap<any>(ma.classification)

      // �… Extract meter status from the first active meter
      let meterStatusName: string | null = null
      let meterSerialNo: string | null = null

      if (ma.meters && ma.meters.length > 0) {
        const meter = ma.meters[0] // Use the first meter found
        meterSerialNo = meter.meter_serial_no ?? null
        const status = unwrap<any>(meter.meter_status)
        meterStatusName = status?.meter_status_name ?? null
      }

      const consumerName = consumer.account_name || 'Unknown Consumer'

      tableData.push({
        meter_account_id:      ma.meter_account_id,
        contract_no:        consumer.contract_no ?? '—',
        consumer_name:         consumerName,
        barangay_name:         barangay?.barangay_name       ?? 'Unknown',
        zone_name:             zone.zone_name,
        classification_name:   classification?.classification_name ?? 'Unknown',
        meter_serial_no:       meterSerialNo,
        meter_status_name:     meterStatusName,
      })
    }

    return { status: 'success', data: tableData }
  } catch (err) {
    console.error('getAssignedConsumersTableData error:', err)
    return { status: 'error', message: 'Failed to load consumer data' }
  }
}

// ─── Simplified Zone Action ──────────────────────────────────────────────────

export async function getAssignedZonesSimple(): Promise<{
  status:   'success' | 'error'
  data?:    Zone[]
  message?: string
}> {
  const supabase = await createClient()

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { status: 'error', message: 'Not authenticated' }
    }

    const { data, error } = await supabase
      .from('meter_reader_assignments')
      .select(`
        zone:zone_id (
          zone_id,
          zone_name,
          barangay:barangay_id (
            barangay_name
          )
        )
      `)
      .eq('user_id', user.id)
      .eq('is_active', true)

    if (error) throw error

    const zones: Zone[] = (data ?? [])
      .map((row: any) => {
        const zone     = unwrap<any>(row.zone)
        if (!zone) return null
        const barangay = unwrap<any>(zone.barangay)
        return {
          zone_id:       zone.zone_id,
          zone_name:     zone.zone_name,
          barangay_name: barangay?.barangay_name ?? 'Unknown',
        }
      })
      .filter(Boolean) as Zone[]

    return { status: 'success', data: zones }
  } catch (err) {
    console.error('getAssignedZonesSimple error:', err)
    return { status: 'error', message: 'Failed to load zones' }
  }
}

// ============================================================================
// GET — All Assignments
// ============================================================================

export async function getAllAssignments(): Promise<Assignment[]> {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from('meter_reader_assignments')
      .select(`
        assignment_id,
        user_id,
        zone_id,
        is_active,
        assigned_date,
        user:user_id (
          user_id,
          first_name,
          last_name,
          email
        ),
        zone:zone_id (
          zone_id,
          zone_name,
          barangay:barangay_id (
            barangay_id,
            barangay_name
          )
        )
      `)
      .order('assigned_date', { ascending: false })

    if (error) throw error

    return (data ?? []).map((row: any) => {
      const user     = unwrap<any>(row.user)
      const zone     = unwrap<any>(row.zone)
      const barangay = zone ? unwrap<any>(zone.barangay) : null

      return {
        assignment_id: row.assignment_id,
        user_id:       row.user_id,
        zone_id:       row.zone_id,
        is_active:     row.is_active,
        assigned_date: row.assigned_date,
        user: user
          ? { user_id: user.user_id, first_name: user.first_name, last_name: user.last_name, email: user.email }
          : null,
        zone: zone
          ? {
              zone_id:   zone.zone_id,
              zone_name: zone.zone_name,
              barangay:  barangay
                ? { barangay_id: barangay.barangay_id, barangay_name: barangay.barangay_name }
                : { barangay_id: '', barangay_name: '' },
            }
          : null,
      }
    })
  } catch (error) {
    console.error('[getAllAssignments] Error:', error)
    throw new Error('Failed to fetch assignments')
  }
}

// ============================================================================
// GET — All Barangays
// ============================================================================

export async function getAllBarangays(): Promise<Barangay[]> {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from('barangay')
      .select('barangay_id, barangay_name, is_active, created_at')
      .eq('is_active', true)
      .order('barangay_name', { ascending: true })

    if (error) throw error

    return (data ?? []).map((row: any) => ({
      barangay_id:   row.barangay_id,
      barangay_name: row.barangay_name,
      is_active:     row.is_active,
      created_at:    row.created_at,
    }))
  } catch (error) {
    console.error('[getAllBarangays] Error:', error)
    throw new Error('Failed to fetch barangays')
  }
}

// ============================================================================
// GET — Assignment by ID
// ============================================================================

export async function getAssignmentById(assignmentId: string): Promise<Assignment | null> {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from('meter_reader_assignments')
      .select(`
        assignment_id, user_id, zone_id, is_active, assigned_date,
        user:user_id ( user_id, first_name, last_name, email ),
        zone:zone_id (
          zone_id, zone_name,
          barangay:barangay_id ( barangay_id, barangay_name )
        )
      `)
      .eq('assignment_id', assignmentId)
      .single()

    if (error) return null

    const user     = unwrap<any>(data.user)
    const zone     = unwrap<any>(data.zone)
    const barangay = zone ? unwrap<any>(zone.barangay) : null

    return {
      assignment_id: data.assignment_id,
      user_id:       data.user_id,
      zone_id:       data.zone_id,
      is_active:     data.is_active,
      assigned_date: data.assigned_date,
      user: user
        ? { user_id: user.user_id, first_name: user.first_name, last_name: user.last_name, email: user.email }
        : null,
      zone: zone
        ? {
            zone_id:   zone.zone_id,
            zone_name: zone.zone_name,
            barangay:  barangay
              ? { barangay_id: barangay.barangay_id, barangay_name: barangay.barangay_name }
              : { barangay_id: '', barangay_name: '' },
          }
        : null,
    }
  } catch (error) {
    console.error('[getAssignmentById] Error:', error)
    return null
  }
}

// ============================================================================
// GET — Current User's Assignments
// ============================================================================

export async function getMyAssignments(): Promise<Assignment[]> {
  const supabase = await createClient()

  try {
    const userId = await getCurrentUserId()
    if (!userId) return []

    const { data, error } = await supabase
      .from('meter_reader_assignments')
      .select(`
        assignment_id, user_id, zone_id, is_active, assigned_date,
        zone:zone_id (
          zone_id, zone_name,
          barangay:barangay_id ( barangay_id, barangay_name )
        )
      `)
      .eq('user_id', userId)
      .order('assigned_date', { ascending: false })

    if (error) throw error

    return (data ?? []).map((row: any) => {
      const zone     = unwrap<any>(row.zone)
      const barangay = zone ? unwrap<any>(zone.barangay) : null
      return {
        assignment_id: row.assignment_id,
        user_id:       row.user_id,
        zone_id:       row.zone_id,
        is_active:     row.is_active,
        assigned_date: row.assigned_date,
        user: null,
        zone: zone
          ? {
              zone_id:   zone.zone_id,
              zone_name: zone.zone_name,
              barangay:  barangay
                ? { barangay_id: barangay.barangay_id, barangay_name: barangay.barangay_name }
                : { barangay_id: '', barangay_name: '' },
            }
          : null,
      }
    })
  } catch (error) {
    console.error('[getMyAssignments] Error:', error)
    throw new Error('Failed to fetch user assignments')
  }
}

// ============================================================================
// GET — Assignments by Zone
// ============================================================================

export async function getAssignmentsByZone(zoneId: string): Promise<Assignment[]> {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from('meter_reader_assignments')
      .select(`
        assignment_id, user_id, zone_id, is_active, assigned_date,
        user:user_id ( user_id, first_name, last_name, email )
      `)
      .eq('zone_id', zoneId)
      .order('assigned_date', { ascending: false })

    if (error) throw error

    return (data ?? []).map((row: any) => {
      const user = unwrap<any>(row.user)
      return {
        assignment_id: row.assignment_id,
        user_id:       row.user_id,
        zone_id:       row.zone_id,
        is_active:     row.is_active,
        assigned_date: row.assigned_date,
        user: user
          ? { user_id: user.user_id, first_name: user.first_name, last_name: user.last_name, email: user.email }
          : null,
        zone: null,
      }
    })
  } catch (error) {
    console.error('[getAssignmentsByZone] Error:', error)
    throw new Error('Failed to fetch zone assignments')
  }
}

// ============================================================================
// GET — Assignments by User (active + inactive) — powers ManageReaderZonesForm
// ============================================================================

export async function getAssignmentsByUserId(userId: string): Promise<{
  status:   'success' | 'error'
  data?:    ReaderZoneAssignment[]
  message?: string
}> {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from('meter_reader_assignments')
      .select(`
        assignment_id, zone_id, is_active, assigned_date,
        zone:zone_id (
          zone_name,
          barangay:barangay_id ( barangay_name )
        )
      `)
      .eq('user_id', userId)
      .order('assigned_date', { ascending: false })

    if (error) throw error

    const rows: ReaderZoneAssignment[] = (data ?? []).map((row: any) => {
      const zone     = unwrap<any>(row.zone)
      const barangay = zone ? unwrap<any>(zone.barangay) : null
      return {
        assignment_id: row.assignment_id,
        zone_id:       row.zone_id,
        zone_name:     zone?.zone_name ?? 'Unknown Zone',
        barangay_name: barangay?.barangay_name ?? 'Unknown Barangay',
        is_active:     row.is_active,
        assigned_date: row.assigned_date,
      }
    })

    return { status: 'success', data: rows }
  } catch (error) {
    console.error('[getAssignmentsByUserId] Error:', error)
    return { status: 'error', message: 'Failed to load reader zone assignments' }
  }
}

// ============================================================================
// GET — Available Meter Readers
// ============================================================================

export async function getAvailableMeterReaders(): Promise<UserOption[]> {
  const supabase = await createClient()

  try {
    const { data: roleData } = await supabase
      .from('roles')
      .select('role_id')
      .eq('role_name', 'meter-reader')
      .single()

    if (!roleData) return []

    const { data, error } = await supabase
      .from('users')
      .select('user_id, first_name, last_name, email')
      .eq('role_id', roleData.role_id)
      .eq('is_active', true)
      .order('first_name', { ascending: true })

    if (error) throw error

    return data ?? []
  } catch (error) {
    console.error('[getAvailableMeterReaders] Error:', error)
    return []
  }
}

// ============================================================================
// GET — Active Meter Readers With Zone Stats (reader-first table)
// ============================================================================

export async function getActiveMeterReadersWithStats(): Promise<MeterReaderRow[]> {
  const supabase = await createClient()

  try {
    const readers = await getAvailableMeterReaders()
    if (readers.length === 0) return []

    const { data: rows, error } = await supabase
      .from('meter_reader_assignments')
      .select('user_id, is_active')
      .in('user_id', readers.map((r) => r.user_id))

    if (error) throw error

    const activeCount = new Map<string, number>()
    const totalCount  = new Map<string, number>()
    for (const row of rows ?? []) {
      totalCount.set(row.user_id, (totalCount.get(row.user_id) ?? 0) + 1)
      if (row.is_active) activeCount.set(row.user_id, (activeCount.get(row.user_id) ?? 0) + 1)
    }

    return readers.map((r) => ({
      ...r,
      active_zone_count: activeCount.get(r.user_id) ?? 0,
      total_zone_count:  totalCount.get(r.user_id) ?? 0,
    }))
  } catch (error) {
    console.error('[getActiveMeterReadersWithStats] Error:', error)
    return []
  }
}

// ============================================================================
// GET — Zones by Barangay
//
// When userId is provided, excludes zones where this user ALREADY HAS any
// assignment row (active OR inactive).
//
// Inactive assignments cannot be re-created via this form — the admin must
// use the toggle button on the assignments table to reactivate them.
// This prevents duplicate rows and forces the intentional reactivation flow.
// ============================================================================

export async function getZonesByBarangay(
  barangayId: string,
  userId?: string
): Promise<ZoneOption[]> {
  const supabase = await createClient()

  try {
    const { data: zones, error: zonesError } = await supabase
      .from('zone')
      .select('zone_id, zone_name')
      .eq('barangay_id', barangayId)
      .eq('is_active', true)
      .order('zone_name', { ascending: true })

    if (zonesError) throw zonesError
    if (!zones || zones.length === 0) return []

    if (userId) {
      // Exclude ALL zones this user has any row for — active OR inactive.
      // Inactive ones must be reactivated via the toggle, not re-created.
      const { data: anyAssignments } = await supabase
        .from('meter_reader_assignments')
        .select('zone_id')
        .eq('user_id', userId)

      const assignedZoneIds = new Set((anyAssignments ?? []).map((a: any) => a.zone_id))
      return zones.filter((zone) => !assignedZoneIds.has(zone.zone_id))
    }

    return zones
  } catch (error) {
    console.error('[getZonesByBarangay] Error:', error)
    return []
  }
}

// ============================================================================
// GET — Readers Eligible to Take Over a Zone
//
// Excludes the current holder. For each other active meter reader, reports
// whether they have no row for this zone ('new') or an existing inactive
// row that can be reactivated instead of duplicated ('reactivate').
// Readers who are already ACTIVELY assigned to this zone are skipped —
// that should never happen for more than one reader at a time, but it's a
// defensive guard against stale data.
// ============================================================================

export async function getEligibleReadersForZone(
  zoneId: string,
  excludeUserId: string
): Promise<EligibleReader[]> {
  const supabase = await createClient()

  try {
    const { data: roleData } = await supabase
      .from('roles')
      .select('role_id')
      .eq('role_name', 'meter-reader')
      .single()

    if (!roleData) return []

    const { data: readers, error: readersError } = await supabase
      .from('users')
      .select('user_id, first_name, last_name, email')
      .eq('role_id', roleData.role_id)
      .eq('is_active', true)
      .neq('user_id', excludeUserId)
      .order('first_name', { ascending: true })

    if (readersError) throw readersError
    if (!readers || readers.length === 0) return []

    const { data: existingRows } = await supabase
      .from('meter_reader_assignments')
      .select('assignment_id, user_id, is_active')
      .eq('zone_id', zoneId)
      .in('user_id', readers.map((r) => r.user_id))

    const rowByUser = new Map<string, { assignment_id: string; is_active: boolean }>()
    for (const row of existingRows ?? []) {
      rowByUser.set(row.user_id, row)
    }

    const result: EligibleReader[] = []
    for (const r of readers) {
      const row = rowByUser.get(r.user_id)
      if (row?.is_active) continue // already actively assigned — shouldn't happen, skip defensively

      result.push({
        user_id:       r.user_id,
        first_name:    r.first_name,
        last_name:     r.last_name,
        email:         r.email,
        assignment_id: row ? row.assignment_id : null,
        status:        row ? 'reactivate' : 'new',
      })
    }

    return result
  } catch (error) {
    console.error('[getEligibleReadersForZone] Error:', error)
    return []
  }
}

// ============================================================================
// CREATE — Assignment
// ============================================================================

export async function createAssignment(payload: {
  user_id: string
  zones:   { zone_id: string }[]
}): Promise<{
  status:   'success' | 'error'
  message?: string
  count?:   number
}> {
  const supabase = await createClient()

  try {
    const {
      data: { user: actorUser },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !actorUser) {
      return { status: 'error', message: 'User not authenticated' }
    }

    if (!payload.user_id || !payload.zones || payload.zones.length === 0) {
      return { status: 'error', message: 'Invalid assignment data' }
    }

    const zoneIds = payload.zones.map((z) => z.zone_id)

    // Fetch ALL existing rows (active + inactive) for these zones
    const { data: existingRows, error: fetchError } = await supabase
      .from('meter_reader_assignments')
      .select(`
        assignment_id,
        user_id,
        zone_id,
        is_active,
        user:user_id ( first_name, last_name )
      `)
      .in('zone_id', zoneIds)

    if (fetchError) throw fetchError

    // Block if any zone is actively assigned to ANOTHER user
    const activeConflicts = (existingRows ?? []).filter(
      (row: any) => row.is_active && row.user_id !== payload.user_id
    )

    if (activeConflicts.length > 0) {
      const conflictDetails = activeConflicts
        .map((row: any) => {
          const user = unwrap<any>(row.user)
          return `Zone is already assigned to ${user?.first_name ?? ''} ${user?.last_name ?? ''}`.trim()
        })
        .join('; ')

      return {
        status:  'error',
        message: `Cannot assign: ${conflictDetails}. Please deactivate the existing assignment first.`,
      }
    }

    // Separate zones into: reactivate vs insert
    const existingByZone = new Map<string, any>()
    for (const row of existingRows ?? []) {
      if (row.user_id === payload.user_id) {
        existingByZone.set(row.zone_id, row)
      }
    }

    const toInsert: string[] = []

    for (const zoneId of zoneIds) {
      const existing = existingByZone.get(zoneId)

      if (!existing) {
        toInsert.push(zoneId)
      } else if (!existing.is_active) {
        // Same user has a deactivated row → block and prompt reactivation
        return {
          status:  'error',
          message:
            `This meter reader already has a deactivated assignment for one or more selected zones. ` +
            `Please go to the Assignments table and use the activate toggle to restore it instead of creating a new one.`,
        }
      }
      // Same user already active → silently skip (getZonesByBarangay hides these)
    }

    if (toInsert.length === 0) {
      return {
        status:  'error',
        message: 'All selected zones are already assigned to this meter reader.',
      }
    }

    // Insert brand-new rows
    const newRows = toInsert.map((zone_id) => ({
      user_id:       payload.user_id,
      zone_id,
      is_active:     true,
      assigned_date: new Date().toISOString(),
    }))

    const { data: insertedRows, error: insertError } = await supabase
      .from('meter_reader_assignments')
      .insert(newRows)
      .select(`assignment_id, zone:zone_id ( zone_name )`)

    if (insertError) throw insertError

    // Audit log
    const { data: userData } = await supabase
      .from('users')
      .select('first_name, last_name')
      .eq('user_id', payload.user_id)
      .single()

    const userName = userData
      ? `${userData.first_name} ${userData.last_name}`
      : 'Unknown User'

    await createAuditLog(
      actorUser.id,
      'CREATE_ASSIGNMENT',
      `Assigned meter reader ${userName}: ${(insertedRows ?? []).length} new zone(s) assigned`,
      'meter_reader_assignments',
      insertedRows?.[0]?.assignment_id ?? undefined
    )

    return {
      status:  'success',
      message: `Successfully assigned ${(insertedRows ?? []).length} zone(s) to ${userName}`,
      count:   (insertedRows ?? []).length,
    }
  } catch (error) {
    console.error('[createAssignment] Error:', error)
    return { status: 'error', message: 'Failed to create assignment' }
  }
}

// ============================================================================
// UPDATE — Toggle Assignment Status
// ============================================================================

export async function toggleAssignmentStatus(
  assignmentId: string,
  currentStatus: boolean
): Promise<{ status: 'success' | 'error'; message?: string }> {
  const supabase = await createClient()

  try {
    const {
      data: { user: actorUser },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !actorUser) {
      return { status: 'error', message: 'User not authenticated' }
    }

    // Fetch the assignment we're toggling (need zone_id for conflict check)
    const { data: assignmentInfo, error: fetchError } = await supabase
      .from('meter_reader_assignments')
      .select(`
        zone_id,
        user:user_id ( user_id, first_name, last_name ),
        zone:zone_id (
          zone_id, zone_name,
          barangay:barangay_id ( barangay_id, barangay_name )
        )
      `)
      .eq('assignment_id', assignmentId)
      .single()

    if (fetchError || !assignmentInfo) {
      return { status: 'error', message: 'Assignment not found.' }
    }

    // Conflict check — only when ACTIVATING (false → true)
    if (!currentStatus) {
      const { data: conflictRow, error: conflictError } = await supabase
        .from('meter_reader_assignments')
        .select(`
          assignment_id,
          user:user_id ( first_name, last_name )
        `)
        .eq('zone_id', assignmentInfo.zone_id)
        .eq('is_active', true)
        .neq('assignment_id', assignmentId)
        .maybeSingle()

      if (conflictError) throw conflictError

      if (conflictRow) {
        const conflictUser = unwrap<any>(conflictRow.user)
        const conflictName = conflictUser
          ? `${conflictUser.first_name} ${conflictUser.last_name}`
          : 'another meter reader'

        const zone = unwrap<any>(assignmentInfo.zone)

        return {
          status:  'error',
          message:
            `Cannot activate — Zone "${zone?.zone_name ?? 'this zone'}" is already actively ` +
            `assigned to ${conflictName}. Deactivate their assignment first.`,
        }
      }
    }

    // Apply the toggle
    const { error: updateError } = await supabase
      .from('meter_reader_assignments')
      .update({ is_active: !currentStatus })
      .eq('assignment_id', assignmentId)

    if (updateError) throw updateError

    // Audit log
    const user     = unwrap<any>(assignmentInfo.user)
    const zone     = unwrap<any>(assignmentInfo.zone)
    const barangay = zone?.barangay ? unwrap<any>(zone.barangay) : null

    const readerName = user ? `${user.first_name} ${user.last_name}` : 'Unknown reader'
    const action     = !currentStatus ? 'activated' : 'deactivated'

    await createAuditLog(
      actorUser.id,
      'TOGGLE_ASSIGNMENT',
      `${action} assignment: ${readerName} ${action === 'activated' ? 'assigned to' : 'removed from'} ` +
        `zone ${zone?.zone_name ?? 'Unknown Zone'} in ${barangay?.barangay_name ?? 'Unknown Barangay'}`,
      'meter_reader_assignments',
      assignmentId
    )

    return { status: 'success', message: `Assignment ${action} successfully` }
  } catch (error) {
    console.error('[toggleAssignmentStatus] Error:', error)
    return { status: 'error', message: 'Failed to update assignment status' }
  }
}

// ============================================================================
// UPDATE — Transfer a Zone from One Reader to Another
//
// Deactivates `from_assignment_id` and, in the same call, either reactivates
// `to_assignment_id` (an existing inactive row for the target reader) or
// inserts a brand-new active row for `to_user_id`. This is what powers the
// "reassign" sheet — a single click hands the zone off atomically from the
// caller's point of view.
// ============================================================================

export async function transferZoneAssignment(payload: {
  zone_id:             string
  from_assignment_id:  string
  to_user_id:          string
  to_assignment_id?:   string
}): Promise<{ status: 'success' | 'error'; message?: string }> {
  const supabase = await createClient()

  try {
    const { data: { user: actorUser }, error: authError } = await supabase.auth.getUser()
    if (authError || !actorUser) {
      return { status: 'error', message: 'User not authenticated' }
    }

    const { data: fromInfo, error: fromError } = await supabase
      .from('meter_reader_assignments')
      .select(`
        assignment_id, user_id, zone_id, is_active,
        user:user_id ( first_name, last_name ),
        zone:zone_id ( zone_name, barangay:barangay_id ( barangay_name ) )
      `)
      .eq('assignment_id', payload.from_assignment_id)
      .single()

    if (fromError || !fromInfo) {
      return { status: 'error', message: 'Original assignment not found.' }
    }
    if (!fromInfo.is_active) {
      return { status: 'error', message: 'This assignment is already inactive.' }
    }
    if (fromInfo.zone_id !== payload.zone_id) {
      return { status: 'error', message: 'Zone mismatch — please refresh and try again.' }
    }

    const { data: toUser } = await supabase
      .from('users')
      .select('first_name, last_name')
      .eq('user_id', payload.to_user_id)
      .single()
    const toName = toUser ? `${toUser.first_name} ${toUser.last_name}` : 'Unknown reader'

    // Declared as `string` (not `string | undefined`) — each branch below
    // guarantees a real assignment_id before we fall through to the audit log.
    let toAssignmentId: string

    if (payload.to_assignment_id) {
      const { data: existingTo, error: existingToError } = await supabase
        .from('meter_reader_assignments')
        .select('assignment_id, user_id, zone_id, is_active')
        .eq('assignment_id', payload.to_assignment_id)
        .single()

      if (existingToError || !existingTo) {
        return { status: 'error', message: 'Target assignment not found.' }
      }
      if (existingTo.user_id !== payload.to_user_id || existingTo.zone_id !== payload.zone_id) {
        return { status: 'error', message: 'Target assignment does not match this zone/reader.' }
      }
      if (existingTo.is_active) {
        return { status: 'error', message: 'Target reader is already active on this zone.' }
      }

      const { error: reactivateError } = await supabase
        .from('meter_reader_assignments')
        .update({ is_active: true })
        .eq('assignment_id', payload.to_assignment_id)

      if (reactivateError) throw reactivateError

      toAssignmentId = payload.to_assignment_id
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('meter_reader_assignments')
        .insert({
          user_id:       payload.to_user_id,
          zone_id:       payload.zone_id,
          is_active:     true,
          assigned_date: new Date().toISOString(),
        })
        .select('assignment_id')
        .single()

      if (insertError) throw insertError
      if (!inserted) {
        return { status: 'error', message: 'Failed to create new assignment for target reader.' }
      }

      toAssignmentId = inserted.assignment_id
    }

    const { error: deactivateError } = await supabase
      .from('meter_reader_assignments')
      .update({ is_active: false })
      .eq('assignment_id', payload.from_assignment_id)

    if (deactivateError) throw deactivateError

    const fromUser  = unwrap<any>(fromInfo.user)
    const zone      = unwrap<any>(fromInfo.zone)
    const barangay  = zone ? unwrap<any>(zone.barangay) : null
    const fromName  = fromUser ? `${fromUser.first_name} ${fromUser.last_name}` : 'Unknown reader'

    await createAuditLog(
      actorUser.id,
      'TRANSFER_ASSIGNMENT',
      `Transferred zone ${zone?.zone_name ?? 'Unknown Zone'} in ${barangay?.barangay_name ?? 'Unknown Barangay'} from ${fromName} to ${toName}`,
      'meter_reader_assignments',
      toAssignmentId
    )

    return { status: 'success', message: `Zone transferred to ${toName} successfully` }
  } catch (error) {
    console.error('[transferZoneAssignment] Error:', error)
    return { status: 'error', message: 'Failed to transfer zone assignment' }
  }
}

// ============================================================================
// GET — Current active holder of a zone (used before activating a
// deactivated assignment, so the admin sees who they'd be taking over from
// before attempting it, rather than finding out only after a failed toggle).
// ============================================================================
export async function getActiveAssignmentForZone(
  zoneId: string,
  excludeAssignmentId?: string
): Promise<ActiveZoneHolder | null> {
  const supabase = await createClient()

  try {
    let query = supabase
      .from('meter_reader_assignments')
      .select(`
        assignment_id,
        user_id,
        user:user_id ( user_id, first_name, last_name, email )
      `)
      .eq('zone_id', zoneId)
      .eq('is_active', true)

    if (excludeAssignmentId) {
      query = query.neq('assignment_id', excludeAssignmentId)
    }

    const { data, error } = await query.maybeSingle()
    if (error || !data) return null

    const user = unwrap<any>(data.user)
    if (!user) return null

    return {
      assignment_id: data.assignment_id,
      user_id:       data.user_id,
      first_name:    user.first_name,
      last_name:     user.last_name,
      email:         user.email,
    }
  } catch (error) {
    console.error('[getActiveAssignmentForZone] Error:', error)
    return null
  }
}

// ============================================================================
// UPDATE — Activate an assignment, optionally handing over from a
// conflicting currently-active assignment on the same zone in one flow.
// Re-checks for a live conflict at the moment of activation (not just what
// was shown when the dialog opened) to avoid a stale-read race.
// ============================================================================
export async function activateAssignment(payload: {
  assignment_id:            string
  conflict_assignment_id?:  string
}): Promise<{ status: 'success' | 'error'; message?: string }> {
  const supabase = await createClient()

  try {
    const { data: { user: actorUser }, error: authError } = await supabase.auth.getUser()
    if (authError || !actorUser) {
      return { status: 'error', message: 'User not authenticated' }
    }

    const { data: targetInfo, error: targetError } = await supabase
      .from('meter_reader_assignments')
      .select(`
        assignment_id, zone_id, is_active,
        user:user_id ( first_name, last_name ),
        zone:zone_id ( zone_name, barangay:barangay_id ( barangay_name ) )
      `)
      .eq('assignment_id', payload.assignment_id)
      .single()

    if (targetError || !targetInfo) {
      return { status: 'error', message: 'Assignment not found.' }
    }
    if (targetInfo.is_active) {
      return { status: 'error', message: 'This assignment is already active.' }
    }

    const { data: liveConflict } = await supabase
      .from('meter_reader_assignments')
      .select(`assignment_id, user:user_id ( first_name, last_name )`)
      .eq('zone_id', targetInfo.zone_id)
      .eq('is_active', true)
      .neq('assignment_id', payload.assignment_id)
      .maybeSingle()

    if (liveConflict && liveConflict.assignment_id !== payload.conflict_assignment_id) {
      const conflictUser = unwrap<any>(liveConflict.user)
      const conflictName = conflictUser
        ? `${conflictUser.first_name} ${conflictUser.last_name}`
        : 'another meter reader'
      return {
        status:  'error',
        message: `Zone is now actively assigned to ${conflictName}. Please refresh and try again.`,
      }
    }

    if (liveConflict && payload.conflict_assignment_id) {
      const { error: deactivateError } = await supabase
        .from('meter_reader_assignments')
        .update({ is_active: false })
        .eq('assignment_id', payload.conflict_assignment_id)

      if (deactivateError) throw deactivateError
    }

    const { error: activateError } = await supabase
      .from('meter_reader_assignments')
      .update({ is_active: true })
      .eq('assignment_id', payload.assignment_id)

    if (activateError) throw activateError

    const user     = unwrap<any>(targetInfo.user)
    const zone     = unwrap<any>(targetInfo.zone)
    const barangay = zone?.barangay ? unwrap<any>(zone.barangay) : null
    const readerName = user ? `${user.first_name} ${user.last_name}` : 'Unknown reader'

    await createAuditLog(
      actorUser.id,
      'ACTIVATE_ASSIGNMENT',
      payload.conflict_assignment_id
        ? `Activated ${readerName} on zone ${zone?.zone_name ?? 'Unknown Zone'} (${barangay?.barangay_name ?? 'Unknown Barangay'}), handing over from the previous active reader`
        : `Activated assignment: ${readerName} on zone ${zone?.zone_name ?? 'Unknown Zone'} (${barangay?.barangay_name ?? 'Unknown Barangay'})`,
      'meter_reader_assignments',
      payload.assignment_id
    )

    return { status: 'success', message: 'Assignment activated successfully' }
  } catch (error) {
    console.error('[activateAssignment] Error:', error)
    return { status: 'error', message: 'Failed to activate assignment' }
  }
}