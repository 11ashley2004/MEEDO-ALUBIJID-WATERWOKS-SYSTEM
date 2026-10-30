'use server'

import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

export interface MeterPriceRecord {
  meter_price_id: string
  unit_price:     number
  monthly_amount: number
  updated_by:     string | null
  created_at:     string
  updated_at:     string
}

type ActionResult<T> =
  | { status: 'success'; data: T;         message?: string }
  | { status: 'error';   data?: undefined; message: string; errors?: z.ZodIssue[] }

// ─── Validation schema ──────────────────────────────────────────────────────

const UpdateMeterPriceSchema = z.object({
  unit_price: z.number().min(0, 'Unit price must be a non-negative number'),
  monthly_amount: z.number().min(0, 'Monthly amount must be a non-negative number'),
}).refine(
  (data) => data.monthly_amount <= data.unit_price,
  {
    message: 'Monthly amount cannot exceed unit price',
    path: ['monthly_amount'],
  }
)

// ─── Get meter price ───────────────────────────────────────────────────────

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

// ─── Update meter price with validation ────────────────────────────────────

export async function updateMeterPrice(
  meterPriceId: string,
  unitPrice: number,
  monthlyAmount: number,
): Promise<ActionResult<MeterPriceRecord>> {
  const supabase = await createClient()
  
  try {
    // ─── Validate inputs ────────────────────────────────────────────────────
    const validated = UpdateMeterPriceSchema.parse({
      unit_price: unitPrice,
      monthly_amount: monthlyAmount,
    })

    // ─── Check if record exists ────────────────────────────────────────────
    const { data: existing, error: checkError } = await supabase
      .from('meter_price')
      .select('meter_price_id')
      .eq('meter_price_id', meterPriceId)
      .single()

    if (checkError || !existing) {
      return { 
        status: 'error', 
        message: 'Meter price configuration not found' 
      }
    }

    // ─── Get current user ──────────────────────────────────────────────────
    const { data: { user } } = await supabase.auth.getUser()

    // ─── Update the record ─────────────────────────────────────────────────
    const { data, error } = await supabase
      .from('meter_price')
      .update({
        unit_price:     validated.unit_price,
        monthly_amount: validated.monthly_amount,
        updated_by:     user?.id ?? null,
        updated_at:     new Date().toISOString(),
      })
      .eq('meter_price_id', meterPriceId)
      .select('meter_price_id, unit_price, monthly_amount, updated_by, created_at, updated_at')
      .single()

    if (error) throw error
    
    return { 
      status: 'success', 
      data,
      message: 'Meter price updated successfully' 
    }

  } catch (err) {
    // ─── Handle validation errors ─────────────────────────────────────────
    if (err instanceof z.ZodError) {
      // ZodError uses 'issues' property in newer versions
      const issues = err.issues
      return {
        status: 'error',
        message: issues.map((e: z.ZodIssue) => e.message).join(', '),
        errors: issues
      }
    }

    console.error('updateMeterPrice:', err)
    return { 
      status: 'error', 
      message: 'Failed to update meter price' 
    }
  }
}