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
          // Login real (nuevo inicio de sesión).
          setLoading(true)
          await fetchProfile(currentUser.id)
          setLoading(false)
        }
      },
    )

    // Al volver a esta pestaña, forzamos la comprobación de sesión en vez de
    // esperar al timer interno de Supabase (puede haberse retrasado por
    // throttling en background). Con timeout: si esta llamada se cuelga, no
    // debe quedar una promesa flotando ocupando el lock interno de Supabase
    // y bloqueando las llamadas de auth posteriores (incluido el propio
    // auto-refresh).
    function handleVisibility() {
      if (document.visibilityState === 'visible') {
        withTimeout(supabase.auth.getSession(), 8000)
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