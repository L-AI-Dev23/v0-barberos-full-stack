import { createServiceClient } from '@/lib/supabase/service'

export type WhatsAppTriggerEvent =
  | 'booking_created'
  | 'booking_completed'
  | 'reminder_30m'
  | 'custom_days'

export async function sendWhatsAppMessage(appointmentId: string, event: WhatsAppTriggerEvent) {
  const supabase = createServiceClient()

  const { data: appointment, error: apptError } = await supabase
    .from('appointments')
    .select('*, client:loyalty_clients(*), service:services(*), employee:profiles(*)')
    .eq('id', appointmentId)
    .maybeSingle()

  if (apptError) {
    return { error: 'Error al buscar la cita', status: 500 as const }
  }

  if (!appointment) {
    return { error: 'Cita no encontrada', status: 404 as const }
  }

  if (!appointment.client?.phone) {
    return { error: 'El cliente no tiene un número de teléfono registrado', status: 400 as const }
  }

  const clientPhone = appointment.client.phone.trim()

  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('whatsapp_api_url, whatsapp_api_key, whatsapp_instance_name, whatsapp_connected')
    .eq('id', appointment.organization_id)
    .maybeSingle()

  if (orgError) {
    return { error: 'Error al buscar organización', status: 500 as const }
  }

  if (!org?.whatsapp_connected || !org.whatsapp_api_url || !org.whatsapp_api_key || !org.whatsapp_instance_name) {
    return { error: 'La configuración de WhatsApp está incompleta o desactivada', status: 400 as const }
  }

  const { data: rule, error: ruleError } = await supabase
    .from('whatsapp_rules')
    .select('message_template')
    .eq('organization_id', appointment.organization_id)
    .eq('trigger_event', event)
    .eq('is_active', true)
    .maybeSingle()

  if (ruleError) {
    return { error: 'Error al buscar regla de WhatsApp', status: 500 as const }
  }

  if (!rule?.message_template) {
    return { error: `No hay una regla activa para el evento: ${event}`, status: 404 as const }
  }

  let whatsappApiUrlSanitized = org.whatsapp_api_url.trim()
  if (!whatsappApiUrlSanitized.startsWith('http://') && !whatsappApiUrlSanitized.startsWith('https://')) {
    whatsappApiUrlSanitized = `https://${whatsappApiUrlSanitized}`
  }
  if (whatsappApiUrlSanitized.endsWith('/')) {
    whatsappApiUrlSanitized = whatsappApiUrlSanitized.slice(0, -1)
  }

  let number = clientPhone.replace(/\D/g, '')
  if (number.length === 9) {
    number = `51${number}`
  }
  if (number.startsWith('+')) {
    number = number.substring(1)
  }

  let message = rule.message_template
  message = message.replace(/{nombre_cliente}/g, appointment.client.name)

  const apptDate = new Date(appointment.appointment_time)
  const timeStr = apptDate.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true })
  const dateStr = apptDate.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })

  message = message.replace(/{fecha_cita}/g, dateStr)
  message = message.replace(/{hora_cita}/g, timeStr)

  const endpoint = `${whatsappApiUrlSanitized}/message/sendText/${org.whatsapp_instance_name}`

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: org.whatsapp_api_key,
    },
    body: JSON.stringify({
      number,
      text: message,
      textMessage: { text: message },
      options: {
        delay: 1200,
        presence: 'composing',
      },
    }),
  })

  const responseData = await response.json().catch(() => ({}))

  if (response.ok) {
    return { success: true as const, data: responseData }
  }

  return {
    error: 'Evolution API respondió con error',
    detail: responseData,
    status: response.status as number,
  }
}
