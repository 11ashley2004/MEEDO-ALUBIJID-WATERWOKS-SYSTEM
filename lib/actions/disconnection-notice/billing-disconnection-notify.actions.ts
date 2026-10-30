'use server'

import config from '@/config/config'
import { createClient } from '@/lib/supabase/server'
import { createServerClient } from '@/lib/supabase/serverClient'
import { sendDisconnectionNoticeEmail } from '@/lib/email/disconnection-notice-email'
import { createNotification } from '@/lib/actions/notifications/notifications'

const ELIGIBLE_METER_STATUSES = [
  'Active',
  'Defective',
  'Stolen',
  'Waterleak_After_Meter',
] as const

function unwrap<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

/** Prefer service role so consumer/staff sessions can create formal notice rows. */
function noticeWriteClient(fallback: Awaited<ReturnType<typeof createClient>>) {
  if (config.env.supabase.supabaseServerRoleKey) {
    return createServerClient()
  }
  return fallback
}

/** App-side notice_no so insert works even if DB trigger is missing. */
async function nextNoticeNo(db: ReturnType<typeof createServerClient> | Awaited<ReturnType<typeof createClient>>): Promise<string> {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date())
  const y = parts.find((p) => p.type === 'year')?.value ?? '0000'
  const m = parts.find((p) => p.type === 'month')?.value ?? '01'
  const ym = `${y}${m}`
  const prefix = `NOD-${ym}-`

  const { data } = await db
    .from('notice_of_disconnection')
    .select('notice_no')
    .like('notice_no', `${prefix}%`)
    .order('notice_no', { ascending: false })
    .limit(1)

  let seq = 1
  const latest = data?.[0]?.notice_no as string | undefined
  if (latest) {
    const match = latest.match(/-(\d+)$/)
    if (match) seq = Number(match[1]) + 1
  }

  return `${prefix}${String(seq).padStart(3, '0')}`
}

/**
 * Find or create notice_of_disconnection for the billing's reading period + rule,
 * then ensure a notice_meter_accounts row exists for this account/billing.
 */
