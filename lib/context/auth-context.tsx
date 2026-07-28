'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
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

  const fetchProfile = useCallback(async (userId: string) => {
    const loadedProfile = await loadUserProfile(supabase, userId)
    if (loadedProfile) {
      setProfile(loadedProfile)
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
          setProfile(null)
          setLoading(false)
          return
        }

        if (currentUser && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
          setLoading(true)
          await fetchProfile(currentUser.id)
          setLoading(false)
        }
      },
    )

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
