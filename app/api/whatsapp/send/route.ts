import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getAuthenticatedProfile,
  unauthorizedResponse,
  forbiddenResponse,
  requireOrgMembership,
} from '@/lib/auth/api-auth'
import { enqueueWhatsAppMessage } from '@/lib/whatsapp/queue'
import type { WhatsAppTriggerEvent } from '@/lib/whatsapp/send-message'

export async function POST(req: Request) {
  try {
    const { appointmentId, event } = await req.json()

    if (!appointmentId || !event) {
      return NextResponse.json({ error: 'Faltan parámetros appointmentId o event' }, { status: 400 })
    }

    const profile = await getAuthenticatedProfile()
    if (!profile) {
      return unauthorizedResponse()
    }

    const supabase = await createClient()
    const { data: appointment, error: apptError } = await supabase
      .from('appointments')
      .select('id, organization_id')
      .eq('id', appointmentId)
      .maybeSingle()

    if (apptError) {
      return NextResponse.json({ error: 'Error al buscar la cita' }, { status: 500 })
    }

    if (!appointment) {
      return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 })
    }

    if (!requireOrgMembership(profile, appointment.organization_id)) {
      return forbiddenResponse()
    }

    const result = await enqueueWhatsAppMessage(
      appointmentId,
      appointment.organization_id,
      event as WhatsAppTriggerEvent,
    )

    if ('success' in result && result.success) {
      return NextResponse.json({ success: true, message: 'Mensaje encolado, se enviará en los próximos segundos' })
    }

    return NextResponse.json({ error: 'error' in result ? result.error : 'No se pudo encolar el mensaje' }, { status: 500 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}