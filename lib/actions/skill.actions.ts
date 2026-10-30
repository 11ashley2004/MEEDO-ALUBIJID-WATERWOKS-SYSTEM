'use server'

import { createClient } from '@/lib/supabase/server'
import { createAuditLog } from './audit.action'

// =====================
// SKILL MANAGEMENT
// =====================

export async function getAllSkills() {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from('skills')
      .select('*')
      .order('skill_name', { ascending: true })

    if (error) throw error
    return data || []

  } catch (error) {
    console.error('Error fetching skills:', error)
    throw new Error('Failed to fetch skills')
  }
}

// =====================
// SELECT/DROPDOWN HELPERS
// =====================

export async function getAllSkillsForSelect() {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from('skills')
      .select('skill_id, skill_name')
      .eq('is_active', true)
      .order('skill_name', { ascending: true })

    if (error) throw error
    return data || []

  } catch (error) {
    console.error('Error fetching skills for select:', error)
    throw new Error('Failed to fetch skills')
  }
}

// =====================
// SKILL CRUD OPERATIONS
// =====================

export async function createSkill(skillData: {
  skill_name:  string
  description: string
}) {
  const supabase = await createClient()

  try {
    const { data: { user: actorUser } } = await supabase.auth.getUser()

    // Check for duplicate name (case-insensitive)
    const { data: existing } = await supabase
      .from('skills')
      .select('skill_id')
      .ilike('skill_name', skillData.skill_name)
      .single()

    if (existing) {
      return {
        status: 'error',
        message: `Skill "${skillData.skill_name}" already exists.`,
      }
    }

    const { data, error } = await supabase
      .from('skills')
      .insert({
        skill_name:  skillData.skill_name,
        description: skillData.description,
        created_at:  new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.error('Database error:', error)
      return { status: 'error', message: error.message }
    }

    if (actorUser) {
      await createAuditLog(
        actorUser.id,
        'CREATE',
        `Created new skill: ${skillData.skill_name}`,
        'skills',
        data.skill_id,
      )
    }

    return { status: 'success', data }

  } catch (error) {
    console.error('Error creating skill:', error)
    return { status: 'error', message: 'Failed to create skill' }
  }
}

export async function updateSkill(
  skillId: string,
  skillData: {
    skill_name?:  string
    description?: string | null
    is_active?:   boolean
  },
) {
  const supabase = await createClient()

  try {
    const { data: originalSkill } = await supabase
      .from('skills')
      .select('skill_name')
      .eq('skill_id', skillId)
      .single()

    const { data: { user: actorUser } } = await supabase.auth.getUser()

    const { data, error } = await supabase
      .from('skills')
      .update({
        ...skillData,
        updated_at: new Date().toISOString(),
      })
      .eq('skill_id', skillId)
      .select()
      .single()

    if (error) throw error

    if (actorUser && originalSkill) {
      const changes = Object.keys(skillData)
        .filter((key) => skillData[key as keyof typeof skillData] !== undefined)
        .map((key) => {
          if (key === 'skill_name') return `name: ${originalSkill.skill_name} → ${skillData.skill_name}`
          if (key === 'is_active')  return `status: ${skillData.is_active ? 'activated' : 'deactivated'}`
          if (key === 'description') return 'description: updated'
          return `${key}: updated`
        })
        .join(', ')

      await createAuditLog(
        actorUser.id,
        'UPDATE',
        `Updated skill ${data.skill_name}: ${changes}`,
        'skills',
        skillId,
      )
    }

    return { status: 'success', data }

  } catch (error) {
    console.error('Error updating skill:', error)
    return { status: 'error', message: 'Failed to update skill' }
  }
}

export async function getSkillById(skillId: string) {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from('skills')
      .select('*')
      .eq('skill_id', skillId)
      .single()

    if (error) throw error
    return data

  } catch (error) {
    console.error('Error fetching skill:', error)
    throw new Error('Failed to fetch skill')
  }
}