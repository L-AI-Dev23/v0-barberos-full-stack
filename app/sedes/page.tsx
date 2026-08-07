'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { MapPin, Scissors } from 'lucide-react'
import type { PublicOrganization } from '@/lib/types/database'

export default function SedesPage() {
  const router = useRouter()
  const supabase = createClient()

  const [organizations, setOrganizations] = useState<PublicOrganization[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadOrganizations() {
      const { data } = await supabase
        .from('organizations_public')
        .select('id, name, logo_url, coupon_discount_percent')
        .order('name')

      setOrganizations(data || [])
      setLoading(false)
    }

    loadOrganizations()
  }, [])

  function selectSede(orgId: string) {
    router.push(`/loyalty/${orgId}`)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/30">
        <p className="text-muted-foreground">Cargando sedes...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 px-4 py-10">
      <div className="mx-auto max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Scissors className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Elige tu sede</h1>
          <p className="text-muted-foreground mt-1">
            Selecciona la barbería donde quieres reservar tu cita
          </p>
        </div>

        {organizations.length === 0 ? (
          <p className="text-center text-muted-foreground">
            No hay sedes disponibles en este momento.
          </p>
        ) : (
          <div className="space-y-3">
            {organizations.map((org) => (
              <Card
                key={org.id}
                onClick={() => selectSede(org.id)}
                className="cursor-pointer transition hover:border-primary hover:shadow-md active:scale-[0.99]"
              >
                <CardContent className="flex items-center gap-4 py-4">
                  {org.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={org.logo_url}
                      alt={org.name}
                      className="h-12 w-12 rounded-full object-cover border"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                      <MapPin className="h-5 w-5 text-primary" />
                    </div>
                  )}
                  <div className="flex-1">
                    <p className="font-medium leading-tight">{org.name}</p>
                    <p className="text-sm text-muted-foreground">Reservar en esta sede</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
