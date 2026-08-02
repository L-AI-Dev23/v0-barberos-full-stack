'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/context/auth-context'
import { signOut } from '@/lib/actions/auth'
import { Button } from '@/components/ui/button'
import {
  LayoutDashboard,
  Scissors,
  Package,
  Users,
  ShoppingCart,
  Heart,
  CalendarClock,
  Settings,
  Wallet,
  LogOut,
  Menu,
  X,
  UserCircle2,
  Lock,
} from 'lucide-react'
import { useState } from 'react'

const adminNavItems = [
  { href: '/dashboard', label: 'Panel', icon: LayoutDashboard, permission: 'dashboard' as const },
  { href: '/dashboard/services', label: 'Servicios', icon: Scissors, permission: 'services' as const },
  { href: '/dashboard/inventory', label: 'Inventario', icon: Package, permission: 'inventory' as const },
  { href: '/dashboard/collaborators', label: 'Colaboradores', icon: Users, permission: 'collaborators' as const },
  { href: '/dashboard/pos', label: 'P.O.S.', icon: ShoppingCart, permission: 'pos' as const },
  { href: '/dashboard/loyalty', label: 'Fidelidad', icon: Heart, permission: 'loyalty' as const },
  { href: '/dashboard/appointments', label: 'Citas', icon: CalendarClock, permission: 'appointments' as const },
  { href: '/dashboard/configuration', label: 'Configuración', icon: Settings, permission: 'configuration' as const },
]

const employeeNavItems = [
  { href: '/dashboard/earnings', label: 'Ganancias', icon: Wallet, permission: null },
  // Employees with the cash_register permission get a link straight to the
  // Panel, which shows a focused Caja-only view for non-admins.
  { href: '/dashboard', label: 'Caja', icon: Lock, permission: 'cash_register' as const },
  { href: '/dashboard/profile', label: 'Perfil', icon: UserCircle2, permission: null },
]

function dedupeByHref<T extends { href: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  return items.filter(item => {
    if (seen.has(item.href)) return false
    seen.add(item.href)
    return true
  })
}

export function Sidebar() {
  const pathname = usePathname()
  const { user, profile, loading, isAdmin, hasPermission, refreshProfile } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Treat items with permission: null as always visible (e.g. "Ganancias", "Perfil"),
  // and defer to hasPermission for everything else.
  const canSee = (permission: string | null) =>
    permission === null || hasPermission(permission as Parameters<typeof hasPermission>[0])

  const navItems = isAdmin
    ? adminNavItems
    : dedupeByHref(
        adminNavItems
          .filter(item => canSee(item.permission))
          .concat(employeeNavItems.filter(item => canSee(item.permission)))
      )

  return (
    <>
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-4 left-4 z-50 md:hidden"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {/* Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-40 h-screen w-64 border-r bg-sidebar transition-transform md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center gap-2 border-b px-6">
            {profile?.organizations?.logo_url ? (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md overflow-hidden bg-muted">
                <img
                  src={profile.organizations.logo_url}
                  alt={profile.organizations.name}
                  className="h-full w-full object-cover"
                />
              </div>
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary">
                <Scissors className="h-4 w-4 text-primary-foreground" />
              </div>
            )}
            <span className="font-semibold text-lg truncate">
              {profile?.organizations?.name || 'BarberOS'}
            </span>
          </div>

          {/* Organization name */}
          {profile?.organizations && (
            <div className="px-6 py-3 border-b">
              <p className="text-xs text-muted-foreground">Organización</p>
              <p className="font-medium truncate">{profile.organizations.name}</p>
            </div>
          )}

          {/* Navigation */}
          <nav className="flex-1 space-y-1 p-4 overflow-y-auto">
            {loading ? (
              <p className="px-3 text-sm text-muted-foreground">Cargando menú...</p>
            ) : user && !profile ? (
              <div className="space-y-3 px-3">
                <p className="text-sm text-muted-foreground">
                  No se pudo cargar tu perfil.
                </p>
                <Button variant="outline" size="sm" onClick={() => refreshProfile()}>
                  Reintentar
                </Button>
              </div>
            ) : (
              navItems.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href
              
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              )
            })
            )}
          </nav>

          {/* User info & logout */}
          <div className="border-t p-4">
            <div className="mb-3">
              <p className="font-medium truncate">{profile?.full_name}</p>
              <p className="text-xs text-muted-foreground capitalize">{profile?.role}</p>
            </div>
            <form action={signOut}>
              <Button type="submit" variant="outline" className="w-full gap-2">
                <LogOut className="h-4 w-4" />
                Cerrar Sesión
              </Button>
            </form>
          </div>
        </div>
      </aside>
    </>
  )
}