async function ensureNoticeMeterAccount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  params: {
    readingPeriodId: string
    ruleId: string
    meterAccountId: string
    billingId: string
    balanceSnapshot: number
    monthsUnpaid: number
  },
): Promise<{ noticeId: string; noticeNo: string; created: boolean } | null> {
  const db = noticeWriteClient(supabase)
  const log = (...args: unknown[]) => console.log('[disconnection-notify] notice-ensure', ...args)

  // Already linked to this billing on any notice?
  const { data: existingByBillingRows } = await db
    .from('notice_meter_accounts')
    .select(`
      notice_meter_account_id,
      notice_id,
      notice:notice_id ( notice_id, notice_no )
    `)
    .eq('billing_id', params.billingId)
    .eq('meter_account_id', params.meterAccountId)
    .limit(1)

  const existingByBilling = existingByBillingRows?.[0]
  if (existingByBilling) {
    const notice = unwrap((existingByBilling as any).notice)
    if (notice?.notice_id && notice?.notice_no) {
      log('reuse existing notice_meter_accounts', {
        noticeId: notice.notice_id,
        noticeNo: notice.notice_no,
        billingId: params.billingId,
      })
      return {
        noticeId: notice.notice_id,
        noticeNo: notice.notice_no,
        created: false,
      }
    }
  }

  // Find or create notice header for this period + rule
  let noticeId: string | null = null
  let noticeNo: string | null = null

  const { data: existingNoticeRows } = await db
    .from('notice_of_disconnection')
    .select('notice_id, notice_no, total_accounts')
    .eq('reading_period_id', params.readingPeriodId)
    .eq('rule_id', params.ruleId)
    .limit(1)

  const existingNotice = existingNoticeRows?.[0]
  if (existingNotice) {
    noticeId = existingNotice.notice_id
    noticeNo = existingNotice.notice_no
  } else {
    const generatedNo = await nextNoticeNo(db)
    const { data: createdNotice, error: noticeErr } = await db
      .from('notice_of_disconnection')
      .insert({
        notice_no: generatedNo,
        reading_period_id: params.readingPeriodId,
        rule_id: params.ruleId,
        generated_by: null,
        total_accounts: 0,
      })
      .select('notice_id, notice_no')
      .single()

    if (noticeErr || !createdNotice) {
      // Race: another request may have created it (unique period+rule or notice_no)
      const { data: racedRows } = await db
        .from('notice_of_disconnection')
        .select('notice_id, notice_no')
        .eq('reading_period_id', params.readingPeriodId)
        .eq('rule_id', params.ruleId)
        .limit(1)

      const raced = racedRows?.[0]
      if (!raced) {
        console.error('[disconnection-notify] notice_of_disconnection insert failed', noticeErr)
        return null
      }
      noticeId = raced.notice_id
      noticeNo = raced.notice_no
      log('reused raced notice header', { noticeId, noticeNo })
    } else {
      noticeId = createdNotice.notice_id
      noticeNo = createdNotice.notice_no
      log('created notice_of_disconnection', { noticeId, noticeNo })
    }
  }

  if (!noticeId || !noticeNo) return null

  // Meter already on this notice (possibly different billing)?
  const { data: existingOnNoticeRows } = await db
    .from('notice_meter_accounts')
    .select('notice_meter_account_id')
    .eq('notice_id', noticeId)
    .eq('meter_account_id', params.meterAccountId)
    .limit(1)

  if (existingOnNoticeRows?.[0]) {
    log('meter already on notice', { noticeId, noticeNo, meterAccountId: params.meterAccountId })
    return { noticeId, noticeNo, created: false }
  }

  const { error: nmaErr } = await db.from('notice_meter_accounts').insert({
    notice_id: noticeId,
    meter_account_id: params.meterAccountId,
    billing_id: params.billingId,
    balance_snapshot: params.balanceSnapshot,
    months_unpaid: params.monthsUnpaid,
  })

  if (nmaErr) {
    // Unique race — treat as already present
    if (nmaErr.code === '23505') {
      log('notice_meter_accounts unique race — already present', {
        noticeId,
        billingId: params.billingId,
      })
      return { noticeId, noticeNo, created: false }
    }
    console.error('[disconnection-notify] notice_meter_accounts insert failed', nmaErr)
    return null
  }

  const { count } = await db
    .from('notice_meter_accounts')
    .select('*', { count: 'exact', head: true })
    .eq('notice_id', noticeId)

  await db
    .from('notice_of_disconnection')
    .update({ total_accounts: count ?? 0 })
    .eq('notice_id', noticeId)

  log('created notice_meter_accounts', {
    noticeId,
    noticeNo,
    meterAccountId: params.meterAccountId,
    billingId: params.billingId,
    totalAccounts: count,
  })

  return { noticeId, noticeNo, created: true }
}

function countArrearsMonths(
  accountBillings: Array<{
    billing_status_name: string
    remaining_balance: number
    previous_balance: number
  }>,
): number {
  let months = 0
  let expectCarry = false

  for (const bill of accountBillings) {
    const status = bill.billing_status_name
    const remaining = bill.remaining_balance
    const prev = bill.previous_balance

    if (months === 0) {
      if ((status === 'unpaid' || status === 'partial') && remaining > 0) {
        months = 1
        expectCarry = prev > 0
        continue
      }
      return 0
    }

    if (status === 'unpaid' || status === 'partial') {
      months += 1
      expectCarry = prev > 0
    } else if (expectCarry && (status === 'paid' || status === 'forwarded')) {
      months += 1
      expectCarry = prev > 0
    } else {
      break
    }
  }

  return months
}

