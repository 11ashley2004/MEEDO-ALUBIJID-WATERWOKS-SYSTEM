'use server'

import { createClient } from '@/lib/supabase/server'

export interface Role {
  role_id: string
  role_name: string
}

export async function getAllUserRoles() {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("roles")
      .select("role_id, role_name")
      .order('role_name', { ascending: true });

    if (error) throw error;
    return data || []; 

  } catch (error) {
    console.error('Error fetching roles:', error);
    throw new Error('Failed to fetch roles');
  }
}