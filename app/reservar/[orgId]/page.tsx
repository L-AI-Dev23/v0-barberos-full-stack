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
import { Scissors, Calendar, Clock, User, Heart, ArrowLeft, AlertCircle } from 'lucide-react'
import type { Organization, LoyaltyClient, Service, Profile } from '@/lib/types/database'

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

export default function BookingPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params)
  const supabase = createClient()
  
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [client, setClient] = useState<LoyaltyClient | null>(null)
  const [clientName, setClientName] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<'login' | 'services' | 'booking'>('login')
  const [services, setServices] = useState<Service[]>([])
  const [employees, setEmployees] = useState<Profile[]>([])
  const [selectedService, setSelectedService] = useState<Service | null>(null)
  const [selectedEmployee, setSelectedEmployee] = useState<string>('')
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedTime, setSelectedTime] = useState('')
  const [bookingSubmitting, setBookingSubmitting] = useState(false)
  const [bookingSuccess, setBookingSuccess] = useState(false)

  // Load organization
  useEffect(() => {
    async function loadOrg() {
      const { data } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', orgId)
        .single()
      
      setOrganization(data)
      
      // Load services
      const { data: servicesData } = await supabase
        .from('services')
        .select('*')
        .eq('organization_id', orgId)
        .eq('active', true)
      
      setServices(servicesData || [])

      // Load employees
      const { data: employeesData } = await supabase
        .from('profiles')
        .select('*')
        .eq('organization_id', orgId)
        .eq('role', 'employee')
      
      setEmployees(employeesData || [])
      
      setLoading(false)
    }
    loadOrg()
  }, [orgId])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!clientName.trim()) return
    
    setSubmitting(true)
    setError(null)

    // Try to find existing client
    const { data: existingClient } = await supabase
      .from('loyalty_clients')
      .select('*')
      .eq('organization_id', orgId)
      .eq('name', clientName.trim())
      .single()

    if (existingClient) {
      setClient(existingClient)
      setStep('services')
    } else {
      // Create new client
      const { data: newClient, error: createError } = await supabase
        .from('loyalty_clients')
        .insert({
          name: clientName.trim(),
          organization_id: orgId,
          stamps: 0,
        })
        .select()
        .single()

      if (createError) {
        setError('No se pudo crear la cuenta. Por favor intenta de nuevo.')
      } else {
        setClient(newClient)
        setStep('services')
      }
    }

    setSubmitting(false)
  }

  async function bookAppointment() {
    if (!selectedService || !selectedEmployee || !selectedDate || !selectedTime || !client) {
      setError('Por favor completa todos los campos')
      return
    }

    setBookingSubmitting(true)
    setError(null)

    const appointmentTime = new Date(`${selectedDate}T${selectedTime}`)

    const { error: bookError } = await supabase
      .from('appointments')
      .insert({
        organization_id: orgId,
        client_id: client.id,
        service_id: selectedService.id,
        employee_id: selectedEmployee,
        appointment_time: appointmentTime.toISOString(),
        status: 'pendiente',
      })

    if (bookError) {
      setError('No se pudo agendar la cita. Por favor intenta de nuevo.')
    } else {
      setBookingSuccess(true)
      setTimeout(() => {
        setStep('services')
        setSelectedService(null)
        setSelectedEmployee('')
        setSelectedDate('')
        setSelectedTime('')
        setBookingSuccess(false)
      }, 2000)
    }

    setBookingSubmitting(false)
  }

  function logout() {
    setClient(null)
    setClientName('')
    setStep('login')
    setSelectedService(null)
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

  // Login screen
  if (!client) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            {organization.logo_url ? (
              <img
                src={organization.logo_url}
                alt={organization.name}
                className="h-16 w-16 rounded-full mx-auto mb-4 object-cover"
              />
            ) : (
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary">
                <Scissors className="h-8 w-8 text-primary-foreground" />
              </div>
            )}
            <CardTitle className="text-2xl">{organization.name}</CardTitle>
            <CardDescription>Ingresa tu nombre para agendar tu cita</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              {error && (
                <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md flex gap-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

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

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Cargando...' : 'Agendar cita'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Services or Booking step
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {organization.logo_url ? (
              <img
                src={organization.logo_url}
                alt={organization.name}
                className="h-10 w-10 rounded-full object-cover"
              />
            ) : (
              <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center">
                <Scissors className="h-5 w-5 text-primary-foreground" />
              </div>
            )}
            <div>
              <p className="font-semibold">{organization.name}</p>
              <p className="text-sm text-muted-foreground">Hola, {client.name}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={logout}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Salir
          </Button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {step === 'services' ? (
          <>
            {/* Loyalty Card Preview */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Heart className="h-5 w-5 text-primary" />
                  Tu tarjeta de fidelidad
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2 justify-center mb-4">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className={`h-10 w-10 rounded-full flex items-center justify-center ${
                        i < client.stamps 
                          ? 'bg-primary scale-105' 
                          : 'bg-muted'
                      }`}
                    >
                      {i < client.stamps ? (
                        <Heart className="h-5 w-5 text-primary-foreground fill-current" />
                      ) : (
                        <Heart className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-center text-sm text-muted-foreground">
                  {client.stamps} de 5 sellos recogidos
                </p>
              </CardContent>
            </Card>

            {/* Services List */}
            <div>
              <h2 className="text-xl font-semibold mb-4">Servicios disponibles</h2>
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
                              <p className="text-lg font-bold text-primary">
                                {formatCurrency(service.cost)}
                              </p>
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
                                  ¡Cita agendada exitosamente! Nos vemos pronto.
                                </div>
                              )}

                              <div>
                                <Label htmlFor="employee">Selecciona un barbero</Label>
                                <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                                  <SelectTrigger className="mt-2">
                                    <SelectValue placeholder="Elige un barbero" />
                                  </SelectTrigger>
                                  <SelectContent>
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
                                <Button 
                                  onClick={bookAppointment}
                                  disabled={bookingSubmitting}
                                >
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
          </>
        ) : null}
      </main>
    </div>
  )
}
