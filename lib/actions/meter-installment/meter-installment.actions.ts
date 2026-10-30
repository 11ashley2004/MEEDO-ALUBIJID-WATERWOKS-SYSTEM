'use server'

import { createClient } from '@/lib/supabase/server'

// ============================================================================
// Types
// ============================================================================

export interface MeterInstallmentDetail {
  installment_id: string
  meter_account_id: string
  meter_serial_no: string | null
  consumer_name: string
  total_cost: number
  monthly_amount: number
  total_months: number
  remaining_balance: number
  months_paid: number
  months_remaining: number
  amount_paid: number
  progress_pct: number
  status_code: string                    // 'ACTIVE', 'COMPLETED', 'CANCELLED', 'PENDING', 'PAUSED'
  status_id: string
  created_at: string
  estimated_completion_date: string | null
  charges: MeterInstallmentCharge[]
}

export interface MeterInstallmentCharge {
  charge_id: string
  billing_id: string
  amount: number
  created_at: string
  billing_period: string | null          // from reading_period
  billing_status: string | null          // from billing_status.billing_status_name
}

export interface PendingMeterAccount {
  meter_account_id: string
  meter_serial_no: string | null
  consumer_id: string
  consumer_name: string
  zone_name: string
  barangay_name: string
  classification_name: string
  meter_status_name?: string
}

type ActionResult<T = null> =
  | { status: 'success'; data: T; message?: string }
  | { status: 'error'; message: string }

// ============================================================================
// Helper — get status ID by code

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

async function getInstallmentStatusId(supabase: any, statusCode: string): Promise<string | null> {
  const { data } = await supabase
    .from('installment_status')
    .select('installment_status_id')
    .eq('status_code', statusCode)
    .single()
  return data?.installment_status_id ?? null
}

export interface MeterPrice {
  meter_price_id: string
  unit_price: number
  monthly_amount: number
  updated_at: string
}

export async function getCurrentMeterPrice(): Promise<ActionResult<MeterPrice | null>> {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from('meter_price')
      .select('meter_price_id, unit_price, monthly_amount, updated_at')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('[getCurrentMeterPrice]', error)
      return { status: 'error', message: error.message }
    }

    if (!data) {
      return { status: 'error', message: 'No meter price has been set yet' }
    }

    return {
      status: 'success',
      data: {
        meter_price_id: data.meter_price_id,
        unit_price: Number(data.unit_price),
        monthly_amount: Number(data.monthly_amount),
        updated_at: data.updated_at,
      },
    }
  } catch (err) {
    console.error('[getCurrentMeterPrice]', err)
    return { status: 'error', message: 'Failed to fetch meter price' }
  }
}

// ============================================================================
// GET — all pending meter accounts (no installment plan yet)
// Now includes accounts with Pending, Replacing, Defective, or Stolen meter status
// ===========================================================================

