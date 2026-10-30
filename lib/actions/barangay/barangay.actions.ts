'use server'

import { createClient } from '@/lib/supabase/server'
import { createAuditLog } from '../audit.action'

export interface Barangay {
  barangay_id: string
  barangay_name: string
  is_active: boolean
  created_at: string
  updated_at?: string | null
}

// =====================
// BARANGAY MANAGEMENT
// =====================

export async function getAllBarangays() {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("barangay")
      .select(`*`)
      .order('barangay_name', { ascending: true });

    if (error) throw error;
    return data || []; 

  } catch (error) {
    console.error('Error fetching barangays:', error);
    throw new Error('Failed to fetch barangays');
  }
}

// =====================
// SELECT/DROPDOWN HELPERS
// =====================

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
    console.error('Error fetching barangays for select:', error);
    throw new Error('Failed to fetch barangays');
  }
}

// =====================
// ZONE MANAGEMENT (Barangay-related)
// =====================

export async function getZonesByBarangay(barangayId: string) {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("zone")
      .select(`
        zone_id,
        zone_name,
        barangay:barangay_id (
          barangay_name
        )
      `)
      .eq('barangay_id', barangayId)
      .eq('is_active', true)
      .order('zone_name', { ascending: true });

    if (error) throw error;
    return data || []; 

  } catch (error) {
    console.error('Error fetching zones by barangay:', error);
    throw new Error('Failed to fetch zones');
  }
}

export async function getAllZonesForSelect() {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("zone")
      .select(`
        zone_id,
        zone_name,
        barangay:barangay_id (
          barangay_name
        )
      `)
      .eq('is_active', true)
      .order('zone_name', { ascending: true });

    if (error) throw error;
    return data || []; 

  } catch (error) {
    console.error('Error fetching zones for select:', error);
    throw new Error('Failed to fetch zones');
  }
}

// =====================
// BARANGAY CRUD OPERATIONS
// =====================

