'use server'

import { createClient } from '@/lib/supabase/server'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PenaltyRateRecord {
  penalty_rate_id: string
  penalty_rate:    number
  created_at:      string
}

export interface MeterPriceRecord {
  meter_price_id: string
  unit_price:     number
  monthly_amount: number
  updated_by:     string | null
  created_at:     string
  updated_at:     string
}

export interface DisconnectionRuleRecord {
  rule_id:           string
  min_balance:       number | null
  min_unpaid_months: number | null
  created_at:        string
}

type ActionResult<T> =
  | { status: 'success'; data: T;         message?: string }
  | { status: 'error';   data?: undefined; message: string }

// ─── Penalty Rates ────────────────────────────────────────────────────────────

export async function getPenaltyRates(): Promise<ActionResult<PenaltyRateRecord[]>> {
  const supabase = await createClient()
  try {
    const { data, error } = await supabase
      .from('penalty_rate')
      .select('penalty_rate_id, penalty_rate, created_at')
      .order('created_at', { ascending: true })

    if (error) throw error
    return { status: 'success', data: data ?? [] }
  } catch (err) {
    console.error('getPenaltyRates:', err)
    return { status: 'error', message: 'Failed to fetch penalty rates' }
  }
}

export async function updatePenaltyRate(
  penaltyRateId: string,
  newRate: number,
): Promise<ActionResult<PenaltyRateRecord>> {
  const supabase = await createClient()
  try {
    const { data, error } = await supabase
      .from('penalty_rate')
      .update({ penalty_rate: newRate })
      .eq('penalty_rate_id', penaltyRateId)
      .select('penalty_rate_id, penalty_rate, created_at')
      .single()

    if (error) throw error
    return { status: 'success', data }
  } catch (err) {
    console.error('updatePenaltyRate:', err)
    return { status: 'error', message: 'Failed to update penalty rate' }
  }
}

// ─── Meter Price ──────────────────────────────────────────────────────────────

export async function getMeterPrice(): Promise<ActionResult<MeterPriceRecord>> {
  const supabase = await createClient()
  try {
    const { data, error } = await supabase
      .from('meter_price')
      .select('meter_price_id, unit_price, monthly_amount, updated_by, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error
    if (!data) return { status: 'error', message: 'No meter price configuration found' }
    return { status: 'success', data }
  } catch (err) {
    console.error('getMeterPrice:', err)
    return { status: 'error', message: 'Failed to fetch meter price' }
  }
}

export async function updateMeterPrice(
  meterPriceId: string,
  unitPrice: number,
  monthlyAmount: number,
): Promise<ActionResult<MeterPriceRecord>> {
  const supabase = await createClient()
  try {
    const { data: { user } } = await supabase.auth.getUser()

    const { data, error } = await supabase
      .from('meter_price')
      .update({
        unit_price:     unitPrice,
        monthly_amount: monthlyAmount,
        updated_by:     user?.id ?? null,
        updated_at:     new Date().toISOString(),
      })
      .eq('meter_price_id', meterPriceId)
      .select('meter_price_id, unit_price, monthly_amount, updated_by, created_at, updated_at')
      .single()

    if (error) throw error
    return { status: 'success', data }
  } catch (err) {
    console.error('updateMeterPrice:', err)
    return { status: 'error', message: 'Failed to update meter price' }
  }
}

// ─── Disconnection Rules ──────────────────────────────────────────────────────

export async function getDisconnectionRules(): Promise<ActionResult<DisconnectionRuleRecord>> {
  const supabase = await createClient()
  try {
    const { data, error } = await supabase
      .from('disconnection_rules')
      .select('rule_id, min_balance, min_unpaid_months, created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error
    if (!data) return { status: 'error', message: 'No disconnection rule found' }
    return { status: 'success', data }
  } catch (err) {
    console.error('getDisconnectionRules:', err)
    return { status: 'error', message: 'Failed to fetch disconnection rules' }
  }
}

export async function updateDisconnectionRule(
  ruleId: string,
  minBalance: number,
  minUnpaidMonths: number,
): Promise<ActionResult<DisconnectionRuleRecord>> {
  const supabase = await createClient()
  try {
    const { data, error } = await supabase
      .from('disconnection_rules')
      .update({ min_balance: minBalance, min_unpaid_months: minUnpaidMonths })
      .eq('rule_id', ruleId)
      .select('rule_id, min_balance, min_unpaid_months, created_at')
      .single()

    if (error) throw error
    return { status: 'success', data }
  } catch (err) {
    console.error('updateDisconnectionRule:', err)
    return { status: 'error', message: 'Failed to update disconnection rule' }
  }
}