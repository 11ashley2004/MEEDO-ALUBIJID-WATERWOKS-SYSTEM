// lib/actions/dashboard/consultant-dashboard.actions.ts

'use server'

import { createClient } from '@/lib/supabase/server'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConsultantCardStats {
  totalJobOrders: number
  inProgressJobOrders: number
  completedJobOrders: number
  pendingAdjustments: number
}

export interface ConsultantJobOrder {
  job_order_id: string
  job_order_no: string
  job_type_name: string
  zone_name: string
  barangay_name: string
  job_status_name: string
  request_date: string
}

export interface ConsultantPendingAdjustment {
  reading_adjustment_id: string
  reading_id: string
  consumer_name: string
  meter_serial_no: string | null
  original_reading: number
  adjusted_reading: number
  status_name: string
  requested_date: string
  reason: string | null
}

// ─── Helper ───────────────────────────────────────────────────────────────────

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

function getFirst(val: unknown): any {
  if (Array.isArray(val)) return val[0] ?? null
  return val ?? null
}

async function getStatusIdByName(supabase: any, name: string): Promise<string | null> {
  const { data } = await supabase
    .from('job_order_status')
    .select('job_status_id')
    .ilike('job_status_name', name)
    .maybeSingle()
  return data?.job_status_id ?? null
}

// ============================================================================
// GET — Consultant Card Stats
// ============================================================================

export async function getConsultantCardStats(): Promise<{
  status: 'success' | 'error'
  data?: ConsultantCardStats
  message?: string
}> {
  const supabase = await createClient()

  try {
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return { status: 'error', message: 'Unauthorized' }

    // Get all job orders
    const { data: jobOrders, error: joErr } = await supabase
      .from('job_orders')
      .select(`
        job_order_id,
        job_status_id
      `)

    if (joErr) throw joErr

    const inProgressId = await getStatusIdByName(supabase, 'in_progress')
    const completedId = await getStatusIdByName(supabase, 'completed')

    let inProgressCount = 0
    let completedCount = 0

    for (const job of jobOrders ?? []) {
      const statusId = job.job_status_id
      if (statusId === inProgressId) inProgressCount++
      else if (statusId === completedId) completedCount++
    }

    // Get pending adjustments count
    const { data: pendingStatus } = await supabase
      .from('bulk_status')
      .select('status_id')
      .ilike('status_name', 'pending')
      .single()

    let pendingAdjustments = 0
    if (pendingStatus) {
      const { data: pendingAdj, error: adjErr } = await supabase
        .from('meter_reading_adjustments')
        .select('reading_adjustment_id')
        .eq('status_id', pendingStatus.status_id)

      if (!adjErr) {
        pendingAdjustments = pendingAdj?.length || 0
      }
    }

    return {
      status: 'success',
      data: {
        totalJobOrders: jobOrders?.length || 0,
        inProgressJobOrders: inProgressCount,
        completedJobOrders: completedCount,
        pendingAdjustments: pendingAdjustments,
      },
    }
  } catch (err) {
    console.error('[getConsultantCardStats]', err)
    return { status: 'error', message: 'Failed to load stats' }
  }
}

// ============================================================================
// GET — Recent Job Orders
// ============================================================================

export async function getConsultantRecentJobOrders(limit = 5): Promise<{
  status: 'success' | 'error'
  data?: ConsultantJobOrder[]
  message?: string
}> {
  const supabase = await createClient()

  try {
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return { status: 'error', message: 'Unauthorized' }

    const { data: jobOrders, error: joErr } = await supabase
      .from('job_orders')
      .select(`
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
      `)
      .order('request_date', { ascending: false })
      .limit(limit)

    if (joErr) throw joErr

    const results: ConsultantJobOrder[] = []

    for (const jo of jobOrders ?? []) {
      const jobType = getFirst(jo.job_type) as any
      const jobStatus = getFirst(jo.job_status) as any
      const barangay = getFirst(jo.barangay) as any

      let zoneName = '—'
      if (barangay?.barangay_id) {
        const { data: zoneData } = await supabase
          .from('zone')
          .select('zone_name')
          .eq('barangay_id', barangay.barangay_id)
          .limit(1)
          .maybeSingle()
        if (zoneData) {
          zoneName = zoneData.zone_name
        }
      }

      results.push({
        job_order_id: jo.job_order_id,
        job_order_no: jo.job_order_no,
        job_type_name: jobType?.job_type_name ?? '—',
        zone_name: zoneName,
        barangay_name: barangay?.barangay_name ?? '—',
        job_status_name: jobStatus?.job_status_name ?? 'pending',
        request_date: jo.request_date,
      })
    }

    return { status: 'success', data: results }
  } catch (err) {
    console.error('[getConsultantRecentJobOrders]', err)
    return { status: 'error', message: 'Failed to load recent job orders' }
  }
}

// ============================================================================
// GET — Pending Adjustments (FIXED - properly gets consumer name)
// ============================================================================

export async function getConsultantPendingAdjustments(limit = 5): Promise<{
  status: 'success' | 'error'
  data?: ConsultantPendingAdjustment[]
  message?: string
}> {
  const supabase = await createClient()

  try {
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return { status: 'error', message: 'Unauthorized' }

    const { data: pendingStatus } = await supabase
      .from('bulk_status')
      .select('status_id')
      .ilike('status_name', 'pending')
      .single()

    if (!pendingStatus) {
      return { status: 'success', data: [] }
    }

    // Get adjustments with all needed data
    const { data: adjustments, error: adjErr } = await supabase
      .from('meter_reading_adjustments')
      .select(`
        reading_adjustment_id,
        reading_id,
        original_reading,
        adjusted_reading,
        reason,
        requested_date,
        meter_reading:reading_id (
          reading_id,
          meter_account_id,
          meter_accounts:meter_account_id (
            meter_account_id,
            consumer_id,
            consumers:consumer_id (
              consumer_id,
              account_name
            )
          )
        )
      `)
      .eq('status_id', pendingStatus.status_id)
      .order('requested_date', { ascending: false })
      .limit(limit)

    if (adjErr) {
      console.error('[getConsultantPendingAdjustments] Error:', adjErr)
      throw adjErr
    }

    const results: ConsultantPendingAdjustment[] = []

    for (const adj of adjustments ?? []) {
      const meterReading = getFirst(adj.meter_reading) as any
      const meterAccount = getFirst(meterReading?.meter_accounts) as any
      
      // Get consumer data - handle both array and object responses
      let consumerName = 'Unknown'
      const consumerData = meterAccount?.consumers
      
      if (consumerData) {
        if (Array.isArray(consumerData)) {
          const firstConsumer = consumerData[0]
          if (firstConsumer?.account_name) {
            consumerName = firstConsumer.account_name
          }
        } else if (consumerData.account_name) {
          consumerName = consumerData.account_name
        }
      }

      results.push({
        reading_adjustment_id: adj.reading_adjustment_id,
        reading_id: adj.reading_id,
        consumer_name: consumerName,
        meter_serial_no: meterAccount?.meter_serial_no ?? '—',
        original_reading: Number(adj.original_reading),
        adjusted_reading: Number(adj.adjusted_reading),
        status_name: 'pending',
        requested_date: adj.requested_date,
        reason: adj.reason,
      })
    }

    return { status: 'success', data: results }
  } catch (err) {
    console.error('[getConsultantPendingAdjustments]', err)
    return { status: 'error', message: 'Failed to load pending adjustments' }
  }
}