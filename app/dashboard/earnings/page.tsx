'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/context/auth-context'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Wallet, Scissors, TrendingUp, Heart, Package } from 'lucide-react'
import type { Sale, SaleItem } from '@/lib/types/database'
import { DateRangeFilter, resolveDateRange, describeDateFilter, type DateFilterValue } from '@/components/dashboard/date-range-filter'

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
  }).format(amount)
}

export default function EarningsPage() {
  const { profile } = useAuth()
  const supabase = createClient()
  const [filter, setFilter] = useState<DateFilterValue>({ period: 'today' })

  // useMemo evita recalcular new Date() (y por tanto cambiar la key de SWR)
  // en cada render; solo se recalcula cuando cambia el filtro.
  const range = useMemo(() => resolveDateRange(filter), [filter])
  const filterKey = `${filter.period}-${range.start}-${range.end}`

  const { data: sales } = useSWR<(Sale & { items: SaleItem[] })[]>(
    profile?.id ? `earnings-${filterKey}` : null,
    async () => {
      const { data } = await supabase
        .from('sales')
        .select('*, items:sale_items(*, service:services(*), product:products(*))')
        .eq('employee_id', profile!.id)
        .gte('created_at', range.start)
        .lte('created_at', range.end)
        .order('created_at', { ascending: false })
      return data || []
    }
  )

  const totalEarnings = sales?.reduce((sum, sale) => sum + Number(sale.total_commission), 0) || 0
  const totalTips = sales?.reduce((sum, sale) => sum + Number(sale.tip_amount || 0), 0) || 0
  const totalServices = sales?.reduce((sum, sale) => {
    const serviceItems = sale.items?.filter(i => i.item_type === 'service') || []
    return sum + serviceItems.reduce((s, i) => s + i.quantity, 0)
  }, 0) || 0
  const totalProducts = sales?.reduce((sum, sale) => {
    const productItems = sale.items?.filter(i => i.item_type === 'product') || []
    return sum + productItems.reduce((s, i) => s + i.quantity, 0)
  }, 0) || 0

  // Agrupa por servicio Y por producto para el desglose de comisiones:
  // ambos generan comisión al empleado de la misma forma.
  const itemBreakdown = sales?.reduce((acc, sale) => {
    sale.items?.forEach(item => {
      const name = item.item_type === 'service' ? item.service?.name : item.product?.name
      if (!name) return
      const key = `${item.item_type}:${name}`
      if (!acc[key]) {
        acc[key] = { name, type: item.item_type, count: 0, commission: 0 }
      }
      acc[key].count += item.quantity
      acc[key].commission += Number(item.commission) * item.quantity
    })
    return acc
  }, {} as Record<string, { name: string; type: 'service' | 'product'; count: number; commission: number }>) || {}

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ganancias</h1>
          <p className="text-muted-foreground">Monitorea tus comisiones y desempeño</p>
        </div>
      </div>

      {/* Selector de período */}
      <DateRangeFilter value={filter} onChange={setFilter} />

      {/* Tarjetas resumen */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ganancias totales</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatCurrency(totalEarnings)}</div>
            <p className="text-xs text-muted-foreground">
              {describeDateFilter(filter)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Propinas</CardTitle>
            <Heart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatCurrency(totalTips)}</div>
            <p className="text-xs text-muted-foreground">
              {describeDateFilter(filter)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Servicios realizados</CardTitle>
            <Scissors className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalServices}</div>
            <p className="text-xs text-muted-foreground">
              {describeDateFilter(filter)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Productos vendidos</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalProducts}</div>
            <p className="text-xs text-muted-foreground">
              {describeDateFilter(filter)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Desglose de ganancias */}
      {Object.keys(itemBreakdown).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Desglose de ganancias
            </CardTitle>
            <CardDescription>Comisión por servicio y por producto vendido</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(itemBreakdown)
                .sort(([, a], [, b]) => b.commission - a.commission)
                .map(([key, data]) => (
                  <div key={key} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{data.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {data.count} {data.type === 'service' ? 'realizados' : 'vendidos'}
                      </p>
                    </div>
                    <p className="font-semibold">{formatCurrency(data.commission)}</p>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Historial detallado */}
      <Card>
        <CardHeader>
          <CardTitle>Historial de ventas</CardTitle>
          <CardDescription>Lista detallada de tus servicios y productos vendidos</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            {sales && sales.length > 0 ? (
              <div className="space-y-4 pr-4">
                {sales.map((sale) => (
                  <div key={sale.id} className="border-b pb-4 last:border-0">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-medium">
                          {new Date(sale.created_at).toLocaleDateString('es-PE', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(sale.created_at).toLocaleTimeString('es-PE', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-green-600">
                          +{formatCurrency(sale.total_commission)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Venta: {formatCurrency(sale.total)}
                        </p>
                        {Number(sale.tip_amount) > 0 && (
                          <p className="text-xs text-pink-600 flex items-center justify-end gap-1">
                            <Heart className="h-3 w-3" />
                            Propina: {formatCurrency(Number(sale.tip_amount))}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      {sale.items?.map((item) => (
                        <div key={item.id} className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            {item.quantity}x {item.item_type === 'service' ? item.service?.name : item.product?.name}
                          </span>
                          <span>{formatCurrency(Number(item.commission) * item.quantity)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                Sin servicios registrados en este período.
              </p>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}