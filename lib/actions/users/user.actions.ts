'use server'

import { createClient } from '@/lib/supabase/server';
import { createServerClient } from '@/lib/supabase/serverClient';
import { createAuditLog } from '../audit.action';

const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB
const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

interface CreateUserData {
  first_name: string;
  last_name: string;
  middle_name?: string | null;
  email: string;
  phone: string;
  role: string;
  password: string;
  profile?: File | null;
}

interface UpdateUserData {
  first_name?: string;
  last_name?: string;
  middle_name?: string | null;
  email?: string;
  contact_number?: string;
  is_active?: boolean;
  profile?: File | null;
}

export interface UserRole {
  role_id: string
  role_name: string
}

export interface User {
  user_id: string
  first_name: string
  last_name: string
  middle_name: string | null
  email: string
  contact_number: string
  is_active: boolean
  last_active: string | null
  profile_image: string | null
  role: UserRole | null  
}

// ─── Helper Functions ────────────────────────────────────────────────────────

async function uploadProfileImage(userId: string, file: File): Promise<string | null> {
  if (file.size > MAX_FILE_SIZE || !ALLOWED_MIME_TYPES.includes(file.type)) {
    return null;
  }

  const supabase = await createClient();
  const fileExt = file.name.split('.').pop();
  const fileName = `${userId}/${userId}-${Date.now()}.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from('profile-images')
    .upload(fileName, file, { contentType: file.type, upsert: true });

  if (uploadError) {
    console.error('Profile upload error:', uploadError);
    return null;
  }

  const { data: { publicUrl } } = supabase.storage.from('profile-images').getPublicUrl(fileName);
  return publicUrl;
}

async function deleteProfileImage(imageUrl: string): Promise<void> {
  try {
    const supabase = await createClient();
    const url = new URL(imageUrl);
    const pathIndex = url.pathname.indexOf('/profile-images/');
    if (pathIndex === -1) return;
    
    const filePath = url.pathname.slice(pathIndex + '/profile-images/'.length);
    await supabase.storage.from('profile-images').remove([filePath]);
  } catch (err) {
    console.error('Failed to delete profile image:', err);
  }
}

// ─── Validation Functions ────────────────────────────────────────────────────

async function isEmailUnique(email: string, excludeUserId?: string): Promise<boolean> {
  const supabase = await createClient();
  
  let query = supabase.from('users').select('user_id').eq('email', email);
  
  if (excludeUserId) {
    query = query.neq('user_id', excludeUserId);
  }
  
  const { data, error } = await query;
  
  if (error) {
    console.error('Error checking email uniqueness:', error);
    return false;
  }
  
  return data?.length === 0;
}

async function isPhoneUnique(phone: string, excludeUserId?: string): Promise<boolean> {
  const supabase = await createClient();
  
  let query = supabase.from('users').select('user_id').eq('contact_number', phone);
  
  if (excludeUserId) {
    query = query.neq('user_id', excludeUserId);
  }
  
  const { data, error } = await query;
  
  if (error) {
    console.error('Error checking phone uniqueness:', error);
    return false;
  }
  
  return data?.length === 0;
}

// ─── Main CRUD Functions ─────────────────────────────────────────────────────

export async function getAllUsers() {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from('users')
      .select(`
        user_id, 
        first_name, 
        last_name, 
        middle_name, 
        email, 
        contact_number, 
        is_active, 
        last_active, 
        profile_image,
        role:roles(role_id, role_name)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    return (data ?? []) as unknown as User[];
  } catch (error) {
    console.error('Error fetching users:', error);
    throw new Error('Failed to fetch users');
  }
}

export async function getUserById(userId: string) {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from('users')
      .select(`
        user_id, 
        first_name, 
        last_name, 
        middle_name, 
        email,
        contact_number, 
        is_active, 
        last_active, 
        profile_image,
        role:roles(role_id, role_name)
      `)
      .eq('user_id', userId)
      .single();

    if (error) throw error;

    return data ;
  } catch (error) {
    console.error('Error fetching user:', error);
    throw new Error('Failed to fetch user');
  }
}

