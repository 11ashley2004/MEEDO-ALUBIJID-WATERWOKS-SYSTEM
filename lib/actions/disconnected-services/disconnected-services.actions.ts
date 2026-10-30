'use server'

import { createClient } from '@/lib/supabase/server'

export interface DisconnectedService {
  connection_id: string
  connection_no: string
  consumer_name: string
  barangay_name: string
  zone_name: string
  classification_name: string
  outstanding_balance: number
  disconnected_date: string
  notice_no: string | null
  notice_id: string | null
}

export interface DisconnectedServiceDetail {
  connection_id: string
  connection_no: string
  consumer_id: string
  consumer_name: string
  barangay_id: string
  barangay_name: string
  zone_id: string
  zone_name: string
  classification_id: string
  classification_name: string
  connection_type: boolean
  outstanding_balance: number
  disconnected_date: string
  notice_no: string | null
  notice_id: string | null
  meter_serial_no: string | null
  meter_status: string | null
  last_billing_date: string | null
  last_billing_amount: number | null
}

// Helper
const getFirst = (val: unknown): any => {
  if (Array.isArray(val)) return val[0] ?? null
  return val ?? null
}

function buildFullName(person: any): string {
  if (!person) return '—'
  const { first_name = '', last_name = '', middle_name } = person
  if (!first_name && !last_name) return '—'
  const mi = middle_name ? ` ${middle_name[0]}.` : ''
  return `${last_name}, ${first_name}${mi}`.trim()
}

// ============================================================================
// GET — All Disconnected Services
// ============================================================================

export async function getDisconnectedServices(): Promise<DisconnectedService[]> {
  const supabase = await createClient()

  try {
    // Get Disconnected status ID
    const { data: disconnectedStatus } = await supabase
      .from('connection_status')
      .select('connection_status_id')
      .eq('connection_status_name', 'Disconnected')
      .single()

    if (!disconnectedStatus) return []

    // Get all service connections with status 'Disconnected'
    const { data: disconnectedConns, error: connError } = await supabase
      .from('service_connections')
      .select(`
        connection_id,
        connection_no,
        consumer_id,
        zone:zone_id (
          zone_name,
          barangay:barangay_id (
            barangay_id,
            barangay_name
          )
        ),
        classification:classification_id (
          classification_name
        ),
        updated_at
      `)
      .eq('connection_status_id', disconnectedStatus.connection_status_id)
      .order('updated_at', { ascending: false })

    if (connError) throw connError
    if (!disconnectedConns?.length) return []

    const connectionIds = disconnectedConns.map(c => c.connection_id)

    // Get consumer names
    const consumerIds = disconnectedConns.map(c => c.consumer_id).filter(Boolean)
    const { data: consumers } = await supabase
      .from('consumers')
      .select('consumer_id, first_name, last_name, middle_name')
      .in('consumer_id', consumerIds)

    const consumerMap = new Map()
    for (const c of consumers ?? []) {
      consumerMap.set(c.consumer_id, c)
    }

    // Get outstanding balances from latest billing
    const { data: billings } = await supabase
      .from('billing')
      .select('connection_id, remaining_balance, created_at')
      .in('connection_id', connectionIds)
      .order('created_at', { ascending: false })

    const latestBalanceMap = new Map<string, number>()
    const disconnectedDateMap = new Map<string, string>()
    for (const b of billings ?? []) {
      if (!latestBalanceMap.has(b.connection_id)) {
        latestBalanceMap.set(b.connection_id, b.remaining_balance ?? 0)
      }
      if (!disconnectedDateMap.has(b.connection_id)) {
        disconnectedDateMap.set(b.connection_id, b.created_at)
      }
    }

    // Get notice info for disconnected connections
    const { data: noticeConns } = await supabase
      .from('notice_service_connections')
      .select(`
        connection_id,
        notice:notice_id (
          notice_id,
          notice_no
        )
      `)
      .in('connection_id', connectionIds)

    const noticeMap = new Map<string, { notice_id: string; notice_no: string }>()
    for (const nc of noticeConns ?? []) {
      const notice = getFirst(nc.notice)
      if (notice) {
        noticeMap.set(nc.connection_id, {
          notice_id: notice.notice_id,
          notice_no: notice.notice_no,
        })
      }
    }

    const result: DisconnectedService[] = []

    for (const conn of disconnectedConns) {
      const zone = getFirst(conn.zone)
      const barangay = getFirst(zone?.barangay)
      const classification = getFirst(conn.classification)
      const consumer = consumerMap.get(conn.consumer_id)
      const notice = noticeMap.get(conn.connection_id)

      result.push({
        connection_id: conn.connection_id,
        connection_no: conn.connection_no,
        consumer_name: buildFullName(consumer),
        barangay_name: barangay?.barangay_name ?? '—',
        zone_name: zone?.zone_name ?? '—',
        classification_name: classification?.classification_name ?? '—',
        outstanding_balance: latestBalanceMap.get(conn.connection_id) ?? 0,
        disconnected_date: disconnectedDateMap.get(conn.connection_id) ?? conn.updated_at,
        notice_no: notice?.notice_no ?? null,
        notice_id: notice?.notice_id ?? null,
      })
    }

    return result
  } catch (err) {
    console.error('Error fetching disconnected services:', err)
    return []
  }
}

