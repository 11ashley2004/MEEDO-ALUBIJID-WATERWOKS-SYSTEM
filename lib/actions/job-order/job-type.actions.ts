'use server'

import { createClient } from '@/lib/supabase/server'

export async function getAllJobTypes() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('job_types')
    .select(`
      job_type_id,
      job_type_name,
      job_type_code,
      job_type_category,
      created_at,
      skill:skills(skill_id, skill_name)
    `)
    .order('created_at', { ascending: false })

  if (error) throw new Error('Failed to fetch job types')

  return (data || []).map((row) => ({
    ...row,
    skill: Array.isArray(row.skill) ? (row.skill[0] ?? null) : row.skill,
  }))
}

export async function getAllSkills() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('skills')
    .select('skill_id, skill_name')
    .order('skill_name', { ascending: true })

  if (error) throw new Error('Failed to fetch skills')
  return data || []
}

export async function createJobType(values: {
  job_type_name: string
  skill_id: string
  job_type_category: boolean
}) {
  const supabase = await createClient()
  
  // Generate job_type_code from name (uppercase, spaces to underscores)
  const jobTypeCode = values.job_type_name.toUpperCase().replace(/\s+/g, '_')
  
  const { error } = await supabase
    .from('job_types')
    .insert({
      job_type_name: values.job_type_name.trim(),
      job_type_code: jobTypeCode,
      skill_id: values.skill_id,
      job_type_category: values.job_type_category,
    })

  if (error) return { status: 'error' as const, message: error.message }
  return { status: 'success' as const }
}

export async function updateJobType(
  id: string,
  values: { job_type_name: string; skill_id: string; job_type_category: boolean },
) {
  const supabase = await createClient()
  
  // Generate job_type_code from name
  const jobTypeCode = values.job_type_name.toUpperCase().replace(/\s+/g, '_')
  
  const { error } = await supabase
    .from('job_types')
    .update({
      job_type_name: values.job_type_name.trim(),
      job_type_code: jobTypeCode,
      skill_id: values.skill_id,
      job_type_category: values.job_type_category,
    })
    .eq('job_type_id', id)

  if (error) return { status: 'error' as const, message: error.message }
  return { status: 'success' as const }
}

export async function deleteJobType(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('job_types')
    .delete()
    .eq('job_type_id', id)

  if (error) return { status: 'error' as const, message: error.message }
  return { status: 'success' as const }
}