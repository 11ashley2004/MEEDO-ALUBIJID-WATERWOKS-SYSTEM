'use server'

import { createClient } from '@/lib/supabase/server'
import { SupabaseClient } from '@supabase/supabase-js'

// ============================================================
// TYPES — standalone, not shared with meter-reading.actions.ts
// ============================================================

export interface ReadingConsumer {
  consumer_id:          string
  account_name:         string
  contact_number:       string | null
  meter_account_id:     string
  meter_id:             string | null
  meter_serial_no:      string | null
  meter_status_name:    string | null
  zone: {
    zone_id:   string
    zone_name: string
    barangay: { barangay_id: string; barangay_name: string }
  }
  classification: {
    classification_id:   string
    classification_name: string
  }
  reading_id:           string | null
  previous_reading:     number
  present_reading:      number | null
  reading_date:         string | null
  reading_status_code:  string | null
  consumption:          number | null
}

export interface ReadingPeriodOption {
  reading_period_id: string
  period_start:       string
  period_end:         string
  due_date:           string | null
}

interface ActionResult<T> {
  status:   'success' | 'error'
  message?: string
  data?:    T
}

// ============================================================
// HELPERS — local copies, kept independent of meter-reading.actions.ts
// ============================================================

function unwrap<T>(val: T | T[] | null | undefined): T | null {
  if (val == null) return null
  return Array.isArray(val) ? (val[0] ?? null) : val
}

function toIssueCode(meterStatusName: string | null | undefined): string | null {
  const s = (meterStatusName ?? '').toUpperCase()
  if (s === 'DEFECTIVE') return 'DEFECTIVE'
  if (s === 'STOLEN') return 'STOLEN'
  if (s.includes('LEAK')) return 'LEAK_AFTER_METER'
  return null
}

async function getActiveMeterStatusId(supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase
    .from('meter_status')
    .select('meter_status_id')
    .eq('meter_status_name', 'Active')
    .single()
  return data?.meter_status_id ?? ''
}

async function getMeterStatusIdsByNames(
  supabase: SupabaseClient,
  names: string[],
): Promise<string[]> {
  const { data } = await supabase
    .from('meter_status')
    .select('meter_status_id')
    .in('meter_status_name', names)
  return (data ?? []).map((d) => d.meter_status_id)
}

async function getActiveMeterAccountIds(supabase: SupabaseClient): Promise<string[]> {
  const activeStatusId = await getActiveMeterStatusId(supabase)
  if (!activeStatusId) return []

  const { data: meterAccounts } = await supabase
    .from('meters')
    .select('meter_account_id')
    .eq('meter_status_id', activeStatusId)

  const uniqueAccountIds = new Set(meterAccounts?.map((m) => m.meter_account_id) || [])
  return Array.from(uniqueAccountIds)
}

async function resolveTargetPeriodId(supabase: SupabaseClient): Promise<string | null> {
  const { data: latestPeriod } = await supabase
    .from('reading_periods')
    .select('reading_period_id')
    .order('period_start', { ascending: false })
    .limit(1)
    .maybeSingle()

  return latestPeriod?.reading_period_id ?? null
}

// Same self-healing billing check as getMeterReadingData — idempotent RPC,
// cheap no-op once a period is fully billed. Kept here so the admin list
// stays consistent with the reader view without importing from it.
async function ensureIssueAccountBilling(
  supabase: SupabaseClient,
  readingPeriodId: string,
): Promise<void> {
  const { data, error } = await supabase.rpc(
    'generate_billing_for_issue_accounts',
    { p_reading_period_id: readingPeriodId },
  )

  if (error) {
    console.error(
      `[meter-reading-admin] ensureIssueAccountBilling: RPC failed for period ${readingPeriodId}:`,
      error,
    )
    return
  }
  if (data?.generated_count > 0) {
    console.log(
      `[meter-reading-admin] auto-generated billing for ${data.generated_count} defective/stolen account(s) in period ${readingPeriodId}`,
    )
  }
}

