'use server'

import { createClient } from '@/lib/supabase/server'
import { createAuditLog } from './audit.action'

// ─── Shared type (exported so pages/forms can import it) ─────────────────────

export interface UserSkill {
  user_skill_id: string
  user_id:       string
  skill_id:      string
  is_active:     boolean
  created_at:    string
  user: {
    user_id:    string
    first_name: string
    last_name:  string
  }
  skill: {
    skill_id:   string
    skill_name: string
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
// Supabase returns joined relations as T | T[] — these guards resolve safely.

function resolveSkillName(relation: unknown, fallback = '?'): string {
  if (!relation) return fallback
  if (typeof relation === 'object' && !Array.isArray(relation)) {
    return ((relation as Record<string, unknown>).skill_name as string) ?? fallback
  }
  if (Array.isArray(relation) && relation.length > 0) {
    return ((relation[0] as Record<string, unknown>).skill_name as string) ?? fallback
  }
  return fallback
}

// Normalizes a raw Supabase user_skills row (joins may be T | T[]) to UserSkill
function normalizeUserSkill(row: Record<string, unknown>): UserSkill {
  const resolveObj = (rel: unknown, fallback: Record<string, string>) => {
    if (!rel) return fallback
    if (Array.isArray(rel)) return (rel[0] as Record<string, string>) ?? fallback
    return rel as Record<string, string>
  }

  const user  = resolveObj(row.user,  { user_id: '', first_name: '', last_name: '' })
  const skill = resolveObj(row.skill, { skill_id: '', skill_name: '' })

  return {
    user_skill_id: row.user_skill_id as string,
    user_id:       row.user_id       as string,
    skill_id:      row.skill_id      as string,
    is_active:     row.is_active     as boolean,
    created_at:    row.created_at    as string,
    user: {
      user_id:    user.user_id,
      first_name: user.first_name,
      last_name:  user.last_name,
    },
    skill: {
      skill_id:   skill.skill_id,
      skill_name: skill.skill_name,
    },
  }
}

// =====================
// SELECT HELPERS
// =====================

export async function getAllUsersForSelect() {
  const supabase = await createClient()
  try {
    const { data, error } = await supabase
      .from('users')
      .select(`
        user_id,
        first_name,
        last_name,
        role:role_id (
          role_name
        )
      `)
      .eq('is_active', true)
      .order('last_name', { ascending: true })
    if (error) throw error

    // Filter by role_name in JS — PostgREST does not support .in() on joined tables
    const filtered = (data || []).filter((u) => {
      const roleName = Array.isArray(u.role)
        ? (u.role[0] as { role_name: string })?.role_name
        : (u.role as { role_name: string } | null)?.role_name
      return roleName === 'meter-reader' || roleName === 'plumber'
    })

    return filtered.map((u) => ({
      user_id:    u.user_id,
      first_name: u.first_name,
      last_name:  u.last_name,
    }))
  } catch (error) {
    console.error('Error fetching users for select:', error)
    throw new Error('Failed to fetch users')
  }
}

export async function getAllSkillsForSelect() {
  const supabase = await createClient()
  try {
    const { data, error } = await supabase
      .from('skills')
      .select('skill_id, skill_name')
      .order('skill_name', { ascending: true })
    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Error fetching skills for select:', error)
    throw new Error('Failed to fetch skills')
  }
}

// =====================
// GET ASSIGNED SKILL IDs FOR A USER (used to filter dropdowns)
// =====================

export async function getAssignedSkillIds(userId: string): Promise<string[]> {
  const supabase = await createClient()
  try {
    const { data, error } = await supabase
      .from('user_skills')
      .select('skill_id')
      .eq('user_id', userId)
    if (error) throw error
    return (data || []).map((r: { skill_id: string }) => r.skill_id)
  } catch (error) {
    console.error('Error fetching assigned skill ids:', error)
    return []
  }
}

// =====================
// GET ALL USER SKILLS (standalone page)
// =====================

export async function getAllUserSkills() {
  const supabase = await createClient()
  try {
    const { data, error } = await supabase
      .from('user_skills')
      .select(`
        user_skill_id,
        user_id,
        skill_id,
        is_active,
        created_at,
        user:user_id (
          user_id,
          first_name,
          last_name
        ),
        skill:skill_id (
          skill_id,
          skill_name
        )
      `)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data || []).map((row) => normalizeUserSkill(row as Record<string, unknown>))
  } catch (error) {
    console.error('Error fetching all user skills:', error)
    throw new Error('Failed to fetch user skills')
  }
}

// =====================
// GET USER SKILLS (per-user, for detail page)
// =====================

export async function getUserSkills(userId: string) {
  const supabase = await createClient()
  try {
    const { data, error } = await supabase
      .from('user_skills')
      .select(`
        user_skill_id,
        is_active,
        created_at,
        skill:skill_id (
          skill_id,
          skill_name,
          description
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Error fetching user skills:', error)
    throw new Error('Failed to fetch user skills')
  }
}

// =====================
// ASSIGN SKILLS TO USER
// =====================

export async function assignSkillsToUser(payload: {
  user_id:   string
  skill_ids: string[]
}) {
  const supabase = await createClient()
  try {
    const { data: { user: actorUser } } = await supabase.auth.getUser()

    const { data: existing } = await supabase
      .from('user_skills')
      .select('skill_id')
      .eq('user_id', payload.user_id)

    const existingIds = new Set(
      (existing || []).map((r: { skill_id: string }) => r.skill_id),
    )
    const newSkillIds = payload.skill_ids.filter((id) => !existingIds.has(id))

    if (newSkillIds.length === 0) {
      return {
        status:   'error',
        message:  'All selected skills are already assigned to this worker.',
        assigned: 0,
      }
    }

    const rows = newSkillIds.map((skill_id) => ({
      user_id:    payload.user_id,
      skill_id,
      is_active:  true,
      created_at: new Date().toISOString(),
    }))

    const { error } = await supabase.from('user_skills').insert(rows)
    if (error) {
      console.error('Database error:', error)
      return { status: 'error', message: error.message, assigned: 0 }
    }

    if (actorUser && newSkillIds.length > 0) {
      const { data: skillRows } = await supabase
        .from('skills')
        .select('skill_name')
        .in('skill_id', newSkillIds)

      const names = (skillRows || [])
        .map((s: { skill_name: string }) => s.skill_name)
        .join(', ')

      await createAuditLog(
        actorUser.id,
        'CREATE',
        `Assigned skill(s) to user ${payload.user_id}: ${names}`,
        'user_skills',
        payload.user_id,
      )
    }

    return { status: 'success', assigned: newSkillIds.length }

  } catch (error) {
    console.error('Error assigning skills:', error)
    return { status: 'error', message: 'Failed to assign skills', assigned: 0 }
  }
}

// =====================
// UPDATE USER SKILL (swap skill on an assignment)
// =====================

export async function updateUserSkill(
  userSkillId: string,
  payload: { skill_id: string },
) {
  const supabase = await createClient()
  try {
    const { data: { user: actorUser } } = await supabase.auth.getUser()

    // Fetch old record for duplicate-check + audit log
    const { data: old } = await supabase
      .from('user_skills')
      .select('user_id, skill:skill_id ( skill_name )')
      .eq('user_skill_id', userSkillId)
      .single()

    const oldUserId    = old?.user_id as string | undefined
    const oldSkillName = resolveSkillName(old?.skill)

    // Guard: new skill must not already be assigned to the same user
    if (oldUserId) {
      const { data: duplicate } = await supabase
        .from('user_skills')
        .select('user_skill_id')
        .eq('user_id', oldUserId)
        .eq('skill_id', payload.skill_id)
        .neq('user_skill_id', userSkillId)
        .maybeSingle()

      if (duplicate) {
        return { status: 'error', message: 'This skill is already assigned to the worker.' }
      }
    }

    const { data, error } = await supabase
      .from('user_skills')
      .update({ skill_id: payload.skill_id })
      .eq('user_skill_id', userSkillId)
      .select('user_skill_id, user_id, skill:skill_id ( skill_name )')
      .single()

    if (error) throw error

    const newSkillName = resolveSkillName(data.skill)

    if (actorUser && oldUserId) {
      await createAuditLog(
        actorUser.id,
        'UPDATE',
        `Updated user skill for user ${data.user_id as string}: ${oldSkillName} → ${newSkillName}`,
        'user_skills',
        userSkillId,
      )
    }

    return { status: 'success', data }

  } catch (error) {
    console.error('Error updating user skill:', error)
    return { status: 'error', message: 'Failed to update skill assignment' }
  }
}

// =====================
// TOGGLE USER SKILL STATUS
// =====================

export async function toggleUserSkillStatus(userSkillId: string, currentStatus: boolean) {
  const supabase = await createClient()
  try {
    const { data: { user: actorUser } } = await supabase.auth.getUser()

    const { data, error } = await supabase
      .from('user_skills')
      .update({ is_active: !currentStatus })
      .eq('user_skill_id', userSkillId)
      .select('user_skill_id, user_id, skill:skill_id ( skill_name )')
      .single()

    if (error) throw error

    if (actorUser) {
      const skillName = resolveSkillName(data.skill, userSkillId)
      const newStatus = !currentStatus ? 'activated' : 'deactivated'
      await createAuditLog(
        actorUser.id,
        'STATUS_CHANGE',
        `${newStatus} user skill: ${skillName} for user ${data.user_id as string}`,
        'user_skills',
        userSkillId,
      )
    }

    return { status: 'success', data }

  } catch (error) {
    console.error('Error toggling user skill status:', error)
    return { status: 'error', message: 'Failed to update skill status' }
  }
}
