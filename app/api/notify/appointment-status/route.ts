import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedProfile, unauthorizedResponse, forbiddenResponse, requireOrgMembership } from '@/lib/auth/api-auth'
import { enqueueWhatsAppMessage } from '@/lib/whatsapp/queue'

export async function POST(req: Request) {
  try {
    const { appointmentId, event } = await req.json()

    if (!appointmentId || !event) {
      return NextResponse.json({ error: 'Faltan parámetros appointmentId o event' }, { status: 400 })
    }

    const profile = await getAuthenticatedProfile()
    if (!profile) return unauthorizedResponse()

    const supabase = await createClient()
    const { data: appointment, error: apptError } = await supabase
      .from('appointments')
      .select('id, organization_id')
      .eq('id', appointmentId)
      .maybeSingle()

    if (apptError || !appointment) {
      return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 })
    }

    if (!requireOrgMembership(profile, appointment.organization_id)) {
      return forbiddenResponse()
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('whatsapp_connected')
      .eq('id', appointment.organization_id)
      .maybeSingle()

    if (!org?.whatsapp_connected) {
      return NextResponse.json({ success: false, error: 'WhatsApp no está conectado' }, { status: 200 })
    }

    const queueResult = await enqueueWhatsAppMessage(appointmentId, appointment.organization_id, event as never)

    if ('success' in queueResult && queueResult.success) {
      return NextResponse.json({ success: true, channel: 'whatsapp_queued' })
    }

    return NextResponse.json({ error: 'No se pudo encolar el mensaje de WhatsApp' }, { status: 502 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
