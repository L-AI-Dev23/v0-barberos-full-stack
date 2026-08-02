'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/context/auth-context'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DollarSign,
  Scissors,
  Users,
  TrendingUp,
  Settings,
  Banknote,
  Smartphone,
} from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { CashRegisterSection } from '@/components/dashboard/cash-register-section'
import type { Sale } from '@/lib/types/database'

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
  }).format(amount)
}

export default function DashboardPage() {
  const router = useRouter()
  const { profile, isAdmin, loading } = useAuth()
  const supabase = createClient()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [openingTime, setOpeningTime] = useState('09:00')
  const [closingTime, setClosingTime] = useState('21:00')
  const [saving, setSaving] = useState(false)

  const today = new Date().toISOString().split('T')[0]

  // Fetch today's sales
  const { data: sales } = useSWR<Sale[]>(
    profile?.organization_id ? `sales-${today}` : null,
    async () => {
      const { data } = await supabase
        .from('sales')
        .select('*, employee:profiles(*), items:sale_items(*)')
        .eq('organization_id', profile!.organization_id)
        .gte('created_at', `${today}T00:00:00`)
        .lte('created_at', `${today}T23:59:59`)
      return data || []
    }
  )

  // Load organization settings
  useEffect(() => {
    async function loadSettings() {
      if (!profile?.organization_id) return
      const { data } = await supabase
        .from('organizations')
        .select('opening_time, closing_time')
        .eq('id', profile.organization_id)
        .single()
      if (data) {
        setOpeningTime(data.opening_time || '09:00')
        setClosingTime(data.closing_time || '21:00')
      }
    }
    loadSettings()
  }, [profile?.organization_id, supabase])
  
  const canOperateCashRegister = isAdmin || !!profile?.module_permissions?.cash_register

  // Employees without cash-register access don't need this page at all
  useEffect(() => {
    if (!loading && profile && profile.role !== 'admin' && !canOperateCashRegister) {
      router.push('/dashboard/earnings')
    }
  }, [profile, router, loading, canOperateCashRegister])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">No se pudo cargar tu perfil. Recarga la página.</p>
      </div>
    )
  }

  if (profile.role !== 'admin' && !canOperateCashRegister) {
    return null
  }

  // Employees with cash-register access get a focused view: just the caja.
  // The full financial panel (revenue, commissions, chart) stays admin-only.
  if (profile.role !== 'admin') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Caja</h1>
          <p className="text-muted-foreground">Apertura, cierre e historial de caja</p>
        </div>
        <CashRegisterSection />
      </div>
    )
  }

  // Calculate metrics
  const dailyRevenue = sales?.reduce((sum, sale) => sum + Number(sale.total), 0) || 0
  const servicesCount = sales?.reduce((sum, sale) => {
    const serviceItems = sale.items?.filter(item => item.item_type === 'service') || []
    return sum + serviceItems.reduce((s, i) => s + i.quantity, 0)
  }, 0) || 0
  const totalCommissions = sales?.reduce((sum, sale) => sum + Number(sale.total_commission), 0) || 0
  const netProfit = dailyRevenue - totalCommissions
  const cashRevenue = sales?.reduce((sum, sale) => sum + Number(sale.cash_amount || 0), 0) || 0
  const yapeRevenue = sales?.reduce((sum, sale) => sum + Number(sale.yape_amount || 0), 0) || 0

  // Generate hourly data for chart
  const hourlyData = generateHourlyData(sales || [], openingTime, closingTime)

  async function saveSettings() {
    if (!profile?.organization_id) return
    setSaving(true)
    await supabase
      .from('organizations')
      .update({ opening_time: openingTime, closing_time: closingTime })
      .eq('id', profile.organization_id)
    setSaving(false)
    setSettingsOpen(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Panel</h1>
          <p className="text-muted-foreground">Resumen del rendimiento de hoy</p>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ingresos del día</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(dailyRevenue)}</div>
            <p className="text-xs text-muted-foreground">Ventas totales hoy</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Servicios hoy</CardTitle>
            <Scissors className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{servicesCount}</div>
            <p className="text-xs text-muted-foreground">Servicios realizados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pagos a empleados</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalCommissions)}</div>
            <p className="text-xs text-muted-foreground">Comisiones totales</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ganancia neta</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(netProfit)}</div>
            <p className="text-xs text-muted-foreground">Ingresos - Comisiones</p>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Chart */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Ingresos por hora</CardTitle>
            <CardDescription>Distribución de ventas durante el día</CardDescription>
          </div>
          <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="icon">
                <Settings className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Horario de operación</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Hora de apertura</Label>
                  <Input
                    type="time"
                    value={openingTime}
                    onChange={(e) => setOpeningTime(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Hora de cierre</Label>
                  <Input
                    type="time"
                    value={closingTime}
                    onChange={(e) => setClosingTime(e.target.value)}
                  />
                </div>
                <Button onClick={saveSettings} disabled={saving} className="w-full">
                  {saving ? 'Guardando...' : 'Guardar configuración'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="hour" className="text-xs" />
                <YAxis className="text-xs" tickFormatter={(value) => `S/${value}`} />
                <Tooltip
                  formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ fill: 'hsl(var(--primary))' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Payment method totals */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ingresos en efectivo</CardTitle>
            <Banknote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(cashRevenue)}</div>
            <p className="text-xs text-muted-foreground">Cobrado en efectivo hoy</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ingresos por Yape</CardTitle>
            <Smartphone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(yapeRevenue)}</div>
            <p className="text-xs text-muted-foreground">Cobrado por Yape hoy</p>
          </CardContent>
        </Card>
      </div>

      {/* Caja: apertura, cierre e historial */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Caja</h2>
        <CashRegisterSection />
      </div>
    </div>
  )
}

function generateHourlyData(sales: Sale[], openingTime: string, closingTime: string) {
  const startHour = parseInt(openingTime.split(':')[0])
  const endHour = parseInt(closingTime.split(':')[0])
  
  const hourlyRevenue: { [hour: string]: number } = {}
  
  for (let h = startHour; h <= endHour; h++) {
    const hourStr = `${h.toString().padStart(2, '0')}:00`
    hourlyRevenue[hourStr] = 0
  }

  sales.forEach((sale) => {
    const hour = new Date(sale.created_at).getHours()
    const hourStr = `${hour.toString().padStart(2, '0')}:00`
    if (hourlyRevenue[hourStr] !== undefined) {
      hourlyRevenue[hourStr] += Number(sale.total)
    }
  })

  return Object.entries(hourlyRevenue).map(([hour, revenue]) => ({
    hour,
    revenue,
  }))
}