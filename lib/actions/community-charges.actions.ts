'use server'

import { createClient } from '@/lib/supabase/server'
import { createAuditLog } from './audit.action'

// ============================================================================
// Types
// ============================================================================

export interface TierInput {
  community_charge_id?: string
  min_consumption:      number
  max_consumption:      number | null
  multiplier:           number
}

export interface ClassificationSummary {
  classification_id:   string
  classification_name: string
  description:         string | null
  tier_count:          number
  range_min:           number | null
  range_max:           number | null
  multiplier_min:      number | null
  multiplier_max:      number | null
}

export interface TierDetail {
  community_charge_id: string
  classification_id:   string
  min_consumption:     number
  max_consumption:     number | null
  multiplier:          number
  created_at:          string
  updated_at?:         string
}

export interface ClassificationDetail {
  classification_id:   string
  classification_name: string
  description:         string | null
}

type ActionResult<T> =
  | { status: 'success'; data: T }
  | { status: 'error';   message: string }

type UpsertResult =
  | { status: 'success' }
  | { status: 'error'; message: string }

// ============================================================================
// GET — All classifications with their charge summary (one row per class)
// Used by the main table page.
// ============================================================================

export async function getClassificationsWithChargeSummary(): Promise<
  ActionResult<ClassificationSummary[]>
> {
  const supabase = await createClient()

  try {
    const { data: classifications, error: classError } = await supabase
      .from('classifications')
      .select('classification_id, classification_name, description')
      .order('classification_name', { ascending: true })

    if (classError) throw classError

    const { data: charges, error: chargeError } = await supabase
      .from('community_charges')
      .select(
        'community_charge_id, classification_id, min_consumption, max_consumption, multiplier, created_at'
      )
      .order('min_consumption', { ascending: true })

    if (chargeError) throw chargeError

    // Group charges by classification_id
    const chargesByClass = new Map<string, typeof charges>()
    for (const charge of charges ?? []) {
      const existing = chargesByClass.get(charge.classification_id) ?? []
      existing.push(charge)
      chargesByClass.set(charge.classification_id, existing)
    }

    const result: ClassificationSummary[] = (classifications ?? []).map((cls) => {
      const tiers      = chargesByClass.get(cls.classification_id) ?? []
      const tierCount  = tiers.length
      const minVal     = tiers.length > 0 ? Math.min(...tiers.map((t) => t.min_consumption)) : null
      const maxTier    = tiers.find((t) => t.max_consumption === null)
      const maxVal     = maxTier
        ? null
        : tiers.length > 0
          ? Math.max(...tiers.map((t) => t.max_consumption ?? 0))
          : null
      const multipliers    = tiers.map((t) => t.multiplier)
      const minMultiplier  = multipliers.length > 0 ? Math.min(...multipliers) : null
      const maxMultiplier  = multipliers.length > 0 ? Math.max(...multipliers) : null

      return {
        classification_id:   cls.classification_id,
        classification_name: cls.classification_name,
        description:         cls.description,
        tier_count:          tierCount,
        range_min:           minVal,
        range_max:           maxVal,
        multiplier_min:      minMultiplier,
        multiplier_max:      maxMultiplier,
      }
    })

    return { status: 'success', data: result }
  } catch (error) {
    console.error('[getClassificationsWithChargeSummary]', error)
    return { status: 'error', message: 'Failed to fetch classification summaries.' }
  }
}

// ============================================================================
// GET — All tiers for a single classification (view / edit sheet)
// Returns tiers sorted by min_consumption ascending.
// ============================================================================

export async function getChargesByClassification(
  classificationId: string
): Promise<ActionResult<{ classification: ClassificationDetail; tiers: TierDetail[] }>> {
  const supabase = await createClient()

  try {
    const [chargesRes, clsRes] = await Promise.all([
      supabase
        .from('community_charges')
        .select(
          'community_charge_id, classification_id, min_consumption, max_consumption, multiplier, created_at, updated_at'
        )
        .eq('classification_id', classificationId)
        .order('min_consumption', { ascending: true }),
      supabase
        .from('classifications')
        .select('classification_id, classification_name, description')
        .eq('classification_id', classificationId)
        .single(),
    ])

    if (chargesRes.error) throw chargesRes.error
    if (clsRes.error)     throw clsRes.error

    return {
      status: 'success',
      data: {
        classification: clsRes.data as ClassificationDetail,
        tiers:          (chargesRes.data ?? []) as TierDetail[],
      },
    }
  } catch (error) {
    console.error('[getChargesByClassification]', error)
    return { status: 'error', message: 'Failed to fetch charges for this classification.' }
  }
}