async function latestMeterSerial(
  supabase: Awaited<ReturnType<typeof createClient>>,
  meterAccountId: string,
): Promise<string> {
  const { data } = await supabase
    .from('meters')
    .select('meter_serial_no, created_at')
    .eq('meter_account_id', meterAccountId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data?.meter_serial_no ?? ''
}

/**
 * Validate one billing row against disconnection rules and notify the
 * consumer via user_notifications (consumer_id = auth id). Idempotent
 * per billing_id + NOTICE_OF_DISCONNECTION.
 */
export async function evaluateBillingDisconnectionNotify(billingId: string): Promise<{
  status: 'success' | 'error' | 'skipped'
  message?: string
  notified?: boolean
  notice_id?: string | null
  notice_no?: string | null
}> {
  const log = (...args: unknown[]) =>
    console.log('[disconnection-notify]', ...args)

  if (!billingId) {
    log('abort: billingId is required')
    return { status: 'error', message: 'billingId is required' }
  }

  log('start', { billingId })
  const supabase = await createClient()

  try {
    const { data: billing, error: billErr } = await supabase
      .from('billing')
      .select(`
        billing_id,
        meter_account_id,
        reading_period_id,
        remaining_balance,
        previous_balance,
        total_billing,
        created_at,
        consumer_id,
        billing_status:billing_status_id ( billing_status_name )
      `)
      .eq('billing_id', billingId)
      .maybeSingle()

    if (billErr) {
      console.error('[disconnection-notify] billing fetch error', billErr)
      throw billErr
    }
    if (!billing) {
      log('skip: billing not found', { billingId })
      return { status: 'skipped', message: 'Billing not found' }
    }

    const status =
      unwrap((billing as any).billing_status)?.billing_status_name?.toLowerCase() ?? ''
    const remaining = Number(billing.remaining_balance) || 0
    const totalBilling = Number((billing as any).total_billing) || 0

    log('billing loaded', {
      billingId,
      meterAccountId: billing.meter_account_id,
      consumerIdOnBilling: billing.consumer_id,
      status,
      remaining,
      totalBilling,
      previousBalance: Number(billing.previous_balance) || 0,
      note: 'Rule uses remaining_balance (not total_billing)',
    })

    if (!(status === 'unpaid' || status === 'partial') || remaining <= 0) {
      log('skip: billing not open unpaid/partial', { status, remaining })
      return { status: 'skipped', message: 'Billing not open unpaid/partial' }
    }

    const { data: rule, error: ruleErr } = await supabase
      .from('disconnection_rules')
      .select('rule_id, min_balance, min_unpaid_months')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (ruleErr) {
      console.error('[disconnection-notify] rule fetch error', ruleErr)
    }
    if (!rule) {
      log('skip: no disconnection rule configured')
      return { status: 'skipped', message: 'No disconnection rule configured' }
    }

    log('rule', {
      ruleId: rule.rule_id,
      minBalance: rule.min_balance,
      minUnpaidMonths: rule.min_unpaid_months,
    })

    const { data: statusRows } = await supabase
      .from('meter_status')
      .select('meter_status_id, meter_status_name')
      .in('meter_status_name', [...ELIGIBLE_METER_STATUSES])

    const eligibleStatusIds = (statusRows ?? []).map((s) => s.meter_status_id)
    if (!eligibleStatusIds.length) {
      log('skip: no eligible meter statuses found in DB', {
        expected: ELIGIBLE_METER_STATUSES,
      })
      return { status: 'skipped', message: 'No eligible meter statuses' }
    }

    const { data: meterOk } = await supabase
      .from('meters')
      .select('meter_id, meter_status_id')
      .eq('meter_account_id', billing.meter_account_id)
      .in('meter_status_id', eligibleStatusIds)
      .limit(1)
      .maybeSingle()

    if (!meterOk) {
      const { data: anyMeter } = await supabase
        .from('meters')
        .select('meter_id, meter_status_id, meter_status:meter_status_id ( meter_status_name )')
        .eq('meter_account_id', billing.meter_account_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      log('skip: meter status not eligible', {
        meterAccountId: billing.meter_account_id,
        actualMeter: anyMeter,
        eligibleStatusIds,
      })
      return { status: 'skipped', message: 'Meter status not eligible' }
    }

    log('meter eligible', { meterId: meterOk.meter_id })

    const { data: accountBillings, error: histErr } = await supabase
      .from('billing')
      .select(`
        remaining_balance,
        previous_balance,
        created_at,
        billing_status:billing_status_id ( billing_status_name )
      `)
      .eq('meter_account_id', billing.meter_account_id)
      .order('created_at', { ascending: false })

    if (histErr) {
      console.error('[disconnection-notify] billing history error', histErr)
      throw histErr
    }

    const history = (accountBillings ?? []).map((b) => ({
      billing_status_name:
        unwrap((b as any).billing_status)?.billing_status_name?.toLowerCase() ?? '',
      remaining_balance: Number(b.remaining_balance) || 0,
      previous_balance: Number(b.previous_balance) || 0,
    }))

    const unpaidMonths = countArrearsMonths(history)
    const minBalance = Number(rule.min_balance) || 0
    const minMonths = Number(rule.min_unpaid_months) || 0

    // Match disconnection_rules: balance ≥ min_balance OR unpaid months ≥ min_unpaid_months
    const passesBalance = minBalance > 0 && remaining >= minBalance
    const passesMonths = minMonths > 0 && unpaidMonths >= minMonths
    const meetsRule = passesBalance || passesMonths

    log('thresholds check (OR)', {
      remaining,
      minBalance,
      unpaidMonths,
      minMonths,
      historyPreview: history.slice(0, 6),
      passesBalance,
      passesMonths,
      meetsRule,
    })

    if (!meetsRule) {
      const message = `Below thresholds (need balance ≥ ${minBalance} OR months ≥ ${minMonths}; got ${remaining} / ${unpaidMonths} mo)`
      log('skip:', message)
      return { status: 'skipped', message }
    }

    // Resolve consumer from meter account / billing — must exist in consumers
    let consumerId = billing.consumer_id as string | null
    let consumerSource: 'billing' | 'meter_accounts' | null = consumerId
      ? 'billing'
      : null
    if (!consumerId) {
      const { data: ma } = await supabase
        .from('meter_accounts')
        .select('consumer_id')
        .eq('meter_account_id', billing.meter_account_id)
        .maybeSingle()
      consumerId = ma?.consumer_id ?? null
      consumerSource = consumerId ? 'meter_accounts' : null
    }

    log('consumer resolve', { consumerId, consumerSource })

    if (!consumerId) {
      log('skip: no consumer on meter account', {
        meterAccountId: billing.meter_account_id,
      })
      return { status: 'skipped', message: 'No consumer on meter account' }
    }

    const { data: consumerRow, error: consumerErr } = await supabase
      .from('consumers')
      .select('consumer_id, email, account_name')
      .eq('consumer_id', consumerId)
      .maybeSingle()

    if (consumerErr) {
      console.error('[disconnection-notify] consumer lookup error', consumerErr)
    }
    if (!consumerRow) {
      log('skip: consumer row missing — notify would not show for login', {
        consumerId,
        hint: 'consumers.consumer_id must equal auth.users.id for the consumer login',
      })
      return { status: 'skipped', message: 'Consumer row missing' }
    }

    const readingPeriodId = billing.reading_period_id as string | null
    if (!readingPeriodId) {
      log('skip: billing has no reading_period_id', { billingId })
      return { status: 'skipped', message: 'Billing has no reading period' }
    }

    // ── Persist formal notice rows (auto path) ──
    const notice = await ensureNoticeMeterAccount(supabase, {
      readingPeriodId,
      ruleId: rule.rule_id,
      meterAccountId: billing.meter_account_id,
      billingId,
      balanceSnapshot: remaining,
      monthsUnpaid: unpaidMonths,
    })

    if (!notice) {
      log('error: failed to ensure notice_of_disconnection / notice_meter_accounts', {
        billingId,
        readingPeriodId,
        ruleId: rule.rule_id,
      })
      return {
        status: 'error',
        message: 'Failed to create notice of disconnection records',
      }
    }

    // Use service-role when available so RLS can't hide existing rows and
    // cause duplicate inserts (which re-toasts the consumer every poll).
    const notifyDb = noticeWriteClient(supabase)
    const { data: existingRows, error: existingErr } = await notifyDb
      .from('user_notifications')
      .select('notification_id')
      .eq('event_code', 'NOTICE_OF_DISCONNECTION')
      .eq('reference_id', billingId)
      .eq('consumer_id', consumerId)
      .order('created_at', { ascending: false })
      .limit(1)

    if (existingErr) {
      console.error('[disconnection-notify] existing notify lookup error', existingErr)
    }
    const existing = existingRows?.[0]
    if (existing) {
      log('skip notify: already notified for this billing (notice rows ensured)', {
        notificationId: existing.notification_id,
        consumerId,
        billingId,
        noticeId: notice.noticeId,
        noticeNo: notice.noticeNo,
      })
      return {
        status: 'skipped',
        message: 'Already notified for this billing',
        notice_id: notice.noticeId,
        notice_no: notice.noticeNo,
      }
    }

    const serial = await latestMeterSerial(supabase, billing.meter_account_id)
    const metadata = {
      meter_serial_no: serial,
      notice_no: notice.noticeNo,
      balance: remaining,
      months_unpaid: unpaidMonths,
    }

    log('inserting user_notifications', {
      consumerId,
      eventCode: 'NOTICE_OF_DISCONNECTION',
      meterAccountId: billing.meter_account_id,
      referenceId: billingId,
      metadata,
    })

    const created = await createNotification(
      { consumerId },
      'NOTICE_OF_DISCONNECTION',
      metadata,
      billing.meter_account_id,
      billingId,
    )

    if (!created.ok) {
      log('error: insert failed', { consumerId, billingId, error: created.error })
      return {
        status: 'error',
        message: created.error ?? 'Failed to insert user_notifications',
      }
    }

    // ── Email consumer via Resend (non-fatal) ──
    try {
      const consumerEmail = consumerRow.email?.trim()
      if (consumerEmail) {
        await sendDisconnectionNoticeEmail({
          to: consumerEmail,
          consumer_name: consumerRow.account_name ?? 'Valued customer',
          meter_serial_no: serial,
          balance: remaining,
          months_unpaid: unpaidMonths,
          notice_no: notice.noticeNo,
        })
        log('email sent', { consumerId, to: consumerEmail })
      } else {
        log('email skipped: consumer has no email', { consumerId })
      }
    } catch (emailErr) {
      console.error('[disconnection-notify] email failed', { consumerId, billingId, emailErr })
    }

    log('success: consumer notified', {
      consumerId,
      billingId,
      notificationId: created.notificationId,
      noticeId: notice.noticeId,
      noticeNo: notice.noticeNo,
    })
    return {
      status: 'success',
      notified: true,
      message: 'Consumer notified',
      notice_id: notice.noticeId,
      notice_no: notice.noticeNo,
    }
  } catch (err) {
    console.error('[disconnection-notify] evaluateBillingDisconnectionNotify failed', {
      billingId,
      err,
    })
    return { status: 'error', message: 'Failed to evaluate disconnection notify' }
  }
}

/**
 * Evaluate the latest open billing for each meter account of a consumer.
 * Used when the consumer opens Billing (existing bills never hit Realtime).
 */
export async function evaluateConsumerOpenBillingsForDisconnectionNotify(
  consumerId: string,
): Promise<{
  status: 'success' | 'error' | 'skipped'
  message?: string
  results?: Array<{ billingId: string; status: string; message?: string }>
}> {
  console.log('[disconnection-notify] consumer-open-billings start', { consumerId })

  if (!consumerId) {
    return { status: 'error', message: 'consumerId is required' }
  }

  const supabase = await createClient()

  try {
    const { data: meterAccounts, error: maErr } = await supabase
      .from('meter_accounts')
      .select('meter_account_id')
      .eq('consumer_id', consumerId)

    if (maErr) throw maErr
    if (!meterAccounts?.length) {
      console.log('[disconnection-notify] consumer-open-billings: no meter accounts', {
        consumerId,
      })
      return { status: 'skipped', message: 'No meter accounts' }
    }

    const results: Array<{ billingId: string; status: string; message?: string }> = []

    for (const ma of meterAccounts) {
      const { data: latest } = await supabase
        .from('billing')
        .select(`
          billing_id,
          remaining_balance,
          total_billing,
          billing_status:billing_status_id ( billing_status_name )
        `)
        .eq('meter_account_id', ma.meter_account_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!latest?.billing_id) {
        console.log('[disconnection-notify] consumer-open-billings: no billing', {
          meterAccountId: ma.meter_account_id,
        })
        continue
      }

      const status =
        unwrap((latest as any).billing_status)?.billing_status_name?.toLowerCase() ?? ''
      const remaining = Number(latest.remaining_balance) || 0
      const totalBilling = Number((latest as any).total_billing) || 0

      console.log('[disconnection-notify] consumer-open-billings candidate', {
        meterAccountId: ma.meter_account_id,
        billingId: latest.billing_id,
        status,
        remaining,
        totalBilling,
      })

      if (!(status === 'unpaid' || status === 'partial') || remaining <= 0) {
        console.log('[disconnection-notify] consumer-open-billings skip closed/zero', {
          billingId: latest.billing_id,
          status,
          remaining,
        })
        continue
      }

      const res = await evaluateBillingDisconnectionNotify(latest.billing_id)
      results.push({
        billingId: latest.billing_id,
        status: res.status,
        message: res.message,
      })
    }

    console.log('[disconnection-notify] consumer-open-billings done', {
      consumerId,
      results,
    })

    return { status: 'success', results }
  } catch (err) {
    console.error('[disconnection-notify] consumer-open-billings failed', err)
    return { status: 'error', message: 'Failed to evaluate consumer open billings' }
  }
}

/**
 * After a meter reading, wait briefly for the DB billing trigger, then
 * validate + notify if rules are met.
 */
export async function evaluateMeterAccountBillingAfterReading(
  meterAccountId: string,
  readingPeriodId?: string | null,
): Promise<{
  status: 'success' | 'error' | 'skipped'
  message?: string
  billingId?: string | null
}> {
  console.log('[disconnection-notify] after-reading start', {
    meterAccountId,
    readingPeriodId,
  })

  if (!meterAccountId) {
    return { status: 'error', message: 'meterAccountId is required' }
  }

  const supabase = await createClient()

  try {
    let billingId: string | null = null

    for (let attempt = 0; attempt < 6; attempt++) {
      let q = supabase
        .from('billing')
        .select('billing_id')
        .eq('meter_account_id', meterAccountId)
        .order('created_at', { ascending: false })
        .limit(1)

      if (readingPeriodId) {
        q = q.eq('reading_period_id', readingPeriodId)
      }

      const { data } = await q.maybeSingle()
      if (data?.billing_id) {
        billingId = data.billing_id
        console.log('[disconnection-notify] after-reading billing found', {
          attempt,
          billingId,
        })
        break
      }

      await new Promise((r) => setTimeout(r, 400))
    }

    if (!billingId) {
      console.log('[disconnection-notify] after-reading skip: no billing row yet', {
        meterAccountId,
        readingPeriodId,
      })
      return { status: 'skipped', message: 'No billing row yet for this reading' }
    }

    const result = await evaluateBillingDisconnectionNotify(billingId)
    console.log('[disconnection-notify] after-reading result', {
      billingId,
      status: result.status,
      message: result.message,
      notified: result.notified,
    })
    return {
      status: result.status,
      message: result.message,
      billingId,
    }
  } catch (err) {
    console.error('[disconnection-notify] evaluateMeterAccountBillingAfterReading failed', err)
    return { status: 'error', message: 'Failed to evaluate meter account billing' }
  }
}

/**
 * Realtime / batch entry: validate a billing id from postgres_changes payload.
 */
export async function onBillingRealtimeChange(payload: {
  billing_id?: string | null
  eventType?: string | null
}): Promise<{
  status: 'success' | 'error' | 'skipped'
  message?: string
}> {
  console.log('[disconnection-notify] realtime entry', payload)
  const billingId = payload.billing_id
  if (!billingId) {
    console.log('[disconnection-notify] realtime skip: no billing_id in payload')
    return { status: 'skipped', message: 'No billing_id in payload' }
  }

  const result = await evaluateBillingDisconnectionNotify(billingId)
  console.log('[disconnection-notify] realtime result', {
    billingId,
    status: result.status,
    message: result.message,
    notified: result.notified,
  })
  return result
}
