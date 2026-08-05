import { createServiceClient } from '@/lib/supabase/service'
import { getEvolutionApiUrl, getEvolutionApiKey, getInstanceName } from '@/lib/whatsapp/config'

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
    .select('whatsapp_connected')
    .eq('id', appointment.organization_id)
    .maybeSingle()

  if (orgError) {
    return { error: 'Error al buscar organización', status: 500 as const }
  }

  if (!org?.whatsapp_connected) {
    return { error: 'WhatsApp no está conectado para esta organización', status: 400 as const }
  }

  let apiUrl: string
  let apiKey: string
  try {
    apiUrl = getEvolutionApiUrl()
    apiKey = getEvolutionApiKey()
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Configuración de WhatsApp incompleta en el servidor'
    return { error: message, status: 500 as const }
  }

  const instanceName = getInstanceName(appointment.organization_id)

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
  const timeStr = apptDate.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Lima' })
  const dateStr = apptDate.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Lima' })

  message = message.replace(/{fecha_cita}/g, dateStr)
  message = message.replace(/{hora_cita}/g, timeStr)

  const endpoint = `${apiUrl}/message/sendText/${instanceName}`

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
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