// ============================================================================
// GET — Single community charge by ID
// ============================================================================

export async function getCommunityChargeById(
  chargeId: string
): Promise<ActionResult<TierDetail & { classifications: ClassificationDetail }>> {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from('community_charges')
      .select(`*, classifications (classification_id, classification_name, description)`)
      .eq('community_charge_id', chargeId)
      .single()

    if (error) throw error
    return { status: 'success', data: data as TierDetail & { classifications: ClassificationDetail } }
  } catch (error) {
    console.error('[getCommunityChargeById]', error)
    return { status: 'error', message: 'Failed to fetch community charge.' }
  }
}

// ============================================================================
// GET — All community charges with pagination + search + filter
// ============================================================================

export async function getAllCommunityCharges({
  page             = 1,
  pageSize         = 10,
  search           = '',
  classificationId = 'all',
}: {
  page?:             number
  pageSize?:         number
  search?:           string
  classificationId?: string
}): Promise<{ data: (TierDetail & { classifications: ClassificationDetail })[]; totalCount: number }> {
  const supabase = await createClient()
  const from     = (page - 1) * pageSize
  const to       = from + pageSize - 1

  try {
    let query = supabase
      .from('community_charges')
      .select(
        `*, classifications!inner (classification_id, classification_name, description)`,
        { count: 'exact' }
      )

    if (classificationId !== 'all') {
      query = query.eq('classification_id', classificationId)
    }

    if (search) {
      query = query.or(
        `multiplier.cast.text.ilike.%${search}%,classifications.classification_name.ilike.%${search}%`
      )
    }

    const { data, error, count } = await query
      .order('min_consumption', { ascending: true })
      .range(from, to)

    if (error) throw error

    return {
      data:       (data ?? []) as (TierDetail & { classifications: ClassificationDetail })[],
      totalCount: count ?? 0,
    }
  } catch (error) {
    console.error('[getAllCommunityCharges]', error)
    throw new Error('Failed to fetch community charges.')
  }
}

// ============================================================================
// GET — Charges for a classification (join version, for compatibility)
// ============================================================================

export async function getCommunityChargesByClassification(
  classificationId: string
): Promise<ActionResult<(TierDetail & { classifications: ClassificationDetail })[]>> {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from('community_charges')
      .select(`*, classifications (classification_id, classification_name, description)`)
      .eq('classification_id', classificationId)
      .order('min_consumption', { ascending: true })

    if (error) throw error
    return {
      status: 'success',
      data:   (data ?? []) as (TierDetail & { classifications: ClassificationDetail })[],
    }
  } catch (error) {
    console.error('[getCommunityChargesByClassification]', error)
    return { status: 'error', message: 'Failed to fetch community charges.' }
  }
}

// ============================================================================
// UPSERT — Save ALL tiers for a classification at once (delete + re-insert)
//
// Validation:
//   1. At least one tier required
//   2. Sort by min_consumption
//   3. Only last tier may have null max_consumption
//   4. No negative min values
//   5. max > min for each tier
//   6. multiplier > 0 for each tier
//   7. Contiguous chain: each tier's min === prev tier's max + 1
// ============================================================================

