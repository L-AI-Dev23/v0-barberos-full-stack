import type { SupabaseClient } from '@supabase/supabase-js'
import type { Profile, Organization } from '@/lib/types/database'

export type UserProfile = Profile & { organizations: Organization | null }

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

  return { ...(profile as Profile), organizations: organization }
}
