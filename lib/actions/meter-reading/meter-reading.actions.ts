'use server'

import { createClient } from '@/lib/supabase/server'
import { SupabaseClient } from '@supabase/supabase-js'
import { createAuditLog } from '../audit.action'

// ============================================================
// CONSTANTS (From your meter_status table schema)
// ============================================================
const ACTIVE_METER_STATUS_ID = 'fd19e37d-92e4-47a1-be42-83f67be5a1d4'

// ============================================================
// TYPES
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

// ============================================================
// HELPERS
// ============================================================

function unwrap<T>(val: T | T[] | null | undefined): T | null {
  if (val == null) return null
  return Array.isArray(val) ? (val[0] ?? null) : val
}

// ─── Tolerant mapping from meter_status.meter_status_name → issue code ────────
function toIssueCode(meterStatusName: string | null | undefined): string | null {
  const s = (meterStatusName ?? '').toUpperCase()
  if (s === 'DEFECTIVE') return 'DEFECTIVE'
  if (s === 'STOLEN') return 'STOLEN'
  if (s.includes('LEAK')) return 'LEAK_AFTER_METER'
  return null
}

// ============================================================
// Dynamic meter_status lookups (no hardcoded UUIDs)
// ============================================================
async function getActiveMeterStatusId(supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase
    .from('meter_status')
    .select('meter_status_id')
    .eq('meter_status_name', 'Active')
    .single()
  return data?.meter_status_id ?? ''
}

async function getLeakMeterStatusId(supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase
    .from('meter_status')
    .select('meter_status_id')
    .eq('meter_status_name', 'Waterleak_After_Meter')
    .single()
  return data?.meter_status_id ?? ''
}

// ============================================================
// getRecordableMeter
// FIX: a present reading can now be submitted not just for ACTIVE meters
// but also for meters flagged LEAK_AFTER_METER — the physical meter still
// works and can be read normally, the leak is downstream of it. Only
// DEFECTIVE/STOLEN meters can't be read directly and must go through
// generateBillingForIssueAccount instead.
// ============================================================
async function getRecordableMeter(
  supabase: SupabaseClient,
  meterAccountId: string,
): Promise<{ meter_id: string; meter_serial_no: string | null; is_leak: boolean } | null> {
  const { data: meters } = await supabase
    .from('meters')
    .select('meter_id, meter_serial_no, meter_status_id')
    .eq('meter_account_id', meterAccountId)

  if (!meters?.length) return null

  const [activeStatusId, leakStatusId] = await Promise.all([
    getActiveMeterStatusId(supabase),
    getLeakMeterStatusId(supabase),
  ])

  const active = meters.find(m => activeStatusId && m.meter_status_id === activeStatusId)
  if (active) {
    return {
      meter_id: active.meter_id,
      meter_serial_no: active.meter_serial_no ?? null,
      is_leak: false,
    }
  }

  const leak = meters.find(m => leakStatusId && m.meter_status_id === leakStatusId)
  return leak
    ? {
        meter_id: leak.meter_id,
        meter_serial_no: leak.meter_serial_no ?? null,
        is_leak: true,
      }
    : null
}

function parseDbDateToUTC(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day || 1))
}

function getLastFridayOfMonth(year: number, month: number): Date {
  const date = new Date(Date.UTC(year, month, 0))
  while (date.getUTCDay() !== 5) {
    date.setUTCDate(date.getUTCDate() - 1)
  }
  return date
}

function calculateDueDate(periodStart: Date): string {
  const periodMonth = periodStart.getUTCMonth()
  const periodYear = periodStart.getUTCFullYear()

  let dueYear = periodYear
  let dueMonth = periodMonth + 2

  if (dueMonth > 12) {
    dueMonth = 1
    dueYear += 1
  }

  const lastFriday = getLastFridayOfMonth(dueYear, dueMonth)
  return lastFriday.toISOString().split('T')[0]
}

