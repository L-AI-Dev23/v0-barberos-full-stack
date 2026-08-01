import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedProfile, unauthorizedResponse, forbiddenResponse, requireOrgMembership } from '@/lib/auth/api-auth'
import { sendWhatsAppMessage, type WhatsAppTriggerEvent } from '@/lib/whatsapp/send-message'
import { sendPushToClient } from '@/lib/push/send-push'

const PUSH_COPY: Record<string, { title: string; body: (name: string) => string }> = {
  booking_created: {
    title: 'Reserva recibida',
    body: (name) => `Hola ${name}, tu cita ha sido registrada. Te avisaremos cuando sea confirmada.`,
  },
  booking_confirmed: {
    title: 'Cita confirmada ✅',
    body: (name) => `Hola ${name}, tu cita ha sido confirmada. ¡Te esperamos!`,
  },
  booking_completed: {
    title: 'Gracias por tu visita',
    body: (name) => `Hola ${name}, gracias por venir. ¡Esperamos verte pronto de nuevo!`,
  },
  reminder_30m: {
    title: 'Tu cita es en 30 minutos',
    body: (name) => `Hola ${name}, tu cita comienza en 30 minutos.`,
  },
}

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
      .select('id, organization_id, client:loyalty_clients(id, name)')
      .eq('id', appointmentId)
      .maybeSingle()

    if (apptError || !appointment) {
      return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 })
    }

    if (!requireOrgMembership(profile, appointment.organization_id)) {
      return forbiddenResponse()
    }

    // 1. Intentar WhatsApp primero
    const whatsappResult = await sendWhatsAppMessage(appointmentId, event as WhatsAppTriggerEvent)
    const whatsappOk = 'success' in whatsappResult && whatsappResult.success

    if (whatsappOk) {
      return NextResponse.json({ success: true, channel: 'whatsapp' })
    }

    // 2. Fallback a push si WhatsApp no está conectado o falló
    const client = Array.isArray(appointment.client) ? appointment.client[0] : appointment.client
    const copy = PUSH_COPY[event]

    if (!client || !copy) {
      return NextResponse.json(
        { error: 'whatsapp' in whatsappResult ? undefined : 'No se pudo notificar', whatsappError: 'error' in whatsappResult ? whatsappResult.error : undefined },
        { status: 502 },
      )
    }

    const pushResult = await sendPushToClient(client.id, {
      title: copy.title,
      body: copy.body(client.name),
      url: '/',
    })

    if (pushResult.success) {
      return NextResponse.json({ success: true, channel: 'push' })
    }

    return NextResponse.json(
      {
        error: 'No se pudo notificar por WhatsApp ni por push',
        whatsappError: 'error' in whatsappResult ? whatsappResult.error : undefined,
        pushError: pushResult.error,
      },
      { status: 502 },
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
