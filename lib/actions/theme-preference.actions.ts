'use server'

import { createClient } from '@/lib/supabase/server'

export type ThemeChoice = 'light' | 'dark' | 'system'

function isThemeChoice(value: string | null | undefined): value is ThemeChoice {
  return value === 'light' || value === 'dark' || value === 'system'
}

export async function getThemePreference(): Promise<ThemeChoice> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 'system'

  const { data, error } = await supabase
    .from('user_theme_preferences')
    .select('theme')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error || !isThemeChoice(data?.theme)) return 'system'
  return data.theme
}

export async function saveThemePreference(theme: ThemeChoice): Promise<{ status: 'success' | 'error'; message?: string }> {
  if (!isThemeChoice(theme)) {
    return { status: 'error', message: 'Choose light, dark, or system.' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { status: 'error', message: 'Sign in to save your theme.' }

  const { error } = await supabase
    .from('user_theme_preferences')
    .upsert(
      { user_id: user.id, theme, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )

  if (error) {
    console.error('saveThemePreference:', error)
    return { status: 'error', message: 'Could not save your theme preference.' }
  }

  return { status: 'success' }
}
