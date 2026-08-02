'use client'

import { useState, useEffect, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
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
import {
  Scissors,
  Heart,
  ArrowLeft,
  AlertCircle,
  Gift,
  Phone,
  Clock,
  CheckCircle2,
  Sparkles,
} from 'lucide-react'
import type {
  PublicOrganization,
  LoyaltyClient,
  Sale,
  SaleItem,
  Service,
  Profile,
  Appointment,
} from '@/lib/types/database'
import { triggerBookingWhatsApp } from '@/lib/actions/whatsapp'
import { normalizePhone, isValidPhone } from '@/lib/utils/phone'
import { NotificationPrompt } from '@/components/notification-prompt'

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
  }).format(amount)
}

function formatDateTime(dateStr: string) {
  const date = new Date(dateStr)
  return (
    date.toLocaleDateString('es-PE', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }) +
    ' a las ' +
    date.toLocaleTimeString('es-PE', {
      hour: '2-digit',
      minute: '2-digit',
    })
  )
}

const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function generateTimeSlots(startTime = '10:00', endTime = '22:00', stepMinutes = 30) {
  const slots: string[] = []
  const [startH, startM] = startTime.split(':').map(Number)
  const [endH, endM] = endTime.split(':').map(Number)
  let cursor = startH * 60 + startM
  const end = endH * 60 + endM
  while (cursor < end) {
    const h = Math.floor(cursor / 60)
    const m = cursor % 60
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    cursor += stepMinutes
  }
  return slots
}

