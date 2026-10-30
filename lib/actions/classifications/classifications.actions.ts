'use server'

import { createClient } from '@/lib/supabase/server'
import { createAuditLog } from '../audit.action'

// ============================================================================
// Types
// ============================================================================

export interface Classification {
  classification_id: string
  classification_name: string
  description: string
  connection_fee: number
}

interface CreateClassificationData {
  classification_name: string
  description: string
  connection_fee: number
}

interface UpdateClassificationData {
  classification_name?: string
  description?: string
  connection_fee?: number
}

// ============================================================================
// Helper Functions
// ============================================================================

async function isClassificationNameUnique(name: string, excludeId?: string): Promise<boolean> {
  const supabase = await createClient()
  
  let query = supabase
    .from('classifications')
    .select('classification_id')
    .ilike('classification_name', name)
  
  if (excludeId) {
    query = query.neq('classification_id', excludeId)
  }
  
  const { data } = await query.maybeSingle()
  return !data
}

// ============================================================================
// GET - Retrieve all classifications
// ============================================================================

export async function getAllClassifications(): Promise<Classification[]> {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from('classifications')
      .select('classification_id, classification_name, description, connection_fee')
      .order('classification_name', { ascending: true })

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Error fetching classifications:', error)
    throw new Error('Failed to fetch classifications')
  }
}

// ============================================================================
// GET - Retrieve single classification by ID
// ============================================================================

export async function getClassificationById(classificationId: string) {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from('classifications')
      .select('classification_id, classification_name, description, connection_fee')
      .eq('classification_id', classificationId)
      .single()

    if (error) throw error
    return { status: 'success', data }
  } catch (error) {
    console.error('Error fetching classification:', error)
    return { status: 'error', message: 'Failed to fetch classification' }
  }
}

// ============================================================================
// CREATE - Add new classification
// ============================================================================

export async function createClassification(classificationData: CreateClassificationData) {
  const supabase = await createClient()

  try {
    const { data: { user: actorUser } } = await supabase.auth.getUser()

    // Check uniqueness
    const isNameUnique = await isClassificationNameUnique(classificationData.classification_name)
    if (!isNameUnique) {
      return {
        status: 'error',
        message: `Classification "${classificationData.classification_name}" already exists.`
      }
    }

    // Insert classification
    const { data, error } = await supabase
      .from('classifications')
      .insert({
        classification_name: classificationData.classification_name,
        description: classificationData.description,
        connection_fee: classificationData.connection_fee,
      })
      .select()
      .single()

    if (error) throw error

    // Audit log
    if (actorUser) {
      await createAuditLog(
        actorUser.id,
        'CREATE',
        `Created consumer classification: ${classificationData.classification_name} with connection fee of ₱${classificationData.connection_fee}`,
        'classifications',
        data.classification_id
      )
    }

    return { status: 'success', data }
  } catch (error) {
    console.error('Error creating classification:', error)
    return { status: 'error', message: 'Failed to create classification' }
  }
}

// ============================================================================
// UPDATE - Modify existing classification
// ============================================================================

export async function updateClassification(
  classificationId: string,
  classificationData: UpdateClassificationData
) {
  const supabase = await createClient()

  try {
    // Get original data for audit
    const { data: original } = await supabase
      .from('classifications')
      .select('classification_name, description, connection_fee')
      .eq('classification_id', classificationId)
      .single()

    if (!original) {
      return { status: 'error', message: 'Classification not found' }
    }

    // Check name uniqueness if being updated
    if (classificationData.classification_name && 
        classificationData.classification_name !== original.classification_name) {
      const isNameUnique = await isClassificationNameUnique(classificationData.classification_name, classificationId)
      if (!isNameUnique) {
        return {
          status: 'error',
          message: `Classification "${classificationData.classification_name}" already exists.`
        }
      }
    }

    const { data: { user: actorUser } } = await supabase.auth.getUser()

    // Update classification
    const { data, error } = await supabase
      .from('classifications')
      .update({
        ...classificationData,
        updated_at: new Date().toISOString()
      })
      .eq('classification_id', classificationId)
      .select()
      .single()

    if (error) throw error

    // Audit log
    if (actorUser) {
      const changes = Object.keys(classificationData)
        .filter(key => classificationData[key as keyof UpdateClassificationData] !== undefined)
        .map(key => {
          if (key === 'classification_name') {
            return `name: ${original.classification_name} → ${classificationData.classification_name}`
          }
          if (key === 'description') {
            return `description updated`
          }
          if (key === 'connection_fee') {
            return `fee: ₱${original.connection_fee} → ₱${classificationData.connection_fee}`
          }
          return `${key}: updated`
        })
        .join(', ')

      await createAuditLog(
        actorUser.id,
        'UPDATE',
        `Updated consumer classification ${data.classification_name}: ${changes}`,
        'classifications',
        classificationId
      )
    }

    return { status: 'success', data }
  } catch (error) {
    console.error('Error updating classification:', error)
    return { status: 'error', message: 'Failed to update classification' }
  }
}