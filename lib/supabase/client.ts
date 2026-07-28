import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

// Lock "no-op": reemplaza el navigator.locks interno de GoTrueClient.
// Ese lock sirve para coordinar refresh de token entre pestañas, pero tiene
// un bug conocido y no resuelto (issues abiertos en supabase-js 2024-2026):
// puede quedar huérfano/colgado para siempre (típico al volver de una
// pestaña en background con React Strict Mode), y una vez colgado, TODAS
// las llamadas de auth posteriores (getUser, getSession, refresh, etc.)
// quedan encoladas esperando ese lock indefinidamente. Nuestra app no
// depende de sincronización perfecta entre pestañas, así que ejecutamos el
// callback directamente sin usar navigator.locks.
async function noOpLock<R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> {
  return fn()
}

export function createClient() {
  if (client) return client

  client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        lock: noOpLock,
      },
    },
  )

  return client
}