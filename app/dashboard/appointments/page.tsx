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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import { Calendar, Clock, MapPin, User, Trash2, CheckCircle, XCircle, AlertCircle, QrCode, Copy, Check, Heart, List, CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import type { Appointment, Service, Profile, LoyaltyClient } from '@/lib/types/database'
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
  format,
} from 'date-fns'
import { es } from 'date-fns/locale'

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
  // Cuando se intenta completar una cita sin barbero asignado, pedimos que se elija uno
  const [pendingCompleteId, setPendingCompleteId] = useState<string | null>(null)
  const [completeEmployeeId, setCompleteEmployeeId] = useState<string>('')
  const [completeSubmitting, setCompleteSubmitting] = useState(false)
  const [search, setSearch] = useState('')
  const [displayMode, setDisplayMode] = useState<'lista' | 'calendario'>('lista')
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [qrModalOpen, setQrModalOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [generating, setGenerating] = useState(false)

  // Nueva cita (creación manual)
  const [newApptOpen, setNewApptOpen] = useState(false)
  const [newApptSubmitting, setNewApptSubmitting] = useState(false)
  const [newApptError, setNewApptError] = useState<string | null>(null)
  const [newApptServiceId, setNewApptServiceId] = useState('')
  const [newApptOption, setNewApptOption] = useState('')
  const [newApptEmployeeId, setNewApptEmployeeId] = useState('')
  const [newApptClientId, setNewApptClientId] = useState('')
  const [newApptDate, setNewApptDate] = useState('')
  const [newApptTime, setNewApptTime] = useState('')
  const [newApptStatus, setNewApptStatus] = useState('pendiente')
  const [newApptNotes, setNewApptNotes] = useState('')

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

  // Datos para el formulario de nueva cita
  const { data: services } = useSWR<Service[]>(
    profile?.organization_id ? `services-${profile.organization_id}` : null,
    async () => {
      const { data } = await supabase
        .from('services')
        .select('*')
        .eq('organization_id', profile!.organization_id)
        .order('name', { ascending: true })
      return data || []
    }
  )

  const { data: employees } = useSWR<Profile[]>(
    profile?.organization_id ? `employees-${profile.organization_id}` : null,
    async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('organization_id', profile!.organization_id)
        .order('full_name', { ascending: true })
      return data || []
    }
  )

  const { data: clients } = useSWR<LoyaltyClient[]>(
    profile?.organization_id ? `loyalty-clients-${profile.organization_id}` : null,
    async () => {
      const { data } = await supabase
        .from('loyalty_clients')
        .select('*')
        .eq('organization_id', profile!.organization_id)
        .order('name', { ascending: true })
      return data || []
    }
  )

  function resetNewApptForm() {
    setNewApptServiceId('')
    setNewApptOption('')
    setNewApptEmployeeId('')
    setNewApptClientId('')
    setNewApptDate('')
    setNewApptTime('')
    setNewApptStatus('pendiente')
    setNewApptNotes('')
    setNewApptError(null)
  }

  async function createAppointment() {
    if (!profile?.organization_id) return

    if (!newApptServiceId || !newApptDate || !newApptTime) {
      setNewApptError('Completa servicio, fecha y hora para continuar.')
      return
    }

    const selectedService = services?.find((s) => s.id === newApptServiceId)
    if (selectedService?.opciones && selectedService.opciones.length > 0 && !newApptOption) {
      setNewApptError('Selecciona una opción para este servicio.')
      return
    }

    setNewApptSubmitting(true)
    setNewApptError(null)

    const appointmentTime = new Date(`${newApptDate}T${newApptTime}`)

    const { error } = await supabase
      .from('appointments')
      .insert({
        organization_id: profile.organization_id,
        service_id: newApptServiceId,
        employee_id: newApptEmployeeId || null,
        client_id: newApptClientId || null,
        appointment_time: appointmentTime.toISOString(),
        status: newApptStatus,
        notes: newApptNotes || null,
        opcion_seleccionada: newApptOption || null,
      })

    setNewApptSubmitting(false)

    if (error) {
      setNewApptError('No se pudo crear la cita. Intenta de nuevo.')
      return
    }

    resetNewApptForm()
    setNewApptOpen(false)
    mutateAppointments()
  }

  async function updateStatus(appointmentId: string, newStatus: string) {
    const appointment = appointments?.find(apt => apt.id === appointmentId)

    // Si se va a completar una cita SIN barbero asignado, no podemos registrar la venta
    // (la comisión pertenece a un empleado). Pedimos que se elija uno antes de continuar,
    // en vez de completar la cita y perder el ingreso silenciosamente.
    if (newStatus === 'completada' && appointment?.status !== 'completada' && !appointment?.employee_id) {
      setCompleteEmployeeId('')
      setPendingCompleteId(appointmentId)
      return
    }

    await supabase
      .from('appointments')
      .update({ status: newStatus })
      .eq('id', appointmentId)

    // Si se marca como completada, registrar el ingreso (venta) y el sello de fidelidad
    if (newStatus === 'completada' && appointment?.status !== 'completada') {
      await completeAppointmentSale(appointment)
    }

    mutateAppointments()

    // Notificar al cliente (WhatsApp si está conectado, si no, push del sitio) en segundo plano
    const notifyEvent =
      newStatus === 'completada' ? 'booking_completed' : newStatus === 'confirmada' ? 'booking_confirmed' : null

    if (notifyEvent) {
      fetch('/api/notify/appointment-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId, event: notifyEvent })
      }).catch(console.error);
    }
  }

  // Confirma la completada de una cita que no tenía barbero asignado, luego de elegir uno
  async function confirmCompleteWithEmployee() {
    if (!pendingCompleteId || !completeEmployeeId) return

    setCompleteSubmitting(true)

    const appointment = appointments?.find(apt => apt.id === pendingCompleteId)

    await supabase
      .from('appointments')
      .update({ status: 'completada', employee_id: completeEmployeeId })
      .eq('id', pendingCompleteId)

    await completeAppointmentSale(
      appointment ? { ...appointment, employee_id: completeEmployeeId } : appointment
    )

    setCompleteSubmitting(false)
    setPendingCompleteId(null)
    setCompleteEmployeeId('')
    mutateAppointments()

    fetch('/api/notify/appointment-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appointmentId: pendingCompleteId, event: 'booking_completed' })
    }).catch(console.error)
  }

  async function completeAppointmentSale(
    appointment?: (Appointment & { service: Service | null; employee: Profile | null; client?: any })
  ) {
    if (!appointment || !profile?.organization_id) return

    if (!appointment.employee_id) {
      // No debería pasar (se pide barbero antes de llegar aquí), pero evitamos
      // que un insert sin employee_id falle en silencio contra la restricción NOT NULL.
      toast.error('No se pudo registrar el ingreso: falta asignar un barbero a la cita.')
      return
    }

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
      const { error: itemError } = await supabase.from('sale_items').insert({
        sale_id: sale.id,
        item_type: 'service',
        service_id: appointment.service_id,
        product_id: null,
        quantity: 1,
        unit_price: price,
        commission: totalCommission,
        opcion_seleccionada: appointment.opcion_seleccionada || null,
      })

      if (itemError) throw itemError

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
      toast.error('La cita se marcó como completada, pero no se pudo registrar el ingreso. Revisa la venta manualmente.')
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
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <div className="flex items-center rounded-md border p-0.5">
            <Button
              variant={displayMode === 'lista' ? 'default' : 'ghost'}
              size="sm"
              className="h-8"
              onClick={() => setDisplayMode('lista')}
            >
              <List className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Lista</span>
            </Button>
            <Button
              variant={displayMode === 'calendario' ? 'default' : 'ghost'}
              size="sm"
              className="h-8"
              onClick={() => setDisplayMode('calendario')}
            >
              <CalendarDays className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Calendario</span>
            </Button>
          </div>
          <Button
            variant={view === 'historial' ? 'default' : 'outline'}
            onClick={() => setView(view === 'historial' ? 'activas' : 'historial')}
            className="md:px-3"
          >
            <Clock className="h-4 w-4 md:mr-2" />
            <span className="hidden md:inline">{view === 'historial' ? 'Ver citas activas' : 'Historial'}</span>
          </Button>
          <Dialog
            open={newApptOpen}
            onOpenChange={(open) => {
              setNewApptOpen(open)
              if (!open) resetNewApptForm()
            }}
          >
            <DialogTrigger asChild>
              <Button className="md:px-3">
                <Plus className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Nueva cita</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Nueva cita</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="new-appt-service">Servicio *</Label>
                  <Select
                    value={newApptServiceId}
                    onValueChange={(v) => {
                      setNewApptServiceId(v)
                      setNewApptOption('')
                    }}
                  >
                    <SelectTrigger id="new-appt-service" className="w-full">
                      <SelectValue placeholder="Selecciona un servicio" />
                    </SelectTrigger>
                    <SelectContent>
                      {services?.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name} — {formatCurrency(s.cost)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {(() => {
                  const selectedService = services?.find((s) => s.id === newApptServiceId)
                  if (!selectedService?.opciones || selectedService.opciones.length === 0) return null
                  return (
                    <div className="space-y-1.5">
                      <Label htmlFor="new-appt-option">Opción *</Label>
                      <Select value={newApptOption} onValueChange={setNewApptOption}>
                        <SelectTrigger id="new-appt-option" className="w-full">
                          <SelectValue placeholder="Selecciona una opción" />
                        </SelectTrigger>
                        <SelectContent>
                          {selectedService.opciones.map((op) => (
                            <SelectItem key={op} value={op}>
                              {op}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )
                })()}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="new-appt-date">Fecha *</Label>
                    <Input
                      id="new-appt-date"
                      type="date"
                      value={newApptDate}
                      onChange={(e) => setNewApptDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="new-appt-time">Hora *</Label>
                    <Input
                      id="new-appt-time"
                      type="time"
                      value={newApptTime}
                      onChange={(e) => setNewApptTime(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="new-appt-client">Cliente</Label>
                  <Select value={newApptClientId} onValueChange={setNewApptClientId}>
                    <SelectTrigger id="new-appt-client" className="w-full">
                      <SelectValue placeholder="Sin cliente asociado" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="new-appt-employee">Barbero</Label>
                  <Select value={newApptEmployeeId} onValueChange={setNewApptEmployeeId}>
                    <SelectTrigger id="new-appt-employee" className="w-full">
                      <SelectValue placeholder="Sin asignar" />
                    </SelectTrigger>
                    <SelectContent>
                      {employees?.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="new-appt-status">Estado</Label>
                  <Select value={newApptStatus} onValueChange={setNewApptStatus}>
                    <SelectTrigger id="new-appt-status" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pendiente">Pendiente</SelectItem>
                      <SelectItem value="confirmada">Confirmada</SelectItem>
                      <SelectItem value="completada">Completada</SelectItem>
                      <SelectItem value="cancelada">Cancelada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="new-appt-notes">Notas</Label>
                  <Textarea
                    id="new-appt-notes"
                    placeholder="Notas opcionales sobre la cita..."
                    value={newApptNotes}
                    onChange={(e) => setNewApptNotes(e.target.value)}
                    rows={3}
                  />
                </div>

                {newApptError && (
                  <p className="text-sm text-destructive">{newApptError}</p>
                )}

                <div className="flex justify-end gap-3 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setNewApptOpen(false)
                      resetNewApptForm()
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button onClick={createAppointment} disabled={newApptSubmitting}>
                    {newApptSubmitting ? 'Creando...' : 'Crear cita'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          {isAdmin && (
            <Button onClick={generateQR} disabled={generating} className="md:px-3">
              <QrCode className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">{generating ? 'Generando...' : 'Generar código QR'}</span>
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

      {/* Calendar View */}
      {displayMode === 'calendario' && (
        <AppointmentsCalendar
          appointments={appointments || []}
          currentMonth={currentMonth}
          onMonthChange={setCurrentMonth}
          statusConfig={statusConfig}
          formatCurrency={formatCurrency}
          formatTime={formatTime}
          onUpdateStatus={updateStatus}
          onDelete={deleteAppointment}
        />
      )}

      {/* Appointments List */}
      {displayMode === 'lista' && (
      <ScrollArea className="h-auto md:h-[calc(100vh-18rem)]">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 pr-4">
          {appointments && appointments.length > 0 ? (
            appointments.map((apt) => {
              const config = statusConfig[apt.status]
              return (
                <Card key={apt.id} className="gap-0 py-3">
                  <CardContent className="px-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="font-semibold text-sm leading-tight truncate">{apt.service?.name}</p>
                        {apt.opcion_seleccionada && (
                          <span className="inline-flex items-center rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400 shrink-0">
                            {apt.opcion_seleccionada}
                          </span>
                        )}
                      </div>
                      <Badge className={config.color + ' text-[10px] shrink-0'}>
                        {config.label}
                      </Badge>
                    </div>

                    <div className="space-y-1 text-xs text-muted-foreground">
                      {apt.client && (
                        <div className="flex items-center gap-1.5">
                          <Heart className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{apt.client.name}</span>
                        </div>
                      )}
                      {apt.employee && (
                        <div className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{apt.employee.full_name}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">
                          {formatDate(apt.appointment_time)} · {formatTime(apt.appointment_time)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1.5 border-t">
                      <p className="text-sm font-bold">{formatCurrency(apt.service?.cost || 0)}</p>
                      <div className="flex items-center gap-1.5">
                        <Select value={apt.status} onValueChange={(newStatus) => updateStatus(apt.id, newStatus)}>
                          <SelectTrigger className="h-7 w-[110px] text-[11px]">
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
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => setDeleteConfirm(apt.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
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
                    </div>
                  </CardContent>
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
      )}

      <Dialog open={!!pendingCompleteId} onOpenChange={(open) => { if (!open) { setPendingCompleteId(null); setCompleteEmployeeId('') } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Asigna un barbero</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Esta cita no tiene un barbero asignado. Para registrar el ingreso y la comisión correspondiente, elige quién atendió al cliente.
          </p>
          <div className="space-y-2">
            <Label htmlFor="complete-employee">Barbero</Label>
            <Select value={completeEmployeeId} onValueChange={setCompleteEmployeeId}>
              <SelectTrigger id="complete-employee" className="w-full">
                <SelectValue placeholder="Selecciona un barbero" />
              </SelectTrigger>
              <SelectContent>
                {employees?.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>{emp.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { setPendingCompleteId(null); setCompleteEmployeeId('') }}>
              Cancelar
            </Button>
            <Button onClick={confirmCompleteWithEmployee} disabled={!completeEmployeeId || completeSubmitting}>
              {completeSubmitting ? 'Completando...' : 'Completar cita'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function AppointmentsCalendar({
  appointments,
  currentMonth,
  onMonthChange,
  statusConfig,
  formatCurrency,
  formatTime,
  onUpdateStatus,
  onDelete,
}: {
  appointments: (Appointment & { service: Service | null; employee: Profile | null; client?: any })[]
  currentMonth: Date
  onMonthChange: (d: Date) => void
  statusConfig: Record<string, { label: string; icon: any; color: string }>
  formatCurrency: (n: number) => string
  formatTime: (d: string) => string
  onUpdateStatus: (id: string, status: string) => void
  onDelete: (id: string) => void
}) {
  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })

  const appointmentsByDay = (day: Date) =>
    appointments.filter((apt) => isSameDay(new Date(apt.appointment_time), day))

  const dotColor: Record<string, string> = {
    pendiente: 'bg-yellow-500',
    confirmada: 'bg-blue-500',
    completada: 'bg-green-500',
    cancelada: 'bg-red-500',
  }

  const weekdayLabels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg capitalize">
            {format(currentMonth, 'MMMM yyyy', { locale: es })}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onMonthChange(subMonths(currentMonth, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-8" onClick={() => onMonthChange(new Date())}>
              Hoy
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onMonthChange(addMonths(currentMonth, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-px mb-1">
          {weekdayLabels.map((d) => (
            <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px bg-border rounded-md overflow-hidden">
          {days.map((day) => {
            const dayAppointments = appointmentsByDay(day)
            const inMonth = isSameMonth(day, currentMonth)
            return (
              <Popover key={day.toISOString()}>
                <PopoverTrigger asChild disabled={dayAppointments.length === 0}>
                  <button
                    type="button"
                    className={`min-h-[5rem] md:min-h-[6.5rem] bg-background p-1.5 flex flex-col items-start gap-1 text-left transition-colors ${
                      inMonth ? '' : 'opacity-40'
                    } ${dayAppointments.length > 0 ? 'hover:bg-accent cursor-pointer' : 'cursor-default'}`}
                  >
                    <span
                      className={`text-xs font-medium h-5 w-5 flex items-center justify-center rounded-full ${
                        isToday(day) ? 'bg-primary text-primary-foreground' : ''
                      }`}
                    >
                      {format(day, 'd')}
                    </span>
                    <div className="flex flex-wrap gap-1 w-full">
                      {dayAppointments.slice(0, 4).map((apt) => (
                        <span
                          key={apt.id}
                          className={`h-1.5 w-1.5 rounded-full ${dotColor[apt.status] || 'bg-muted-foreground'}`}
                        />
                      ))}
                    </div>
                    {dayAppointments.length > 0 && (
                      <span className="text-[10px] text-muted-foreground mt-auto">
                        {dayAppointments.length} cita{dayAppointments.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </button>
                </PopoverTrigger>
                {dayAppointments.length > 0 && (
                  <PopoverContent className="w-80 p-0" align="start">
                    <div className="p-3 border-b">
                      <p className="font-medium capitalize">
                        {format(day, "EEEE d 'de' MMMM", { locale: es })}
                      </p>
                    </div>
                    <div className="max-h-80 overflow-y-auto divide-y">
                      {dayAppointments
                        .sort((a, b) => new Date(a.appointment_time).getTime() - new Date(b.appointment_time).getTime())
                        .map((apt) => {
                          const config = statusConfig[apt.status]
                          return (
                            <div key={apt.id} className="p-3 space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <p className="text-sm font-semibold">{apt.service?.name}</p>
                                    {apt.opcion_seleccionada && (
                                      <span className="inline-flex items-center rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400 shrink-0">
                                        {apt.opcion_seleccionada}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {formatTime(apt.appointment_time)}
                                  </p>
                                </div>
                                <Badge className={config.color + ' text-[10px]'}>{config.label}</Badge>
                              </div>
                              {apt.client && (
                                <p className="text-xs text-muted-foreground">{apt.client.name}</p>
                              )}
                              {apt.employee && (
                                <p className="text-xs text-muted-foreground">{apt.employee.full_name}</p>
                              )}
                              <p className="text-sm font-semibold">{formatCurrency(apt.service?.cost || 0)}</p>
                              <div className="flex gap-2 pt-1">
                                <Select value={apt.status} onValueChange={(v) => onUpdateStatus(apt.id, v)}>
                                  <SelectTrigger className="h-7 flex-1 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="pendiente">Pendiente</SelectItem>
                                    <SelectItem value="confirmada">Confirmada</SelectItem>
                                    <SelectItem value="completada">Completada</SelectItem>
                                    <SelectItem value="cancelada">Cancelada</SelectItem>
                                  </SelectContent>
                                </Select>
                                <Button
                                  variant="destructive"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => onDelete(apt.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  </PopoverContent>
                )}
              </Popover>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}