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

export function AuthProvider({
  children,
  initialUser = null,
  initialProfile = null,
}: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(initialUser)
  const [profile, setProfile] = useState<UserProfile | null>(initialProfile)
  const [loading, setLoading] = useState(!initialProfile && !!initialUser)

  const supabase = createClient()

  // Secuenciador de peticiones: si llegan varias respuestas de perfil fuera de
  // orden (p. ej. tras reactivar una pestaña que estuvo minutos en segundo
  // plano y Supabase dispara varios TOKEN_REFRESHED seguidos), solo se aplica
  // el resultado de la petición más reciente. Sin esto, una respuesta vieja
  // que llega tarde puede pisar el estado bueno con uno obsoleto.
  const requestIdRef = useRef(0)
  // Id del usuario cuyo perfil ya tenemos cargado, para evitar refetchear
  // (y por tanto evitar exponernos a la carrera) cuando el evento de
  // Supabase es solo un refresco de token del MISMO usuario.
  const loadedUserIdRef = useRef<string | null>(initialProfile?.id ?? null)

  // Si al volver de otra pestaña el refresco de sesión de Supabase se queda
  // colgado (bug conocido: el timer de auto-refresh se retrasa por el
  // throttling del navegador en segundo plano y el intento de refresh al
  // reactivar la pestaña puede quedar esperando un lock interno que nunca
  // se libera), esta petición de perfil nunca resolvería y la UI se
  // quedaría en "Cargando..." para siempre. Este timeout evita ese cuelgue:
  // si no hay respuesta en 8s, seguimos con lo que tengamos en vez de
  // bloquear la pantalla indefinidamente.
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

  const fetchProfile = useCallback(async (userId: string) => {
    const requestId = ++requestIdRef.current
    const loadedProfile = await withTimeout(loadUserProfile(supabase, userId), 8000)

    // Si mientras esperábamos esta respuesta se lanzó una petición más nueva,
    // esta respuesta está obsoleta: se descarta para no corromper el estado.
    if (requestId !== requestIdRef.current) {
      return loadedProfile
    }

    if (loadedProfile) {
      setProfile(loadedProfile)
      loadedUserIdRef.current = userId
    }
    return loadedProfile
  }, [supabase])

  const refreshProfile = useCallback(async () => {
    const { data: { user: currentUser } } = await supabase.auth.getUser()
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
        const { data: { user: currentUser } } = await supabase.auth.getUser()

        if (!mounted) return

        setUser(currentUser)

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
          loadedUserIdRef.current = null
          setProfile(null)
          setLoading(false)
          return
        }

        if (event === 'TOKEN_REFRESHED') {
          // Un TOKEN_REFRESHED (incluido el que dispara Supabase al volver
          // de otra pestaña) SOLO renueva el JWT. El perfil y el rol no
          // cambian por esto. No se toca `loading` ni se vuelve a consultar
          // la base de datos: justamente eso era lo que dejaba la pantalla
          // congelada en "Cargando..." si esa consulta se colgaba al
          // dispararse en el momento en que la pestaña recién despierta.
          return
        }

        if (currentUser && event === 'SIGNED_IN') {
          // Login real (nuevo inicio de sesión). Aquí sí hace falta cargar
          // el perfil desde cero.
          setLoading(true)
          await fetchProfile(currentUser.id)
          setLoading(false)
        }
      },
    )

    // Al volver a esta pestaña, no esperamos a que el timer interno de
    // Supabase note el cambio (puede haberse retrasado por el throttling
    // en segundo plano). Forzamos nosotros la comprobación de sesión: si
    // sigue viva no pasa nada visible; si el token ya venció mientras
    // estábamos en otra pestaña, esto dispara el refresh de inmediato en
    // vez de dejarlo pendiente de un timer que puede quedarse colgado.
    function handleVisibility() {
      if (document.visibilityState === 'visible') {
        supabase.auth.getSession().catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      mounted = false
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibility)
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