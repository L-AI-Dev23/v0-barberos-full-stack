import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { UserRole } from '@/lib/types/database'

export interface AuthenticatedProfile {
  id: string
  role: UserRole
  organization_id: string
}

export async function getAuthenticatedProfile(): Promise<AuthenticatedProfile | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, organization_id')
    .eq('id', user.id)
    .single()

  if (!profile?.organization_id) {
    return null
  }

  return profile as AuthenticatedProfile
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
}

export function forbiddenResponse() {
  return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
}

export function requireOrgMembership(
  profile: AuthenticatedProfile,
  organizationId: string,
) {
  return profile.organization_id === organizationId
}

export function requireAdmin(profile: AuthenticatedProfile) {
  return profile.role === 'admin'
}
