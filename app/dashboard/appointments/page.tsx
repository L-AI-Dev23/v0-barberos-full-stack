'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/context/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { QRCodeSVG } from 'qrcode.react'
import { Calendar, Clock, MapPin, User, Trash2, CheckCircle, XCircle, AlertCircle, QrCode, Copy, Check, Heart } from 'lucide-react'
import type { Appointment, Service, Profile } from '@/lib/types/database'

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
  }).format(amount)
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('es-PE', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function AppointmentsPage() {
  const { profile, isAdmin } = useAuth()
  const supabase = createClient()
  const [view, setView] = useState<'activas' | 'historial'>('activas')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [qrModalOpen, setQrModalOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [generating, setGenerating] = useState(false)

  const bookingUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/loyalty/${profile?.organization_id}` 
    : ''

  const { data: appointments, mutate: mutateAppointments } = useSWR<(Appointment & { 
    service: Service | null
    employee: Profile | null
    client?: any
  })[]>(
    profile?.organization_id ? `appointments-${view}-${statusFilter}-${search}` : null,
    async () => {
      let query = supabase
        .from('appointments')
        .select('*, service:services(*), employee:profiles(*), client:loyalty_clients(*)')
        .eq('organization_id', profile!.organization_id)
        .order('appointment_time', { ascending: true })

      if (view === 'historial') {
        // El historial solo muestra las citas ya completadas
        query = query.eq('status', 'completada')
      } else if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
      } else {
        // Las citas completadas se mueven automáticamente al historial
        query = query.neq('status', 'completada')
      }

      const { data } = await query
      
      if (search) {
        return (data || []).filter(apt => 
          apt.service?.name.toLowerCase().includes(search.toLowerCase())
        )
      }
      
      return data || []
    }
  )

  async function updateStatus(appointmentId: string, newStatus: string) {
    const appointment = appointments?.find(apt => apt.id === appointmentId)

    await supabase
      .from('appointments')
      .update({ status: newStatus })
      .eq('id', appointmentId)

    // Si se marca como completada, registrar el ingreso (venta) y el sello de fidelidad
    if (newStatus === 'completada' && appointment?.status !== 'completada') {
      await completeAppointmentSale(appointment)
    }

    mutateAppointments()

    // Enviar notificación de WhatsApp (Cita Completada) en segundo plano
    if (newStatus === 'completada') {
      fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId, event: 'booking_completed' })
      }).catch(console.error);
    }
  }

  async function completeAppointmentSale(
    appointment?: (Appointment & { service: Service | null; employee: Profile | null; client?: any })
  ) {
    if (!appointment || !profile?.organization_id) return

    const price = appointment.service?.cost || 0
    const totalCommission = (appointment.service as any)?.commission || 0

    try {
      // Crear la venta (esto es lo que alimenta los ingresos del negocio)
      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .insert({
          organization_id: profile.organization_id,
          employee_id: appointment.employee_id,
          client_id: appointment.client_id,
          total: price,
          total_commission: totalCommission,
        })
        .select()
        .single()

      if (saleError) throw saleError

      // Crear el item de la venta ligado al servicio de la cita
      await supabase.from('sale_items').insert({
        sale_id: sale.id,
        item_type: 'service',
        service_id: appointment.service_id,
        product_id: null,
        quantity: 1,
        unit_price: price,
        commission: totalCommission,
      })

      // Sumar un sello de fidelidad al cliente (si la cita tiene cliente asociado)
      if (appointment.client_id && appointment.client) {
        const totalStamps = appointment.client.stamps + 1
        let additionalCoupons = 0
        let finalStamps = totalStamps

        if (totalStamps >= 5) {
          additionalCoupons = Math.floor(totalStamps / 5)
          finalStamps = totalStamps % 5
        }

        await supabase
          .from('loyalty_clients')
          .update({
            stamps: finalStamps,
            coupons: appointment.client.coupons + additionalCoupons,
          })
          .eq('id', appointment.client_id)
      }
    } catch (error) {
      console.error('Error registrando venta/fidelidad de la cita:', error)
    }
  }

  async function deleteAppointment(appointmentId: string) {
    await supabase
      .from('appointments')
      .delete()
      .eq('id', appointmentId)
    
    setDeleteConfirm(null)
    mutateAppointments()
  }

  async function generateQR() {
    if (!profile?.organization_id) return
    setGenerating(true)
    
    const qrValue = bookingUrl
    
    if (await checkIfQrExists()) {
      await supabase
        .from('organization_qr_codes')
        .update({ qr_code: qrValue })
        .eq('organization_id', profile.organization_id)
    } else {
      await supabase
        .from('organization_qr_codes')
        .insert({
          organization_id: profile.organization_id,
          qr_code: qrValue,
        })
    }
    
    setGenerating(false)
    setQrModalOpen(true)
  }

  async function checkIfQrExists() {
    const { data } = await supabase
      .from('organization_qr_codes')
      .select('id')
      .eq('organization_id', profile!.organization_id)
      .single()
    return !!data
  }

  async function copyLink() {
    await navigator.clipboard.writeText(bookingUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const statusConfig: Record<string, { label: string; icon: any; color: string }> = {
    pendiente: { label: 'Pendiente', icon: AlertCircle, color: 'bg-yellow-100 text-yellow-800' },
    confirmada: { label: 'Confirmada', icon: CheckCircle, color: 'bg-blue-100 text-blue-800' },
    completada: { label: 'Completada', icon: CheckCircle, color: 'bg-green-100 text-green-800' },
    cancelada: { label: 'Cancelada', icon: XCircle, color: 'bg-red-100 text-red-800' },
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{view === 'historial' ? 'Historial de citas' : 'Citas'}</h1>
          <p className="text-muted-foreground">
            {view === 'historial'
              ? 'Citas que ya fueron completadas'
              : 'Gestiona las citas de tus clientes'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={view === 'historial' ? 'default' : 'outline'}
            onClick={() => setView(view === 'historial' ? 'activas' : 'historial')}
          >
            <Clock className="h-4 w-4 mr-2" />
            {view === 'historial' ? 'Ver citas activas' : 'Historial'}
          </Button>
          {isAdmin && (
            <Button onClick={generateQR} disabled={generating}>
              <QrCode className="h-4 w-4 mr-2" />
              {generating ? 'Generando...' : 'Generar código QR'}
            </Button>
          )}
        </div>
      </div>

      {/* QR Code Display */}
      {qrModalOpen && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              Código QR de citas
            </CardTitle>
            <CardDescription>
              Los clientes pueden escanear este código para agendar una cita
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <div className="p-4 bg-white rounded-lg">
              <QRCodeSVG value={bookingUrl} size={200} />
            </div>
            <div className="flex items-center gap-2 w-full max-w-md">
              <Input value={bookingUrl} readOnly className="text-sm" />
              <Button variant="outline" size="icon" onClick={copyLink}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <Button variant="outline" onClick={() => setQrModalOpen(false)}>
              Cerrar
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <Input
          placeholder="Buscar por servicio..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1"
        />
        {view === 'activas' && (
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full md:w-48">
              <SelectValue placeholder="Filtrar por estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="pendiente">Pendiente</SelectItem>
              <SelectItem value="confirmada">Confirmada</SelectItem>
              <SelectItem value="cancelada">Cancelada</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Appointments List */}
      <ScrollArea className="h-auto md:h-[calc(100vh-18rem)]">
        <div className="grid gap-4 md:grid-cols-2 pr-4">
          {appointments && appointments.length > 0 ? (
            appointments.map((apt) => {
              const config = statusConfig[apt.status]
              return (
                <Card key={apt.id} className="flex flex-col">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <CardTitle className="text-lg">{apt.service?.name}</CardTitle>
                        <CardDescription>{apt.service?.description}</CardDescription>
                        {apt.opcion_seleccionada && (
                          <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2 py-0.5 mt-1 text-[10px] font-semibold text-blue-600 dark:text-blue-400">
                            {apt.opcion_seleccionada}
                          </span>
                        )}
                      </div>
                      <Badge className={config.color}>
                        {config.label}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="flex-1 space-y-3">
                    {/* Client Name */}
                    {apt.client && (
                      <div className="flex gap-3">
                        <Heart className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1" />
                        <div className="text-sm">
                          <p className="font-medium">{apt.client.name}</p>
                        </div>
                      </div>
                    )}

                    {/* Date and Time */}
                    <div className="flex gap-3">
                      <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1" />
                      <div className="text-sm">
                        <p className="font-medium">{formatDate(apt.appointment_time)}</p>
                        <p className="text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatTime(apt.appointment_time)}
                        </p>
                      </div>
                    </div>

                    {/* Employee */}
                    {apt.employee && (
                      <div className="flex gap-3">
                        <User className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1" />
                        <div className="text-sm">
                          <p className="font-medium">{apt.employee.full_name}</p>
                          <p className="text-muted-foreground">{apt.employee.email}</p>
                        </div>
                      </div>
                    )}

                    {/* Notes */}
                    {apt.notes && (
                      <div className="text-sm p-2 bg-muted rounded">
                        <p className="text-muted-foreground">{apt.notes}</p>
                      </div>
                    )}

                    {/* Service Price */}
                    <div className="pt-2 border-t">
                      <p className="text-lg font-bold">{formatCurrency(apt.service?.cost || 0)}</p>
                    </div>
                  </CardContent>

                  {/* Actions */}
                  <div className="flex gap-2 p-4 border-t">
                    <Select value={apt.status} onValueChange={(newStatus) => updateStatus(apt.id, newStatus)}>
                      <SelectTrigger className="flex-1 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pendiente">Pendiente</SelectItem>
                        <SelectItem value="confirmada">Confirmada</SelectItem>
                        <SelectItem value="completada">Completada</SelectItem>
                        <SelectItem value="cancelada">Cancelada</SelectItem>
                      </SelectContent>
                    </Select>

                    <Dialog>
                      <DialogTrigger asChild>
                        <Button 
                          variant="destructive" 
                          size="sm"
                          onClick={() => setDeleteConfirm(apt.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      {deleteConfirm === apt.id && (
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Eliminar cita</DialogTitle>
                          </DialogHeader>
                          <p className="text-muted-foreground">¿Estás seguro de que deseas eliminar esta cita? Esta acción no se puede deshacer.</p>
                          <div className="flex gap-3 justify-end">
                            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
                              Cancelar
                            </Button>
                            <Button 
                              variant="destructive" 
                              onClick={() => deleteAppointment(apt.id)}
                            >
                              Eliminar
                            </Button>
                          </div>
                        </DialogContent>
                      )}
                    </Dialog>
                  </div>
                </Card>
              )
            })
          ) : (
            <div className="col-span-full text-center py-12">
              <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                {view === 'historial' ? 'Aún no hay citas completadas' : 'No hay citas registradas'}
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}