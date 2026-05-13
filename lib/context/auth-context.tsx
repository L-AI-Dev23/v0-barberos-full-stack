'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile, Organization, ModulePermissions } from '@/lib/types/database'
import type { User } from '@supabase/supabase-js'

interface AuthContextType {
  user: User | null
  profile: (Profile & { organizations: Organization }) | null
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<(Profile & { organizations: Organization }) | null>(null)
  const [loading, setLoading] = useState(true)

  const supabase = createClient()

  async function fetchProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('*, organizations(*)')
      .eq('id', userId)
      .single()
    
    setProfile(data)
  }

  async function refreshProfile() {
    if (user) {
      await fetchProfile(user.id)
    }
  }

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      
      if (user) {
        await fetchProfile(user.id)
      }
      
      setLoading(false)
    }

    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null)
        
        if (session?.user) {
          await fetchProfile(session.user.id)
        } else {
          setProfile(null)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const isAdmin = profile?.role === 'admin'

  function hasPermission(module: keyof ModulePermissions): boolean {
    if (isAdmin) return true
    return profile?.module_permissions?.[module] === true
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin, hasPermission, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
