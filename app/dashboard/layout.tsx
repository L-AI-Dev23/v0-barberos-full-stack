import { AuthProvider } from '@/lib/context/auth-context'
import { Sidebar } from '@/components/dashboard/sidebar'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-background">
        <Sidebar />
        <main className="md:ml-64 min-h-screen">
          <div className="p-4 md:p-8">
            {children}
          </div>
        </main>
      </div>
    </AuthProvider>
  )
}
