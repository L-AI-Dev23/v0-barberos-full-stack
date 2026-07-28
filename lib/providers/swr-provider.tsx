'use client'

import { SWRConfig } from 'swr'

// Por defecto, SWR revalida TODAS las queries activas cuando la pestaña
// vuelve a tener foco (revalidateOnFocus: true). Con 8 páginas del
// dashboard usando useSWR (algunas con 2-3 queries cada una), volver a la
// pestaña dispara varias llamadas a Supabase en paralelo, y esas llamadas
// vuelven a competir por el mismo lock interno de auth que ya identificamos
// como causa del cuelgue. Desactivamos revalidateOnFocus/Reconnect a nivel
// global para que cambiar de pestaña no dispare esta tormenta de refetches.
export function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
      }}
    >
      {children}
    </SWRConfig>
  )
}