// ============================================================
// getPreviousReading
// Scoped to the CURRENT physical meter_id, so a replaced meter
// (theft/defect/swap) never inherits the old meter's last reading.
//
// FIX: NO reading-status filter. It used to only look at RECORDED
// readings, which skipped the leak month (status LEAK_AFTER_METER).
// A leak-month reading is a REAL reading — the meter was physically
// read — so the next month must start from it. This now matches the
// database trigger (create_water_consumption_on_reading), which also
// takes the latest prior reading of the meter regardless of status.
// ============================================================
async function getPreviousReading(
  supabase: SupabaseClient,
  meterAccountId: string,
  meterId: string | null,
  beforePeriodStart: string,
): Promise<number> {
  if (!meterId) return 0

  const { data: priorReadings } = await supabase
    .from('meter_readings')
    .select('present_reading, reading_periods!inner(period_start)')
    .eq('meter_account_id', meterAccountId)
    .eq('meter_id', meterId)
    .not('present_reading', 'is', null)
    .lt('reading_periods.period_start', beforePeriodStart)

  if (priorReadings && priorReadings.length > 0) {
    const latest = priorReadings.reduce((latestRecord, currentRecord) => {
      const currentStart = (currentRecord as any).reading_periods?.period_start
      const latestStart = (latestRecord as any).reading_periods?.period_start

      if (!latestStart || (currentStart && currentStart > latestStart)) {
        return currentRecord
      }
      return latestRecord
    }, priorReadings[0])

    if (latest?.present_reading != null) {
      return Number(latest.present_reading)
    }
  }

  const { data: lastReading } = await supabase
    .from('meter_readings')
    .select('present_reading')
    .eq('meter_account_id', meterAccountId)
    .eq('meter_id', meterId)
    .not('present_reading', 'is', null)
    .order('reading_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  return lastReading?.present_reading != null ? Number(lastReading.present_reading) : 0
}

// ============================================================
// reconcileWaterConsumption
// ------------------------------------------------------------
// Belt-and-suspenders: right after a meter_reading is inserted, make sure
// the water_consumptions row (created by the database trigger) carries the
// same meter_id-scoped previous_reading / consumption the app computed and
// validated against. It only touches previous_reading, present_reading and
// consumption — never billed_consumption, which is the estimate used for
// billing on leak / defective / stolen accounts.
//
// Now that getPreviousReading and the trigger both use the latest prior
// reading of the current meter (any status), the two agree and this
// normally finds nothing to fix. It stays as a safety net.
// ============================================================
async function reconcileWaterConsumption(
  supabase: SupabaseClient,
  readingId: string,
  meterAccountId: string,
  correctPreviousReading: number,
  presentReading: number,
): Promise<void> {
  const correctConsumption = Math.max(0, presentReading - correctPreviousReading)

  const { data: consumptionRow } = await supabase
    .from('water_consumptions')
    .select('consumption_id, previous_reading, present_reading, consumption')
    .eq('reading_id', readingId)
    .maybeSingle()

  // No consumption row yet (trigger hasn't run / doesn't exist for this
  // status) — nothing to reconcile.
  if (!consumptionRow) return

  const needsFix =
    Number(consumptionRow.previous_reading) !== correctPreviousReading ||
    Number(consumptionRow.present_reading) !== presentReading ||
    Number(consumptionRow.consumption) !== correctConsumption

  if (!needsFix) return

  const { error: fixErr } = await supabase
    .from('water_consumptions')
    .update({
      previous_reading: correctPreviousReading,
      present_reading: presentReading,
      consumption: correctConsumption,
    })
    .eq('consumption_id', consumptionRow.consumption_id)

  if (fixErr) {
    // Don't fail the whole submission over this — but surface it loudly,
    // since it means billing may be based on a wrong consumption figure.
    console.error(
      `reconcileWaterConsumption: failed to correct consumption_id=${consumptionRow.consumption_id} ` +
      `for reading_id=${readingId} (meter_account_id=${meterAccountId}):`,
      fixErr,
    )
  }
}

// ============================================================
// Active-meter account set — single source of truth for which
// accounts count toward "connected" totals AND which meter_readings
// rows count as "recorded" for period completion.
// ============================================================
async function getActiveMeterAccountIds(supabase: SupabaseClient): Promise<string[]> {
  const activeStatusId = await getActiveMeterStatusId(supabase)
  if (!activeStatusId) return []

  const { data: meterAccounts } = await supabase
    .from('meters')
    .select('meter_account_id')
    .eq('meter_status_id', activeStatusId)

  const uniqueAccountIds = new Set(meterAccounts?.map(m => m.meter_account_id) || [])
  return Array.from(uniqueAccountIds)
}

async function getGlobalConnectedAccountsCount(supabase: SupabaseClient): Promise<number> {
  const activeAccountIds = await getActiveMeterAccountIds(supabase)
  return activeAccountIds.length
}

async function isPeriodCompleteGlobally(
  supabase: SupabaseClient,
  readingPeriodId: string
): Promise<boolean> {
  const activeAccountIds = await getActiveMeterAccountIds(supabase)
  const totalGlobalAccounts = activeAccountIds.length
  if (totalGlobalAccounts === 0) return false

  // FIX: bulk import inserts a meter_readings row for EVERY imported
  // account regardless of meter_status (Active, Disconnected, Defective,
  // Stolen, Leak, ...). Counting all of them here previously made
  // recordedCount exceed totalGlobalAccounts (which only counts Active
  // meters) whenever a period contained any non-Active account, so
  // completion could never register as true. Scoping this count to the
  // same active-meter account set fixes that.
  const { count: recordedCount, error: countErr } = await supabase
    .from('meter_readings')
    .select('*', { count: 'exact', head: true })
    .eq('reading_period_id', readingPeriodId)
    .in('meter_account_id', activeAccountIds)

  if (countErr) {
    console.error('Error checking global period completion:', countErr)
    return false
  }

  return recordedCount === totalGlobalAccounts
}


// ============================================================
// Get or create reading period
// ============================================================
async function getOrCreateReadingPeriod(
  supabase: SupabaseClient,
  periodStart: Date,
  periodEnd: Date,
  dueDate: Date,
  currentPeriodId?: string
): Promise<string> {
  const periodStartStr = periodStart.toISOString().split('T')[0]
  const periodEndStr = periodEnd.toISOString().split('T')[0]
  const dueDateStr = dueDate.toISOString().split('T')[0]

  const { data: existing } = await supabase
    .from('reading_periods')
    .select('reading_period_id')
    .eq('period_start', periodStartStr)
    .eq('period_end', periodEndStr)
    .maybeSingle()

  if (existing) {
    return existing.reading_period_id
  }

  if (currentPeriodId) {
    const isComplete = await isPeriodCompleteGlobally(supabase, currentPeriodId)
    if (!isComplete) {
      return currentPeriodId
    }
  }

  const { data: newPeriod, error } = await supabase
    .from('reading_periods')
    .insert({
      period_start: periodStartStr,
      period_end: periodEndStr,
      due_date: dueDateStr,
    })
    .select('reading_period_id')
    .single()

  if (error || !newPeriod) {
    throw new Error(`Failed to create reading period: ${error?.message}`)
  }

  return newPeriod.reading_period_id
}

function getEffectiveNow(): Date {
  const override = process.env.READING_PERIOD_TEST_DATE
  if (override) {
    const d = new Date(override)
    if (!isNaN(d.getTime())) return d
  }
  return new Date()
}

// ============================================================
// resolveTargetPeriodId
// ============================================================
async function resolveTargetPeriodId(supabase: SupabaseClient): Promise<string> {
  const { data: latestPeriod } = await supabase
    .from('reading_periods')
    .select('*')
    .order('period_start', { ascending: false })
    .limit(1)
    .maybeSingle()

  const now = getEffectiveNow()
  const calendarYear = now.getUTCFullYear()
  const calendarMonth = now.getUTCMonth() + 1

  if (!latestPeriod) {
    const baseMonth = calendarMonth === 1 ? 12 : calendarMonth - 1
    const baseYear = calendarMonth === 1 ? calendarYear - 1 : calendarYear

    const periodStart = new Date(Date.UTC(baseYear, baseMonth - 1, 1))
    const periodEnd = new Date(Date.UTC(baseYear, baseMonth, 0))
    const dueDate = new Date(calculateDueDate(periodStart))

    return await getOrCreateReadingPeriod(supabase, periodStart, periodEnd, dueDate)
  }

  return latestPeriod.reading_period_id
}


// ============================================================
// CHECK FOR PENDING ISSUE REPORTS
// ============================================================

async function hasPendingIssueReport(
  supabase: SupabaseClient,
  meterAccountId: string
): Promise<boolean> {
  const { data: pendingStatus } = await supabase
    .from('bulk_status')
    .select('status_id')
    .ilike('status_name', 'pending')
    .single()

  if (!pendingStatus) return false

  const { data: existing } = await supabase
    .from('service_reports')
    .select('report_id')
    .eq('meter_account_id', meterAccountId)
    .eq('report_status_id', pendingStatus.status_id)
    .is('resolved_at', null)
    .maybeSingle()

  return !!existing
}

// ============================================================
// createNextReadingPeriod
// ============================================================
export async function createNextReadingPeriod() {
  const supabase = await createClient()

  try {
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
    if (authError || !authUser)
      return { status: 'error', message: 'User not authenticated' }

    const { data: latestPeriod, error: latestErr } = await supabase
      .from('reading_periods')
      .select('*')
      .order('period_start', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (latestErr || !latestPeriod)
      return { status: 'error', message: 'No existing reading period found to advance from.' }

    const activeAccountIds = await getActiveMeterAccountIds(supabase)
    const totalGlobalAccounts = activeAccountIds.length

    // FIX: same scoping fix as isPeriodCompleteGlobally — only count
    // meter_readings belonging to accounts that currently have an Active
    // meter, so bulk-imported rows for non-Active accounts don't inflate
    // recordedCount past totalGlobalAccounts.
    const { count: recordedCount, error: countErr } = await supabase
      .from('meter_readings')
      .select('*', { count: 'exact', head: true })
      .eq('reading_period_id', latestPeriod.reading_period_id)
      .in('meter_account_id', activeAccountIds)

    if (countErr) {
      return { status: 'error', message: 'Failed to verify period completion.' }
    }

    const recorded = recordedCount || 0
    const isComplete = totalGlobalAccounts > 0 && recorded === totalGlobalAccounts

    if (!isComplete) {
      return {
        status: 'error',
        message: `Cannot start the next period yet — ${recorded}/${totalGlobalAccounts} meter accounts recorded for the current period.`,
      }
    }

    const currentStart = parseDbDateToUTC(latestPeriod.period_start)

    let nextTargetMonth = currentStart.getUTCMonth() + 1
    let nextTargetYear = currentStart.getUTCFullYear()

    if (currentStart.getUTCMonth() === 5) {
      nextTargetMonth = 6
    }

    const nextPeriodStart = new Date(Date.UTC(nextTargetYear, nextTargetMonth, 1))
    const nextPeriodEnd = new Date(Date.UTC(nextPeriodStart.getUTCFullYear(), nextPeriodStart.getUTCMonth() + 1, 0))
    const nextDueDate = new Date(calculateDueDate(nextPeriodStart))

    const periodStartStr = nextPeriodStart.toISOString().split('T')[0]
    const periodEndStr = nextPeriodEnd.toISOString().split('T')[0]

    const { data: existing } = await supabase
      .from('reading_periods')
      .select('reading_period_id')
      .eq('period_start', periodStartStr)
      .eq('period_end', periodEndStr)
      .maybeSingle()

    if (existing) {
      return {
        status: 'success',
        data: { reading_period_id: existing.reading_period_id, alreadyExisted: true },
      }
    }

    const { data: newPeriod, error } = await supabase
      .from('reading_periods')
      .insert({
        period_start: periodStartStr,
        period_end: periodEndStr,
        due_date: nextDueDate.toISOString().split('T')[0],
      })
      .select('reading_period_id')
      .single()

    if (error || !newPeriod) {
      return { status: 'error', message: `Failed to create next reading period: ${error?.message}` }
    }

    // ─── AUTO-BILL DEFECTIVE/STOLEN ACCOUNTS FOR THE NEW PERIOD ────────────
    // Only runs for a genuinely NEW period (not the `existing` branch above,
    // which returns earlier) — otherwise re-clicking "Start Next Period"
    // after it already succeeded would re-trigger billing generation.
    // Failure here does NOT fail period creation: the period is valid and
    // usable either way, so we log and let the reader continue; billing for
    // any missed accounts can be retried by re-invoking the RPC directly.
    const { data: billingResult, error: billingErr } = await supabase.rpc(
      'generate_billing_for_issue_accounts',
      { p_reading_period_id: newPeriod.reading_period_id },
    )

    if (billingErr) {
      console.error(
        `createNextReadingPeriod: generate_billing_for_issue_accounts failed for period ${newPeriod.reading_period_id}:`,
        billingErr,
      )
    } else if (billingResult) {
      console.log(
        `createNextReadingPeriod: auto-generated billing for ${billingResult.generated_count ?? 0} defective/stolen accounts`,
        billingResult,
      )
    }

    return {
      status: 'success',
      data: {
        reading_period_id: newPeriod.reading_period_id,
        alreadyExisted: false,
        autoBilledCount: billingResult?.generated_count ?? 0,
        autoBillingSkipped: billingResult?.skipped ?? [],
      },
    }
  } catch (error: any) {
    console.error('createNextReadingPeriod error:', error)
    return { status: 'error', message: error?.message ?? 'Failed to create next reading period' }
  }
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

// ============================================================
// ensureIssueAccountBilling
// Calls generate_billing_for_issue_accounts for the given period.
// Deliberately NOT tied to period creation — createNextReadingPeriod
// only ran this on the branch where a period was freshly inserted, so
// any period that already existed (bootstrapped via resolveTargetPeriodId,
// created before this logic existed, etc.) never got billed and nothing
// ever re-checked it. This is called from getMeterReadingData on every
// load instead, so it's self-healing regardless of how the period was
// created. The RPC is idempotent — it checks water_consumptions/billing
// per account and skips anything already billed — so repeat calls are
// cheap no-ops once a period is fully billed.
// ============================================================
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
      `ensureIssueAccountBilling: RPC failed for period ${readingPeriodId}:`,
      error,
    )
    return
  }

  if (data?.generated_count > 0) {
    console.log(
      `ensureIssueAccountBilling: auto-generated billing for ${data.generated_count} defective/stolen account(s) in period ${readingPeriodId}`,
      data,
    )
  }
  if (Array.isArray(data?.skipped) && data.skipped.length > 0) {
    console.warn(
      `ensureIssueAccountBilling: ${data.skipped.length} account(s) skipped for period ${readingPeriodId}`,
      data.skipped,
    )
  }
}