function formatTimeLabel(time: string) {
  const [h, m] = time.split(':').map(Number)
  const period = h >= 12 ? 'p. m.' : 'a. m.'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`
}

// Determina el rango horario disponible para el barbero seleccionado en la
// fecha elegida. Sin barbero (o sin fecha aún), se usa el rango por defecto
// 10am-10pm. Si el barbero no trabaja ese día, devuelve null.
function getAvailableRange(
  employee: Profile | undefined,
  dateStr: string,
): { start: string; end: string } | null {
  if (!employee || !dateStr) {
    return { start: '10:00', end: '22:00' }
  }

  const dayKey = DAY_KEYS[new Date(`${dateStr}T00:00:00`).getDay()]
  const daySchedule = employee.work_schedule?.[dayKey]

  if (!daySchedule || !daySchedule.enabled) {
    return null
  }

  return { start: daySchedule.start, end: daySchedule.end }
}

export default function LoyaltyClientPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params)
  const supabase = createClient()

  const [organization, setOrganization] = useState<PublicOrganization | null>(null)
  const [client, setClient] = useState<LoyaltyClient | null>(null)
  const [history, setHistory] = useState<(Sale & { items: SaleItem[] })[]>([])
  const [clientPhone, setClientPhone] = useState('')
  const [clientName, setClientName] = useState('')
  const [loginStep, setLoginStep] = useState<'phone' | 'register'>('phone')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [services, setServices] = useState<Service[]>([])
  const [employees, setEmployees] = useState<Profile[]>([])
  const [selectedService, setSelectedService] = useState<Service | null>(null)
  const [selectedEmployee, setSelectedEmployee] = useState('')
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedTime, setSelectedTime] = useState('')
  const [bookingSubmitting, setBookingSubmitting] = useState(false)
  const [bookingSuccess, setBookingSuccess] = useState(false)
  const [bookedTimes, setBookedTimes] = useState<string[]>([])
  const [appointments, setAppointments] = useState<
    (Appointment & { service?: Service; employee?: Profile })[]
  >([])

  useEffect(() => {
    async function loadOrg() {
      const { data } = await supabase
        .from('organizations_public')
        .select('id, name, logo_url, coupon_discount_percent')
        .eq('id', orgId)
        .single()

      setOrganization(data)

      const { data: servicesData } = await supabase
        .from('services')
        .select('*')
        .eq('organization_id', orgId)

      const PRIORITY_ORDER = ['corte', 'corte + barba', 'corte + barba + facial']
      const sortedServices = (servicesData || []).slice().sort((a, b) => {
        const aIndex = PRIORITY_ORDER.indexOf(a.name.trim().toLowerCase())
        const bIndex = PRIORITY_ORDER.indexOf(b.name.trim().toLowerCase())
        const aRank = aIndex === -1 ? PRIORITY_ORDER.length : aIndex
        const bRank = bIndex === -1 ? PRIORITY_ORDER.length : bIndex
        return aRank - bRank
      })

      setServices(sortedServices)

      const { data: employeesData } = await supabase
        .from('profiles')
        .select('id, full_name, work_schedule, avatar_url, employee_type')
        .eq('organization_id', orgId)
        .eq('role', 'employee')
        .eq('employee_type', 'barbero')

      setEmployees(employeesData || [])
      setLoading(false)
    }
    loadOrg()
  }, [orgId])

  useEffect(() => {
    if (!client) return

    const channel = supabase
      .channel(`loyalty-${client.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'loyalty_clients',
          filter: `id=eq.${client.id}`,
        },
        (payload) => {
          setClient(payload.new as LoyaltyClient)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [client?.id])

  useEffect(() => {
    async function loadBookedTimes() {
      if (!selectedDate || !selectedEmployee) {
        setBookedTimes([])
        return
      }

      const dayStart = `${selectedDate}T00:00:00`
      const dayEnd = `${selectedDate}T23:59:59`

      const { data } = await supabase
        .from('appointments')
        .select('appointment_time')
        .eq('organization_id', orgId)
        .eq('employee_id', selectedEmployee)
        .gte('appointment_time', dayStart)
        .lte('appointment_time', dayEnd)
        .in('status', ['pendiente', 'confirmada'])

      const times = (data || []).map((a) => {
        const d = new Date(a.appointment_time)
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      })
      setBookedTimes(times)
    }
    loadBookedTimes()
  }, [selectedDate, selectedEmployee])

  async function loadClientData(clientRecord: LoyaltyClient) {
    setClient(clientRecord)
    loadHistory(clientRecord.id)

    const { data: appointmentsData } = await supabase
      .from('appointments')
      .select('*, service:services(*), employee:profiles(*)')
      .eq('client_id', clientRecord.id)
      .in('status', ['pendiente', 'confirmada'])
      .order('appointment_time', { ascending: true })

    setAppointments(appointmentsData || [])
  }

  async function findClientByPhone(phone: string) {
    const normalized = normalizePhone(phone)

    const { data } = await supabase
      .from('loyalty_clients')
      .select('*')
      .eq('organization_id', orgId)
      .eq('phone', normalized)
      .maybeSingle()

    return data
  }

  async function handlePhoneLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!clientPhone.trim()) return

    if (!isValidPhone(clientPhone)) {
      setError('Ingresa un número de celular válido (9 dígitos).')
      return
    }

    setSubmitting(true)
    setError(null)

    const normalized = normalizePhone(clientPhone.trim())
    const existingClient = await findClientByPhone(normalized)

    if (existingClient) {
      await loadClientData(existingClient)
    } else {
      setLoginStep('register')
    }

    setSubmitting(false)
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    if (!clientName.trim()) {
      setError('Ingresa tu nombre para completar el registro.')
      return
    }

    setSubmitting(true)
    setError(null)

    const normalized = normalizePhone(clientPhone.trim())

    const { data: newClient, error: createError } = await supabase
      .from('loyalty_clients')
      .insert({
        name: clientName.trim(),
        phone: normalized,
        organization_id: orgId,
        stamps: 0,
      })
      .select()
      .single()

    if (createError) {
      setError('No se pudo crear tu cuenta. Por favor intenta de nuevo.')
    } else if (newClient) {
      await loadClientData(newClient)
    }

    setSubmitting(false)
  }

  async function loadHistory(clientId: string) {
    const { data: historyData } = await supabase
      .from('sales')
      .select('*, items:sale_items(*)')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })

    setHistory(historyData || [])
  }

  async function reloadAppointments(clientId: string) {
    const { data: appointmentsData } = await supabase
      .from('appointments')
      .select('*, service:services(*), employee:profiles(*)')
      .eq('client_id', clientId)
      .in('status', ['pendiente', 'confirmada'])
      .order('appointment_time', { ascending: true })

    setAppointments(appointmentsData || [])
  }

  async function bookAppointment() {
    if (!selectedService || !selectedDate || !selectedTime || !client) {
      setError('Por favor completa todos los campos')
      return
    }

    setBookingSubmitting(true)
    setError(null)

    const appointmentTime = new Date(`${selectedDate}T${selectedTime}`)

    const { data: newAppt, error: bookError } = await supabase
      .from('appointments')
      .insert({
        organization_id: orgId,
        client_id: client.id,
        service_id: selectedService.id,
        employee_id: selectedEmployee || null,
        appointment_time: appointmentTime.toISOString(),
        status: 'pendiente',
      })
      .select('id')
      .single()

    if (bookError) {
      setError('No se pudo agendar la cita. Por favor intenta de nuevo.')
    } else {
      setBookingSuccess(true)

      if (newAppt?.id) {
        triggerBookingWhatsApp(newAppt.id, orgId).catch(() => { })
      }

      setTimeout(() => {
        setSelectedService(null)
        setSelectedEmployee('')
        setSelectedDate('')
        setSelectedTime('')
        setBookingSuccess(false)
        reloadAppointments(client.id)
      }, 2000)
    }

    setBookingSubmitting(false)
  }

  function logout() {
    setClient(null)
    setHistory([])
    setAppointments([])
    setClientPhone('')
    setClientName('')
    setLoginStep('phone')
    setSelectedService(null)
    setError(null)
  }

  function renderOrgLogo(size: 'lg' | 'sm' = 'lg') {
    const sizeClass = size === 'lg' ? 'h-16 w-16' : 'h-10 w-10'
    const iconSize = size === 'lg' ? 'h-8 w-8' : 'h-5 w-5'

    if (organization?.logo_url) {
      return (
        <img
          src={organization.logo_url}
          alt={organization.name}
          className={`${sizeClass} rounded-full object-cover ${size === 'lg' ? 'mx-auto mb-4' : ''}`}
        />
      )
    }

    return (
      <div
        className={`${sizeClass} rounded-full bg-primary flex items-center justify-center ${size === 'lg' ? 'mx-auto mb-4' : ''}`}
      >
        <Scissors className={`${iconSize} text-primary-foreground`} />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Cargando...</p>
        </div>
      </div>
    )
  }

  if (!organization) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-6">
            <p className="text-muted-foreground">No se encontró la barbería.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!client) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            {renderOrgLogo('lg')}
            <CardTitle className="text-2xl">{organization.name}</CardTitle>
            <CardDescription>
              {loginStep === 'phone'
                ? 'Ingresa tu celular para ver tu fidelidad y agendar citas'
                : 'Completa tu registro para continuar'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loginStep === 'phone' ? (
              <form onSubmit={handlePhoneLogin} className="space-y-4">
                {error && (
                  <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md flex gap-2">
                    <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="phone">Tu celular / WhatsApp</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="Ej. 987654321"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Usaremos este número para recordatorios y confirmaciones de tus citas.
                  </p>
                </div>

                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? 'Verificando...' : 'Continuar'}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-4">
                {error && (
                  <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md flex gap-2">
                    <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="phone-display">Celular</Label>
                  <Input id="phone-display" type="tel" value={clientPhone} disabled />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name">Tu nombre</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Ingresa tu nombre"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    required
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setLoginStep('phone')
                      setError(null)
                    }}
                  >
                    Atrás
                  </Button>
                  <Button type="submit" className="flex-1" disabled={submitting}>
                    {submitting ? 'Creando...' : 'Crear cuenta'}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <header className="border-b bg-gradient-to-b from-primary/5 to-transparent">
        <div className="max-w-2xl mx-auto px-4 pt-8 pb-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Phone className="h-3.5 w-3.5" />
              {client.phone}
            </div>
            <Button variant="ghost" size="sm" onClick={logout}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Salir
            </Button>
          </div>

          <div className="flex flex-col items-center text-center gap-3">
            {renderOrgLogo('lg')}
            <div>
              <h1 className="text-2xl font-bold">{organization.name}</h1>
              <p className="text-muted-foreground">Hola, {client.name} 👋</p>
            </div>
          </div>

          {/* Citas activas como chips */}
          {appointments.length > 0 && (
            <div className="flex gap-2 overflow-x-auto mt-6 pb-1 -mx-4 px-4">
              {appointments.map((appointment) => (
                <div
                  key={appointment.id}
                  className="flex items-center gap-2 shrink-0 rounded-full border bg-card pl-3 pr-4 py-2 shadow-sm"
                >
                  <Clock className="h-4 w-4 text-primary shrink-0" />
                  <div className="text-left">
                    <p className="text-sm font-medium leading-none">{appointment.service?.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDateTime(appointment.appointment_time)}
                    </p>
                  </div>
                  <Badge
                    variant={appointment.status === 'confirmada' ? 'default' : 'secondary'}
                    className="ml-1 shrink-0"
                  >
                    {appointment.status === 'confirmada' ? 'Confirmada' : 'Pendiente'}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        <NotificationPrompt organizationId={organization.id} clientId={client.id} />

        {/* Fidelidad + cupones en una sola tarjeta */}
        <Card className="overflow-hidden">
          <CardContent className="pt-6">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Heart className="h-5 w-5 text-primary" />
              <h2 className="font-semibold text-lg">Tu tarjeta de fidelidad</h2>
            </div>
            <p className="text-sm text-muted-foreground text-center mb-6">
              {organization.coupon_discount_percent
                ? `¡Junta 5 sellos y obtén ${organization.coupon_discount_percent}% de descuento!`
                : '¡Junta 5 sellos y obtén un cupón de descuento!'}
            </p>

            <div className="flex gap-3 justify-center mb-4">
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className={`h-12 w-12 sm:h-14 sm:w-14 rounded-full flex items-center justify-center transition-all ${i < client.stamps ? 'bg-primary scale-110' : 'bg-muted'
                    }`}
                >
                  <Heart
                    className={`h-6 w-6 sm:h-7 sm:w-7 ${i < client.stamps ? 'text-primary-foreground fill-current' : 'text-muted-foreground'
                      }`}
                  />
                </div>
              ))}
            </div>

            <div className="text-center">
              <p className="font-medium">{client.stamps} de 5 sellos recogidos</p>
              <p className="text-sm text-muted-foreground">
                {5 - client.stamps > 0
                  ? `${5 - client.stamps} sellos más para tu cupón de descuento`
                  : '¡Ya completaste tu tarjeta!'}
              </p>
            </div>

            {client.stamps >= 5 && (
              <div className="mt-6 p-4 bg-primary/10 rounded-xl text-center">
                <Gift className="h-8 w-8 text-primary mx-auto mb-2" />
                <p className="font-semibold">¡Felicitaciones!</p>
                <p className="text-sm text-muted-foreground">
                  Has ganado un cupón de{' '}
                  {organization.coupon_discount_percent
                    ? `${organization.coupon_discount_percent}% de descuento`
                    : 'descuento'}
                  . ¡Avísale al staff en tu próxima visita!
                </p>
              </div>
            )}

            <Separator className="my-6" />

            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-full ${client.coupons > 0 ? 'bg-primary/10' : 'bg-muted'}`}>
                <Gift className={`h-6 w-6 ${client.coupons > 0 ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <p className={`text-lg font-bold ${client.coupons > 0 ? 'text-primary' : 'text-muted-foreground'}`}>
                  {client.coupons} {client.coupons === 1 ? 'cupón disponible' : 'cupones disponibles'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {client.coupons > 0
                    ? `Puedes canjear ${organization.coupon_discount_percent ? `${organization.coupon_discount_percent}% de descuento` : 'un descuento'} en tu próxima visita`
                    : 'Completa 5 sellos para obtener un cupón'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Servicios y reservas */}
        <div>
          <div className="mb-4">
            <h2 className="text-xl font-semibold">Agendar cita</h2>
            <p className="text-sm text-muted-foreground">Elige un servicio para reservar tu próxima visita</p>
          </div>

          {(() => {
            const bookableServices = services.filter((s) => s.mode !== 'ejemplo')
            return bookableServices.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {bookableServices.map((service) => (
                <Dialog key={service.id}>
                  <DialogTrigger asChild>
                    <Card
                      className="cursor-pointer overflow-hidden py-0 gap-0 hover:shadow-md hover:border-primary/40 transition-all"
                      onClick={() => setSelectedService(service)}
                    >
                      <div className="aspect-video w-full bg-muted overflow-hidden relative">
                        {service.imagen ? (
                          <img
                            src={service.imagen}
                            alt={service.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/15 via-primary/5 to-transparent">
                            <Scissors className="h-8 w-8 text-primary/40" />
                          </div>
                        )}
                        <div className="absolute bottom-2 right-2 rounded-full bg-background/95 backdrop-blur px-3 py-1 shadow-sm">
                          <span className="font-bold text-primary text-sm">
                            {service.variable_price ? 'Costo variable' : formatCurrency(service.cost)}
                          </span>
                        </div>
                      </div>
                      <CardContent className="p-4">
                        <p className="font-semibold">{service.name}</p>
                        {service.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                            {service.description}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </DialogTrigger>
                  {selectedService?.id === service.id && (
                    <DialogContent className="max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Agendar {service.name}</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        {/* Info del servicio */}
                        <div className="space-y-3">
                          {service.imagen && (
                            <div className="w-full overflow-hidden rounded-md aspect-video bg-muted">
                              <img
                                src={service.imagen}
                                alt={service.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          )}
                          <div>
                            <p className="font-semibold text-lg">{service.name}</p>
                            {service.description && (
                              <p className="text-sm text-muted-foreground mt-1">
                                {service.description}
                              </p>
                            )}
                            <p className="text-lg font-bold text-primary mt-2">
                              {service.variable_price ? 'Costo variable' : formatCurrency(service.cost)}
                            </p>
                          </div>
                          {service.incluye && (
                            <div className="rounded-md bg-muted/50 p-3">
                              <p className="text-sm font-medium mb-1">Este servicio incluye:</p>
                              <p className="text-sm text-muted-foreground whitespace-pre-line">
                                {service.incluye}
                              </p>
                            </div>
                          )}
                        </div>

                        <div className="border-t pt-4 space-y-4">
                          {error && (
                            <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md flex gap-2">
                              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                              <span>{error}</span>
                            </div>
                          )}

                          {bookingSuccess ? (
                            <div className="p-6 text-center space-y-2">
                              <CheckCircle2 className="h-10 w-10 text-primary mx-auto" />
                              <p className="font-semibold">¡Cita agendada!</p>
                              <p className="text-sm text-muted-foreground">
                                Te enviaremos un WhatsApp de confirmación.
                              </p>
                            </div>
                          ) : (
                            <>
                              <div>
                                <Label htmlFor="date">Fecha</Label>
                                <Input
                                  id="date"
                                  type="date"
                                  value={selectedDate}
                                  onChange={(e) => {
                                    setSelectedDate(e.target.value)
                                    setSelectedTime('')
                                  }}
                                  className="mt-2"
                                  min={new Date().toISOString().split('T')[0]}
                                />
                              </div>

                              <div>
                                <Label>Hora</Label>
                                {(() => {
                                  const employeeObj = employees.find((e) => e.id === selectedEmployee)
                                  const range = getAvailableRange(employeeObj, selectedDate)

                                  if (range === null) {
                                    return (
                                      <p className="mt-2 text-sm text-muted-foreground bg-muted/50 rounded-md p-3">
                                        Este barbero no atiende ese día. Elige otra fecha o selecciona otro barbero.
                                      </p>
                                    )
                                  }

                                  const slots = generateTimeSlots(range.start, range.end)

                                  return (
                                    <div className="mt-2 grid grid-cols-4 gap-2 max-h-48 overflow-y-auto pr-1">
                                      {slots.map((time) => {
                                        const isBooked = bookedTimes.includes(time)
                                        const isSelected = selectedTime === time
                                        return (
                                          <button
                                            key={time}
                                            type="button"
                                            disabled={isBooked}
                                            onClick={() => setSelectedTime(time)}
                                            className={`text-xs rounded-md border py-2 transition-colors ${isBooked
                                                ? 'opacity-40 line-through cursor-not-allowed bg-muted'
                                                : isSelected
                                                  ? 'bg-primary text-primary-foreground border-primary'
                                                  : 'hover:border-primary/50'
                                              }`}
                                          >
                                            {formatTimeLabel(time)}
                                          </button>
                                        )
                                      })}
                                    </div>
                                  )
                                })()}
                              </div>

                              <div>
                                <Label>Barbero (opcional)</Label>
                                <div className="mt-2 grid grid-cols-2 gap-3">
                                  <Card
                                    onClick={() => {
                                      setSelectedEmployee('')
                                      setSelectedTime('')
                                    }}
                                    className={`overflow-hidden p-0 py-0 gap-0 cursor-pointer transition-all ${
                                      !selectedEmployee
                                        ? 'border-primary border-2'
                                        : 'hover:border-primary/40'
                                    }`}
                                  >
                                    <div className="h-28 w-full bg-gradient-to-br from-violet-500/10 via-fuchsia-500/5 to-pink-500/10 flex items-center justify-center">
                                      <Sparkles className="h-6 w-6 text-violet-500/40" />
                                    </div>
                                    <div className="px-3 py-2.5 text-center">
                                      <p className="text-sm font-semibold truncate">Sin preferencia</p>
                                    </div>
                                  </Card>
                                  {employees.map((emp) => (
                                    <Card
                                      key={emp.id}
                                      onClick={() => {
                                        setSelectedEmployee(emp.id)
                                        setSelectedTime('')
                                      }}
                                      className={`overflow-hidden p-0 py-0 gap-0 cursor-pointer transition-all ${
                                        selectedEmployee === emp.id
                                          ? 'border-primary border-2'
                                          : 'hover:border-primary/40'
                                      }`}
                                    >
                                      <div className="h-28 w-full bg-muted overflow-hidden">
                                        {emp.avatar_url ? (
                                          <img
                                            src={emp.avatar_url}
                                            alt={emp.full_name}
                                            className="h-full w-full object-cover"
                                          />
                                        ) : (
                                          <div className="w-full h-full bg-gradient-to-br from-violet-500/10 via-fuchsia-500/5 to-pink-500/10 flex items-center justify-center">
                                            <span className="text-xs text-muted-foreground/40 font-semibold tracking-widest uppercase select-none">BarberOS</span>
                                          </div>
                                        )}
                                      </div>
                                      <div className="px-3 py-2.5 text-center">
                                        <p className="text-sm font-semibold truncate">{emp.full_name}</p>
                                      </div>
                                    </Card>
                                  ))}
                                </div>
                              </div>

                              <div className="flex gap-3 justify-end pt-2">
                                <Button
                                  variant="outline"
                                  onClick={() => setSelectedService(null)}
                                  disabled={bookingSubmitting}
                                >
                                  Cancelar
                                </Button>
                                <Button onClick={bookAppointment} disabled={bookingSubmitting}>
                                  {bookingSubmitting ? 'Agendando...' : 'Agendar cita'}
                                </Button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </DialogContent>
                  )}
                </Dialog>
              ))}
            </div>
            ) : (
            <Card>
              <CardContent className="pt-6 text-center text-muted-foreground">
                No hay servicios disponibles en este momento.
              </CardContent>
            </Card>
            )
          })()}
        </div>

        {/* Estilos: servicios marcados como "ejemplo", solo de referencia visual */}
        {services.some((s) => s.mode === 'ejemplo') && (
          <div>
            <div className="mb-4">
              <h2 className="text-xl font-semibold">Estilos</h2>
              <p className="text-sm text-muted-foreground">Algunos de los estilos que ofrecemos</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {services
                .filter((s) => s.mode === 'ejemplo')
                .map((service) => (
                  <Card key={service.id} className="overflow-hidden py-0 gap-0">
                    <div className="aspect-video w-full bg-muted overflow-hidden relative">
                      {service.imagen ? (
                        <img
                          src={service.imagen}
                          alt={service.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/15 via-primary/5 to-transparent">
                          <Scissors className="h-8 w-8 text-primary/40" />
                        </div>
                      )}
                    </div>
                    <CardContent className="p-4">
                      <p className="font-semibold">{service.name}</p>
                      {service.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                          {service.description}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
            </div>
          </div>
        )}

        {/* Historial como timeline */}
        <Card>
          <CardHeader>
            <CardTitle>Historial de visitas</CardTitle>
            <CardDescription>Tus servicios y compras anteriores</CardDescription>
          </CardHeader>
          <CardContent>
            {history.length > 0 ? (
              <ScrollArea className="h-[400px]">
                <div className="relative pr-4 pl-1">
                  <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
                  <div className="space-y-6">
                    {history.map((sale) => (
                      <div key={sale.id} className="relative pl-6">
                        <div className="absolute left-0 top-1.5 h-3.5 w-3.5 rounded-full bg-primary ring-4 ring-background" />
                        <div className="flex justify-between items-start mb-1">
                          <div>
                            <p className="font-medium text-sm">
                              {new Date(sale.created_at).toLocaleDateString('es-PE', {
                                weekday: 'long',
                                day: 'numeric',
                                month: 'long',
                              })}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(sale.created_at).toLocaleTimeString('es-PE', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </p>
                          </div>
                          <p className="font-semibold text-sm">{formatCurrency(sale.total)}</p>
                        </div>
                        <div className="space-y-0.5">
                          {sale.items?.map((item) => (
                            <div key={item.id} className="flex justify-between text-sm">
                              <span className="text-muted-foreground">
                                {item.quantity}x {item.service?.name || item.product?.name}
                              </span>
                              <span>{formatCurrency(item.unit_price * item.quantity)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </ScrollArea>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                Aún no tienes visitas registradas. ¡Agenda tu primera cita!
              </p>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}