import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | undefined

const supabaseUrl = (): string => import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const supabaseKey = (): string => import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? ''

export function isMultiplayerConfigured(): boolean {
  return supabaseUrl().length > 0 && supabaseKey().length > 0
}

export function getSupabaseClient(): SupabaseClient {
  if (!isMultiplayerConfigured()) {
    throw new Error(
      'Online races need VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY',
    )
  }
  client ??= createClient(supabaseUrl(), supabaseKey(), {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  })
  return client
}
