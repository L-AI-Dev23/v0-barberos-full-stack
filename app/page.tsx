import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    // Fetch profile to check role and permissions
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, module_permissions')
      .eq('id', user.id)
      .single()

    if (profile?.role === 'admin') {
      redirect('/dashboard')
    } else {
      // For employees, find first accessible module
      const moduleMap: { [key: string]: string } = {
        'services': '/dashboard/services',
        'inventory': '/dashboard/inventory',
        'collaborators': '/dashboard/collaborators',
        'pos': '/dashboard/pos',
        'loyalty': '/dashboard/loyalty',
        'configuration': '/dashboard/configuration',
      }

      const permissions = profile?.module_permissions || {}
      
      for (const [module, path] of Object.entries(moduleMap)) {
        if (permissions[module as keyof typeof permissions]) {
          redirect(path)
        }
      }

      // Fallback to earnings if no other permissions
      redirect('/dashboard/earnings')
    }
  } else {
    redirect('/auth/login')
  }
}
