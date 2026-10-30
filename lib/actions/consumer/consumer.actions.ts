'use server'

import { createClient } from '@/lib/supabase/server'
import { createServerClient } from '@/lib/supabase/serverClient'
import { createAuditLog } from '../audit.action'

// ============================================================================
// Types
// ============================================================================

// Consumer as returned to the client — no password field ever
export interface Consumer {
  consumer_id: string
  contract_no: string
  account_name: string
  email: string
  contact_number: string | null
  is_active: boolean
  last_active: string | null
  is_default_password: boolean
  is_email_verified: boolean
  registered_by: string | null
  updated_at: string
  created_at: string
}

// Alias kept for backward compatibility
export type ConsumerRow = Consumer

// Payload for creating a new consumer
export interface CreateConsumerData {
  account_name: string
  email: string
  contact_number: string
}

// Payload for updating an existing consumer
export interface UpdateConsumerData {
  account_name?: string
  email?: string
  contact_number?: string
}

// Standard action response shape
type ActionResult<T = null> =
  | { status: 'success'; data: T; message?: string }
  | { status: 'error'; message: string }

// ── Safe column list (never includes password) ────────────────────────────────
const SAFE_COLUMNS = `
  consumer_id, contract_no, account_name,
  email, contact_number, is_active, last_active,
  is_default_password, is_email_verified,
  registered_by, updated_at, created_at
` as const

// ============================================================================
// Helpers — uniqueness checks
// ============================================================================

/** Format: ##-####-#####  (e.g. 11-2222-11111) */
const CONTRACT_NO_RE = /^\d{2}-\d{4}-\d{5}$/

