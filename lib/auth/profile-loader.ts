import type { SupabaseClient } from '@supabase/supabase-js'
import type { Profile, Organization, ModulePermissions } from '@/lib/types/database'

export type UserProfile = Profile & { organizations: Organization | null }

const ADMIN_PERMISSIONS: ModulePermissions = {
  dashboard: true,
  services: true,
  inventory: true,
  collaborators: true,
  pos: true,
  loyalty: true,
  appointments: true,
  configuration: true,
}

async function loadOrganization(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<Organization | null> {
  const { data: org } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', organizationId)
    .maybeSingle()

  if (org) {
    return org as Organization
  }

  const { data: publicOrg } = await supabase
    .from('organizations_public')
    .select('*')
    .eq('id', organizationId)
    .maybeSingle()

  if (!publicOrg) {
    return null
  }

  return {
    ...publicOrg,
    whatsapp_api_url: null,
    whatsapp_api_key: null,
    whatsapp_instance_name: null,
    whatsapp_connected: false,
  } as Organization
}

async function ensureAdminRole(
  supabase: SupabaseClient,
  userId: string,
  profile: Profile,
  organization: Organization | null,
): Promise<UserProfile> {
  if (profile.role === 'admin' || !profile.organization_id) {
    return { ...profile, organizations: organization }
  }

  const { data: admins } = await supabase
    .from('profiles')
    .select('id')
    .eq('organization_id', profile.organization_id)
    .eq('role', 'admin')

  if (admins && admins.length > 0) {
    return { ...profile, organizations: organization }
  }

  const { data: updatedProfile } = await supabase
    .from('profiles')
    .update({
      role: 'admin',
      module_permissions: ADMIN_PERMISSIONS,
    })
    .eq('id', userId)
    .select('*')
    .single()

  if (updatedProfile) {
    return { ...updatedProfile, organizations: organization } as UserProfile
  }

  return { ...profile, organizations: organization }
}

export async function loadUserProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserProfile | null> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  if (error || !profile) {
    return null
  }

  const organization = profile.organization_id
    ? await loadOrganization(supabase, profile.organization_id)
    : null

  return ensureAdminRole(supabase, userId, profile as Profile, organization)
}
