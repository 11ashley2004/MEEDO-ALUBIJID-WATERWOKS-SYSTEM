// lib/serverClient.ts\
import config from '@/config/config'
import { createClient } from '@supabase/supabase-js';

export function createServerClient() {
  return createClient(
    config.env.supabase.supabaseUrl!,
    config.env.supabase.supabaseServerRoleKey!,// server-only
  );
}
