'use client'

import { useState, useEffect, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Scissors, Heart, Gift, ArrowLeft } from 'lucide-react'
import type { Organization, LoyaltyClient, Sale, SaleItem } from '@/lib/types/database'

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
  }).format(amount)
}

export default function LoyaltyClientPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params)
  const supabase = createClient()
  
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [client, setClient] = useState<LoyaltyClient | null>(null)
  const [history, setHistory] = useState<(Sale & { items: SaleItem[] })[]>([])
  const [clientName, setClientName] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load organization
  useEffect(() => {
    async function loadOrg() {
      const { data } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', orgId)
        .single()
      
      setOrganization(data)
      setLoading(false)
    }
    loadOrg()
  }, [orgId])

  // Subscribe to realtime updates for client stamps
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
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [client?.id])

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
      loadHistory(existingClient.id)
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
        setError('Failed to create account. Please try again.')
      } else {
        setClient(newClient)
      }
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

  function logout() {
    setClient(null)
    setHistory([])
    setClientName('')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (!organization) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-6">
            <p className="text-muted-foreground">Organization not found.</p>
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
            <CardDescription>Enter your name to view your loyalty card</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              {error && (
                <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="name">Your Name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Enter your name"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  required
                />
              </div>

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Loading...' : 'View My Loyalty Card'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Client profile screen
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
              <p className="text-sm text-muted-foreground">Welcome, {client.name}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={logout}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Exit
          </Button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        {/* Loyalty Card */}
        <Card>
          <CardHeader className="text-center">
            <CardTitle>Your Loyalty Card</CardTitle>
            <CardDescription>
              Collect 5 stamps for a free service!
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3 justify-center mb-6">
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className={`h-14 w-14 rounded-full flex items-center justify-center transition-all ${
                    i < client.stamps 
                      ? 'bg-primary scale-110' 
                      : 'bg-muted'
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
              <p className="text-lg font-medium">
                {client.stamps} of 5 stamps collected
              </p>
              <p className="text-sm text-muted-foreground">
                {5 - client.stamps} more {5 - client.stamps === 1 ? 'stamp' : 'stamps'} until your free service!
              </p>
            </div>

            {client.stamps >= 5 && (
              <div className="mt-6 p-4 bg-green-100 dark:bg-green-900/20 rounded-lg text-center">
                <Gift className="h-8 w-8 text-green-600 mx-auto mb-2" />
                <p className="font-semibold text-green-700 dark:text-green-400">
                  Congratulations!
                </p>
                <p className="text-sm text-green-600 dark:text-green-500">
                  You have earned a free service. Tell the staff on your next visit!
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Available Coupons */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-full ${client.coupons > 0 ? 'bg-green-100' : 'bg-muted'}`}>
                <Gift className={`h-6 w-6 ${client.coupons > 0 ? 'text-green-600' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <p className={`text-xl font-bold ${client.coupons > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                  {client.coupons} {client.coupons === 1 ? 'cupón disponible' : 'cupones disponibles'}
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

        </Card>

        {/* WhatsApp Phone Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
              </span>
              Recordatorios por WhatsApp
            </CardTitle>
            <CardDescription>
              Recibe un mensaje 30 minutos antes de tu cita y notificaciones de tus cupones.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {client.phone ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between p-3 bg-muted rounded-md">
                  <span className="font-medium">{client.phone}</span>
                  <Button variant="outline" size="sm" onClick={() => {
                    // Solo limpia el state temporalmente para editar
                    setClient({ ...client, phone: '' })
                  }}>Editar</Button>
                </div>
                <p className="text-sm text-green-600 flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  Número guardado correctamente
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <Input 
                    type="tel" 
                    placeholder="Ej. +51987654321" 
                    id="phone-input"
                  />
                  <Button onClick={async () => {
                    const input = document.getElementById('phone-input') as HTMLInputElement
                    if (!input.value) return
                    const { error } = await supabase
                      .from('loyalty_clients')
                      .update({ phone: input.value })
                      .eq('id', client.id)
                    if (!error) {
                      setClient({ ...client, phone: input.value })
                    }
                  }}>
                    Guardar
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Service History */}
        <Card>
          <CardHeader>
            <CardTitle>Service History</CardTitle>
            <CardDescription>Your visits and purchases</CardDescription>
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
                No service history yet. Visit us to start earning stamps!
              </p>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
