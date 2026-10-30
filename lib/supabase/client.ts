import { createBrowserClient } from '@supabase/ssr'
import config from '@/config/config'

export function createClient() {
  return createBrowserClient(
    config.env.supabase.supabaseUrl!,
    config.env.supabase.supabaseKey!,
  )
}