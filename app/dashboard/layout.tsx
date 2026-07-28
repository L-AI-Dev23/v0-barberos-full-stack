import { AuthProvider } from '@/lib/context/auth-context'
import { SWRProvider } from '@/lib/providers/swr-provider'
import { Sidebar } from '@/components/dashboard/sidebar'
import { createClient } from '@/lib/supabase/server'
import { loadUserProfile } from '@/lib/auth/profile-loader'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const profile = user ? await loadUserProfile(supabase, user.id) : null

  return (
    <SWRProvider>
      <AuthProvider initialUser={user} initialProfile={profile}>
        <div className="min-h-screen bg-background">
          <Sidebar />
          <main className="md:ml-64 min-h-screen">
            <div className="p-4 md:p-8">
              {children}
            </div>
          </main>
        </div>
      </AuthProvider>
    </SWRProvider>
  )
}