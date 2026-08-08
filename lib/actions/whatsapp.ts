'use server'

import { createServiceClient } from '@/lib/supabase/service'
import { enqueueWhatsAppMessage } from '@/lib/whatsapp/queue'
import { sendPushToEmployee } from '@/lib/push/send-push'

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

  return enqueueWhatsAppMessage(appointmentId, organizationId, 'booking_created')
}

/**
 * Notifica por push únicamente al barbero asignado a la cita (si tiene
 * notificaciones activadas en algún dispositivo). No afecta a otros
 * empleados de la misma organización.
 */
export async function triggerAppointmentEmployeePush(appointmentId: string, organizationId: string) {
  if (!appointmentId || !organizationId) {
    return { error: 'Parámetros inválidos' }
  }

  const supabase = createServiceClient()

  const { data: appointment } = await supabase
    .from('appointments')
    .select('id, employee_id, appointment_time, client:loyalty_clients(name), service:services(name)')
    .eq('id', appointmentId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (!appointment?.employee_id) {
    // Cita sin barbero asignado: no hay a quién avisarle.
    return { success: false as const, error: 'La cita no tiene empleado asignado' }
  }

  const client = Array.isArray(appointment.client) ? appointment.client[0] : appointment.client
  const service = Array.isArray(appointment.service) ? appointment.service[0] : appointment.service

  const time = new Date(appointment.appointment_time)
  const timeLabel = time.toLocaleString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

  const clientName = client?.name ? client.name : 'Cliente'
  const serviceName = service?.name ? ` (${service.name})` : ''

  return sendPushToEmployee(appointment.employee_id, {
    title: 'Nueva cita agendada',
    body: `${clientName}${serviceName} — ${timeLabel}`,
    url: '/dashboard/appointments',
    tag: `appointment-${appointmentId}`,
  })
}