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
  Settings,
  Wallet,
  LogOut,
  Menu,
  X,
} from 'lucide-react'
import { useState } from 'react'

const adminNavItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard' as const },
  { href: '/dashboard/services', label: 'Services', icon: Scissors, permission: 'services' as const },
  { href: '/dashboard/inventory', label: 'Inventory', icon: Package, permission: 'inventory' as const },
  { href: '/dashboard/collaborators', label: 'Collaborators', icon: Users, permission: 'collaborators' as const },
  { href: '/dashboard/pos', label: 'P.O.S.', icon: ShoppingCart, permission: 'pos' as const },
  { href: '/dashboard/loyalty', label: 'Loyalty', icon: Heart, permission: 'loyalty' as const },
  { href: '/dashboard/configuration', label: 'Configuration', icon: Settings, permission: 'configuration' as const },
]

const employeeNavItems = [
  { href: '/dashboard/earnings', label: 'Earnings', icon: Wallet, permission: null },
]

export function Sidebar() {
  const pathname = usePathname()
  const { profile, isAdmin, hasPermission } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)

  const navItems = isAdmin
    ? adminNavItems
    : [...adminNavItems.filter(item => hasPermission(item.permission)), ...employeeNavItems]

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
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
              <Scissors className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-lg">BarberOS</span>
          </div>

          {/* Organization name */}
          {profile?.organizations && (
            <div className="px-6 py-3 border-b">
              <p className="text-xs text-muted-foreground">Organization</p>
              <p className="font-medium truncate">{profile.organizations.name}</p>
            </div>
          )}

          {/* Navigation */}
          <nav className="flex-1 space-y-1 p-4 overflow-y-auto">
            {navItems.map((item) => {
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
            })}
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
                Sign Out
              </Button>
            </form>
          </div>
        </div>
      </aside>
    </>
  )
}