function formatContractNo(seq: number): string {
  const digits = String(Math.max(1, seq)).padStart(11, '0').slice(-11)
  return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 11)}`
}

function parseContractNoSeq(contractNo: string): number | null {
  if (!CONTRACT_NO_RE.test(contractNo)) return null
  const n = Number(contractNo.replace(/-/g, ''))
  return Number.isFinite(n) ? n : null
}

async function generateContractNo(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string> {
  const { data, error } = await supabase
    .from('consumers')
    .select('contract_no')
    .not('contract_no', 'is', null)

  if (error) {
    console.error('[generateContractNo]', error)
    throw new Error('Failed to generate contract number')
  }

  let maxSeq = 0
  for (const row of data ?? []) {
    const seq = parseContractNoSeq(row.contract_no)
    if (seq != null && seq > maxSeq) maxSeq = seq
  }

  return formatContractNo(maxSeq + 1)
}

async function isEmailUnique(email: string, excludeId?: string): Promise<boolean> {
  if (!email?.trim()) return true
  const supabase = await createClient()
  let q = supabase.from('consumers').select('consumer_id').ilike('email', email.trim())
  if (excludeId) q = q.neq('consumer_id', excludeId)
  const { data } = await q.maybeSingle()
  return !data
}

async function isContactUnique(contact: string, excludeId?: string): Promise<boolean> {
  if (!contact?.trim()) return true
  const supabase = await createClient()
  let q = supabase.from('consumers').select('consumer_id').eq('contact_number', contact.trim())
  if (excludeId) q = q.neq('consumer_id', excludeId)
  const { data } = await q.maybeSingle()
  return !data
}

// Check if email already exists in Supabase Auth
async function isEmailExistsInAuth(email: string): Promise<boolean> {
  const adminSupabase = createServerClient()

  try {
    // Try to get user by email using admin API
    const { data, error } = await adminSupabase.auth.admin.listUsers()

    if (error) {
      console.error('[isEmailExistsInAuth] Error listing users:', error)
      return false
    }

    const existingUser = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase())
    return !!existingUser
  } catch (err) {
    console.error('[isEmailExistsInAuth] Unexpected error:', err)
    return false
  }
}

// ============================================================================
// GET — all consumers
// ============================================================================

export async function getAllConsumers(): Promise<Consumer[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('consumers')
    .select(SAFE_COLUMNS)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[getAllConsumers]', error)
    throw new Error('Failed to fetch consumers')
  }

  return data ?? []
}

// ============================================================================
// GET — single consumer by ID
// ============================================================================

export async function getConsumerById(consumerId: string): Promise<Consumer | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('consumers')
    .select(SAFE_COLUMNS)
    .eq('consumer_id', consumerId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    console.error('[getConsumerById]', error)
    throw new Error('Failed to fetch consumer')
  }

  return data
}

// ============================================================================
// CREATE — register a new consumer
// ============================================================================

export async function createConsumer(
  payload: CreateConsumerData,
): Promise<ActionResult<Consumer>> {
  const supabase = await createClient()
  const adminSupabase = createServerClient()

  try {
    const { data: { user: actor } } = await supabase.auth.getUser()

    if (!payload.account_name?.trim()) {
      return { status: 'error', message: 'Account name is required.' }
    }

    const normalizedEmail = payload.email?.trim() || ''
    if (!normalizedEmail) {
      return { status: 'error', message: 'Email is required.' }
    }
    if (normalizedEmail.length > 200) {
      return { status: 'error', message: 'Email must be at most 200 characters.' }
    }
    const normalizedContact = payload.contact_number?.trim() || ''
    if (!normalizedContact) {
      return { status: 'error', message: 'Contact number is required.' }
    }
    if (normalizedContact.length > 200) {
      return { status: 'error', message: 'Contact number must be at most 200 characters.' }
    }

    const emailOk = await isEmailUnique(normalizedEmail)
    if (!emailOk) {
      return { status: 'error', message: `A consumer with email "${normalizedEmail}" already exists.` }
    }

    const contactOk = await isContactUnique(normalizedContact)
    if (!contactOk) {
      return { status: 'error', message: `A consumer with contact number "${normalizedContact}" already exists.` }
    }

    const existsInAuth = await isEmailExistsInAuth(normalizedEmail)
    if (existsInAuth) {
      return { status: 'error', message: `Email is already registered in the system.` }
    }

    const contractNo = await generateContractNo(supabase)

    const { data: newConsumer, error: insertError } = await supabase
      .from('consumers')
      .insert({
        contract_no: contractNo,
        account_name: payload.account_name.trim(),
        email: normalizedEmail,
        contact_number: normalizedContact,
        registered_by: actor?.id ?? null,
      })
      .select(SAFE_COLUMNS)
      .single()

    if (insertError) {
      console.error('[createConsumer] insert:', insertError)
      return { status: 'error', message: insertError.message }
    }

    const { error: authError } = await adminSupabase.auth.admin.createUser({
      id: newConsumer.consumer_id,
      email: normalizedEmail,
      password: 'consumer123',
      email_confirm: false,
      user_metadata: {
        full_name: payload.account_name,
        account_name: payload.account_name,
        contract_no: contractNo,
        role: 'consumer',
      },
    })

    if (authError) {
      await supabase.from('consumers').delete().eq('consumer_id', newConsumer.consumer_id)

      if (authError.message.toLowerCase().includes('already registered') ||
          authError.message.toLowerCase().includes('already exists')) {
        return { status: 'error', message: `Email already exists in the system.` }
      }
      return { status: 'error', message: authError.message }
    }

    if (actor) {
      await createAuditLog(
        actor.id,
        'CREATE',
        `Registered consumer: ${payload.account_name}`,
        'consumers',
        newConsumer.consumer_id,
      )
    }

    return { status: 'success', data: newConsumer, message: 'Consumer registered successfully' }
  } catch (err) {
    console.error('[createConsumer]', err)
    return { status: 'error', message: 'Failed to register consumer' }
  }
}

// ============================================================================
// UPDATE — edit consumer details
// ============================================================================
async function isConsumerRegisteredInAuth(consumerId: string): Promise<boolean> {
  const adminSupabase = createServerClient()
  try {
    const { data, error } = await adminSupabase.auth.admin.getUserById(consumerId)
    if (error) return false
    return !!data?.user
  } catch (err) {
    console.error('[isConsumerRegisteredInAuth]', err)
    return false
  }
}

export async function updateConsumer(
  consumerId: string,
  payload: UpdateConsumerData,
): Promise<ActionResult<Consumer>> {
  const supabase = await createClient()
  const adminSupabase = createServerClient()

  try {
    const { data: { user: actor } } = await supabase.auth.getUser()

    const existing = await getConsumerById(consumerId)
    if (!existing) return { status: 'error', message: 'Consumer not found' }

    // ── Validation ──────────────────────────────────────────────────────────
    // Mirror the client schema so a direct call can't bypass the rules.

    // Account name — required when provided, trimmed length 1..255
    if (payload.account_name !== undefined) {
      const trimmed = payload.account_name?.trim() ?? ''
      if (!trimmed) {
        return { status: 'error', message: 'Account name is required.' }
      }
      if (trimmed.length > 255) {
        return { status: 'error', message: 'Account name must be at most 255 characters.' }
      }
    }

    // Email — required when provided; cannot be cleared
    let normalizedEmail: string | undefined = undefined
    if (payload.email !== undefined) {
      const trimmed = payload.email?.trim() ?? ''
      if (!trimmed) {
        return { status: 'error', message: 'Email is required.' }
      }
      if (trimmed.length > 200) {
        return { status: 'error', message: 'Email must be at most 200 characters.' }
      }
      normalizedEmail = trimmed
    }

    // Contact number — required when provided; cannot be cleared
    let normalizedContact: string | undefined = undefined
    if (payload.contact_number !== undefined) {
      const trimmed = payload.contact_number?.trim() ?? ''
      if (!trimmed) {
        return { status: 'error', message: 'Contact number is required.' }
      }
      if (trimmed.length > 200) {
        return { status: 'error', message: 'Contact number must be at most 200 characters.' }
      }
      normalizedContact = trimmed
    }

    // ── Uniqueness checks ───────────────────────────────────────────────────
    // account_name is intentionally not unique (duplicate names allowed).

    // Check email uniqueness in consumers table
    if (normalizedEmail && normalizedEmail !== existing.email) {
      const ok = await isEmailUnique(normalizedEmail, consumerId)
      if (!ok) return { status: 'error', message: `A consumer with email "${normalizedEmail}" already exists.` }

      // Check if the new email already exists in Auth
      const existsInAuth = await isEmailExistsInAuth(normalizedEmail)
      if (existsInAuth) {
        return { status: 'error', message: `Email "${normalizedEmail}" is already registered in the system.` }
      }
    }

    if (normalizedContact && normalizedContact !== existing.contact_number) {
      const ok = await isContactUnique(normalizedContact, consumerId)
      if (!ok) return { status: 'error', message: `A consumer with contact number "${normalizedContact}" already exists.` }
    }

    // ── Update consumer in database ─────────────────────────────────────────
    const { data: updated, error } = await supabase
      .from('consumers')
      .update({
        ...(payload.account_name !== undefined && { account_name: payload.account_name.trim() }),
        ...(normalizedEmail !== undefined && { email: normalizedEmail }),
        ...(normalizedContact !== undefined && { contact_number: normalizedContact }),
        updated_at: new Date().toISOString(),
      })
      .eq('consumer_id', consumerId)
      .select(SAFE_COLUMNS)
      .single()

    if (error) {
      console.error('[updateConsumer]', error)
      return { status: 'error', message: error.message }
    }

    // ── Sync Auth ───────────────────────────────────────────────────────────
    // This consumer might not have an Auth user yet (e.g. imported directly
    // into the consumers table rather than through createConsumer()).
    // Check by ID, not just react to an email change.
    const registeredInAuth = await isConsumerRegisteredInAuth(consumerId)

    if (registeredInAuth) {
      // Already has an Auth user — just keep its email in sync.
      if (normalizedEmail && normalizedEmail !== existing.email) {
        const { error: authUpdateError } = await adminSupabase.auth.admin.updateUserById(
          consumerId,
          { email: normalizedEmail }
        )
        if (authUpdateError) {
          console.error('[updateConsumer] Auth update error:', authUpdateError)
          // Don't rollback DB update, just log the error
        }
      }
    } else {
      const authEmail = normalizedEmail || existing.email
      if (!authEmail) {
        console.error('[updateConsumer] Cannot create Auth user without email')
      } else {
        const { error: authCreateError } = await adminSupabase.auth.admin.createUser({
          id: consumerId,
          email: authEmail,
          password: 'consumer123',
          user_metadata: {
            full_name: updated.account_name,
            account_name: updated.account_name,
            contract_no: updated.contract_no,
            role: 'consumer',
          },
        })

        if (authCreateError) {
          console.error('[updateConsumer] Auth create error:', authCreateError)
        } else {
          await supabase
            .from('consumers')
            .update({ is_default_password: true })
            .eq('consumer_id', consumerId)
        }
      }
    }

    // ── Audit ───────────────────────────────────────────────────────────────
    if (actor) {
      const changed = (Object.keys(payload) as (keyof UpdateConsumerData)[])
        .filter((k) => payload[k] !== undefined && payload[k] !== existing[k as keyof Consumer])
        .map((k) => `${k}: "${existing[k as keyof Consumer]}" → "${payload[k]}"`)
        .join(', ')

      if (changed) {
        await createAuditLog(
          actor.id,
          'UPDATE',
          `Updated consumer ${updated.account_name}: ${changed}`,
          'consumers',
          consumerId,
        )
      }
    }

    return { status: 'success', data: updated }
  } catch (err) {
    console.error('[updateConsumer]', err)
    return { status: 'error', message: 'Failed to update consumer' }
  }
}

// ============================================================================
// UPDATE — toggle is_active
// ============================================================================

export async function toggleConsumerStatus(
  consumerId: string,
  currentStatus: boolean,
): Promise<ActionResult<Consumer>> {
  const supabase = await createClient()

  try {
    const { data: { user: actor } } = await supabase.auth.getUser()
    const newStatus = !currentStatus

    const { data, error } = await supabase
      .from('consumers')
      .update({ is_active: newStatus, updated_at: new Date().toISOString() })
      .eq('consumer_id', consumerId)
      .select(SAFE_COLUMNS)
      .single()

    if (error) {
      console.error('[toggleConsumerStatus]', error)
      return { status: 'error', message: error.message }
    }

    if (actor) {
      await createAuditLog(
        actor.id,
        'STATUS_CHANGE',
        `${newStatus ? 'Activated' : 'Deactivated'} consumer: ${data.account_name}`,
        'consumers',
        consumerId,
      )
    }

    return { status: 'success', data, message: `Consumer ${newStatus ? 'activated' : 'deactivated'}` }
  } catch (err) {
    console.error('[toggleConsumerStatus]', err)
    return { status: 'error', message: 'Failed to update consumer status' }
  }
}

// ============================================================================
// UPDATE — record last_active timestamp
// ============================================================================

export async function updateConsumerLastActive(consumerId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('consumers')
    .update({ last_active: new Date().toISOString() })
    .eq('consumer_id', consumerId)
  if (error) {
    console.error('[updateConsumerLastActive]', error)
    throw new Error('Failed to update last active timestamp')
  }
}

// ============================================================================
// UPDATE — mark email as verified
// ============================================================================

export async function markEmailVerified(consumerId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('consumers')
    .update({ is_email_verified: true, updated_at: new Date().toISOString() })
    .eq('consumer_id', consumerId)
  if (error) {
    console.error('[markEmailVerified]', error)
    throw new Error('Failed to mark email as verified')
  }
}

// ============================================================================
// UPDATE — mark password as changed
// ============================================================================

export async function markPasswordChanged(consumerId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('consumers')
    .update({ is_default_password: false, updated_at: new Date().toISOString() })
    .eq('consumer_id', consumerId)
  if (error) {
    console.error('[markPasswordChanged]', error)
    throw new Error('Failed to update password flag')
  }
}

// ============================================================================
// SEARCH — lightweight lookup for SC / JO forms
// ============================================================================

export async function searchConsumers(
  query: string,
  limit = 10,
): Promise<
  {
    consumer_id: string
    contract_no: string
    account_name: string
    email: string
    contact_number: string | null
    label: string
  }[]
> {
  if (!query.trim()) return []
  const supabase = await createClient()
  const term = query.trim()

  const { data, error } = await supabase
    .from('consumers')
    .select('consumer_id, contract_no, account_name, email, contact_number')
    .or(
      `contract_no.ilike.%${term}%,` +
      `account_name.ilike.%${term}%,` +
      `email.ilike.%${term}%,` +
      `contact_number.ilike.%${term}%`,
    )
    .eq('is_active', true)
    .limit(limit)

  if (error) {
    console.error('[searchConsumers]', error)
    throw new Error('Failed to search consumers')
  }

  return (data ?? []).map((c) => ({
    ...c,
    label: `${c.contract_no} — ${c.account_name}`,
  }))
}

// ============================================================================
// GET — meter account details (for the meter-account/[accountId] page header)
// ============================================================================

export interface MeterAccountDetails {
  meter_account_id: string
  // NOTE: meter_accounts has no connection_fee column. This value is sourced
  // from classifications.connection_fee (the default fee for the account's
  // classification), not from the meter_accounts row itself.
  connection_fee: number | null
  created_at: string
  meter_serial_no: string | null

  classification: {
    classification_id: string
    classification_name: string
  } | null
  zone: {
    zone_id: string
    zone_name: string
    barangay: {
      barangay_id: string
      barangay_name: string
    } | null
  } | null
  consumer: {
    consumer_id: string
    contract_no: string
    account_name: string
    email: string
    contact_number: string | null
  } | null
}

function unwrapOne<T>(val: T | T[] | null | undefined): T | null {
  if (val == null) return null
  return Array.isArray(val) ? (val[0] ?? null) : val
}

export async function getMeterAccountDetails(
  meterAccountId: string,
): Promise<MeterAccountDetails | null> {
  const supabase = await createClient()

  try {
    // �… Removed: account_status and meter_type from select
    const { data, error } = await supabase
      .from('meter_accounts')
      .select(`
        meter_account_id,
        created_at,
        consumer_id,
        classification:classification_id (
          classification_id,
          classification_name,
          connection_fee
        ),
        zone:zone_id (
          zone_id,
          zone_name,
          barangay:barangay_id (
            barangay_id,
            barangay_name
          )
        )
      `)
      .eq('meter_account_id', meterAccountId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }
    if (!data) return null

    // Latest installed meter serial for this account
    const { data: meterRow } = await supabase
      .from('meters')
      .select('meter_serial_no')
      .eq('meter_account_id', meterAccountId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Owning consumer
    let consumer: MeterAccountDetails['consumer'] = null
    if (data.consumer_id) {
      const { data: consumerRow } = await supabase
        .from('consumers')
        .select('consumer_id, contract_no, account_name, email, contact_number')
        .eq('consumer_id', data.consumer_id)
        .maybeSingle()
      if (consumerRow) consumer = consumerRow
    }

    const zoneRaw = unwrapOne<any>(data.zone)
    const classificationRaw = unwrapOne<any>(data.classification)

    return {
      meter_account_id: data.meter_account_id,
      connection_fee: classificationRaw?.connection_fee != null
        ? Number(classificationRaw.connection_fee)
        : null,
      created_at: data.created_at,
      meter_serial_no: meterRow?.meter_serial_no ?? null,
      classification: classificationRaw
        ? {
            classification_id: classificationRaw.classification_id,
            classification_name: classificationRaw.classification_name,
          }
        : null,
      zone: zoneRaw
        ? {
            zone_id: zoneRaw.zone_id,
            zone_name: zoneRaw.zone_name,
            barangay: unwrapOne<any>(zoneRaw.barangay),
          }
        : null,
      consumer,
    }
  } catch (err) {
    console.error('[getMeterAccountDetails]', err)
    return null
  }
}