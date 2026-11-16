import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** Every createClient() call, so a test can see what the module asked supabase-js for. */
const created = vi.hoisted(() => [] as { url: string, key: string, options: unknown, client: object }[])

vi.mock('@supabase/supabase-js', () => ({
  createClient: (url: string, key: string, options: unknown) => {
    const client = { fake: created.length }
    created.push({ url, key, options, client })
    return client
  },
}))

/** A fresh copy of the module, so its cached client never leaks from one test into the next. */
const loadConfig = () => import('./multiplayerConfig')

const configure = (url: string | undefined, key: string | undefined) => {
  vi.stubEnv('VITE_SUPABASE_URL', url)
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', key)
}

beforeEach(() => {
  vi.resetModules()
  created.length = 0
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('isMultiplayerConfigured', () => {
  it('is true when both the URL and the key are set', async () => {
    configure('https://example.supabase.co', 'sb_publishable_key')
    const { isMultiplayerConfigured } = await loadConfig()

    expect(isMultiplayerConfigured()).toBe(true)
  })

  it('is false when either value is missing', async () => {
    const { isMultiplayerConfigured } = await loadConfig()

    configure(undefined, 'sb_publishable_key')
    expect(isMultiplayerConfigured(), 'URL unset').toBe(false)

    configure('https://example.supabase.co', undefined)
    expect(isMultiplayerConfigured(), 'key unset').toBe(false)

    configure(undefined, undefined)
    expect(isMultiplayerConfigured(), 'both unset').toBe(false)
  })

  it('treats a whitespace-only value as missing', async () => {
    const { isMultiplayerConfigured } = await loadConfig()

    configure('   ', 'sb_publishable_key')
    expect(isMultiplayerConfigured(), 'blank URL').toBe(false)

    configure('https://example.supabase.co', '\t\n')
    expect(isMultiplayerConfigured(), 'blank key').toBe(false)
  })

  it('reads the environment on every call rather than once at import', async () => {
    configure(undefined, undefined)
    const { isMultiplayerConfigured } = await loadConfig()
    expect(isMultiplayerConfigured()).toBe(false)

    configure('https://example.supabase.co', 'sb_publishable_key')
    expect(isMultiplayerConfigured()).toBe(true)
  })
})

describe('getSupabaseClient', () => {
  it('throws naming both variables when multiplayer is not configured', async () => {
    configure('https://example.supabase.co', '  ')
    const { getSupabaseClient } = await loadConfig()

    expect(() => getSupabaseClient()).toThrow(
      'Online races need VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY',
    )
    expect(created, 'no client is built before the check passes').toHaveLength(0)
  })

  it('builds the client from the trimmed URL and key', async () => {
    configure('  https://example.supabase.co\n', '\tsb_publishable_key ')
    const { getSupabaseClient } = await loadConfig()

    getSupabaseClient()

    expect(created).toHaveLength(1)
    expect(created[0].url).toBe('https://example.supabase.co')
    expect(created[0].key).toBe('sb_publishable_key')
  })

  it('keeps the session, refreshes it, and ignores tokens in the URL', async () => {
    configure('https://example.supabase.co', 'sb_publishable_key')
    const { getSupabaseClient } = await loadConfig()

    getSupabaseClient()

    expect(created[0].options).toEqual({
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  })

  it('builds the client once and hands the same one back afterwards', async () => {
    configure('https://example.supabase.co', 'sb_publishable_key')
    const { getSupabaseClient } = await loadConfig()

    const first = getSupabaseClient()
    const second = getSupabaseClient()

    expect(second).toBe(first)
    expect(created).toHaveLength(1)
    expect(first).toBe(created[0].client)
  })

  it('still throws once configuration is withdrawn, even with a client cached', async () => {
    configure('https://example.supabase.co', 'sb_publishable_key')
    const { getSupabaseClient } = await loadConfig()
    getSupabaseClient()

    configure(undefined, undefined)

    expect(() => getSupabaseClient()).toThrow('Online races need')
  })
})
