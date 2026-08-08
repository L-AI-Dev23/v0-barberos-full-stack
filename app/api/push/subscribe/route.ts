import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getAuthenticatedProfile, unauthorizedResponse } from '@/lib/auth/api-auth'

export async function POST(req: Request) {
  try {
    const profile = await getAuthenticatedProfile()
    if (!profile) return unauthorizedResponse()

    const { organizationId, employeeId, subscription } = await req.json()

    if (!organizationId || !employeeId || !subscription?.endpoint || !subscription?.keys) {
      return NextResponse.json({ error: 'Faltan datos de la suscripción' }, { status: 400 })
    }

    // Un empleado solo puede suscribir SU propio dispositivo, nunca el de otro.
    if (employeeId !== profile.id || organizationId !== profile.organization_id) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const supabase = createServiceClient()

    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        organization_id: organizationId,
        employee_id: employeeId,
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

export async function DELETE(req: Request) {
  try {
    const profile = await getAuthenticatedProfile()
    if (!profile) return unauthorizedResponse()

    const { employeeId, endpoint } = await req.json()

    if (!employeeId || !endpoint) {
      return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
    }

    if (employeeId !== profile.id) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const supabase = createServiceClient()
    await supabase.from('push_subscriptions').delete().eq('employee_id', employeeId).eq('endpoint', endpoint)

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
