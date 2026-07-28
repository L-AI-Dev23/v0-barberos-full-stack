'use client'

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { loadUserProfile, type UserProfile } from '@/lib/auth/profile-loader'
import type { ModulePermissions } from '@/lib/types/database'
import type { User } from '@supabase/supabase-js'

interface AuthContextType {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  isAdmin: boolean
  hasPermission: (module: keyof ModulePermissions) => boolean
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  hasPermission: () => false,
  refreshProfile: async () => {},
})

interface AuthProviderProps {
  children: React.ReactNode
  initialUser?: User | null
  initialProfile?: UserProfile | null
}

// Envuelve cualquier promesa de Supabase (getUser, getSession, la carga de
// perfil, etc.) con un límite de tiempo. Las llamadas de auth de Supabase
// comparten un lock interno: si UNA se cuelga (bug conocido al reactivar una
// pestaña que estuvo en background), todas las siguientes que dependan de
// ese lock se quedan esperando también. Sin este timeout, cualquiera de esas
// llamadas puede dejar el `loading` en true para siempre.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms)
    promise.then((result) => {
      clearTimeout(timer)
      resolve(result)
    }).catch(() => {
      clearTimeout(timer)
      resolve(null)
    })
  })
}

export function AuthProvider({
  children,
  initialUser = null,
  initialProfile = null,
}: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(initialUser)
  const [profile, setProfile] = useState<UserProfile | null>(initialProfile)
  const [loading, setLoading] = useState(!initialProfile && !!initialUser)

  const supabase = createClient()

  // Secuenciador de peticiones: si llegan varias respuestas de perfil fuera
  // de orden, solo se aplica la más reciente.
  const requestIdRef = useRef(0)

  // Recuerda el userId ya autenticado en esta pestaña. GoTrueClient puede
  // volver a emitir SIGNED_IN (en vez de TOKEN_REFRESHED) al recuperar el
  // foco de la pestaña, sin que haya habido un logout real de por medio.
  // Usamos esto para distinguir ese caso (mismo usuario) de un login nuevo
  // de verdad (usuario distinto o primera vez), y así no volver a poner
  // loading=true ni re-consultar el perfil innecesariamente.
  const currentUserIdRef = useRef<string | null>(initialUser?.id ?? null)

  const fetchProfile = useCallback(async (userId: string) => {
    const requestId = ++requestIdRef.current
    const loadedProfile = await withTimeout(loadUserProfile(supabase, userId), 8000)

    if (requestId !== requestIdRef.current) {
      return loadedProfile
    }

    if (loadedProfile) {
      setProfile(loadedProfile)
    }
    return loadedProfile
  }, [supabase])

  const refreshProfile = useCallback(async () => {
    const result = await withTimeout(supabase.auth.getUser(), 8000)
    const currentUser = result?.data?.user ?? null
    if (currentUser) {
      setLoading(true)
      await fetchProfile(currentUser.id)
      setLoading(false)
    }
  }, [supabase, fetchProfile])

  useEffect(() => {
    let mounted = true

    async function init() {
      if (initialProfile && initialUser) {
        setLoading(false)
        return
      }

      try {
        const result = await withTimeout(supabase.auth.getUser(), 8000)
        const currentUser = result?.data?.user ?? null

        if (!mounted) return

        setUser(currentUser)
        currentUserIdRef.current = currentUser?.id ?? null

        if (currentUser) {
          setLoading(true)
          await fetchProfile(currentUser.id)
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return

        const currentUser = session?.user ?? null
        setUser(currentUser)

        if (event === 'SIGNED_OUT') {
          currentUserIdRef.current = null
          setProfile(null)
          setLoading(false)
          return
        }

        if (event === 'TOKEN_REFRESHED') {
          // TOKEN_REFRESHED (incluido al volver de otra pestaña) SOLO
          // renueva el JWT. El perfil y el rol no cambian por esto: no se
          // toca `loading` ni se vuelve a consultar la base de datos, sin
          // excepciones ni comparaciones de ref.
          return
        }

        if (currentUser && event === 'SIGNED_IN') {
          // GoTrueClient puede reemitir SIGNED_IN al recuperar el foco de
          // la pestaña (recuperación de sesión), aunque no haya habido
          // logout real. Si es el MISMO usuario que ya teníamos, no es un
          // login nuevo: no tocamos loading ni volvemos a pedir el perfil,
          // así el sidebar y la página ya no "parpadean" al cambiar de
          // pestaña, ni se bloquean botones que dependen de Supabase.
          if (currentUserIdRef.current === currentUser.id) {
            return
          }

          // Login real (usuario nuevo o primera vez en esta pestaña).
          currentUserIdRef.current = currentUser.id
          setLoading(true)
          await fetchProfile(currentUser.id)
          setLoading(false)
        }
      },
    )

    // Nota: NO agregamos un listener manual de visibilitychange que llame a
    // supabase.auth.getSession(). supabase-js ya escucha visibility/focus
    // internamente y coordina su propio auto-refresh usando el lock de
    // navigator.locks. Una llamada manual adicional en ese mismo instante
    // compite por el mismo lock justo cuando la red y el tab se están
    // "despertando", y puede quedarse esperando el lock indefinidamente.
    // Dejamos que Supabase maneje esto solo (igual que en el resto de
    // proyectos, donde nunca hubo este listener).

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [supabase, fetchProfile, initialProfile, initialUser])

  const isAdmin = profile?.role === 'admin'

  const hasPermission = useCallback((module: keyof ModulePermissions): boolean => {
    if (profile?.role === 'admin') return true
    return profile?.module_permissions?.[module] === true
  }, [profile])

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin, hasPermission, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)