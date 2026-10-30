'use server'

import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

export interface PenaltyRateRecord {
  penalty_rate_id: string
  penalty_rate:    number
  created_at:      string
}

type ActionResult<T> =
  | { status: 'success'; data: T;         message?: string }
  | { status: 'error';   data?: undefined; message: string; errors?: z.ZodIssue[] }

// ─── Validation schema ──────────────────────────────────────────────────────

const UpdatePenaltyRateSchema = z.object({
  penalty_rate: z.number()
    .min(0.01, 'Penalty rate must be greater than 0')
    .max(100, 'Penalty rate cannot exceed 100%')
})

// ─── Get penalty rates ─────────────────────────────────────────────────────

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

// ─── Update penalty rate with validation ───────────────────────────────────

export async function updatePenaltyRate(
  penaltyRateId: string,
  newRate: number,
): Promise<ActionResult<PenaltyRateRecord>> {
  const supabase = await createClient()
  
  try {
    // ─── Validate input ──────────────────────────────────────────────────────
    const validated = UpdatePenaltyRateSchema.parse({
      penalty_rate: newRate,
    })

    // ─── Check if record exists ────────────────────────────────────────────
    const { data: existing, error: checkError } = await supabase
      .from('penalty_rate')
      .select('penalty_rate_id')
      .eq('penalty_rate_id', penaltyRateId)
      .single()

    if (checkError || !existing) {
      return { 
        status: 'error', 
        message: 'Penalty rate configuration not found' 
      }
    }

    // ─── Update the record ──────────────────────────────────────────────────
    const { data, error } = await supabase
      .from('penalty_rate')
      .update({ penalty_rate: validated.penalty_rate })
      .eq('penalty_rate_id', penaltyRateId)
      .select('penalty_rate_id, penalty_rate, created_at')
      .single()

    if (error) throw error
    
    return { 
      status: 'success', 
      data,
      message: 'Penalty rate updated successfully' 
    }

  } catch (err) {
    // ─── Handle validation errors ─────────────────────────────────────────
    if (err instanceof z.ZodError) {
      const issues = err.issues
      return {
        status: 'error',
        message: issues.map((e: z.ZodIssue) => e.message).join(', '),
        errors: issues
      }
    }

    console.error('updatePenaltyRate:', err)
    return { 
      status: 'error', 
      message: 'Failed to update penalty rate' 
    }
  }
}