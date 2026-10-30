'use server'

import { createClient } from '@/lib/supabase/server'
import { SupabaseClient } from '@supabase/supabase-js'

// ============================================================================
// Types
// ============================================================================

export interface MeterReaderStats {
  totalZones:       number
  totalAccounts:    number
  pendingOrders:    number
  inProgressOrders: number
  completedOrders:  number
}

export interface ZoneAccountStat {
  zone_id:       string
  zone_name:     string
  barangay_name: string
  accounts:      number
}

export interface RecentJobOrder {
  job_order_id:    string
  job_order_no:    string
  zone_name:       string
  job_status_name: string
  service_name:    string
  request_date:    string
}

// ============================================================================
// Internal helpers
// ============================================================================

async function getAuthUserId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

async function getAssignedZoneIds(userId: string): Promise<string[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('meter_reader_assignments')
    .select('zone_id')
    .eq('user_id', userId)
    .eq('is_active', true)
  if (error) { return [] }
  return (data ?? []).map((a: any) => a.zone_id)
}

function unwrap<T>(val: T | T[] | null | undefined): T | null {
  if (val == null) return null
  return Array.isArray(val) ? (val[0] ?? null) : val
}

function safeNumber(value: any, defaultValue: number = 0): number {
  const num = Number(value)
  return isNaN(num) ? defaultValue : num
}

async function getMeterStatusIdsByNames(
  supabase: SupabaseClient,
  names: string[],
): Promise<string[]> {
  const { data } = await supabase
    .from('meter_status')
    .select('meter_status_id')
    .in('meter_status_name', names)
  return (data ?? []).map(d => d.meter_status_id)
}

// ============================================================================
// GET — Stat cards
// ============================================================================

export async function getMeterReaderStats(): Promise<{
  status: 'success' | 'error'
  data?: MeterReaderStats
  message?: string
}> {
  const supabase = await createClient()
  const userId   = await getAuthUserId()

  const empty: MeterReaderStats = {
    totalZones: 0, 
    totalAccounts: 0,
    pendingOrders: 0, 
    inProgressOrders: 0, 
    completedOrders: 0,
  }

  if (!userId) return { status: 'success', data: empty }

  try {
    const zoneIds = await getAssignedZoneIds(userId)
    
    if (zoneIds.length === 0) {
      return { status: 'success', data: empty }
    }

    // ── Get job assignment IDs where user is leader ─────────────────────────
    const { data: leaderAssignments } = await supabase
      .from('job_assignments')
      .select('job_assignment_id')
      .eq('assigned_to', userId)

    // ── Get job assignment IDs where user is helper ─────────────────────────
    const { data: helperAssignments } = await supabase
      .from('job_assignment_helper')
      .select('job_assignment_id')
      .eq('helper_id', userId)

    // ── Combine all assignment IDs ──────────────────────────────────────────
    const assignmentIds = new Set<string>()
    ;(leaderAssignments ?? []).forEach((r: any) => assignmentIds.add(r.job_assignment_id))
    ;(helperAssignments ?? []).forEach((h: any) => assignmentIds.add(h.job_assignment_id))

    let joIds: string[] = []

    if (assignmentIds.size > 0) {
      // ── Get job_order_ids from job_assignment_orders ──────────────────────
      const { data: assignmentOrders } = await supabase
        .from('job_assignment_orders')
        .select('job_order_id')
        .in('job_assignment_id', [...assignmentIds])

      joIds = (assignmentOrders ?? []).map((ao: any) => ao.job_order_id).filter(Boolean)
    }

    // ── Status map ───────────────────────────────────────────────────────────
    const { data: statuses } = await supabase
      .from('job_order_status')
      .select('job_status_id, job_status_name')

    const statusId = (name: string) =>
      statuses?.find((s: any) => s.job_status_name.toLowerCase() === name)?.job_status_id

    const pendingId    = statusId('pending')
    const inProgressId = statusId('in_progress')
    const completedId  = statusId('completed')

    // ── Count job orders by status ──────────────────────────────────────────
    const countJos = async (statusIdVal: string | undefined) => {
      if (!statusIdVal || joIds.length === 0) return 0
      const { count } = await supabase
        .from('job_orders')
        .select('job_order_id', { count: 'exact', head: true })
        .in('job_order_id', joIds)
        .eq('job_status_id', statusIdVal)
      return count ?? 0
    }

    // ── Count meter accounts in the assigned zones ──────────────────────────
    const relevantStatusIds = await getMeterStatusIdsByNames(supabase, [
      'Active',
      'Defective',
      'Stolen',
      'Waterleak_After_Meter',
    ])

    let accountsCount = 0
    if (zoneIds.length > 0 && relevantStatusIds.length > 0) {
      const { data: relevantMeters } = await supabase
        .from('meters')
        .select('meter_account_id')
        .in('meter_status_id', relevantStatusIds)

      const relevantAccountIds = Array.from(
        new Set((relevantMeters ?? []).map((m: any) => m.meter_account_id))
      )

      if (relevantAccountIds.length > 0) {
        const { count } = await supabase
          .from('meter_accounts')
          .select('meter_account_id', { count: 'exact', head: true })
          .in('zone_id', zoneIds)
          .in('meter_account_id', relevantAccountIds)

        accountsCount = count ?? 0
      }
    }

    const [pendingCount, inProgressCount, completedCount] = await Promise.all([
      countJos(pendingId),
      countJos(inProgressId),
      countJos(completedId),
    ])

    return {
      status: 'success',
      data: {
        totalZones:       safeNumber(zoneIds.length),
        totalAccounts:    safeNumber(accountsCount),
        pendingOrders:    safeNumber(pendingCount),
        inProgressOrders: safeNumber(inProgressCount),
        completedOrders:  safeNumber(completedCount),
      },
    }
  } catch (err) {
    console.error('[getMeterReaderStats] Error:', err)
    return { status: 'error', message: 'Failed to load stats' }
  }
}

