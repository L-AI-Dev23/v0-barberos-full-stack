'use client'

import { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react'
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
  const profileRef = useRef(profile)
  const fetchingRef = useRef(false)

  // Keep ref in sync with state
  useEffect(() => {
    profileRef.current = profile
  }, [profile])

  const supabase = createClient()

  const fetchProfile = useCallback(async (userId: string, retries = 3): Promise<void> => {
    if (fetchingRef.current) return
    fetchingRef.current = true
    
    for (let i = 0; i < retries; i++) {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*, organizations(*)')
          .eq('id', userId)
          .single()
        
        if (error) {
  
          if (i < retries - 1) {
            await new Promise(r => setTimeout(r, 1000 * (i + 1)))
            continue
          }
        }
        
        if (data) {
          // If role is not set and user has organization, check if they should be admin
          if (!data.role && data.organization_id) {
            const { data: otherUsers } = await supabase
              .from('profiles')
              .select('id')
              .eq('organization_id', data.organization_id)
              .neq('id', userId)
            
            // If no other users, make this user admin
            if (!otherUsers || otherUsers.length === 0) {
              const { data: updatedData } = await supabase
                .from('profiles')
                .update({
                  role: 'admin',
                  module_permissions: {
                    dashboard: true,
                    services: true,
                    inventory: true,
                    collaborators: true,
                    pos: true,
                    loyalty: true,
                    configuration: true,
                  }
                })
                .eq('id', userId)
                .select('*, organizations(*)')
                .single()
              
              if (updatedData) {
                setProfile(updatedData)
                fetchingRef.current = false
                return
              }
            }
          }
          
          setProfile(data)
          fetchingRef.current = false
          return
        }
      } catch (err) {
        if (i < retries - 1) {
          await new Promise(r => setTimeout(r, 1000 * (i + 1)))
        }
      }
    }
    
    fetchingRef.current = false
  }, [supabase])

  const refreshProfile = useCallback(async () => {
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    if (currentUser) {
      fetchingRef.current = false // Reset to allow refetch
      await fetchProfile(currentUser.id)
    }
  }, [supabase, fetchProfile])

  useEffect(() => {
    let mounted = true

    async function init() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const currentUser = session?.user ?? null
        
        if (!mounted) return
        
        setUser(currentUser)
        
        if (currentUser) {
          await fetchProfile(currentUser.id)
        }
      } catch {
        // Silently handle init errors
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
        } else if (currentUser && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION')) {
          // Use ref to check current profile value (avoids stale closure)
          const currentProfile = profileRef.current
          if (!currentProfile || currentProfile.id !== currentUser.id) {
            fetchingRef.current = false // Reset to allow refetch
            await fetchProfile(currentUser.id)
          }
          setLoading(false)
        }
      }
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [supabase, fetchProfile])

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
