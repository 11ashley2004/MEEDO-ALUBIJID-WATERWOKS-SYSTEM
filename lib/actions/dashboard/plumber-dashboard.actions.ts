// lib/actions/dashboard/plumber-dashboard.actions.ts

'use server'

import { createClient } from '@/lib/supabase/server'

// ─── Types ────────────────────────────────────────────────────────────────────

export type PlumberCardStats = {
  totalJobOrders: number
  assignedJobOrders: number
  inProgressJobOrders: number
  completedJobOrders: number
}

export type PlumberJobOrder = {
  job_order_id: string
  job_order_no: string
  job_type_name: string
  zone_name: string
  barangay_name: string
  job_status_name: string
  request_date: string
  role: 'leader' | 'helper'
}

// ─── Helper: get current logged-in user id ────────────────────────────────────

async function getCurrentUserId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user.id
}

// ─── Helper: unwrap nested Supabase data ─────────────────────────────────────

function getFirst(val: unknown): any {
  if (Array.isArray(val)) return val[0] ?? null
  return val ?? null
}

// ─── Helper: get status ID by name ──────────────────────────────────────────

async function getStatusIdByName(supabase: any, name: string): Promise<string | null> {
  const { data } = await supabase
    .from('job_order_status')
    .select('job_status_id')
    .ilike('job_status_name', name)
    .maybeSingle()
  return data?.job_status_id ?? null
}

// ─── Helper: collect all assignment ids for a user (leader + helper) ────────
// Mirrors getAssignmentHeaderInfo in meter-reader-dashboard.actions.ts.

async function getUserAssignmentIds(
  supabase: any,
  userId: string,
): Promise<{ assignmentIds: string[]; leaderIds: Set<string> }> {
  const [{ data: leaderAssignments }, { data: helperAssignments }] = await Promise.all([
    supabase
      .from('job_assignments')
      .select('job_assignment_id')
      .eq('assigned_to', userId),
    supabase
      .from('job_assignment_helper')
      .select('job_assignment_id')
      .eq('helper_id', userId),
  ])

  const leaderRows = (leaderAssignments ?? []) as { job_assignment_id: string }[]
  const helperRows = (helperAssignments ?? []) as { job_assignment_id: string }[]

  const leaderIds = new Set<string>(leaderRows.map((a) => a.job_assignment_id))

  const all = new Set<string>(leaderIds)
  for (const h of helperRows) {
    if (h.job_assignment_id) all.add(h.job_assignment_id)
  }

  return { assignmentIds: [...all], leaderIds }
}

// ─── Helper: collect all job_order_ids for those assignments ────────────────
// job_assignments does NOT have job_order_id — job orders are linked via the
// job_assignment_orders join table. This is the fix for both reported errors.