export async function createUser(userData: CreateUserData) {
  const supabase = await createClient();
  const adminSupabase = createServerClient();

  // Validate file
  if (userData.profile) {
    if (userData.profile.size > MAX_FILE_SIZE) {
      return { status: 'error', message: 'Profile image must be 1 MB or less.' };
    }
    if (!ALLOWED_MIME_TYPES.includes(userData.profile.type)) {
      return { status: 'error', message: 'Only PNG, JPG, and WEBP images are allowed.' };
    }
  }

  // Check uniqueness against your users table
  const isEmailAvailable = await isEmailUnique(userData.email);
  if (!isEmailAvailable) {
    return { status: 'error', message: 'Email address is already registered.' };
  }

  const isPhoneAvailable = await isPhoneUnique(userData.phone);
  if (!isPhoneAvailable) {
    return { status: 'error', message: 'Phone number is already registered.' };
  }

  try {
    const { data: { user: actorUser } } = await supabase.auth.getUser();

    // ── 1. Create auth user FIRST ──────────────────────────────────────────
    // This catches duplicate emails in Supabase Auth before we touch the DB.
    // email_confirm: false — leaves the account unconfirmed so Supabase
    // sends its own "Confirm signup" email (OTP) and the mobile app's
    // first-login / verify-email flow has something to verify.
    const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
      email: userData.email,
      password: userData.password,
      email_confirm: false,
      user_metadata: {
        first_name: userData.first_name,
        last_name: userData.last_name,
        middle_name: userData.middle_name,
      },
    });

    if (authError) {
      // Auth rejected it (e.g. email already exists in auth) — nothing inserted yet
      if (authError.message.toLowerCase().includes('already')) {
        return { status: 'error', message: 'Email address is already registered.' };
      }
      return { status: 'error', message: authError.message };
    }

    const authUserId = authData.user.id;

    // ── 2. Insert into your users table using the auth user's ID ──────────
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert({
        user_id: authUserId,          // keep IDs in sync
        role_id: userData.role,
        first_name: userData.first_name,
        middle_name: userData.middle_name || null,
        last_name: userData.last_name,
        email: userData.email,
        contact_number: userData.phone,
        is_active: true,
        is_default_password: true,    // forces set-password after first verify
        created_at: new Date().toISOString(),
      })
      .select(`*, role:roles(role_name)`)
      .single();

    if (insertError) {
      // Rollback: remove the auth user so we don't leave an orphan
      await adminSupabase.auth.admin.deleteUser(authUserId);
      throw insertError;
    }

    // ── 3. Upload profile image if provided ───────────────────────────────
    let profileImageUrl: string | null = null;
    if (userData.profile) {
      profileImageUrl = await uploadProfileImage(authUserId, userData.profile);
      if (profileImageUrl) {
        await supabase
          .from('users')
          .update({ profile_image: profileImageUrl })
          .eq('user_id', authUserId);
      }
    }

    // ── 4. Audit log ──────────────────────────────────────────────────────
    if (actorUser) {
      const roleName = newUser.role?.role_name || 'Unknown Role';
      await createAuditLog(
        actorUser.id,
        'CREATE',
        `Created new user: ${userData.first_name} ${userData.last_name} (${userData.email}) with role: ${roleName}`,
        'users',
        authUserId,
      );
    }

    return { status: 'success', data: newUser, message: 'User created successfully' };
  } catch (error) {
    console.error('Error creating user:', error);
    return { status: 'error', message: 'Failed to create user' };
  }
}

