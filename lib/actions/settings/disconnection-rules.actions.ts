'use server'

import { createClient } from '@/lib/supabase/server'

export interface DisconnectionRuleRecord {
  rule_id:           string
  min_balance:       number | null
  min_unpaid_months: number | null
  created_at:        string
}

type ActionResult<T> =
  | { status: 'success'; data: T;         message?: string }
  | { status: 'error';   data?: undefined; message: string }

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