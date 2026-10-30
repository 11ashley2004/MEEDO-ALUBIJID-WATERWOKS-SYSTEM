'use server'

import { createClient } from '@/lib/supabase/server'
import { createAuditLog } from './audit.action'


// Type for Zone with barangay info
export interface Zone {
  zone_id: string
  zone_name: string
  barangay_id: string
  is_active: boolean
  created_at: string
  updated_at: string
  barangay: {
    barangay_id: string
    barangay_name: string
  }
}

export async function getAssignedZones() {
  const supabase = await createClient()

  try {
    // Get current user
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !authUser) {
      return { status: 'error', message: 'User not authenticated' }
    }

    // Get active zone assignments for this meter reader
    const { data: assignments, error: assignmentError } = await supabase
      .from('meter_reader_assignments')
      .select('zone_id')
      .eq('user_id', authUser.id)
      .eq('is_active', true)

    if (assignmentError) throw assignmentError

    const zoneIds = assignments?.map((a) => a.zone_id) ?? []
    
    if (zoneIds.length === 0) {
      return { status: 'success', data: [] as Zone[] }
    }

    // Fetch full zone details with barangay info
    const { data: zones, error: zonesError } = await supabase
      .from('zone')
      .select(`
        zone_id,
        zone_name,
        barangay_id,
        is_active,
        created_at,
        updated_at,
        barangay:barangay_id (
          barangay_id,
          barangay_name
        )
      `)
      .in('zone_id', zoneIds)
      .eq('is_active', true)
      .order('zone_name', { ascending: true })

    if (zonesError) throw zonesError

    // Normalize barangay data (handle array/object from Supabase join)
    const normalizedZones: Zone[] = (zones ?? []).map((zone: any) => ({
      zone_id: zone.zone_id,
      zone_name: zone.zone_name,
      barangay_id: zone.barangay_id,
      is_active: zone.is_active,
      created_at: zone.created_at,
      updated_at: zone.updated_at,
      barangay: Array.isArray(zone.barangay) 
        ? zone.barangay[0] ?? { barangay_id: '', barangay_name: 'Unknown' }
        : zone.barangay ?? { barangay_id: '', barangay_name: 'Unknown' }
    }))

    return { status: 'success', data: normalizedZones }

  } catch (error) {
    console.error('Error fetching assigned zones:', error)
    return { status: 'error', message: 'Failed to load assigned zones' }
  }
}

export async function getAllZones() {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("zone")
      .select(`
        *,
        barangay:barangay_id (
          barangay_name
        )
      `)
      .order('zone_name', { ascending: true });

    if (error) throw error;
    return data || []; 

  } catch (error) {
    console.error('Error fetching zones:', error);
    throw new Error('Failed to fetch zones');
  }
}

export async function getZonesByBarangay(barangayId: string) {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("zone")
      .select(`
        *,
        barangay:barangay_id (
          barangay_name
        )
      `)
      .eq('barangay_id', barangayId)
      .order('zone_name', { ascending: true });

    if (error) throw error;
    return data || []; 

  } catch (error) {
    console.error('Error fetching zones by barangay:', error);
    throw new Error('Failed to fetch zones');
  }
}