// ============================================================================
// GET — Disconnected Service Detail
// ============================================================================

export async function getDisconnectedServiceDetail(connectionId: string): Promise<DisconnectedServiceDetail | null> {
  const supabase = await createClient()

  try {
    // Get service connection
    const { data: connection, error: connError } = await supabase
      .from('service_connections')
      .select(`
        connection_id,
        connection_no,
        consumer_id,
        zone_id,
        classification_id,
        connection_type,
        updated_at,
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
        )
      `)
      .eq('connection_id', connectionId)
      .single()

    if (connError) throw connError

    const zone = getFirst(connection.zone)
    const barangay = getFirst(zone?.barangay)
    const classification = getFirst(connection.classification)

    // Get consumer
    const { data: consumer } = await supabase
      .from('consumers')
      .select('consumer_id, first_name, last_name, middle_name')
      .eq('consumer_id', connection.consumer_id)
      .single()

    // Get latest meter
    const { data: meter } = await supabase
      .from('meters')
      .select(`
        meter_serial_no,
        meter_status:meter_status_id (
          meter_status_name
        )
      `)
      .eq('connection_id', connectionId)
      .order('installation_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    const meterStatus = getFirst(meter?.meter_status)

    // Get latest billing
    const { data: billing } = await supabase
      .from('billing')
      .select('remaining_balance, created_at, total_billing')
      .eq('connection_id', connectionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Get notice info
    const { data: noticeConn } = await supabase
      .from('notice_service_connections')
      .select(`
        notice:notice_id (
          notice_id,
          notice_no
        )
      `)
      .eq('connection_id', connectionId)
      .maybeSingle()

    const notice = getFirst(noticeConn?.notice)

    return {
      connection_id: connection.connection_id,
      connection_no: connection.connection_no,
      consumer_id: connection.consumer_id,
      consumer_name: buildFullName(consumer),
      barangay_id: barangay?.barangay_id ?? '',
      barangay_name: barangay?.barangay_name ?? '—',
      zone_id: zone?.zone_id ?? '',
      zone_name: zone?.zone_name ?? '—',
      classification_id: classification?.classification_id ?? '',
      classification_name: classification?.classification_name ?? '—',
      connection_type: connection.connection_type,
      outstanding_balance: billing?.remaining_balance ?? 0,
      disconnected_date: billing?.created_at ?? connection.updated_at,
      notice_no: notice?.notice_no ?? null,
      notice_id: notice?.notice_id ?? null,
      meter_serial_no: meter?.meter_serial_no ?? null,
      meter_status: meterStatus?.meter_status_name ?? null,
      last_billing_date: billing?.created_at ?? null,
      last_billing_amount: billing?.total_billing ?? null,
    }
  } catch (err) {
    console.error('Error fetching disconnected service detail:', err)
    return null
  }
}

// ============================================================================
// CREATE — Reconnection Job Order
// ============================================================================

export async function createReconnectionJobOrder(connectionId: string): Promise<{
  status: 'success' | 'error'
  message?: string
  job_order_id?: string
}> {
  const supabase = await createClient()

  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { status: 'error', message: 'Unauthorized' }

    // Get the disconnected service details
    const { data: connection } = await supabase
      .from('service_connections')
      .select('connection_no, zone_id, consumer_id')
      .eq('connection_id', connectionId)
      .single()

    if (!connection) return { status: 'error', message: 'Connection not found' }

    // Get barangay_id from zone
    const { data: zone } = await supabase
      .from('zone')
      .select('barangay_id')
      .eq('zone_id', connection.zone_id)
      .single()

    if (!zone) return { status: 'error', message: 'Zone not found' }

    // Get reconnection job type ID
    const { data: jobType } = await supabase
      .from('job_types')
      .select('job_type_id')
      .eq('job_type_code', 'RECONNECTION')
      .single()

    if (!jobType) return { status: 'error', message: 'Job type not found' }

    // Get pending status ID
    const { data: pendingStatus } = await supabase
      .from('job_order_status')
      .select('job_status_id')
      .eq('job_status_name', 'pending')
      .single()

    if (!pendingStatus) return { status: 'error', message: 'Status not found' }

    // Create job order
    const { data: newJO, error: joError } = await supabase
      .from('job_orders')
      .insert({
        job_type_id: jobType.job_type_id,
        barangay_id: zone.barangay_id,
        job_status_id: pendingStatus.job_status_id,
        created_by: user.id,
      })
      .select('job_order_id, job_order_no')
      .single()

    if (joError) return { status: 'error', message: joError.message }

    // Create job order request
    const { error: requestError } = await supabase
      .from('job_order_request')
      .insert({
        job_order_id: newJO.job_order_id,
        connection_id: connectionId,
        is_completed: false,
      })

    if (requestError) {
      await supabase.from('job_orders').delete().eq('job_order_id', newJO.job_order_id)
      return { status: 'error', message: requestError.message }
    }

    return {
      status: 'success',
      message: `Reconnection job order ${newJO.job_order_no} created`,
      job_order_id: newJO.job_order_id,
    }
  } catch (err) {
    console.error('Error creating reconnection job order:', err)
    return { status: 'error', message: 'Failed to create reconnection job order' }
  }
}