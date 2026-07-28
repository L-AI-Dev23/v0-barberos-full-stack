'use server'

import { createServiceClient } from '@/lib/supabase/service'
import { sendWhatsAppMessage } from '@/lib/whatsapp/send-message'

const BOOKING_WHATSAPP_WINDOW_MS = 5 * 60 * 1000

export async function triggerBookingWhatsApp(
  appointmentId: string,
  organizationId: string,
) {
  if (!appointmentId || !organizationId) {
    return { error: 'Parámetros inválidos' }
  }

  const supabase = createServiceClient()

  const { data: appointment } = await supabase
    .from('appointments')
    .select('id, organization_id, created_at')
    .eq('id', appointmentId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (!appointment) {
    return { error: 'Cita no encontrada' }
  }

  const createdAt = new Date(appointment.created_at).getTime()
  if (Date.now() - createdAt > BOOKING_WHATSAPP_WINDOW_MS) {
    return { error: 'La ventana para enviar la notificación expiró' }
  }

  return sendWhatsAppMessage(appointmentId, 'booking_created')
}