export async function createZone(zoneData: {
  zone_name: string;
  barangay_id: string;
}) {
  const supabase = await createClient();

  try {
    const { data: { user: actorUser } } = await supabase.auth.getUser();

    const { data: existing } = await supabase
    .from('zone')
    .select('zone_id')
    .eq('barangay_id', zoneData.barangay_id)
    .ilike('zone_name', zoneData.zone_name)
    .single();

    if (existing) {
      return {
        status: 'error',
        message: `Zone "${zoneData.zone_name}" already exists in this barangay.`
      };
    }

    // Get barangay info for audit log
    const { data: barangayData, error: barangayError } = await supabase
      .from('barangay')
      .select('barangay_name')
      .eq('barangay_id', zoneData.barangay_id)
      .single();

    if (barangayError) {
      console.error('Error fetching barangay:', barangayError);
    }

    const barangayName = barangayData?.barangay_name || 'Unknown';

    const { data, error } = await supabase
      .from('zone')
      .insert({
        zone_name: zoneData.zone_name,
        barangay_id: zoneData.barangay_id,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select(`
        *,
        barangay:barangay_id (
          barangay_name
        )
      `)
      .single();

    if (error) {
      console.error('Database error:', error);
      return { status: 'error', message: error.message };
    }

    // Create audit log
    if (actorUser) {
      await createAuditLog(
        actorUser.id,
        'CREATE',
        `Created new zone: Zone ${zoneData.zone_name} in ${barangayName}`,
        'zone',
        data.zone_id
      );
    }

    return { status: 'success', data };

  } catch (error) {
    console.error('Error creating zone:', error);
    return { status: 'error', message: 'Failed to create zone' };
  }
}

export async function updateZone(
  zoneId: string, 
  zoneData: {
    zone_name?: string;
    barangay_id?: string;
    is_active?: boolean;
  }
) {
  const supabase = await createClient();

  try {
    // Get original zone data for audit log
    const { data: originalZone, error: originalError } = await supabase
      .from('zone')
      .select(`
        zone_name,
        barangay_id,
        is_active,
        barangay:barangay_id (
          barangay_name
        )
      `)
      .eq('zone_id', zoneId)
      .single();

    if (originalError) {
      console.error('Error fetching original zone:', originalError);
    }

    const { data: { user: actorUser } } = await supabase.auth.getUser();

    // If barangay_id is being updated, get the new barangay name
    let newBarangayName = null;
    if (zoneData.barangay_id) {
      const { data: newBarangay } = await supabase
        .from('barangay')
        .select('barangay_name')
        .eq('barangay_id', zoneData.barangay_id)
        .single();
      newBarangayName = newBarangay?.barangay_name;
    }

    const { data, error } = await supabase
      .from('zone')
      .update({
        ...zoneData,
        updated_at: new Date().toISOString()
      })
      .eq('zone_id', zoneId)
      .select(`
        *,
        barangay:barangay_id (
          barangay_name
        )
      `)
      .single();

    if (error) throw error;

    // Create audit log
    if (actorUser && originalZone) {
      // Safely extract barangay name from the original zone data
      let originalBarangayName = 'Unknown';
      if (originalZone.barangay && Array.isArray(originalZone.barangay) && originalZone.barangay.length > 0) {
        originalBarangayName = originalZone.barangay[0]?.barangay_name || 'Unknown';
      } else if (originalZone.barangay && typeof originalZone.barangay === 'object' && !Array.isArray(originalZone.barangay)) {
        originalBarangayName = (originalZone.barangay as any)?.barangay_name || 'Unknown';
      }

      const changes = Object.keys(zoneData)
        .filter(key => zoneData[key as keyof typeof zoneData] !== undefined)
        .map(key => {
          if (key === 'zone_name') {
            return `name: Zone ${originalZone.zone_name} → Zone ${zoneData.zone_name}`;
          }
          if (key === 'barangay_id') {
            return `barangay: ${originalBarangayName} → ${newBarangayName || 'Unknown'}`;
          }
          if (key === 'is_active') {
            return `status: ${zoneData.is_active ? 'activated' : 'deactivated'}`;
          }
          return `${key}: updated`;
        })
        .join(', ');

      await createAuditLog(
        actorUser.id,
        'UPDATE',
        `Updated zone: ${changes}`,
        'zone',
        zoneId
      );
    }

    return { status: 'success', data };

  } catch (error) {
    console.error('Error updating zone:', error);
    return { status: 'error', message: 'Failed to update zone' };
  }
}

export async function toggleZoneStatus(zoneId: string, currentStatus: boolean) {
  const supabase = await createClient();

  try {
    // Get zone info for audit log
    const { data: zoneInfo, error: zoneError } = await supabase
      .from('zone')
      .select(`
        zone_name,
        barangay:barangay_id (
          barangay_name
        )
      `)
      .eq('zone_id', zoneId)
      .single();

    if (zoneError) {
      console.error('Error fetching zone info:', zoneError);
    }

    // Only relevant when going ACTIVE -> INACTIVE (currentStatus is the value BEFORE toggling)
    if (currentStatus === true) {
      // Check for meter accounts in this zone
      const { data: meterAccounts, error: meterCheckError, count } = await supabase
        .from('meter_accounts')
        .select('meter_account_id', { count: 'exact', head: true })
        .eq('zone_id', zoneId);

      if (meterCheckError) {
        console.error('Error checking meter accounts for zone:', meterCheckError);
        return { status: 'error', message: 'Failed to validate zone before deactivation.' };
      }

      if (count && count > 0) {
        return {
          status: 'error',
          message: `Cannot deactivate: ${count} active meter account${count === 1 ? '' : 's'} found`
        };
      }
    }

    const { data: { user: actorUser } } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from("zone")
      .update({
        is_active: !currentStatus,
        updated_at: new Date().toISOString()
      })
      .eq('zone_id', zoneId)
      .select(`
        *,
        barangay:barangay_id (
          barangay_name
        )
      `)
      .single();

    if (error) throw error;

    // Create audit log
    if (actorUser && zoneInfo) {
      let barangayName = 'Unknown';
      if (zoneInfo.barangay && Array.isArray(zoneInfo.barangay) && zoneInfo.barangay.length > 0) {
        barangayName = zoneInfo.barangay[0]?.barangay_name || 'Unknown';
      } else if (zoneInfo.barangay && typeof zoneInfo.barangay === 'object' && !Array.isArray(zoneInfo.barangay)) {
        barangayName = (zoneInfo.barangay as any)?.barangay_name || 'Unknown';
      }

      const newStatus = !currentStatus ? 'activated' : 'deactivated';
      await createAuditLog(
        actorUser.id,
        'STATUS_CHANGE',
        `${newStatus} zone: Zone ${zoneInfo.zone_name} in ${barangayName}`,
        'zone',
        zoneId
      );
    }

    return { status: 'success', data };

  } catch (error) {
    console.error('Error toggling zone status:', error);
    return { status: 'error', message: 'Failed to update zone status' };
  }
}

export async function getAllBarangaysForSelect() {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("barangay")
      .select(`
        barangay_id,
        barangay_name
      `)
      .eq('is_active', true)
      .order('barangay_name', { ascending: true });

    if (error) throw error;
    return data || []; 

  } catch (error) {
    console.error('Error fetching barangays:', error);
    throw new Error('Failed to fetch barangays');
  }
}

// ── Add getZoneById to zone.actions.ts ────────────────────────────────────────
export async function getZoneById(zoneId: string) {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from('zone')
      .select(`
        zone_id,
        zone_name,
        is_active,
        created_at,
        updated_at,
        barangay:barangay_id (
          barangay_id,
          barangay_name
        )
      `)
      .eq('zone_id', zoneId)
      .single()

    if (error) throw error

    const barangay = Array.isArray(data.barangay)
      ? data.barangay[0] ?? { barangay_id: '', barangay_name: 'Unknown' }
      : data.barangay ?? { barangay_id: '', barangay_name: 'Unknown' }

    return { status: 'success', data: { ...data, barangay } }
  } catch (error) {
    console.error('Error fetching zone:', error)
    return { status: 'error', message: 'Failed to fetch zone' }
  }
}