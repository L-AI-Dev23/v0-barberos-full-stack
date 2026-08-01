import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(req: Request) {
  try {
    const { organizationId, clientId, subscription } = await req.json()

    if (!organizationId || !clientId || !subscription?.endpoint || !subscription?.keys) {
      return NextResponse.json({ error: 'Faltan datos de la suscripción' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // Verificamos que el cliente de fidelidad pertenezca a esa organización
    const { data: client, error: clientError } = await supabase
      .from('loyalty_clients')
      .select('id, organization_id')
      .eq('id', clientId)
      .eq('organization_id', organizationId)
      .maybeSingle()

    if (clientError || !client) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
    }

    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        organization_id: organizationId,
        client_id: clientId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        user_agent: req.headers.get('user-agent') || null,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' },
    )

    if (error) {
      return NextResponse.json({ error: 'No se pudo guardar la suscripción' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