// ============================================================================
// GET — Accounts per zone (chart)
// ============================================================================

export async function getMeterReaderZoneAccounts(): Promise<{
  status: 'success' | 'error'
  data?: ZoneAccountStat[]
  message?: string
}> {
  const supabase = await createClient()
  const userId   = await getAuthUserId()
  if (!userId) return { status: 'success', data: [] }

  try {
    const { data: assignments, error } = await supabase
      .from('meter_reader_assignments')
      .select(`
        zone_id,
        zone:zone_id (
          zone_name,
          barangay:barangay_id ( barangay_name )
        )
      `)
      .eq('user_id', userId)
      .eq('is_active', true)

    if (error) throw error
    if (!assignments?.length) return { status: 'success', data: [] }

    const zoneIds = assignments.map((a: any) => a.zone_id)

    let accounts: any[] = []
    if (zoneIds.length > 0) {
      const { data } = await supabase
        .from('meter_accounts')
        .select('zone_id')
        .in('zone_id', zoneIds)

      accounts = data ?? []
    }

    const countMap: Record<string, number> = {}
    accounts.forEach((c: any) => {
      countMap[c.zone_id] = (countMap[c.zone_id] ?? 0) + 1
    })

    const result: ZoneAccountStat[] = assignments.map((a: any) => {
      const zone     = unwrap(a.zone)
      const barangay = unwrap(zone?.barangay)
      return {
        zone_id:       a.zone_id,
        zone_name:     zone?.zone_name     ?? '',
        barangay_name: barangay?.barangay_name ?? '',
        accounts:      safeNumber(countMap[a.zone_id] ?? 0),
      }
    })

    result.sort((a, b) => b.accounts - a.accounts)
    return { status: 'success', data: result }
  } catch (err) {
    console.error('[getMeterReaderZoneAccounts]', err)
    return { status: 'error', message: 'Failed to load zone accounts' }
  }
}

// ============================================================================
// GET — Recent job orders (lead + helper, newest first)
// ============================================================================

export async function getRecentJobOrders(limit = 5): Promise<{
  status: 'success' | 'error'
  data?: RecentJobOrder[]
  message?: string
}> {
  const supabase = await createClient()
  const userId   = await getAuthUserId()
  if (!userId) return { status: 'success', data: [] }

  try {
    // Get job assignment IDs where user is leader
    const { data: leaderAssignments } = await supabase
      .from('job_assignments')
      .select('job_assignment_id')
      .eq('assigned_to', userId)

    // Get job assignment IDs where user is helper
    const { data: helperAssignments } = await supabase
      .from('job_assignment_helper')
      .select('job_assignment_id')
      .eq('helper_id', userId)

    const assignmentIds = new Set<string>()
    ;(leaderAssignments ?? []).forEach((r: any) => assignmentIds.add(r.job_assignment_id))
    ;(helperAssignments ?? []).forEach((h: any) => assignmentIds.add(h.job_assignment_id))

    if (assignmentIds.size === 0) return { status: 'success', data: [] }

    // Get job_order_ids from job_assignment_orders using the assignment IDs
    const { data: assignmentOrders } = await supabase
      .from('job_assignment_orders')
      .select('job_order_id')
      .in('job_assignment_id', [...assignmentIds])

    const joIds = new Set<string>()
    ;(assignmentOrders ?? []).forEach((ao: any) => joIds.add(ao.job_order_id))

    if (joIds.size === 0) return { status: 'success', data: [] }

    // Get job order details
    const { data: jobOrders, error } = await supabase
      .from('job_orders')
      .select(`
        job_order_id,
        job_order_no,
        request_date,
        job_type:job_type_id (
          job_type_name
        ),
        barangay:barangay_id (
          barangay_name
        ),
        job_status:job_status_id (
          job_status_name
        )
      `)
      .in('job_order_id', [...joIds])
      .order('request_date', { ascending: false })
      .limit(limit)

    if (error) throw error

    const results: RecentJobOrder[] = (jobOrders ?? []).map((jo: any) => {
      const jobType = unwrap(jo.job_type)
      const barangay = unwrap(jo.barangay)
      const status = unwrap(jo.job_status)
      
      return {
        job_order_id: jo.job_order_id,
        job_order_no: jo.job_order_no ?? '—',
        zone_name: barangay?.barangay_name ?? '—',
        job_status_name: status?.job_status_name ?? 'pending',
        service_name: jobType?.job_type_name ?? '—',
        request_date: jo.request_date,
      }
    })

    return { status: 'success', data: results }
  } catch (err) {
    console.error('[getRecentJobOrders] Error:', err)
    return { status: 'error', message: 'Failed to load job orders' }
  }
}