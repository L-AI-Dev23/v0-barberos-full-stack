'use client'

import { useState, useEffect, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
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
  Calendar,
  User,
  Heart,
  ArrowLeft,
  AlertCircle,
  Gift,
  Phone,
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
  const [appointments, setAppointments] = useState<
    (Appointment & { service?: Service; employee?: Profile })[]
  >([])

  useEffect(() => {
    async function loadOrg() {
      const { data } = await supabase
        .from('organizations_public')
        .select('id, name, logo_url')
        .eq('id', orgId)
        .single()

      setOrganization(data)

      const { data: servicesData } = await supabase
        .from('services')
        .select('*')
        .eq('organization_id', orgId)

      setServices(servicesData || [])

      const { data: employeesData } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('organization_id', orgId)
        .eq('role', 'employee')

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
          className={`${sizeClass} rounded-full object-cover`}
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
      <header className="border-b">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {renderOrgLogo('sm')}
            <div>
              <p className="font-semibold">{organization.name}</p>
              <p className="text-sm text-muted-foreground">Hola, {client.name}</p>
              {client.phone && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {client.phone}
                </p>
              )}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={logout}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Salir
          </Button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Tarjeta de fidelidad */}
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2">
              <Heart className="h-5 w-5 text-primary" />
              Tu tarjeta de fidelidad
            </CardTitle>
            <CardDescription>¡Junta 5 sellos y obtén un servicio gratis!</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3 justify-center mb-6">
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className={`h-14 w-14 rounded-full flex items-center justify-center transition-all ${i < client.stamps ? 'bg-primary scale-110' : 'bg-muted'
                    }`}
                >
                  {i < client.stamps ? (
                    <Heart className="h-7 w-7 text-primary-foreground fill-current" />
                  ) : (
                    <Heart className="h-7 w-7 text-muted-foreground" />
                  )}
                </div>
              ))}
            </div>

            <div className="text-center">
              <p className="text-lg font-medium">{client.stamps} de 5 sellos recogidos</p>
              <p className="text-sm text-muted-foreground">
                {5 - client.stamps} sellos más para tu servicio gratis
              </p>
            </div>

            {client.stamps >= 5 && (
              <div className="mt-6 p-4 bg-green-100 dark:bg-green-900/20 rounded-lg text-center">
                <Gift className="h-8 w-8 text-green-600 mx-auto mb-2" />
                <p className="font-semibold text-green-700 dark:text-green-400">¡Felicitaciones!</p>
                <p className="text-sm text-green-600 dark:text-green-500">
                  Has ganado un servicio gratis. ¡Avísale al staff en tu próxima visita!
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cupones */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-full ${client.coupons > 0 ? 'bg-green-100' : 'bg-muted'}`}>
                <Gift
                  className={`h-6 w-6 ${client.coupons > 0 ? 'text-green-600' : 'text-muted-foreground'}`}
                />
              </div>
              <div>
                <p
                  className={`text-xl font-bold ${client.coupons > 0 ? 'text-green-600' : 'text-muted-foreground'}`}
                >
                  {client.coupons}{' '}
                  {client.coupons === 1 ? 'cupón disponible' : 'cupones disponibles'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {client.coupons > 0
                    ? 'Puedes canjear un servicio gratis en tu próxima visita'
                    : 'Completa 5 sellos para obtener un cupón'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Citas activas */}
        {appointments.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold mb-4">Tus citas activas</h2>
            <div className="space-y-3">
              {appointments.map((appointment) => (
                <Card key={appointment.id} className="border-l-4 border-l-primary">
                  <CardContent className="pt-6">
                    <div className="space-y-2">
                      <p className="font-semibold text-lg">{appointment.service?.name}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span>{formatDateTime(appointment.appointment_time)}</span>
                      </div>
                      {appointment.employee && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <User className="h-4 w-4" />
                          <span>{appointment.employee.full_name}</span>
                        </div>
                      )}
                      <div className="pt-2">
                        <span
                          className={`text-xs px-2 py-1 rounded-full font-medium ${appointment.status === 'confirmada'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-yellow-100 text-yellow-700'
                            }`}
                        >
                          {appointment.status === 'confirmada' ? 'Confirmada' : 'Pendiente'}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Servicios y reservas */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Agendar cita</h2>
          {services.length > 0 ? (
            <ScrollArea className="h-auto md:h-[400px]">
              <div className="grid gap-3 md:grid-cols-2 pr-4">
                {services.map((service) => (
                  <Dialog key={service.id}>
                    <DialogTrigger asChild>
                      <Card
                        className="cursor-pointer hover:border-primary transition-colors"
                        onClick={() => setSelectedService(service)}
                      >
                        <CardContent className="pt-6">
                          <p className="font-semibold">{service.name}</p>
                          <p className="text-sm text-muted-foreground mb-3">{service.description}</p>
                          <p className="text-lg font-bold text-primary">{formatCurrency(service.cost)}</p>
                        </CardContent>
                      </Card>
                    </DialogTrigger>
                    {selectedService?.id === service.id && (
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Agendar {service.name}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          {error && (
                            <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md flex gap-2">
                              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                              <span>{error}</span>
                            </div>
                          )}

                          {bookingSuccess && (
                            <div className="p-3 text-sm text-green-600 bg-green-100 rounded-md">
                              ¡Cita agendada exitosamente! Te enviaremos un WhatsApp de confirmación.
                            </div>
                          )}

                          <div>
                            <Label htmlFor="employee">Selecciona un barbero (opcional)</Label>
                            <Select
                              value={selectedEmployee || 'none'}
                              onValueChange={(v) => setSelectedEmployee(v === 'none' ? '' : v)}
                            >
                              <SelectTrigger className="mt-2">
                                <SelectValue placeholder="Sin preferencia" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Sin preferencia</SelectItem>
                                {employees.map((emp) => (
                                  <SelectItem key={emp.id} value={emp.id}>
                                    {emp.full_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <Label htmlFor="date">Fecha</Label>
                            <Input
                              id="date"
                              type="date"
                              value={selectedDate}
                              onChange={(e) => setSelectedDate(e.target.value)}
                              className="mt-2"
                              min={new Date().toISOString().split('T')[0]}
                            />
                          </div>

                          <div>
                            <Label htmlFor="time">Hora</Label>
                            <Input
                              id="time"
                              type="time"
                              value={selectedTime}
                              onChange={(e) => setSelectedTime(e.target.value)}
                              className="mt-2"
                            />
                          </div>

                          <div className="flex gap-3 justify-end">
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
                        </div>
                      </DialogContent>
                    )}
                  </Dialog>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <Card>
              <CardContent className="pt-6 text-center text-muted-foreground">
                No hay servicios disponibles en este momento.
              </CardContent>
            </Card>
          )}
        </div>

        {/* Historial */}
        <Card>
          <CardHeader>
            <CardTitle>Historial de visitas</CardTitle>
            <CardDescription>Tus servicios y compras anteriores</CardDescription>
          </CardHeader>
          <CardContent>
            {history.length > 0 ? (
              <ScrollArea className="h-[400px]">
                <div className="space-y-4 pr-4">
                  {history.map((sale) => (
                    <div key={sale.id} className="border-b pb-4 last:border-0">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="font-medium">
                            {new Date(sale.created_at).toLocaleDateString('es-PE', {
                              weekday: 'long',
                              year: 'numeric',
                              month: 'long',
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
                        <p className="font-semibold">{formatCurrency(sale.total)}</p>
                      </div>
                      <div className="space-y-1">
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