// ============================================================
// getReadingPeriodOptions
// ------------------------------------------------------------
// Every reading period on record, newest first — for the period-filter
// combobox on the admin Meter Reading List page.
// ============================================================
export async function getReadingPeriodOptions(): Promise<ActionResult<ReadingPeriodOption[]>> {
  const supabase = await createClient()

  try {
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
    if (authError || !authUser) {
      return { status: 'error', message: 'User not authenticated' }
    }

    const { data, error } = await supabase
      .from('reading_periods')
      .select('reading_period_id, period_start, period_end, due_date')
      .order('period_start', { ascending: false })

    if (error) {
      console.error('[getReadingPeriodOptions]', error)
      return { status: 'error', message: 'Failed to load reading periods' }
    }

    return { status: 'success', data: data ?? [] }
  } catch (error) {
    console.error('[getReadingPeriodOptions] unexpected error:', error)
    return { status: 'error', message: 'Failed to load reading periods' }
  }
}

// ============================================================
// getAllMeterReadings
// ------------------------------------------------------------
// Admin-wide equivalent of getMeterReadingData() — same reconciliation-
// authoritative resolution of previous/present/consumption, same
// self-healing billing call — but with NO meter_reader_assignments /
// zone-assignment filter. Every meter account with a relevant meter
// status (Active / Defective / Stolen / Waterleak_After_Meter) is
// included, regardless of who's assigned where.
//
// If `readingPeriodId` is omitted, resolves to the latest reading period
// on record (mirrors resolveTargetPeriodId's "most recent" behavior,
// but WITHOUT auto-creating a new one — this is a read-only list, not
// the reader's recording flow, so it should never mutate reading_periods).
//
// LATEST vs PAST PERIODS
//   • Latest period: every relevant account is listed, including ones
//     that haven't been read yet (they show as PENDING).
//   • Past periods: only accounts that actually have a record for that
//     period are listed. An account with no reading row (or only an
//     empty PENDING placeholder) for that month is left out.
// ============================================================
export async function getAllMeterReadings(
  readingPeriodId?: string,
): Promise<ActionResult<{
  period:      any
  connections: ReadingConsumer[]
  zones:       any[]
}>> {
  const supabase = await createClient()

  try {
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
    if (authError || !authUser) {
      return { status: 'error', message: 'User not authenticated' }
    }

    const latestPeriodId = await resolveTargetPeriodId(supabase)
    const targetPeriodId = readingPeriodId ?? latestPeriodId
    if (!targetPeriodId) {
      return { status: 'success', data: { period: null, connections: [], zones: [] } }
    }

    // Only the latest period shows accounts that haven't been read yet.
    // Past periods show only accounts that actually have a record.
    const isLatestPeriod = targetPeriodId === latestPeriodId

    // Self-healing billing check — same as getMeterReadingData, safe to
    // call repeatedly, idempotent on the DB side. Only run it for the
    // latest period: merely viewing an old period must never generate
    // billing that didn't exist back then.
    if (isLatestPeriod) {
      await ensureIssueAccountBilling(supabase, targetPeriodId)
    }

    const { data: periodDetails, error: periodErr } = await supabase
      .from('reading_periods')
      .select('*')
      .eq('reading_period_id', targetPeriodId)
      .single()

    if (periodErr || !periodDetails) {
      return { status: 'error', message: 'Reading period not found' }
    }

    // ── Every meter account with a relevant meter status — no zone filter ──
    const relevantStatusIds = await getMeterStatusIdsByNames(supabase, [
      'Active',
      'Defective',
      'Stolen',
      'Waterleak_After_Meter',
    ])

    if (!relevantStatusIds.length) {
      return { status: 'success', data: { period: periodDetails, connections: [], zones: [] } }
    }

    const { data: meterAccountsWithRelevantMeters } = await supabase
      .from('meters')
      .select('meter_account_id')
      .in('meter_status_id', relevantStatusIds)

    const relevantMeterAccountIds = new Set(
      meterAccountsWithRelevantMeters?.map((m) => m.meter_account_id) || [],
    )

    if (!relevantMeterAccountIds.size) {
      return { status: 'success', data: { period: periodDetails, connections: [], zones: [] } }
    }

    const { data: meterAccounts, error: maErr } = await supabase
      .from('meter_accounts')
      .select(`
        meter_account_id,
        consumer:consumer_id ( consumer_id, account_name, contact_number ),
        zone:zone_id ( zone_id, zone_name, barangay:barangay_id ( barangay_id, barangay_name ) ),
        classification:classification_id ( classification_id, classification_name ),
        meters (
          meter_id,
          meter_serial_no,
          meter_status_id,
          meter_status:meter_status_id ( meter_status_name )
        )
      `)
      .in('meter_account_id', Array.from(relevantMeterAccountIds))

    if (maErr) {
      console.error('[getAllMeterReadings] meter_accounts query:', maErr)
      return { status: 'error', message: 'Failed to load meter accounts' }
    }

    const accountIds = (meterAccounts ?? []).map((ma) => ma.meter_account_id)

    const { data: existingReadings } = await supabase
      .from('meter_readings')
      .select(`
        reading_id,
        meter_account_id,
        present_reading,
        reading_date,
        reading_status_id,
        meter_reading_status!reading_status_id ( status_code )
      `)
      .in('meter_account_id', accountIds)
      .eq('reading_period_id', targetPeriodId)

    const { data: existingConsumptions } = await supabase
      .from('water_consumptions')
      .select(`
        consumption_id,
        reading_id,
        meter_account_id,
        previous_reading,
        present_reading,
        consumption,
        created_at,
        meter_readings:reading_id ( meter_id )
      `)
      .in('meter_account_id', accountIds)
      .order('created_at', { ascending: false })

    const readingMap = new Map<string, any>()
    for (const r of existingReadings ?? []) {
      readingMap.set(r.meter_account_id, r)
    }

    // Authoritative previous/present/consumption for a SPECIFIC reading_id —
    // same reconciliation pattern as getMeterReadingData, so an already-
    // recorded reading can never disagree with itself even if the account's
    // physical meter is later replaced.
    const consumptionByReadingId = new Map<string, {
      previous_reading: number
      present_reading:  number
      consumption:      number
    }>()

    // Fallback previous-reading lookup for accounts with NO reading yet
    // this period, keyed by `${meter_account_id}|${meter_id}` — same as
    // getMeterReadingData's consumptionPrevMap. Rows are newest-first, so
    // the first hit per key wins and a replaced meter's old readings never
    // overwrite the current meter's.
    const consumptionPrevMap = new Map<string, number>()

    for (const c of existingConsumptions ?? []) {
      if (c.reading_id && !consumptionByReadingId.has(c.reading_id)) {
        consumptionByReadingId.set(c.reading_id, {
          previous_reading: c.previous_reading != null ? Number(c.previous_reading) : 0,
          present_reading:  c.present_reading != null ? Number(c.present_reading) : 0,
          consumption:      c.consumption != null ? Number(c.consumption) : 0,
        })
      }

      const meterId = (c as any).meter_readings?.meter_id
      if (meterId && c.meter_account_id && c.previous_reading != null) {
        const key = `${c.meter_account_id}|${meterId}`
        if (!consumptionPrevMap.has(key)) {
          consumptionPrevMap.set(key, Number(c.previous_reading))
        }
      }
    }

    // Meter-scoped reading history fallback, same as getMeterReadingData's
    // prevMap — used only when there's no reading recorded yet this period.
    const prevMap = new Map<string, number>()
    if (accountIds.length) {
      const { data: priorReadings } = await supabase
        .from('meter_readings')
        .select('meter_account_id, meter_id, present_reading, reading_periods!inner(period_start)')
        .in('meter_account_id', accountIds)
        .not('present_reading', 'is', null)
        .lt('reading_periods.period_start', periodDetails.period_start)

      const latestStart = new Map<string, string>()
      for (const r of priorReadings ?? []) {
        const ps = (r as any).reading_periods?.period_start as string | undefined
        if (!ps || !r.meter_id) continue
        const key = `${r.meter_account_id}|${r.meter_id}`
        const current = latestStart.get(key)
        if (!current || ps > current) {
          latestStart.set(key, ps)
          prevMap.set(key, Number(r.present_reading))
        }
      }
    }

    const activeMeterStatusId = await getActiveMeterStatusId(supabase)
    const connections: ReadingConsumer[] = []

    for (const ma of meterAccounts ?? []) {
      const consumer = unwrap((ma as any).consumer)
      const zone = unwrap((ma as any).zone)
      const barangay = unwrap((zone as any)?.barangay)
      const classification = unwrap((ma as any).classification)

      if (!consumer || !zone) continue

      const metersArr = (ma as any).meters as any[] | null
      let meterStatusName: string | null = null
      let meterId: string | null = null
      let meterSerialNo: string | null = null

      if (metersArr && metersArr.length > 0) {
        const activeMeter = activeMeterStatusId
          ? metersArr.find((m) => m.meter_status_id === activeMeterStatusId)
          : undefined

        if (activeMeter) {
          const status = unwrap(activeMeter.meter_status)
          meterStatusName = status?.meter_status_name?.toUpperCase() || null
          meterId = activeMeter.meter_id
          meterSerialNo = activeMeter.meter_serial_no
        } else {
          const issueMeter = metersArr.find((m) => {
            const status = unwrap(m.meter_status)
            return toIssueCode(status?.meter_status_name) !== null
          })
          if (issueMeter) {
            const status = unwrap(issueMeter.meter_status)
            meterStatusName = status?.meter_status_name?.toUpperCase() || null
            meterId = issueMeter.meter_id
            meterSerialNo = issueMeter.meter_serial_no
          }
        }
      }

      const reading = readingMap.get(ma.meter_account_id) ?? null

      let statusCode: string | null = null
      let presentReading: number | null = null
      let readingDate: string | null = null
      let readingId: string | null = null

      if (reading) {
        const readingStatus = unwrap(reading.meter_reading_status)
        statusCode = readingStatus?.status_code ?? null
        presentReading = reading.present_reading != null ? Number(reading.present_reading) : null
        readingDate = reading.reading_date ?? null
        readingId = reading.reading_id ?? null
      }
      if (!statusCode) statusCode = 'PENDING'

      const recordedConsumption = readingId ? consumptionByReadingId.get(readingId) : undefined

      // Past periods: drop accounts with no real record for that month.
      // A bare PENDING placeholder row (no reading, no consumption) doesn't
      // count as a record. Defective / Stolen / Leak accounts do count even
      // without a present reading, since they're billed on an average basis.
      if (!isLatestPeriod) {
        const hasRecord =
          readingId !== null &&
          (presentReading !== null || statusCode !== 'PENDING' || recordedConsumption !== undefined)
        if (!hasRecord) continue
      }

      let resolvedPrevious: number
      if (recordedConsumption) {
        resolvedPrevious = recordedConsumption.previous_reading
        presentReading = recordedConsumption.present_reading
      } else {
        const derivedKey = meterId ? `${ma.meter_account_id}|${meterId}` : null
        const prevFromHistory = derivedKey ? prevMap.get(derivedKey) : undefined
        const prevFromConsumption = derivedKey ? consumptionPrevMap.get(derivedKey) : undefined
        resolvedPrevious = prevFromHistory ?? prevFromConsumption ?? 0
      }

      connections.push({
        consumer_id:       consumer.consumer_id,
        account_name:      consumer.account_name,
        contact_number:    consumer.contact_number ?? null,
        meter_account_id:  ma.meter_account_id,
        meter_id:          meterId,
        meter_serial_no:   meterSerialNo,
        meter_status_name: meterStatusName,
        zone: {
          zone_id:   zone.zone_id,
          zone_name: zone.zone_name,
          barangay: {
            barangay_id:   barangay?.barangay_id ?? '',
            barangay_name: barangay?.barangay_name ?? 'Unknown',
          },
        },
        classification: {
          classification_id:   classification?.classification_id ?? '',
          classification_name: classification?.classification_name ?? 'Unknown',
        },
        reading_id:          readingId,
        previous_reading:    resolvedPrevious,
        present_reading:     presentReading,
        reading_date:        readingDate,
        reading_status_code: statusCode,
        consumption:         recordedConsumption?.consumption ?? null,
      })
    }

    connections.sort((a, b) => a.account_name.localeCompare(b.account_name))

    // Zones covering every account returned — admin-wide, not scoped to
    // any reader's assignment. Built from the filtered `connections`, so
    // for past periods the barangay filter only lists barangays that
    // actually have records that month.
    const zoneIds = Array.from(new Set(connections.map((c) => c.zone.zone_id).filter(Boolean)))

    let zoneList: any[] = []
    if (zoneIds.length > 0) {
      const { data: zones } = await supabase
        .from('zone')
        .select('zone_id, zone_name, barangay:barangay_id ( barangay_id, barangay_name )')
        .in('zone_id', zoneIds)

      zoneList = (zones ?? []).map((z: any) => ({
        zone_id:   z.zone_id,
        zone_name: z.zone_name,
        barangay:  unwrap(z.barangay) ?? { barangay_id: '', barangay_name: 'Unknown' },
      }))
    }

    return { status: 'success', data: { period: periodDetails, connections, zones: zoneList } }
  } catch (error) {
    console.error('[getAllMeterReadings] unexpected error:', error)
    return { status: 'error', message: 'Failed to load meter readings' }
  }
}