export async function createBarangay(barangayData: {
  barangay_name: string;
}) {
  const supabase = await createClient();

  try {
    const { data: { user: actorUser } } = await supabase.auth.getUser();

    const { data: existing } = await supabase
    .from('barangay')
    .select('barangay_id')
    .ilike('barangay_name', barangayData.barangay_name)
    .single();

    if (existing) {
      return {
        status: 'error',
        message: `Barangay "${barangayData.barangay_name}" already exists.`
      };
    }

    const { data, error } = await supabase
      .from('barangay')
      .insert({
        barangay_name: barangayData.barangay_name,
        is_active: true,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return { status: 'error', message: error.message };
    }

    if (actorUser) {
      await createAuditLog(
        actorUser.id,
        'CREATE',
        `Created new barangay: ${barangayData.barangay_name}`,
        'barangay',
        data.barangay_id
      );
    }

    return { status: 'success', data };

  } catch (error) {
    console.error('Error creating barangay:', error);
    return { status: 'error', message: 'Failed to create barangay' };
  }
}

export async function updateBarangay(
  barangayId: string, 
  barangayData: {
    barangay_name?: string;
    is_active?: boolean;
  }
) {
  const supabase = await createClient();

  try {
    const { data: originalBarangay } = await supabase
      .from('barangay')
      .select('barangay_name')
      .eq('barangay_id', barangayId)
      .single();

    const { data: { user: actorUser } } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('barangay')
      .update({
        ...barangayData,
        updated_at: new Date().toISOString()
      })
      .eq('barangay_id', barangayId)
      .select()
      .single();

    if (error) throw error;

    if (actorUser && originalBarangay) {
      const changes = Object.keys(barangayData)
        .filter(key => barangayData[key as keyof typeof barangayData] !== undefined)
        .map(key => {
          if (key === 'barangay_name') {
            return `name: ${originalBarangay.barangay_name} → ${barangayData.barangay_name}`;
          }
          if (key === 'is_active') {
            return `status: ${barangayData.is_active ? 'activated' : 'deactivated'}`;
          }
          return `${key}: updated`;
        })
        .join(', ');

      await createAuditLog(
        actorUser.id,
        'UPDATE',
        `Updated barangay ${data.barangay_name}: ${changes}`,
        'barangay',
        barangayId
      );
    }

    return { status: 'success', data };

  } catch (error) {
    console.error('Error updating barangay:', error);
    return { status: 'error', message: 'Failed to update barangay' };
  }
}

export async function hasActiveMeterAccounts(barangayId: string) {
  const supabase = await createClient();

  try {
    // Get all zones in this barangay
    const { data: zones, error: zonesError } = await supabase
      .from('zone')
      .select('zone_id')
      .eq('barangay_id', barangayId)
      .eq('is_active', true);

    if (zonesError) throw zonesError;

    if (!zones || zones.length === 0) {
      return { 
        status: 'success', 
        data: { hasActiveAccounts: false, count: 0 }
      };
    }

    const zoneIds = zones.map(z => z.zone_id);

    // Check for meter accounts that have an ACTIVE meter
    const { data: activeMeters, error: meterError } = await supabase
      .from('meters')
      .select(`
        meter_id,
        meter_account_id,
        meter_status:meter_status_id (
          meter_status_name
        ),
        meter_accounts!inner (
          meter_account_id,
          zone_id
        )
      `)
      .in('meter_accounts.zone_id', zoneIds)
      .eq('meter_status.meter_status_name', 'ACTIVE');

    if (meterError) throw meterError;

    const activeCount = activeMeters?.length || 0;

    return { 
      status: 'success', 
      data: { hasActiveAccounts: activeCount > 0, count: activeCount }
    };

  } catch (error) {
    console.error('Error checking active meter accounts:', error);
    return { 
      status: 'error', 
      message: 'Failed to check active meter accounts',
      data: { hasActiveAccounts: false, count: 0 }
    };
  }
}

export async function toggleBarangayStatus(barangayId: string, currentStatus: boolean) {
  const supabase = await createClient();

  try {
    // If trying to deactivate, check for active meter accounts
    if (currentStatus === true) {
      // Get all zones in this barangay
      const { data: zones, error: zonesError } = await supabase
        .from('zone')
        .select('zone_id')
        .eq('barangay_id', barangayId)
        .eq('is_active', true);

      if (zonesError) throw zonesError;

      if (zones && zones.length > 0) {
        const zoneIds = zones.map(z => z.zone_id);

        // Check for meters with ACTIVE status in this barangay's zones
        const { data: activeMeters, error: meterError, count } = await supabase
          .from('meters')
          .select(`
            meter_id,
            meter_account_id,
            meter_status:meter_status_id (
              meter_status_name
            ),
            meter_accounts!inner (
              meter_account_id,
              zone_id
            )
          `, { count: 'exact' })
          .in('meter_accounts.zone_id', zoneIds)
          .eq('meter_status.meter_status_name', 'ACTIVE');

        if (meterError) throw meterError;

        if (activeMeters && activeMeters.length > 0) {
          const accountCount = count || activeMeters.length;
          return {
            status: 'error',
            message: `Cannot deactivate: ${accountCount} active meter account${accountCount === 1 ? '' : 's'} found`
          };
        }
      }
    }

    const { data: barangayInfo } = await supabase
      .from('barangay')
      .select('barangay_name')
      .eq('barangay_id', barangayId)
      .single();

    const { data: { user: actorUser } } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from("barangay")
      .update({ 
        is_active: !currentStatus,
        updated_at: new Date().toISOString()
      })
      .eq('barangay_id', barangayId)
      .select()
      .single();

    if (error) throw error;

    if (actorUser && barangayInfo) {
      const newStatus = !currentStatus ? 'activated' : 'deactivated';
      await createAuditLog(
        actorUser.id,
        'STATUS_CHANGE',
        `${newStatus} barangay: ${barangayInfo.barangay_name}`,
        'barangay',
        barangayId
      );
    }

    return { status: 'success', data };

  } catch (error) {
    console.error('Error toggling barangay status:', error);
    return { status: 'error', message: 'Failed to update barangay status' };
  }
}

export async function getBarangayById(barangayId: string) {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from('barangay')
      .select('*')
      .eq('barangay_id', barangayId)
      .single();

    if (error) throw error;
    return data;

  } catch (error) {
    console.error('Error fetching barangay:', error);
    throw new Error('Failed to fetch barangay');
  }
}