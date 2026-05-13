'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/context/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { QRCodeSVG } from 'qrcode.react'
import { QrCode, Heart, User, Search, Copy, Check, Gift } from 'lucide-react'
import type { LoyaltyClient, Sale, SaleItem } from '@/lib/types/database'

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
  }).format(amount)
}

export default function LoyaltyPage() {
  const { profile, isAdmin } = useAuth()
  const supabase = createClient()
  
  const [search, setSearch] = useState('')
  const [selectedClient, setSelectedClient] = useState<LoyaltyClient | null>(null)
  const [clientSheetOpen, setClientSheetOpen] = useState(false)
  const [qrModalOpen, setQrModalOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [generating, setGenerating] = useState(false)

  const loyaltyUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/loyalty/${profile?.organization_id}` 
    : ''

  const { data: clients, mutate: mutateClients } = useSWR<LoyaltyClient[]>(
    profile?.organization_id ? 'loyalty-clients' : null,
    async () => {
      const { data } = await supabase
        .from('loyalty_clients')
        .select('*')
        .eq('organization_id', profile!.organization_id)
        .order('name')
      return data || []
    }
  )

  const { data: qrCode, mutate: mutateQr } = useSWR(
    profile?.organization_id && isAdmin ? 'org-qr' : null,
    async () => {
      const { data } = await supabase
        .from('organization_qr_codes')
        .select('*')
        .eq('organization_id', profile!.organization_id)
        .single()
      return data
    }
  )

  const { data: clientHistory } = useSWR<(Sale & { items: SaleItem[] })[]>(
    selectedClient ? `client-history-${selectedClient.id}` : null,
    async () => {
      const { data } = await supabase
        .from('sales')
        .select('*, items:sale_items(*, service:services(*), product:products(*))')
        .eq('client_id', selectedClient!.id)
        .order('created_at', { ascending: false })
        .limit(50)
      return data || []
    }
  )

  const filteredClients = clients?.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase())
  ) || []

  async function generateQR() {
    if (!profile?.organization_id) return
    setGenerating(true)
    
    const qrValue = loyaltyUrl
    
    if (qrCode) {
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
    
    mutateQr()
    setGenerating(false)
    setQrModalOpen(true)
  }

  async function copyLink() {
    await navigator.clipboard.writeText(loyaltyUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function openClientSheet(client: LoyaltyClient) {
    setSelectedClient(client)
    setClientSheetOpen(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Loyalty Program</h1>
          <p className="text-muted-foreground">Manage your loyal customers</p>
        </div>
        {isAdmin && (
          <Button onClick={generateQR} disabled={generating}>
            <QrCode className="h-4 w-4 mr-2" />
            {generating ? 'Generating...' : 'Generate QR Code'}
          </Button>
        )}
      </div>

      {/* QR Code Display */}
      {qrModalOpen && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              Loyalty QR Code
            </CardTitle>
            <CardDescription>
              Clients can scan this code to access their loyalty card
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <div className="p-4 bg-white rounded-lg">
              <QRCodeSVG value={loyaltyUrl} size={200} />
            </div>
            <div className="flex items-center gap-2 w-full max-w-md">
              <Input value={loyaltyUrl} readOnly className="text-sm" />
              <Button variant="outline" size="icon" onClick={copyLink}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <Button variant="outline" onClick={() => setQrModalOpen(false)}>
              Close
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search clients..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Clients Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredClients.map((client) => (
          <Card
            key={client.id}
            className="cursor-pointer hover:border-primary transition-colors"
            onClick={() => openClientSheet(client)}
          >
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                  <User className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <p className="font-medium">{client.name}</p>
                  <p className="text-sm text-muted-foreground">
                    Member since {new Date(client.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              
              {/* Loyalty Card Preview */}
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Loyalty Progress</span>
                  <span className="text-sm">{client.stamps}/5</span>
                </div>
                <div className="flex gap-1">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className={`flex-1 h-8 rounded flex items-center justify-center ${
                        i < client.stamps ? 'bg-primary' : 'bg-muted'
                      }`}
                    >
                      {i < client.stamps ? (
                        <Heart className="h-4 w-4 text-primary-foreground fill-current" />
                      ) : (
                        <Heart className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  ))}
                </div>
                {client.stamps >= 5 && (
                  <div className="mt-2 flex items-center gap-1 text-sm text-green-600">
                    <Gift className="h-4 w-4" />
                    Free service available!
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredClients.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p>{search ? 'No clients found matching your search.' : 'No loyalty clients yet.'}</p>
        </div>
      )}

      {/* Client Detail Sheet */}
      <Sheet open={clientSheetOpen} onOpenChange={setClientSheetOpen}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{selectedClient?.name}</SheetTitle>
          </SheetHeader>
          {selectedClient && (
            <div className="space-y-6 py-6">
              {/* Loyalty Card */}
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center mb-4">
                    <h3 className="font-semibold">Loyalty Card</h3>
                    <p className="text-sm text-muted-foreground">
                      {selectedClient.stamps}/5 stamps collected
                    </p>
                  </div>
                  <div className="flex gap-2 justify-center">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className={`h-12 w-12 rounded-full flex items-center justify-center ${
                          i < selectedClient.stamps ? 'bg-primary' : 'bg-muted'
                        }`}
                      >
                        {i < selectedClient.stamps ? (
                          <Heart className="h-6 w-6 text-primary-foreground fill-current" />
                        ) : (
                          <Heart className="h-6 w-6 text-muted-foreground" />
                        )}
                      </div>
                    ))}
                  </div>
                  {selectedClient.stamps >= 5 && (
                    <div className="mt-4 p-3 bg-green-100 dark:bg-green-900/20 rounded-lg text-center">
                      <Gift className="h-5 w-5 text-green-600 mx-auto mb-1" />
                      <p className="text-sm font-medium text-green-700 dark:text-green-400">
                        Free service available!
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Purchase History */}
              <div>
                <h3 className="font-semibold mb-3">Purchase History</h3>
                <ScrollArea className="h-[300px]">
                  {clientHistory && clientHistory.length > 0 ? (
                    <div className="space-y-3 pr-4">
                      {clientHistory.map((sale) => (
                        <Card key={sale.id}>
                          <CardContent className="p-4">
                            <div className="flex justify-between items-start mb-2">
                              <p className="text-sm text-muted-foreground">
                                {new Date(sale.created_at).toLocaleDateString()}
                              </p>
                              <p className="font-medium">{formatCurrency(sale.total)}</p>
                            </div>
                            <div className="space-y-1">
                              {sale.items?.map((item) => (
                                <p key={item.id} className="text-sm">
                                  {item.quantity}x {item.service?.name || item.product?.name}
                                </p>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No purchase history yet
                    </p>
                  )}
                </ScrollArea>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
