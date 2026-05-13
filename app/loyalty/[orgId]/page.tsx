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
    const { data } = await supabase
      .from('sales')
      .select('*, items:sale_items(*, service:services(*), product:products(*))')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(50)
    
    setHistory(data || [])
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