async function getJobOrderIdsForAssignments(
  supabase: any,
  assignmentIds: string[],
): Promise<string[]> {
  if (!assignmentIds.length) return []

  const { data, error } = await supabase
    .from('job_assignment_orders')
    .select('job_order_id')
    .in('job_assignment_id', assignmentIds)

  if (error) throw error

  const rows = (data ?? []) as { job_order_id: string | null }[]

  return [
    ...new Set(
      rows
        .map((r) => r.job_order_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ]
}

// ============================================================================
// GET — Plumber Card Stats (counts both leader and helper assignments)
// ============================================================================

export async function getPlumberCardStats(): Promise<{
  status: 'success' | 'error'
  data?: PlumberCardStats
  message?: string
}> {
  const supabase = await createClient()

  try {
    const userId = await getCurrentUserId()
    if (!userId) return { status: 'error', message: 'Unauthorized' }

    // 1. All assignment ids for this user (leader + helper)
    const { assignmentIds } = await getUserAssignmentIds(supabase, userId)

    // 2. All job_order_ids reachable from those assignments
    const jobOrderIds = await getJobOrderIdsForAssignments(supabase, assignmentIds)

    if (jobOrderIds.length === 0) {
      return {
        status: 'success',
        data: {
          totalJobOrders: 0,
          assignedJobOrders: 0,
          inProgressJobOrders: 0,
          completedJobOrders: 0,
        },
      }
    }

    // 3. Status ids
    const assignedId   = await getStatusIdByName(supabase, 'assigned')
    const inProgressId = await getStatusIdByName(supabase, 'in_progress')
    const completedId  = await getStatusIdByName(supabase, 'completed')

    // 4. Fetch each job order's status
    const { data: jobOrders, error: joErr } = await supabase
      .from('job_orders')
      .select('job_order_id, job_status_id')
      .in('job_order_id', jobOrderIds)

    if (joErr) throw joErr

    const jobRows = (jobOrders ?? []) as {
      job_order_id: string
      job_status_id: string | null
    }[]

    let assignedCount = 0
    let inProgressCount = 0
    let completedCount = 0

    for (const job of jobRows) {
      const statusId = job.job_status_id
      if (statusId === assignedId) assignedCount++
      else if (statusId === inProgressId) inProgressCount++
      else if (statusId === completedId) completedCount++
    }

    return {
      status: 'success',
      data: {
        totalJobOrders: jobOrderIds.length,
        assignedJobOrders: assignedCount,
        inProgressJobOrders: inProgressCount,
        completedJobOrders: completedCount,
      },
    }
  } catch (err) {
    console.error('[getPlumberCardStats]', err)
    return { status: 'error', message: 'Failed to load stats' }
  }
}

// ============================================================================
// GET — Recent Job Orders (leader + helper, newest first)
// ============================================================================

export async function getPlumberRecentJobOrders(limit = 5): Promise<{
  status: 'success' | 'error'
  data?: PlumberJobOrder[]
  message?: string
}> {
  const supabase = await createClient()

  try {
    const userId = await getCurrentUserId()
    if (!userId) return { status: 'error', message: 'Unauthorized' }

    // 1. All assignment ids for this user (leader + helper)
    const { assignmentIds, leaderIds } = await getUserAssignmentIds(supabase, userId)
    if (assignmentIds.length === 0) return { status: 'success', data: [] }

    // 2. Pull job_assignment_orders rows with the nested job_order + related
    //    tables, in one query. This mirrors JOB_ORDER_LINE_SELECT in
    //    meter-reader / worker-job-order.actions.ts.
    const { data, error } = await supabase
      .from('job_assignment_orders')
      .select(`
        job_assignment_id,
        job_order:job_order_id (
          job_order_id,
          job_order_no,
          request_date,
          job_type:job_type_id (
            job_type_name
          ),
          job_status:job_status_id (
            job_status_name
          ),
          barangay:barangay_id (
            barangay_name
          )
        )
      `)
      .in('job_assignment_id', assignmentIds)

    if (error) throw error

    const rows = (data ?? []) as {
      job_assignment_id: string
      job_order: any
    }[]

    // 3. Shape the rows.
    const results: PlumberJobOrder[] = []

    for (const row of rows) {
      const jo = getFirst(row.job_order)
      if (!jo) continue

      const jobType   = getFirst(jo.job_type)
      const jobStatus = getFirst(jo.job_status)
      const barangay  = getFirst(jo.barangay)

      // Job orders don't carry a direct zone_name; the zone hangs off the
      // barangay. Look it up separately.
      let zoneName = '—'
      if (barangay?.barangay_id) {
        const { data: zoneData } = await supabase
          .from('zone')
          .select('zone_name')
          .eq('barangay_id', barangay.barangay_id)
          .limit(1)
          .maybeSingle()
        if (zoneData) zoneName = zoneData.zone_name
      }

      results.push({
        job_order_id: jo.job_order_id,
        job_order_no: jo.job_order_no ?? '—',
        job_type_name: jobType?.job_type_name ?? '—',
        zone_name: zoneName,
        barangay_name: barangay?.barangay_name ?? '—',
        job_status_name: jobStatus?.job_status_name ?? 'pending',
        request_date: jo.request_date,
        role: leaderIds.has(row.job_assignment_id) ? 'leader' : 'helper',
      })
    }

    // 4. Sort newest first and take limit.
    results.sort(
      (a, b) => new Date(b.request_date).getTime() - new Date(a.request_date).getTime(),
    )

    return { status: 'success', data: results.slice(0, limit) }
  } catch (err) {
    console.error('[getPlumberRecentJobOrders]', err)
    return { status: 'error', message: 'Failed to load recent job orders' }
  }
}