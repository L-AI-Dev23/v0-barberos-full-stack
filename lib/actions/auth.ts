'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { loadUserProfile } from '@/lib/auth/profile-loader'

export async function checkAndCreateCoupon(clientId: string, organizationId: string) {
  const supabase = await createClient()
  
  // Get client current stamps
  const { data: client } = await supabase
    .from('loyalty_clients')
    .select('stamps')
    .eq('id', clientId)
    .single()
  
  if (!client) return { error: 'Cliente no encontrado' }
  
  // If stamps >= 5, create coupon and reset stamps
  if (client.stamps >= 5) {
    // Create coupon
    await supabase
      .from('loyalty_coupons')
      .insert({
        organization_id: organizationId,
        client_id: clientId,
        description: 'Corte gratis',
        status: 'disponible'
      })
    
    // Reset stamps to 0
    await supabase
      .from('loyalty_clients')
      .update({ stamps: 0 })
      .eq('id', clientId)
    
    return { success: true, couponCreated: true }
  }
  
  return { success: true, couponCreated: false }
}

export async function signUp(formData: FormData) {
  const supabase = await createClient()

  const fullName = formData.get('fullName') as string
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const businessName = formData.get('businessName') as string | null
  const invitationCode = formData.get('invitationCode') as string | null

  // Determine role and organization based on inputs
  let organizationId: string | null = null
  let role: 'admin' | 'employee' = 'admin'
  let modulePermissions = {}

  // If business name is provided, create as admin with new org
  if (businessName && businessName.trim()) {
    // Create organization first
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({ name: businessName.trim() })
      .select()
      .single()

    if (orgError) {
      return { error: orgError.message }
    }

    organizationId = org.id
    role = 'admin'
    modulePermissions = {
      dashboard: true,
      services: true,
      inventory: true,
      collaborators: true,
      pos: true,
      loyalty: true,
      appointments: true,
      configuration: true,
    }
  } else if (invitationCode && invitationCode.trim()) {
    // Look up invitation code
    const { data: invitation, error: invError } = await supabase
      .from('invitation_codes')
      .select('*')
      .eq('code', invitationCode.trim().toUpperCase())
      .eq('used', false)
      .single()

    if (invError || !invitation) {
      return { error: 'Invalid or already used invitation code' }
    }

    organizationId = invitation.organization_id
    role = 'employee'
    modulePermissions = invitation.module_permissions
  } else {
    return { error: 'Please provide either a business name or an invitation code' }
  }

  // Sign up the user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo:
        process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ??
        `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/callback`,
      data: {
        full_name: fullName,
        role,
        organization_id: organizationId,
      },
    },
  })

  if (authError) {
    return { error: authError.message }
  }

  if (!authData.user) {
    return { error: 'Failed to create user' }
  }

  // Create profile
  const { error: profileError } = await supabase
    .from('profiles')
    .insert({
      id: authData.user.id,
      full_name: fullName,
      email,
      role,
      organization_id: organizationId,
      module_permissions: modulePermissions,
    })

  if (profileError) {
    return { error: profileError.message }
  }

  // If employee, mark invitation code as used
  if (role === 'employee' && invitationCode) {
    await supabase
      .from('invitation_codes')
      .update({
        used: true,
        used_by: authData.user.id,
        used_at: new Date().toISOString(),
      })
      .eq('code', invitationCode.trim().toUpperCase())
  }

  return { success: true, needsEmailConfirmation: !authData.session }
}

export async function signIn(formData: FormData) {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return { error: error.message }
  }

  redirect('/dashboard')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/auth/login')
}

export async function getCurrentUser() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return null
  }

  return loadUserProfile(supabase, user.id)
}