export async function upsertClassificationTiers(
  classificationId: string,
  tiers: TierInput[]
): Promise<UpsertResult> {
  const supabase = await createClient()

  try {
    // Auth check
    const {
      data: { user: actorUser },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !actorUser) {
      return { status: 'error', message: 'Unauthorized. Please sign in again.' }
    }

    // ── 1. Require at least one tier ─────────────────────────────────────────
    if (!tiers || tiers.length === 0) {
      return { status: 'error', message: 'At least one tier is required.' }
    }

    // ── 2. Sort by min_consumption ────────────────────────────────────────────
    const sorted = [...tiers].sort((a, b) => a.min_consumption - b.min_consumption)

    // ── 3. Only last tier may have null max ───────────────────────────────────
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].max_consumption === null) {
        return {
          status:  'error',
          message: `Tier ${i + 1} has no maximum but is not the last tier. Only the last tier can be unbounded.`,
        }
      }
    }

    // ── 4–7. Per-tier field validation + contiguous chain ────────────────────
    for (let i = 0; i < sorted.length; i++) {
      const tier = sorted[i]

      if (tier.min_consumption < 0) {
        return {
          status:  'error',
          message: `Tier ${i + 1}: minimum consumption cannot be negative.`,
        }
      }

      if (tier.max_consumption !== null && tier.max_consumption <= tier.min_consumption) {
        return {
          status:  'error',
          message: `Tier ${i + 1}: maximum (${tier.max_consumption}) must be greater than minimum (${tier.min_consumption}).`,
        }
      }

      if (tier.multiplier <= 0) {
        return {
          status:  'error',
          message: `Tier ${i + 1}: rate must be greater than 0.`,
        }
      }

      if (i > 0) {
        const prevMax = sorted[i - 1].max_consumption!
        if (tier.min_consumption !== prevMax + 1) {
          return {
            status:  'error',
            message: `Tier ${i + 1}: minimum (${tier.min_consumption}) must equal previous tier's maximum + 1 (${prevMax + 1}). Tiers must be contiguous.`,
          }
        }
      }
    }

    // ── Fetch classification name for audit log ───────────────────────────────
    const { data: cls } = await supabase
      .from('classifications')
      .select('classification_name')
      .eq('classification_id', classificationId)
      .single()

    // ── Delete all existing tiers for this classification ─────────────────────
    const { error: deleteError } = await supabase
      .from('community_charges')
      .delete()
      .eq('classification_id', classificationId)

    if (deleteError) throw deleteError

    // ── Insert the full new set ───────────────────────────────────────────────
    const rows = sorted.map((tier) => ({
      classification_id: classificationId,
      min_consumption:   tier.min_consumption,
      max_consumption:   tier.max_consumption,
      multiplier:        tier.multiplier,
    }))

    const { data: inserted, error: insertError } = await supabase
      .from('community_charges')
      .insert(rows)
      .select('community_charge_id')

    if (insertError) throw insertError

    // ── Audit log ─────────────────────────────────────────────────────────────
    await createAuditLog(
      actorUser.id,
      'UPSERT',
      `Saved ${sorted.length} tier(s) for classification "${cls?.classification_name ?? classificationId}"`,
      'community_charges',
      inserted?.[0]?.community_charge_id
    )

    return { status: 'success' }
  } catch (error) {
    console.error('[upsertClassificationTiers]', error)
    return { status: 'error', message: 'Failed to save tiers. Please try again.' }
  }
}

// ============================================================================
// UPDATE — Single charge fields (kept for backward compatibility)
// ============================================================================

export async function updateCommunityCharge(
  chargeId:   string,
  chargeData: {
    classification_id?: string
    min_consumption?:   number
    max_consumption?:   number | null
    multiplier?:        number
  }
): Promise<ActionResult<TierDetail & { classifications: ClassificationDetail }>> {
  const supabase = await createClient()

  try {
    const [originalRes, userRes] = await Promise.all([
      supabase
        .from('community_charges')
        .select(`*, classifications (classification_name)`)
        .eq('community_charge_id', chargeId)
        .single(),
      supabase.auth.getUser(),
    ])

    if (originalRes.error) throw originalRes.error

    const { data, error } = await supabase
      .from('community_charges')
      .update({ ...chargeData, updated_at: new Date().toISOString() })
      .eq('community_charge_id', chargeId)
      .select(`*, classifications (classification_id, classification_name, description)`)
      .single()

    if (error) throw error

    const actorUser = userRes.data.user
    if (actorUser && originalRes.data) {
      const changes = Object.keys(chargeData)
        .map((key) => `${key}: updated`)
        .join(', ')
      await createAuditLog(
        actorUser.id,
        'UPDATE',
        `Updated community charge for ${(originalRes.data as any).classifications?.classification_name}: ${changes}`,
        'community_charges',
        chargeId
      )
    }

    return {
      status: 'success',
      data:   data as TierDetail & { classifications: ClassificationDetail },
    }
  } catch (error) {
    console.error('[updateCommunityCharge]', error)
    return { status: 'error', message: 'Failed to update community charge.' }
  }
}

// ============================================================================
// DELETE — All tiers for a classification
// ============================================================================

export async function deleteClassificationTiers(
  classificationId: string
): Promise<UpsertResult> {
  const supabase = await createClient()

  try {
    const {
      data: { user: actorUser },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !actorUser) {
      return { status: 'error', message: 'Unauthorized. Please sign in again.' }
    }

    const { data: cls } = await supabase
      .from('classifications')
      .select('classification_name')
      .eq('classification_id', classificationId)
      .single()

    const { error: deleteError } = await supabase
      .from('community_charges')
      .delete()
      .eq('classification_id', classificationId)

    if (deleteError) throw deleteError

    await createAuditLog(
      actorUser.id,
      'DELETE',
      `Deleted all tiers for classification "${cls?.classification_name ?? classificationId}"`,
      'community_charges',
      classificationId
    )

    return { status: 'success' }
  } catch (error) {
    console.error('[deleteClassificationTiers]', error)
    return { status: 'error', message: 'Failed to delete tiers.' }
  }
}