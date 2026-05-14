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
  AlertTriangle,
  User,
  Heart,
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
import type { Sale, LoyaltyClient, Product } from '@/lib/types/database'

type PeriodType = 'today' | 'week' | 'month'

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
  }).format(amount)
}

function getDateRange(period: PeriodType) {
  const now = new Date()
  const start = new Date(now)
  
  switch (period) {
    case 'today':
      start.setHours(0, 0, 0, 0)
      break
    case 'week':
      start.setDate(now.getDate() - now.getDay())
      start.setHours(0, 0, 0, 0)
      break
    case 'month':
      start.setDate(1)
      start.setHours(0, 0, 0, 0)
      break
  }
  
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: now.toISOString().split('T')[0],
  }
}

export default function DashboardPage() {
  const router = useRouter()
  const { profile, isAdmin, loading } = useAuth()
  const supabase = createClient()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [openingTime, setOpeningTime] = useState('09:00')
  const [closingTime, setClosingTime] = useState('21:00')
  const [saving, setSaving] = useState(false)
  const [period, setPeriod] = useState<PeriodType>('today')

  // Fetch today's sales
  const { data: sales } = useSWR<Sale[]>(
    profile?.organization_id ? `sales-${period}-${startDate}-${endDate}` : null,
    async () => {
      const { data } = await supabase
        .from('sales')
        .select('*, employee:profiles(*), items:sale_items(*)')
        .eq('organization_id', profile!.organization_id)
        .gte('created_at', `${startDate}T00:00:00`)
        .lte('created_at', `${endDate}T23:59:59`)
      return data || []
    }
  )

  // Fetch recent clients
  const { data: recentClients } = useSWR<(LoyaltyClient & { services_count: number })[]>(
    profile?.organization_id ? `recent-clients-${period}-${startDate}-${endDate}` : null,
    async () => {
      const { data: clientSales } = await supabase
        .from('sales')
        .select('client_id, client:loyalty_clients(*)')
        .eq('organization_id', profile!.organization_id)
        .gte('created_at', `${startDate}T00:00:00`)
        .lte('created_at', `${endDate}T23:59:59`)
        .not('client_id', 'is', null)

      if (!clientSales) return []

      const clientMap = new Map<string, { client: LoyaltyClient; count: number }>()
      clientSales.forEach((sale) => {
        if (sale.client) {
          const existing = clientMap.get(sale.client_id!)
          if (existing) {
            existing.count++
          } else {
            clientMap.set(sale.client_id!, { client: sale.client as unknown as LoyaltyClient, count: 1 })
          }
        }
      })

      return Array.from(clientMap.values()).map((item) => ({
        ...item.client,
        services_count: item.count,
      }))
    }
  )

  // Fetch low stock products
  const { data: lowStockProducts } = useSWR<Product[]>(
    profile?.organization_id ? 'low-stock' : null,
    async () => {
      const { data: org } = await supabase
        .from('organizations')
        .select('min_stock_threshold')
        .eq('id', profile!.organization_id)
        .single()

      const threshold = org?.min_stock_threshold || 5

      const { data } = await supabase
        .from('products')
        .select('*')
        .eq('organization_id', profile!.organization_id)
        .lte('stock', threshold)
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
  
  // Redirect employees away from dashboard
  useEffect(() => {
    if (!loading && profile && !isAdmin) {
      router.push('/dashboard/earnings')
    }
  }, [profile, isAdmin, router, loading])

  // Show loading while auth is loading
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    )
  }

  // If not admin, show nothing (redirect will happen via useEffect)
  if (!isAdmin) {
    return null
  }

  // Calculate metrics
  const dailyRevenue = sales?.reduce((sum, sale) => sum + Number(sale.total), 0) || 0
  const servicesCount = sales?.reduce((sum, sale) => {
    const serviceItems = sale.items?.filter(item => item.item_type === 'service') || []
    return sum + serviceItems.reduce((s, i) => s + i.quantity, 0)
  }, 0) || 0
  const totalCommissions = sales?.reduce((sum, sale) => sum + Number(sale.total_commission), 0) || 0
  const netProfit = dailyRevenue - totalCommissions

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
          <p className="text-muted-foreground">
            {period === 'today' ? 'Resumen del rendimiento de hoy' : 
             period === 'week' ? 'Resumen de la semana' : 
             'Resumen del mes'}
          </p>
        </div>
        
        {/* Period Selector Buttons */}
        <div className="flex gap-2">
          <Button 
            variant={period === 'today' ? 'default' : 'outline'}
            onClick={() => setPeriod('today')}
            size="sm"
          >
            Hoy
          </Button>
          <Button 
            variant={period === 'week' ? 'default' : 'outline'}
            onClick={() => setPeriod('week')}
            size="sm"
          >
            Semana
          </Button>
          <Button 
            variant={period === 'month' ? 'default' : 'outline'}
            onClick={() => setPeriod('month')}
            size="sm"
          >
            Mes
          </Button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {period === 'today' ? 'Ingresos del día' : 
               period === 'week' ? 'Ingresos de la semana' : 
               'Ingresos del mes'}
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(dailyRevenue)}</div>
            <p className="text-xs text-muted-foreground">
              {period === 'today' ? 'Ventas totales hoy' : 
               period === 'week' ? 'Ventas totales esta semana' : 
               'Ventas totales este mes'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {period === 'today' ? 'Servicios hoy' : 
               period === 'week' ? 'Servicios esta semana' : 
               'Servicios este mes'}
            </CardTitle>
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
            <p className="text-xs text-muted-foreground">
              {period === 'today' ? 'Comisiones totales hoy' : 
               period === 'week' ? 'Comisiones totales esta semana' : 
               'Comisiones totales este mes'}
            </p>
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

      {/* Bottom Panels */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Recent Clients */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Clientes recientes
            </CardTitle>
            <CardDescription>Clientes atendidos hoy</CardDescription>
          </CardHeader>
          <CardContent>
            {recentClients && recentClients.length > 0 ? (
              <div className="space-y-3">
                {recentClients.slice(0, 5).map((client) => (
                  <div key={client.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                        <User className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium">{client.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {client.services_count} servicio{client.services_count !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-sm">
                      <Heart className="h-3 w-3 text-red-500" />
                      <span>{client.stamps}/5</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                Sin clientes hoy
              </p>
            )}
          </CardContent>
        </Card>

        {/* Low Stock Alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Alertas de stock bajo
            </CardTitle>
            <CardDescription>Productos por debajo del umbral mínimo</CardDescription>
          </CardHeader>
          <CardContent>
            {lowStockProducts && lowStockProducts.length > 0 ? (
              <div className="space-y-3">
                {lowStockProducts.slice(0, 5).map((product) => (
                  <div key={product.id} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{product.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Mín: {product.min_stock || 5} unidades
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-amber-600">
                        {product.stock} disponibles
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                Todos los productos tienen buen stock
              </p>
            )}
          </CardContent>
        </Card>
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