// ============================================================
// getMeterReadingData - SIMPLIFIED & FIXED
// ============================================================
export async function getMeterReadingData() {
  const supabase = await createClient()

  try {
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
    if (authError || !authUser)
      return { status: 'error', message: 'User not authenticated', data: null }

    const { data: assignments, error: assignErr } = await supabase
      .from('meter_reader_assignments')
      .select('zone_id')
      .eq('user_id', authUser.id)
      .eq('is_active', true)

    if (assignErr)
      return { status: 'error', message: 'Failed to load assigned zones', data: null }

    const assignedZoneIds = (assignments ?? []).map((a: any) => a.zone_id)

    const targetPeriodId = await resolveTargetPeriodId(supabase)

    // ─── Self-healing billing check ──────────────────────────────────────
    // Runs on every load, independent of how targetPeriodId came to exist.
    // Cheap no-op once the period is fully billed.
    await ensureIssueAccountBilling(supabase, targetPeriodId)

    const { data: periodDetails } = await supabase
      .from('reading_periods')
      .select('*')
      .eq('reading_period_id', targetPeriodId)
      .single()

    if (!assignedZoneIds.length) {
      return {
        status: 'success',
        data: { period: periodDetails, connections: [], zones: [], targetPeriodId, isPeriodComplete: false }
      }
    }

    // Get meter status IDs for every status this view needs to surface:
    // Active meters get a normal Record flow; Defective/Stolen meters get
    // routed to "Generate Billing"; Waterleak_After_Meter meters are still
    // physically readable and go through Record just like Active. Without
    // this, accounts whose only meter is Defective/Stolen/Leak (i.e. no
    // Active meter row at all) never show up in the reader's list.
    const relevantStatusIds = await getMeterStatusIdsByNames(supabase, [
      'Active',
      'Defective',
      'Stolen',
      'Waterleak_After_Meter',
    ])

    if (!relevantStatusIds.length) {
      return {
        status: 'success',
        data: { period: periodDetails, connections: [], zones: [], targetPeriodId, isPeriodComplete: false }
      }
    }

    // Get meter accounts that have a meter in one of these statuses
    const { data: meterAccountsWithRelevantMeters } = await supabase
      .from('meters')
      .select('meter_account_id')
      .in('meter_status_id', relevantStatusIds)

    const relevantMeterAccountIds = new Set(
      meterAccountsWithRelevantMeters?.map(m => m.meter_account_id) || []
    )

    // If no accounts match any of these statuses, return empty
    if (!relevantMeterAccountIds.size) {
      return {
        status: 'success',
        data: { period: periodDetails, connections: [], zones: [], targetPeriodId, isPeriodComplete: false }
      }
    }

    // Get meter accounts with their zone assignments
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
      .in('zone_id', assignedZoneIds)
      .in('meter_account_id', Array.from(relevantMeterAccountIds))

    if (maErr) {
      console.error("Database query error:", maErr)
      return { status: 'error', message: 'Failed to load meter accounts', data: null }
    }

    const readerAccountIds = (meterAccounts ?? []).map(ma => ma.meter_account_id)

    // Fetch existing readings
    const { data: existingReadings } = await supabase
      .from('meter_readings')
      .select(`
        reading_id,
        meter_account_id,
        present_reading,
        reading_date,
        reading_status_id,
        meter_reading_status!reading_status_id (
          status_code,
          description
        )
      `)
      .in('meter_account_id', readerAccountIds)
      .eq('reading_period_id', targetPeriodId)

    // Fetch existing water consumptions to pass directly to frontend.
    // Joined to meter_readings to recover meter_id — water_consumptions
    // itself has no meter_id column, only reading_id. Ordered newest-first
    // so the first row seen per key is authoritative.
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
      .in('meter_account_id', readerAccountIds)
      .order('created_at', { ascending: false })

    const readingMap = new Map<string, any>()
    for (const r of existingReadings ?? []) {
      readingMap.set(r.meter_account_id, r)
    }

    const consumptionMap = new Map<string, number>()
    const consumptionPrevMap = new Map<string, number>()

    // ─── FIX ────────────────────────────────────────────────────────────
    // Authoritative previous/present/consumption for a SPECIFIC reading_id,
    // taken straight from the water_consumptions row reconciled at
    // submission time (see reconcileWaterConsumption in submitMeterReading).
    // Once a reading exists, THIS is what gets displayed — it is never
    // recomputed against whatever meter is CURRENTLY active on the account.
    // A meter can be replaced after a Stolen/Defective reading was already
    // recorded (e.g. old meter marked Stolen, new meter installed as
    // Active); recomputing "previous reading" against the new meter finds
    // no history for it and returns 0, even though present_reading (from
    // meter_readings) still correctly shows the billed amount. That
    // mismatch is what made an already-correct billed row look like a bug.
    // Keying by reading_id instead guarantees previous/present/consumption
    // always come from the same reconciled row and can never disagree.
    const consumptionByReadingId = new Map<string, {
      previous_reading: number
      present_reading: number
      consumption: number
    }>()

    for (const c of existingConsumptions ?? []) {
      if (c.reading_id && c.consumption !== null) {
        consumptionMap.set(c.reading_id, Number(c.consumption))
      }

      if (c.reading_id && !consumptionByReadingId.has(c.reading_id)) {
        consumptionByReadingId.set(c.reading_id, {
          previous_reading: c.previous_reading != null ? Number(c.previous_reading) : 0,
          present_reading: c.present_reading != null ? Number(c.present_reading) : 0,
          consumption: c.consumption != null ? Number(c.consumption) : 0,
        })
      }

      // Only usable as a "previous reading" fallback for accounts with NO
      // reading yet this period — must resolve which physical meter it
      // belongs to. Rows are already newest-first, so the first hit per
      // meter key wins and older rows for a replaced meter never overwrite it.
      const meterId = (c as any).meter_readings?.meter_id
      if (meterId && c.meter_account_id && c.previous_reading != null) {
        const key = `${c.meter_account_id}|${meterId}`
        if (!consumptionPrevMap.has(key)) {
          consumptionPrevMap.set(key, Number(c.previous_reading))
        }
      }
    }

    // Latest prior reading per meter, ANY status — leak-month readings are
    // real readings and count as the previous reading (same rule as
    // getPreviousReading and the database trigger).
    const prevMap = new Map<string, number>()
    if (periodDetails && readerAccountIds.length) {
      const { data: priorReadings } = await supabase
        .from('meter_readings')
        .select('meter_account_id, meter_id, present_reading, reading_periods!inner(period_start)')
        .in('meter_account_id', readerAccountIds)
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

    const connections: ReadingConsumer[] = []

    for (const ma of meterAccounts ?? []) {
      const consumer = unwrap(ma.consumer)
      const zone = unwrap(ma.zone)
      const barangay = unwrap((zone as any)?.barangay)
      const classification = unwrap(ma.classification)

      if (!consumer || !zone) continue

      const metersArr = ma.meters as any[] | null
      let activeMeter = null
      let meterStatusName = null
      let meterId = null
      let meterSerialNo = null

      if (metersArr && metersArr.length > 0) {
        // Find active meter first
        activeMeter = metersArr.find(m => m.meter_status_id === ACTIVE_METER_STATUS_ID)

        if (!activeMeter) {
          // If no active meter, check for issue meters
          const issueMeter = metersArr.find(m => {
            const status = unwrap(m.meter_status)
            return toIssueCode(status?.meter_status_name) !== null
          })

          if (issueMeter) {
            const status = unwrap(issueMeter.meter_status)
            meterStatusName = status?.meter_status_name?.toUpperCase() || null
            meterId = issueMeter.meter_id
            meterSerialNo = issueMeter.meter_serial_no
          }
        } else {
          const status = unwrap(activeMeter.meter_status)
          meterStatusName = status?.meter_status_name?.toUpperCase() || null
          meterId = activeMeter.meter_id
          meterSerialNo = activeMeter.meter_serial_no
        }
      }

      const reading = readingMap.get(ma.meter_account_id) ?? null

      let statusCode = null
      let presentReading = null
      let readingDate = null
      let readingId = null

      if (reading) {
        const readingStatus = unwrap(reading.meter_reading_status)
        statusCode = readingStatus?.status_code ?? null
        presentReading = reading.present_reading != null ? Number(reading.present_reading) : null
        readingDate = reading.reading_date ?? null
        readingId = reading.reading_id ?? null
      }

      if (!statusCode) {
        statusCode = 'PENDING'
      }

      // ─── FIX ──────────────────────────────────────────────────────────
      // Once a reading exists for this period, pull previous_reading,
      // present_reading, and consumption from the SAME reconciled
      // water_consumptions row (keyed by reading_id) instead of
      // recomputing previous_reading against whatever meter is currently
      // Active on the account. This is what prevents an already-billed
      // Stolen/Defective row from showing previous_reading = 0 just
      // because the physical meter was later replaced.
      const recordedConsumption = readingId ? consumptionByReadingId.get(readingId) : undefined

      let resolvedPrevious: number
      if (recordedConsumption) {
        resolvedPrevious = recordedConsumption.previous_reading
        // Trust the reconciled present_reading too, so previous/present/
        // consumption always come from the same row and can never disagree.
        presentReading = recordedConsumption.present_reading
      } else {
        // No reading recorded yet this period — fall back to meter-scoped
        // history so the reader still has a previous reading to validate
        // their entry against.
        const derivedKey = meterId ? `${ma.meter_account_id}|${meterId}` : null
        const prevFromHistory = derivedKey ? prevMap.get(derivedKey) : undefined
        const prevFromConsumption = derivedKey ? consumptionPrevMap.get(derivedKey) : undefined
        resolvedPrevious = prevFromHistory ?? prevFromConsumption ?? 0
      }

      connections.push({
        consumer_id: consumer.consumer_id,
        account_name: consumer.account_name,
        contact_number: consumer.contact_number ?? null,
        meter_account_id: ma.meter_account_id,
        meter_id: meterId,
        meter_serial_no: meterSerialNo,
        meter_status_name: meterStatusName,
        zone: {
          zone_id: zone.zone_id,
          zone_name: zone.zone_name,
          barangay: {
            barangay_id: barangay?.barangay_id ?? '',
            barangay_name: barangay?.barangay_name ?? 'Unknown',
          },
        },
        classification: {
          classification_id: classification?.classification_id ?? '',
          classification_name: classification?.classification_name ?? 'Unknown',
        },
        reading_id: readingId,
        previous_reading: resolvedPrevious,
        present_reading: presentReading,
        reading_date: readingDate,
        reading_status_code: statusCode,
        consumption: recordedConsumption?.consumption ?? (readingId ? (consumptionMap.get(readingId) ?? null) : null),
      })
    }

    connections.sort((a, b) => a.account_name.localeCompare(b.account_name))

    const { data: zones } = await supabase
      .from('zone')
      .select('zone_id, zone_name, barangay:barangay_id(barangay_id, barangay_name)')
      .in('zone_id', assignedZoneIds)
      .eq('is_active', true)

    const zoneList = (zones ?? []).map((z: any) => ({
      zone_id: z.zone_id,
      zone_name: z.zone_name,
      barangay: unwrap(z.barangay) ?? { barangay_id: '', barangay_name: 'Unknown' },
    }))

    const globalComplete = await isPeriodCompleteGlobally(supabase, targetPeriodId)

    return {
      status: 'success',
      data: { period: periodDetails, connections, zones: zoneList, targetPeriodId, isPeriodComplete: globalComplete }
    }
  } catch (error) {
    console.error('getMeterReadingData error:', error)
    return { status: 'error', message: 'Failed to load data', data: null }
  }
}

// ============================================================
// submitMeterReading
// ============================================================
async function getReadingStatusId(supabase: SupabaseClient, statusCode: string): Promise<string> {
  const { data, error } = await supabase
    .from('meter_reading_status')
    .select('reading_status_id')
    .eq('status_code', statusCode)
    .single()

  if (error || !data) {
    throw new Error(`Could not find reading status ID for code: ${statusCode}`)
  }

  return data.reading_status_id
}

function resolveReadingStatusCode(meterRow: { meter_id: string; is_leak: boolean } | null): string {
  return meterRow?.is_leak ? 'LEAK_AFTER_METER' : 'RECORDED'
}

// ============================================================
// validateMeterReaderZoneAssignment
// Confirms the requesting user still has an ACTIVE assignment to the
// zone that owns this meter_account. Handles reassignment/offboarding:
// if a reader's assignment was deactivated (or moved to another zone)
// after they loaded the reading list client-side, this blocks the
// submission server-side instead of trusting stale client state.
// ============================================================
async function validateMeterReaderZoneAssignment(
  supabase: SupabaseClient,
  userId: string,
  meterAccountId: string,
): Promise<{ valid: boolean; message?: string }> {
  // Resolve the zone this meter account belongs to
  const { data: meterAccount, error: maErr } = await supabase
    .from('meter_accounts')
    .select('zone_id')
    .eq('meter_account_id', meterAccountId)
    .maybeSingle()

  if (maErr || !meterAccount?.zone_id) {
    return { valid: false, message: 'Could not resolve zone for this meter account.' }
  }

  // Check for an active assignment matching this user + zone
  const { data: assignment, error: assignErr } = await supabase
    .from('meter_reader_assignments')
    .select('assignment_id')
    .eq('user_id', userId)
    .eq('zone_id', meterAccount.zone_id)
    .eq('is_active', true)
    .maybeSingle()

  if (assignErr) {
    console.error('validateMeterReaderZoneAssignment error:', assignErr)
    return { valid: false, message: 'Failed to verify zone assignment.' }
  }

  if (!assignment) {
    return {
      valid: false,
      message: 'You are no longer assigned to the zone for this meter account. Please refresh your reading list.',
    }
  }

  return { valid: true }
}

export async function submitMeterReading(payload: {
  meter_account_id: string
  present_reading: number
  reading_period_id: string
}) {
  const supabase = await createClient()

  try {
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
    if (authError || !authUser)
      return { status: 'error', message: 'User not authenticated' }

    // ─── GUARD: Confirm reader is still actively assigned to this zone ────
    const zoneCheck = await validateMeterReaderZoneAssignment(
      supabase,
      authUser.id,
      payload.meter_account_id,
    )
    if (!zoneCheck.valid) {
      return { status: 'error', message: zoneCheck.message ?? 'Zone assignment validation failed.' }
    }

    // ─── GUARD: Check for pending issue reports ───────────────────────────
    const hasPending = await hasPendingIssueReport(supabase, payload.meter_account_id)
    if (hasPending) {
      return {
        status: 'error',
        message: 'Cannot submit reading: This meter account has a pending issue report that needs to be resolved first.'
      }
    }

    const { data: existing } = await supabase
      .from('meter_readings')
      .select('reading_id, reading_date')
      .eq('meter_account_id', payload.meter_account_id)
      .eq('reading_period_id', payload.reading_period_id)
      .maybeSingle()

    if (existing) {
      const submittedAt = new Date(existing.reading_date).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
      return { status: 'error', message: `Already recorded on ${submittedAt}.` }
    }

    // Fetch recordable meter
    const meterRow = await getRecordableMeter(supabase, payload.meter_account_id)

    if (!meterRow)
      return { status: 'error', message: 'No active or leak-flagged meter found for this meter account.' }

    // ─── RESOLVE READING STATUS ──────────────────────────────────────────
    const statusCode = resolveReadingStatusCode(meterRow)
    const readingStatusId = await getReadingStatusId(supabase, statusCode)

    const { data: currentPeriod } = await supabase
      .from('reading_periods')
      .select('period_start')
      .eq('reading_period_id', payload.reading_period_id)
      .single()

    const previous_reading = currentPeriod
      ? await getPreviousReading(supabase, payload.meter_account_id, meterRow.meter_id, currentPeriod.period_start)
      : 0

    if (payload.present_reading < previous_reading)
      return {
        status: 'error',
        message: `Reading ${payload.present_reading} cannot be less than previous reading (${previous_reading}).`,
      }

    // Insert Reading Record with dynamically assigned reading_status_id
    const { data: readingRow, error: readingErr } = await supabase
      .from('meter_readings')
      .insert({
        reading_period_id: payload.reading_period_id,
        meter_account_id: payload.meter_account_id,
        meter_id: meterRow.meter_id,
        meter_reader_id: authUser.id,
        present_reading: payload.present_reading,
        reading_status_id: readingStatusId,
        reading_date: new Date().toISOString(),
      })
      .select('reading_id')
      .single()

    if (readingErr) {
      return { status: 'error', message: `Failed to save reading: ${readingErr.message}` }
    }

    // ─── RECONCILE WATER CONSUMPTIONS ────────────────────────────────────
    await reconcileWaterConsumption(
      supabase,
      readingRow.reading_id,
      payload.meter_account_id,
      previous_reading,
      payload.present_reading,
    )

    const globalComplete = await isPeriodCompleteGlobally(supabase, payload.reading_period_id)

    // Billing is created by DB process_billing trigger — validate rules in
    // Next.js (Realtime also covers this; this is a direct follow-up).
    try {
      const { evaluateMeterAccountBillingAfterReading } = await import(
        '@/lib/actions/disconnection-notice/billing-disconnection-notify.actions'
      )
      const notifyResult = await evaluateMeterAccountBillingAfterReading(
        payload.meter_account_id,
        payload.reading_period_id,
      )
      console.log('[submitMeterReading] disconnection notify follow-up', notifyResult)
    } catch (notifyErr) {
      console.error('[submitMeterReading] disconnection notify follow-up failed:', notifyErr)
    }

    return {
      status: 'success',
      data: {
        reading_id: readingRow.reading_id,
        previous_reading,
        present_reading: payload.present_reading,
        reading_date: new Date().toISOString(),
        periodComplete: globalComplete,
      },
    }
  } catch (error: any) {
    console.error('submitMeterReading error:', error)
    return { status: 'error', message: error?.message ?? 'Failed to submit meter reading' }
  }
}

// ============================================================
// getReadingConsumerByMeterAccount
// Once a reading exists for this period, previous_reading comes straight
// from the water_consumptions row (keyed by reading_id), so previous /
// present / consumption always come from the SAME row and can never
// disagree, even if the meter is replaced after the reading was recorded.
//
// FIX: the meter-scoped history fallback (used only when there is NO
// reading yet this period) no longer filters by reading status, so a
// leak-month reading counts as the previous reading — same rule as
// getPreviousReading and the database trigger.
// ============================================================
export async function getReadingConsumerByMeterAccount(meterAccountId: string, readingPeriodId: string) {
  const supabase = await createClient()

  try {
    const { data: ma, error: maErr } = await supabase
      .from('meter_accounts')
      .select(`
        meter_account_id,
        consumer:consumer_id ( consumer_id, account_name ),
        zone:zone_id ( zone_id, zone_name, barangay:barangay_id ( barangay_id, barangay_name ) ),
        classification:classification_id ( classification_id, classification_name )
      `)
      .eq('meter_account_id', meterAccountId)
      .single()

    if (maErr || !ma) return null

    const consumer = unwrap(ma.consumer)
    const zone = unwrap(ma.zone)
    const barangay = unwrap((zone as any)?.barangay)
    const classification = unwrap(ma.classification)

    const meterRow = await getRecordableMeter(supabase, meterAccountId)

    const { data: currentPeriod } = await supabase
      .from('reading_periods')
      .select('period_start')
      .eq('reading_period_id', readingPeriodId)
      .single()

    // ─── Fetch the existing reading for this period FIRST ────────────────
    // We need reading_id before we can look up its reconciled
    // water_consumptions row.
    let readingQuery = supabase
      .from('meter_readings')
      .select(`
        reading_id,
        present_reading,
        reading_date,
        reading_status_id,
        meter_reading_status!reading_status_id ( status_code )
      `)
      .eq('meter_account_id', meterAccountId)
      .eq('reading_period_id', readingPeriodId)

    if (meterRow?.meter_id) {
      readingQuery = readingQuery.eq('meter_id', meterRow.meter_id)
    }

    const { data: reading, error: readingErr } = await readingQuery.maybeSingle()

    if (readingErr) {
      console.error('getReadingConsumerByMeterAccount reading query error:', readingErr)
    }

    const statusCode = reading ? unwrap(reading.meter_reading_status)?.status_code ?? null : null

    let previous_reading = 0
    let present_reading = reading?.present_reading != null ? Number(reading.present_reading) : null

    if (reading?.reading_id) {
      // ── Authoritative path: pull from the reconciled water_consumptions row ──
      const { data: consumptionRow } = await supabase
        .from('water_consumptions')
        .select('previous_reading, present_reading')
        .eq('reading_id', reading.reading_id)
        .maybeSingle()

      if (consumptionRow) {
        previous_reading = consumptionRow.previous_reading != null ? Number(consumptionRow.previous_reading) : 0
        // Trust the reconciled present_reading too, so it can never
        // disagree with previous_reading.
        present_reading = consumptionRow.present_reading != null ? Number(consumptionRow.present_reading) : present_reading
      }
    } else if (currentPeriod && meterRow?.meter_id) {
      // ── Fallback: no reading recorded yet this period, so there's ──
      // nothing reconciled to read from. Use the latest prior reading of
      // the CURRENT meter, any status (leak-month readings included).
      const { data: priorReadings } = await supabase
        .from('meter_readings')
        .select('present_reading, reading_periods!inner(period_start)')
        .eq('meter_account_id', meterAccountId)
        .eq('meter_id', meterRow.meter_id)
        .not('present_reading', 'is', null)
        .lt('reading_periods.period_start', currentPeriod.period_start)

      if (priorReadings && priorReadings.length > 0) {
        const latest = priorReadings.reduce((latestRecord, currentRecord) => {
          const currentStart = (currentRecord as any).reading_periods?.period_start
          const latestStart = (latestRecord as any).reading_periods?.period_start
          if (!latestStart || (currentStart && currentStart > latestStart)) {
            return currentRecord
          }
          return latestRecord
        }, priorReadings[0])

        previous_reading = latest?.present_reading != null ? Number(latest.present_reading) : 0
      }
    }

    const { data: period } = await supabase
      .from('reading_periods')
      .select('period_start, period_end, due_date')
      .eq('reading_period_id', readingPeriodId)
      .single()

    return {
      account_name: consumer?.account_name ?? '',
      consumer_id: consumer?.consumer_id ?? '',
      meter_account_id: ma.meter_account_id,
      meter_serial_no: meterRow?.meter_serial_no ?? null,
      meter_id: meterRow?.meter_id ?? null,
      zone_name: zone?.zone_name ?? '',
      barangay_name: barangay?.barangay_name ?? 'Unknown',
      classification_name: classification?.classification_name ?? 'Unknown',
      reading_id: reading?.reading_id ?? null,
      present_reading,
      reading_date: reading?.reading_date ?? null,
      reading_status_code: statusCode,
      previous_reading,
      period_start: period?.period_start ?? null,
      period_end: period?.period_end ?? null,
      due_date: period?.due_date ?? null,
    }
  } catch (error) {
    console.error('getReadingConsumerByMeterAccount error:', error)
    return null
  }
}

// ============================================================
// getPeriodCompletionStatus
// ============================================================
export async function getPeriodCompletionStatus(readingPeriodId: string) {
  const supabase = await createClient()

  try {
    const activeAccountIds = await getActiveMeterAccountIds(supabase)
    const totalAccounts = activeAccountIds.length

    const { count: recordedCount } = await supabase
      .from('meter_readings')
      .select('*', { count: 'exact', head: true })
      .eq('reading_period_id', readingPeriodId)
      .in('meter_account_id', activeAccountIds)

    const recorded = recordedCount || 0
    const isComplete = totalAccounts > 0 && recorded === totalAccounts

    return {
      status: 'success',
      data: {
        isComplete,
        totalAccounts,
        recordedCount: recorded,
        remainingAccounts: totalAccounts - recorded,
      }
    }
  } catch (error) {
    console.error('getPeriodCompletionStatus error:', error)
    return { status: 'error', message: 'Failed to get completion status', data: null }
  }
}