export async function getPendingMeterAccounts(): Promise<{
  status: 'success' | 'error'
  data?: PendingMeterAccount[]
  message?: string
}> {
  const supabase = await createClient()

  try {
    // ── Get all meter status IDs we care about ──
    const { data: statuses, error: statusesError } = await supabase
      .from('meter_status')
      .select('meter_status_id, meter_status_name')
      .in('meter_status_name', ['Pending', 'Replacing', 'Defective', 'Stolen'])

    if (statusesError) {
      console.error('[getPendingMeterAccounts] Statuses error:', statusesError)
      return { status: 'error', message: statusesError.message }
    }

    if (!statuses || statuses.length === 0) {
      return { status: 'success', data: [] }
    }

    const statusIds = statuses.map(s => s.meter_status_id)

    // ── Get existing installment plans that should block a new plan ──
    // ACTIVE / PENDING / PAUSED all count as "already has a plan" for this meter account
    const { data: existingInstallments, error: installmentCheckError } = await supabase
      .from('meter_installments')
      .select(`
        meter_account_id,
        installment_status!inner (
          status_code
        )
      `)
      .in('installment_status.status_code', ['ACTIVE', 'PENDING', 'PAUSED', 'FORWARDED'])

    if (installmentCheckError) {
      console.error('[getPendingMeterAccounts] Installment check error:', installmentCheckError)
    }

    // Accounts with active/pending/paused installments should be excluded
    const excludedMeterAccountIds = new Set(
      existingInstallments?.map((i: any) => i.meter_account_id) ?? []
    )

    // ── Query meter accounts with the target meter statuses ──
    let query = supabase
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
            barangay_name
          )
        ),
        classification:classification_id (
          classification_name
        ),
        meters!inner (
          meter_id,
          meter_status_id,
          meter_status:meter_status_id (
            meter_status_name
          )
        )
      `)
      .in('meters.meter_status_id', statusIds)
      .order('meter_account_id', { ascending: true })

    // Exclude accounts with ACTIVE/PENDING/PAUSED installments
    if (excludedMeterAccountIds.size > 0) {
      const excludedIds = Array.from(excludedMeterAccountIds)
      query = query.not('meter_account_id', 'in', `(${excludedIds.join(',')})`)
    }

    const { data: accounts, error: accountsError } = await query

    if (accountsError) {
      console.error('[getPendingMeterAccounts] Accounts query error:', accountsError)
      return { status: 'error', message: accountsError.message }
    }

    // ── Build results ──
    const results: PendingMeterAccount[] = (accounts ?? []).map((ma: any) => {
      const consumer = ma.consumer
      const zone = ma.zone
      const barangay = zone?.barangay
      const classification = ma.classification

      let meterStatusName = ''
      if (ma.meters) {
        const meters = Array.isArray(ma.meters) ? ma.meters : [ma.meters]
        const meter = meters[0]
        const meterStatus = meter?.meter_status
        if (meterStatus) {
          meterStatusName = Array.isArray(meterStatus)
            ? meterStatus[0]?.meter_status_name ?? ''
            : meterStatus?.meter_status_name ?? ''
        }
      }

      const meters = ma.meters ? (Array.isArray(ma.meters) ? ma.meters : [ma.meters]) : []
      const serial = meters[0]?.meter_serial_no ?? ''

      return {
        meter_account_id: ma.meter_account_id,
        meter_serial_no: serial,
        consumer_id: consumer?.consumer_id || '',
        consumer_name: consumer?.account_name || 'Unknown Consumer',
        zone_name: zone?.zone_name || '',
        barangay_name: barangay?.barangay_name || '',
        classification_name: classification?.classification_name || '',
        meter_status_name: meterStatusName,
      }
    })

    return { status: 'success', data: results }
  } catch (err) {
    console.error('[getPendingMeterAccounts]', err)
    return { status: 'error', message: 'Failed to fetch pending meter accounts' }
  }
}

// ============================================================================
// GET — installment detail by meter_account_id
// ============================================================================

export async function getMeterInstallmentByMeterAccount(
  meterAccountId: string,
): Promise<ActionResult<MeterInstallmentDetail | null>> {
  const supabase = await createClient()

  try {
    const { data: installment, error: installmentError } = await supabase
      .from('meter_installments')
      .select(`
        installment_id,
        meter_account_id,
        total_cost,
        monthly_amount,
        total_months,
        remaining_balance,
        created_at,
        status_id,
        installment_status:status_id (
          status_code
        ),
        meter_accounts!inner (
          consumers!inner (
            account_name
          )
        )
      `)
      .eq('meter_account_id', meterAccountId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (installmentError) {
      console.error('[getMeterInstallmentByMeterAccount] installment:', installmentError)
      return { status: 'error', message: installmentError.message }
    }

    if (!installment) {
      return { status: 'success', data: null }
    }

    const { data: charges, error: chargesError } = await supabase
      .from('meter_installment_charges')
      .select(`
        charge_id,
        billing_id,
        amount,
        created_at,
        billing:billing_id (
          billing_id,
          total_billing,
          remaining_balance,
          created_at,
          billing_status:billing_status_id (
            billing_status_name
          ),
          reading_periods:reading_period_id (
            reading_period_id,
            period_start,
            period_end,
            due_date
          )
        )
      `)
      .eq('installment_id', installment.installment_id)
      .order('created_at', { ascending: false })

    if (chargesError) {
      console.error('[getMeterInstallmentByMeterAccount] charges:', chargesError)
      return { status: 'error', message: chargesError.message }
    }

    const amountPaid = installment.total_cost - installment.remaining_balance
    const monthsPaid = installment.monthly_amount > 0
      ? Math.floor(amountPaid / installment.monthly_amount)
      : 0
    const monthsRemaining = Math.max(0, installment.total_months - monthsPaid)
    const progressPct = installment.total_months > 0
      ? Math.min(100, Math.round((monthsPaid / installment.total_months) * 100))
      : 0

    const createdAt = new Date(installment.created_at)
    const estimatedCompletion = new Date(createdAt)
    estimatedCompletion.setMonth(estimatedCompletion.getMonth() + installment.total_months)

    const status = installment.installment_status as any
    const statusCode = status?.status_code ?? 'UNKNOWN'

    // Format charges with proper period data
    const shapedCharges: MeterInstallmentCharge[] = (charges ?? []).map((c) => {
      const billing = c.billing as any
      const readingPeriods = billing?.reading_periods

      let billingPeriod = null
      if (readingPeriods?.period_start && readingPeriods?.period_end) {
        const start = new Date(readingPeriods.period_start)
        const end = new Date(readingPeriods.period_end)
        billingPeriod = `${start.toLocaleDateString('en-PH', { month: 'short', year: 'numeric' })} - ${end.toLocaleDateString('en-PH', { month: 'short', year: 'numeric' })}`
      }

      return {
        charge_id: c.charge_id,
        billing_id: c.billing_id,
        amount: Number(c.amount),
        created_at: c.created_at,
        billing_period: billingPeriod,
        billing_status: billing?.billing_status?.billing_status_name ?? null,
      }
    })

    const ma = installment.meter_accounts as any
    const consumer = ma?.consumers

    const result: MeterInstallmentDetail = {
      installment_id:             installment.installment_id,
      meter_account_id:           installment.meter_account_id,
      meter_serial_no:           ma?.meter_serial_no ?? '',
      consumer_name:              consumer?.account_name ?? 'Unknown Consumer',
      total_cost:                 Number(installment.total_cost),
      monthly_amount:             Number(installment.monthly_amount),
      total_months:               installment.total_months,
      remaining_balance:          Number(installment.remaining_balance),
      months_paid:                monthsPaid,
      months_remaining:           monthsRemaining,
      amount_paid:                amountPaid,
      progress_pct:               progressPct,
      status_code:                statusCode,
      status_id:                  installment.status_id,
      created_at:                 installment.created_at,
      estimated_completion_date:  estimatedCompletion.toISOString(),
      charges:                    shapedCharges,
    }

    return { status: 'success', data: result }
  } catch (err) {
    console.error('[getMeterInstallmentByMeterAccount]', err)
    return { status: 'error', message: 'Failed to fetch installment details' }
  }
}

// ============================================================================
// GET — all installments (admin overview)
// ============================================================================

export async function getActiveInstallments(): Promise<
  ActionResult<{
    installment_id: string
    meter_serial_no: string | null
    consumer_name: string
    remaining_balance: number
    monthly_amount: number
    months_remaining: number
    progress_pct: number
    status_code: string
    status_name: string
    created_at: string
  }[]>
> {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from('meter_installments')
      .select(`
        installment_id,
        total_cost,
        monthly_amount,
        total_months,
        remaining_balance,
        created_at,
        status_id,
        installment_status:status_id (
          status_code
        ),
        meter_accounts!inner (
          consumers!inner (
            account_name
          )
        )
      `)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[getActiveInstallments]', error)
      return { status: 'error', message: error.message }
    }

    if (!data || data.length === 0) {
      return { status: 'success', data: [] }
    }

    const rows = data.map((row) => {
      const ma = row.meter_accounts as any
      const consumer = ma?.consumers
      const status = row.installment_status as any
      const amountPaid = Number(row.total_cost) - Number(row.remaining_balance)
      const monthsPaid = row.monthly_amount > 0
        ? Math.floor(amountPaid / Number(row.monthly_amount))
        : 0
      const monthsRemaining = Math.max(0, row.total_months - monthsPaid)
      const progressPct = row.total_months > 0
        ? Math.min(100, Math.round((monthsPaid / row.total_months) * 100))
        : 0

      const statusCode = status?.status_code ?? 'UNKNOWN'

      let statusName = statusCode
      switch (statusCode) {
        case 'ACTIVE': statusName = 'Active'; break
        case 'PAUSED': statusName = 'Paused'; break
        case 'FORWARDED': statusName = 'Forwarded'; break 
        case 'COMPLETED': statusName = 'Completed'; break
        case 'CANCELLED': statusName = 'Cancelled'; break
        case 'PENDING': statusName = 'Pending'; break
        default: statusName = statusCode
      }

      return {
        installment_id:    row.installment_id,
        meter_serial_no:  ma?.meter_serial_no ?? '—',
        consumer_name:     consumer?.account_name ?? '—',
        remaining_balance: Number(row.remaining_balance),
        monthly_amount:    Number(row.monthly_amount),
        months_remaining:  monthsRemaining,
        progress_pct:      progressPct,
        status_code:       statusCode,
        status_name:       statusName,
        created_at:        row.created_at,
      }
    })

    return { status: 'success', data: rows }
  } catch (err) {
    console.error('[getActiveInstallments]', err)
    return { status: 'error', message: 'Failed to fetch installments' }
  }
}

// ============================================================================
// GET — installment by ID (for view details)
// ============================================================================

export async function getInstallmentById(
  installmentId: string,
): Promise<ActionResult<MeterInstallmentDetail | null>> {
  const supabase = await createClient()

  try {
    const { data: installment, error: installmentError } = await supabase
      .from('meter_installments')
      .select(`
        installment_id,
        meter_account_id,
        total_cost,
        monthly_amount,
        total_months,
        remaining_balance,
        created_at,
        status_id,
        installment_status:status_id (
          status_code
        ),
        meter_accounts!inner (
          consumers!inner (
            account_name
          )
        )
      `)
      .eq('installment_id', installmentId)
      .single()

    if (installmentError) {
      console.error('[getInstallmentById] installment:', installmentError)
      return { status: 'error', message: installmentError.message }
    }

    if (!installment) {
      return { status: 'success', data: null }
    }

    const { data: charges, error: chargesError } = await supabase
      .from('meter_installment_charges')
      .select(`
        charge_id,
        billing_id,
        amount,
        created_at,
        billing:billing_id (
          billing_id,
          total_billing,
          remaining_balance,
          created_at,
          billing_status:billing_status_id (
            billing_status_name
          ),
          reading_periods:reading_period_id (
            reading_period_id,
            period_start,
            period_end,
            due_date
          )
        )
      `)
      .eq('installment_id', installment.installment_id)
      .order('created_at', { ascending: false })

    if (chargesError) {
      console.error('[getInstallmentById] charges:', chargesError)
      return { status: 'error', message: chargesError.message }
    }

    const amountPaid = installment.total_cost - installment.remaining_balance
    const monthsPaid = installment.monthly_amount > 0
      ? Math.floor(amountPaid / installment.monthly_amount)
      : 0
    const monthsRemaining = Math.max(0, installment.total_months - monthsPaid)
    const progressPct = installment.total_months > 0
      ? Math.min(100, Math.round((monthsPaid / installment.total_months) * 100))
      : 0

    const createdAt = new Date(installment.created_at)
    const estimatedCompletion = new Date(createdAt)
    estimatedCompletion.setMonth(estimatedCompletion.getMonth() + installment.total_months)

    const status = installment.installment_status as any
    const statusCode = status?.status_code ?? 'UNKNOWN'

    const shapedCharges: MeterInstallmentCharge[] = (charges ?? []).map((c) => {
      const billing = c.billing as any
      const readingPeriods = billing?.reading_periods

      let billingPeriod = null
      if (readingPeriods?.period_start && readingPeriods?.period_end) {
        const start = new Date(readingPeriods.period_start)
        const end = new Date(readingPeriods.period_end)
        billingPeriod = `${start.toLocaleDateString('en-PH', { month: 'short', year: 'numeric' })} - ${end.toLocaleDateString('en-PH', { month: 'short', year: 'numeric' })}`
      }

      return {
        charge_id: c.charge_id,
        billing_id: c.billing_id,
        amount: Number(c.amount),
        created_at: c.created_at,
        billing_period: billingPeriod,
        billing_status: billing?.billing_status?.billing_status_name ?? null,
      }
    })

    const ma = installment.meter_accounts as any
    const consumer = ma?.consumers

    const result: MeterInstallmentDetail = {
      installment_id:             installment.installment_id,
      meter_account_id:           installment.meter_account_id,
      meter_serial_no:           ma?.meter_serial_no ?? '',
      consumer_name:              consumer?.account_name ?? 'Unknown Consumer',
      total_cost:                 Number(installment.total_cost),
      monthly_amount:             Number(installment.monthly_amount),
      total_months:               installment.total_months,
      remaining_balance:          Number(installment.remaining_balance),
      months_paid:                monthsPaid,
      months_remaining:           monthsRemaining,
      amount_paid:                amountPaid,
      progress_pct:               progressPct,
      status_code:                statusCode,
      status_id:                  installment.status_id,
      created_at:                 installment.created_at,
      estimated_completion_date:  estimatedCompletion.toISOString(),
      charges:                    shapedCharges,
    }

    return { status: 'success', data: result }
  } catch (err) {
    console.error('[getInstallmentById]', err)
    return { status: 'error', message: 'Failed to fetch installment details' }
  }
}

// ============================================================================
// CREATE — Create installment plan
// ============================================================================

export interface CreateMeterInstallmentInput {
  meter_account_id: string
  status_code: 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'PAUSED'
}

export async function createMeterInstallment(
  input: CreateMeterInstallmentInput,
): Promise<ActionResult<{ installment_id: string }>> {
  const supabase = await createClient()

  try {
    const statusId = await getInstallmentStatusId(supabase, input.status_code)
    if (!statusId) {
      return { status: 'error', message: `Status "${input.status_code}" not found in installment_status table` }
    }

    // ── Fetch current price + monthly amount ──
    const { data: priceRow, error: priceError } = await supabase
      .from('meter_price')
      .select('unit_price, monthly_amount')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (priceError) {
      console.error('[createMeterInstallment] price fetch:', priceError)
      return { status: 'error', message: priceError.message }
    }
    if (!priceRow) {
      return { status: 'error', message: 'No meter price has been set. Please set a unit price first.' }
    }

    const totalCost = Number(priceRow.unit_price)
    const monthlyAmount = Number(priceRow.monthly_amount)

    if (totalCost <= 0) {
      return { status: 'error', message: 'Meter unit price is not set correctly' }
    }
    if (monthlyAmount <= 0) {
      return { status: 'error', message: 'Meter monthly amount is not set correctly' }
    }

    const totalMonths = Math.ceil(totalCost / monthlyAmount)

    const { data: installment, error } = await supabase
      .from('meter_installments')
      .insert({
        meter_account_id: input.meter_account_id,
        total_cost: totalCost,
        monthly_amount: monthlyAmount,
        total_months: totalMonths,
        remaining_balance: totalCost,
        status_id: statusId,
      })
      .select('installment_id')
      .single()

    if (error) {
      console.error('[createMeterInstallment]', error)
      return { status: 'error', message: error.message }
    }

    return {
      status: 'success',
      data: { installment_id: installment.installment_id },
      message: 'Installment plan created successfully',
    }
  } catch (err) {
    console.error('[createMeterInstallment]', err)
    return { status: 'error', message: 'Failed to create installment plan' }
  }
}

// ============================================================================
// UPDATE — Update installment plan
// Active plans are locked from editing. Paused plans can still have their
// status changed (e.g. back to ACTIVE, or to CANCELLED) but not their
// meter account.
// ============================================================================

export interface UpdateMeterInstallmentInput {
  installment_id: string
  meter_account_id?: string
  status_code?: 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'PENDING' | 'PAUSED'
}

export async function updateMeterInstallment(
  input: UpdateMeterInstallmentInput,
): Promise<ActionResult<null>> {
  const supabase = await createClient()

  try {
    const { installment_id, meter_account_id, status_code } = input

    if (!meter_account_id && !status_code) {
      return { status: 'error', message: 'No fields to update' }
    }

    const { data: current, error: fetchError } = await supabase
      .from('meter_installments')
      .select('status_id, installment_status:status_id ( status_code )')
      .eq('installment_id', installment_id)
      .single()

    if (fetchError || !current) {
      return { status: 'error', message: 'Installment plan not found' }
    }

    const currentStatus = (current.installment_status as any)?.status_code ?? ''
    if (currentStatus === 'ACTIVE') {
      return { status: 'error', message: 'Active installment plans cannot be edited' }
    }

    if (currentStatus === 'FORWARDED') {
      return {
        status: 'error',
        message: 'This installment is forwarded to a pending reconnection and cannot be edited. Cancel that reconnection first if changes are needed.',
      }
    }

    // Paused plans came from a disconnected meter account — don't allow
    // moving the plan to a different meter account while paused.
    if (currentStatus === 'PAUSED' && meter_account_id) {
      return { status: 'error', message: 'Cannot reassign the meter account of a paused installment plan' }
    }

    const updates: any = {}

    if (meter_account_id) {
      updates.meter_account_id = meter_account_id
    }

    if (status_code) {
      const statusId = await getInstallmentStatusId(supabase, status_code)
      if (!statusId) {
        return { status: 'error', message: `Status "${status_code}" not found in installment_status table` }
      }
      updates.status_id = statusId
    }

    const { error } = await supabase
      .from('meter_installments')
      .update(updates)
      .eq('installment_id', installment_id)

    if (error) {
      console.error('[updateMeterInstallment]', error)
      return { status: 'error', message: error.message }
    }

    return { status: 'success', data: null, message: 'Installment plan updated' }
  } catch (err) {
    console.error('[updateMeterInstallment]', err)
    return { status: 'error', message: 'Failed to update installment plan' }
  }
}

// ============================================================================
// CANCEL — Cancel installment plan (only if status is PENDING)
// ============================================================================

export async function cancelMeterInstallment(
  installmentId: string,
): Promise<ActionResult<null>> {
  const supabase = await createClient()

  try {
    // Get the current installment
    const { data: installment, error: fetchError } = await supabase
      .from('meter_installments')
      .select('status_id, installment_status:status_id ( status_code )')
      .eq('installment_id', installmentId)
      .single()

    if (fetchError || !installment) {
      return { status: 'error', message: 'Installment plan not found' }
    }

    const status = installment.installment_status as any
    const currentStatusCode = status?.status_code ?? ''

    // Only allow cancellation if status is PENDING
    if (currentStatusCode !== 'PENDING') {
      return { status: 'error', message: 'Only pending installment plans can be cancelled' }
    }

    // Get CANCELLED status ID
    const cancelledStatusId = await getInstallmentStatusId(supabase, 'CANCELLED')
    if (!cancelledStatusId) {
      return { status: 'error', message: 'CANCELLED status not found in installment_status table' }
    }

    // Update the installment status to CANCELLED
    const { error: updateError } = await supabase
      .from('meter_installments')
      .update({
        status_id: cancelledStatusId,
        updated_at: new Date().toISOString(),
      })
      .eq('installment_id', installmentId)

    if (updateError) {
      console.error('[cancelMeterInstallment]', updateError)
      return { status: 'error', message: updateError.message }
    }

    return {
      status: 'success',
      data: null,
      message: 'Installment plan cancelled successfully'
    }
  } catch (err) {
    console.error('[cancelMeterInstallment]', err)
    return { status: 'error', message: 'Failed to cancel installment plan' }
  }
}

// ============================================================================
// PAUSE — Pause an installment plan because its meter account was
// disconnected (Pending/Replacing/Defective/Stolen etc). Only allowed while
// the plan is currently ACTIVE. The plan itself is untouched (balance,
// schedule, charges) — it simply stops being counted as an active,
// in-progress plan until an admin reactivates it via Edit plan.
// ============================================================================

export async function pauseMeterInstallment(
  installmentId: string,
): Promise<ActionResult<null>> {
  const supabase = await createClient()

  try {
    const { data: installment, error: fetchError } = await supabase
      .from('meter_installments')
      .select('status_id, installment_status:status_id ( status_code )')
      .eq('installment_id', installmentId)
      .single()

    if (fetchError || !installment) {
      return { status: 'error', message: 'Installment plan not found' }
    }

    const currentStatusCode = (installment.installment_status as any)?.status_code ?? ''
    if (currentStatusCode !== 'ACTIVE') {
      return { status: 'error', message: 'Only active installment plans can be paused' }
    }

    const pausedStatusId = await getInstallmentStatusId(supabase, 'PAUSED')
    if (!pausedStatusId) {
      return { status: 'error', message: 'PAUSED status not found in installment_status table' }
    }

    const { error: updateError } = await supabase
      .from('meter_installments')
      .update({
        status_id: pausedStatusId,
        updated_at: new Date().toISOString(),
      })
      .eq('installment_id', installmentId)

    if (updateError) {
      console.error('[pauseMeterInstallment]', updateError)
      return { status: 'error', message: updateError.message }
    }

    return {
      status: 'success',
      data: null,
      message: 'Installment plan paused (meter account disconnected)',
    }
  } catch (err) {
    console.error('[pauseMeterInstallment]', err)
    return { status: 'error', message: 'Failed to pause installment plan' }
  }
}

// ============================================================================
// GET — all installment statuses (for dropdown)
// ============================================================================

export async function getInstallmentStatuses(): Promise<{
  status: 'success' | 'error'
  data?: { status_id: string; status_code: string; description: string }[]
  message?: string
}> {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from('installment_status')
      .select('installment_status_id, status_code, description')
      .order('status_code', { ascending: true })

    if (error) {
      console.error('[getInstallmentStatuses]', error)
      return { status: 'error', message: error.message }
    }

    const mappedData = (data ?? []).map((item: any) => ({
      status_id: item.installment_status_id,
      status_code: item.status_code,
      description: item.description,
    }))

    return { status: 'success', data: mappedData }
  } catch (err) {
    console.error('[getInstallmentStatuses]', err)
    return { status: 'error', message: 'Failed to fetch installment statuses' }
  }
}