export async function updateUser(userId: string, userData: UpdateUserData) {
  const supabase = await createClient();

  // Validate file if provided
  if (userData.profile) {
    if (userData.profile.size > MAX_FILE_SIZE) {
      return { status: 'error', message: 'Profile image must be 1 MB or less.' };
    }
    if (!ALLOWED_MIME_TYPES.includes(userData.profile.type)) {
      return { status: 'error', message: 'Only PNG, JPG, and WEBP images are allowed.' };
    }
  }

  // Check email uniqueness if email is being updated
  if (userData.email) {
    const isEmailAvailable = await isEmailUnique(userData.email, userId);
    if (!isEmailAvailable) {
      return { status: 'error', message: 'Email address is already registered.' };
    }
  }

  // Check phone uniqueness if phone is being updated
  if (userData.contact_number) {
    const isPhoneAvailable = await isPhoneUnique(userData.contact_number, userId);
    if (!isPhoneAvailable) {
      return { status: 'error', message: 'Phone number is already registered.' };
    }
  }

  try {
    // Get original user data for audit and image handling
    const { data: originalUser } = await supabase
      .from('users')
      .select('*')
      .eq('user_id', userId)
      .single();

    const { data: { user: actorUser } } = await supabase.auth.getUser();

    // Handle profile image
    let profileImageUrl: string | null = originalUser?.profile_image ?? null;
    if (userData.profile) {
      if (originalUser?.profile_image) {
        await deleteProfileImage(originalUser.profile_image);
      }
      profileImageUrl = await uploadProfileImage(userId, userData.profile);
    }

    // Remove profile from update data to avoid sending File object
    const { profile, ...restUserData } = userData;

    const { data, error } = await supabase
      .from('users')
      .update({
        ...restUserData,
        profile_image: profileImageUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .select(`*, role:roles(role_name)`)
      .single();

    if (error) throw error;

    // Audit log
    if (actorUser && originalUser) {
      const changes = Object.keys(restUserData)
        .filter((key) => restUserData[key as keyof typeof restUserData] !== undefined)
        .map((key) => {
          const oldVal = originalUser[key as keyof typeof originalUser];
          const newVal = restUserData[key as keyof typeof restUserData];
          return `${key}: ${oldVal} → ${newVal}`;
        })
        .join(', ');

      const profileChange = userData.profile ? ', profile_image: updated' : '';

      await createAuditLog(
        actorUser.id,
        'UPDATE',
        `Updated user ${data.first_name} ${data.last_name}: ${changes}${profileChange}`,
        'users',
        userId,
      );
    }

    return { status: 'success', data };
  } catch (error) {
    console.error('Error updating user:', error);
    return { status: 'error', message: 'Failed to update user' };
  }
}

export async function toggleUserStatus(userId: string, currentStatus: boolean) {
  const supabase = await createClient();

  try {
    const { data: userInfo } = await supabase
      .from('users')
      .select('first_name, last_name')
      .eq('user_id', userId)
      .single();

    const { data: { user: actorUser } } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('users')
      .update({
        is_active: !currentStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .select();

    if (error) throw error;

    if (actorUser && userInfo) {
      const newStatus = !currentStatus ? 'activated' : 'deactivated';
      await createAuditLog(
        actorUser.id,
        'STATUS_CHANGE',
        `${newStatus} user: ${userInfo.first_name} ${userInfo.last_name}`,
        'users',
        userId,
      );
    }

    return { status: 'success', data };
  } catch (error) {
    console.error('Error toggling user status:', error);
    return { status: 'error', message: 'Failed to update user status' };
  }
}

export async function updateUserLastLogin(userId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from('users')
    .update({ last_active: new Date().toISOString() })
    .eq('user_id', userId);

  if (error) {
    console.error('Failed to update user login activity:', error);
    throw new Error('Unable to update login activity');
  }
}

// ============================================================
// FIX: getCurrentUser() — consumer branch
// ------------------------------------------------------------
// Root cause: the `consumers` table has an `account_name` column, not
// `first_name`/`last_name` (see the Consumer interface in
// consumer.actions.ts). The old query below selected columns that don't
// exist on `consumers`, which errors out at the DB/PostgREST level —
// so `consumerData` always came back null/undefined, this function fell
// through to `return null`, and the Header component (whose
// `currentUser` state never left null) got stuck showing "Loading…"
// forever for every consumer.
//
// Fix: select `account_name` (the real column) and return it as
// `account_name` on the result object — which is exactly what
// Header.tsx's getDisplayName()/getInitials() already check for via
// `currentUser.userType === 'consumer' && currentUser.account_name`.
// ============================================================

export async function getCurrentUser() {
  const supabase = await createClient();

  try {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return null;

    // 1. Try staff (users table)
    const { data: staffData } = await supabase
      .from('users')
      .select(`
        user_id,
        first_name,
        last_name,
        email,
        profile_image,
        role:roles!inner(role_name)
      `)
      .eq('user_id', authUser.id)
      .maybeSingle();

    if (staffData) {
      return {
        ...staffData,
        role: Array.isArray(staffData.role) ? (staffData.role[0] ?? null) : staffData.role,
        userType: 'staff' as const,
      };
    }

    // 2. Try consumer
    // ─── FIX: select account_name, not first_name/last_name — the
    // consumers table doesn't have those columns.
    const { data: consumerData, error: consumerError } = await supabase
      .from('consumers')
      .select('consumer_id, account_name, email')
      .eq('consumer_id', authUser.id)
      .maybeSingle();

    if (consumerError) {
      console.error('Error fetching consumer in getCurrentUser:', consumerError);
    }

    if (consumerData) {
      return {
        user_id: consumerData.consumer_id,
        account_name: consumerData.account_name,
        email: consumerData.email,
        profile_image: null,
        role: { role_name: 'consumer' },
        userType: 'consumer' as const,
      };
    }

    return null;
  } catch (error) {
    console.error('Error fetching current user:', error);
    return null;
  }
}