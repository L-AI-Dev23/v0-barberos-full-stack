'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/context/auth-context'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Lock,
  Unlock,
  Banknote,
  Smartphone,
  Heart,
  ShoppingBag,
  History,
} from 'lucide-react'
import type { CashRegister, Sale } from '@/lib/types/database'

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
  }).format(amount)
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('es-PE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Cash register ("Caja") widget: shows open/closed status, lets any
 * organization member (admin or employee) open/close the till, and
 * lists the history of past registers. Designed to be embedded inline
 * in a dashboard page rather than living on its own route.
 */
export function CashRegisterSection() {
  const { profile } = useAuth()
  const supabase = createClient()

  const [openDialogOpen, setOpenDialogOpen] = useState(false)
  const [closeDialogOpen, setCloseDialogOpen] = useState(false)
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false)
  const [openingCash, setOpeningCash] = useState('0')
  const [openingYape, setOpeningYape] = useState('0')
  const [closingCash, setClosingCash] = useState('')
  const [closingYape, setClosingYape] = useState('')
  const [saving, setSaving] = useState(false)

  // Currently open register for this organization (if any)
  const {
    data: currentRegister,
    mutate: mutateCurrent,
  } = useSWR<CashRegister | null>(
    profile?.organization_id ? 'cash-register-current' : null,
    async () => {
      const { data } = await supabase
        .from('cash_registers')
        .select('*, opener:profiles!cash_registers_opened_by_fkey(*)')
        .eq('organization_id', profile!.organization_id)
        .eq('status', 'open')
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data
    },
    { refreshInterval: 30000 },
  )

  // Sales made under the current open register, to compute running totals
  const { data: registerSales } = useSWR<Sale[]>(
    currentRegister?.id ? `cash-register-sales-${currentRegister.id}` : null,
    async () => {
      const { data } = await supabase
        .from('sales')
        .select('*')
        .eq('cash_register_id', currentRegister!.id)
      return data || []
    },
  )

  // History of past registers for this organization
  const { data: history, mutate: mutateHistory } = useSWR<CashRegister[]>(
    profile?.organization_id ? 'cash-register-history' : null,
    async () => {
      const { data } = await supabase
        .from('cash_registers')
        .select(
          '*, opener:profiles!cash_registers_opened_by_fkey(*), closer:profiles!cash_registers_closed_by_fkey(*)',
        )
        .eq('organization_id', profile!.organization_id)
        .order('opened_at', { ascending: false })
        .limit(30)
      return data || []
    },
  )

  const salesCash = registerSales?.reduce((s, sale) => s + Number(sale.cash_amount || 0), 0) || 0
  const salesYape = registerSales?.reduce((s, sale) => s + Number(sale.yape_amount || 0), 0) || 0
  const salesTips = registerSales?.reduce((s, sale) => s + Number(sale.tip_amount || 0), 0) || 0
  const salesTotal = registerSales?.reduce((s, sale) => s + Number(sale.total || 0), 0) || 0

  const expectedCash = (currentRegister?.opening_cash || 0) + salesCash
  const expectedYape = (currentRegister?.opening_yape || 0) + salesYape

  const parsedClosingCash = parseFloat(closingCash) || 0
  const parsedClosingYape = parseFloat(closingYape) || 0
  const cashDifference = Math.round((parsedClosingCash - expectedCash) * 100) / 100
  const yapeDifference = Math.round((parsedClosingYape - expectedYape) * 100) / 100

  function openOpenDialog() {
    setOpeningCash('0')
    setOpeningYape('0')
    setOpenDialogOpen(true)
  }

  function openCloseDialog() {
    setClosingCash(expectedCash.toFixed(2))
    setClosingYape(expectedYape.toFixed(2))
    setCloseDialogOpen(true)
  }

  async function handleOpenRegister() {
    if (!profile?.organization_id) return
    setSaving(true)
    try {
      const { error } = await supabase.from('cash_registers').insert({
        organization_id: profile.organization_id,
        opened_by: profile.id,
        opening_cash: parseFloat(openingCash) || 0,
        opening_yape: parseFloat(openingYape) || 0,
        status: 'open',
      })
      if (error) throw error
      setOpenDialogOpen(false)
      mutateCurrent()
      mutateHistory()
    } catch (error) {
      console.error('Error opening register:', error)
      alert('No se pudo abrir la caja. Intenta nuevamente.')
    }
    setSaving(false)
  }

  async function handleCloseRegister() {
    if (!currentRegister) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('cash_registers')
        .update({
          status: 'closed',
          closed_by: profile!.id,
          closed_at: new Date().toISOString(),
          closing_cash: parsedClosingCash,
          closing_yape: parsedClosingYape,
          expected_cash: expectedCash,
          expected_yape: expectedYape,
        })
        .eq('id', currentRegister.id)
      if (error) throw error
      setCloseDialogOpen(false)
      mutateCurrent()
      mutateHistory()
    } catch (error) {
      console.error('Error closing register:', error)
      alert('No se pudo cerrar la caja. Intenta nuevamente.')
    }
    setSaving(false)
  }

  return (
    <div className="space-y-6">
      {/* Current status card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              {currentRegister ? (
                <>
                  <Unlock className="h-5 w-5 text-green-600" />
                  Caja abierta
                </>
              ) : (
                <>
                  <Lock className="h-5 w-5 text-muted-foreground" />
                  Caja cerrada
                </>
              )}
            </CardTitle>
            {currentRegister ? (
              <CardDescription>
                Abierta por {currentRegister.opener?.full_name || 'alguien del equipo'} el{' '}
                {formatDateTime(currentRegister.opened_at)}
              </CardDescription>
            ) : (
              <CardDescription>
                No se pueden registrar ventas en el P.O.S. hasta que se abra la caja.
              </CardDescription>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setHistoryDialogOpen(true)}>
              <History className="h-4 w-4 mr-2" />
              Historial
            </Button>
            {currentRegister ? (
              <Button variant="destructive" onClick={openCloseDialog}>
                Cerrar caja
              </Button>
            ) : (
              <Button onClick={openOpenDialog}>Abrir caja</Button>
            )}
          </div>
        </CardHeader>

        {currentRegister && (
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground mb-1">Apertura efectivo</p>
                <p className="text-lg font-semibold">
                  {formatCurrency(currentRegister.opening_cash)}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground mb-1">Apertura Yape</p>
                <p className="text-lg font-semibold">
                  {formatCurrency(currentRegister.opening_yape)}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <ShoppingBag className="h-3 w-3" /> Ventas del turno
                </p>
                <p className="text-lg font-semibold">{formatCurrency(salesTotal)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Heart className="h-3 w-3" /> Propinas del turno
                </p>
                <p className="text-lg font-semibold">{formatCurrency(salesTips)}</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg bg-muted p-3 flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm">
                  <Banknote className="h-4 w-4" /> Efectivo esperado en caja
                </span>
                <span className="font-bold">{formatCurrency(expectedCash)}</span>
              </div>
              <div className="rounded-lg bg-muted p-3 flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm">
                  <Smartphone className="h-4 w-4" /> Yape esperado
                </span>
                <span className="font-bold">{formatCurrency(expectedYape)}</span>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Open register dialog */}
      <Dialog open={openDialogOpen} onOpenChange={setOpenDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Abrir caja</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Ingresa con cuánto empieza la caja hoy.
            </p>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Banknote className="h-4 w-4" /> Efectivo inicial
              </Label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Smartphone className="h-4 w-4" /> Yape inicial
              </Label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={openingYape}
                onChange={(e) => setOpeningYape(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleOpenRegister} disabled={saving}>
              {saving ? 'Abriendo...' : 'Abrir caja'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close register dialog */}
      <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cerrar caja</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Cuenta el dinero físico y lo registrado en Yape, e ingresa el monto real.
            </p>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Banknote className="h-4 w-4" /> Efectivo contado
              </Label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={closingCash}
                onChange={(e) => setClosingCash(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Esperado: {formatCurrency(expectedCash)}
                {cashDifference !== 0 && (
                  <span className={cashDifference > 0 ? 'text-green-600' : 'text-destructive'}>
                    {' '}
                    ({cashDifference > 0 ? '+' : ''}
                    {formatCurrency(cashDifference)})
                  </span>
                )}
              </p>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Smartphone className="h-4 w-4" /> Yape contado
              </Label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={closingYape}
                onChange={(e) => setClosingYape(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Esperado: {formatCurrency(expectedYape)}
                {yapeDifference !== 0 && (
                  <span className={yapeDifference > 0 ? 'text-green-600' : 'text-destructive'}>
                    {' '}
                    ({yapeDifference > 0 ? '+' : ''}
                    {formatCurrency(yapeDifference)})
                  </span>
                )}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleCloseRegister} disabled={saving}>
              {saving ? 'Cerrando...' : 'Cerrar caja'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History dialog */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Historial de caja</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-2">
            Revisa la caja de cada día que ha pasado
          </p>
          {history && history.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Apertura</TableHead>
                    <TableHead>Abierto por</TableHead>
                    <TableHead>Inicial</TableHead>
                    <TableHead>Cierre</TableHead>
                    <TableHead>Contado</TableHead>
                    <TableHead>Diferencia</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((reg) => {
                    const regCashDiff =
                      reg.status === 'closed'
                        ? Math.round(
                            ((reg.closing_cash || 0) - (reg.expected_cash || 0)) * 100,
                          ) / 100
                        : null
                    const regYapeDiff =
                      reg.status === 'closed'
                        ? Math.round(
                            ((reg.closing_yape || 0) - (reg.expected_yape || 0)) * 100,
                          ) / 100
                        : null
                    return (
                      <TableRow key={reg.id}>
                        <TableCell className="whitespace-nowrap">
                          {formatDateTime(reg.opened_at)}
                        </TableCell>
                        <TableCell>{reg.opener?.full_name || '—'}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatCurrency(reg.opening_cash)} / {formatCurrency(reg.opening_yape)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {reg.closed_at ? formatDateTime(reg.closed_at) : '—'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {reg.status === 'closed'
                            ? `${formatCurrency(reg.closing_cash || 0)} / ${formatCurrency(reg.closing_yape || 0)}`
                            : '—'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {regCashDiff !== null && regYapeDiff !== null ? (
                            <span
                              className={
                                regCashDiff === 0 && regYapeDiff === 0
                                  ? 'text-muted-foreground'
                                  : regCashDiff + regYapeDiff >= 0
                                    ? 'text-green-600'
                                    : 'text-destructive'
                              }
                            >
                              {formatCurrency(regCashDiff)} / {formatCurrency(regYapeDiff)}
                            </span>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={reg.status === 'open' ? 'default' : 'outline'}>
                            {reg.status === 'open' ? 'Abierta' : 'Cerrada'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              Aún no hay cajas registradas.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}