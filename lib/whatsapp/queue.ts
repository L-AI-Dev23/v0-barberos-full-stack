import { createServiceClient } from '@/lib/supabase/service'
import type { WhatsAppTriggerEvent } from '@/lib/whatsapp/send-message'

/**
 * Encola un mensaje de WhatsApp en vez de enviarlo directo.
 * Un worker (Supabase Edge Function) lo procesará con una demora
 * aleatoria de 10-20s, y en estricto orden (uno a la vez), para
 * simular un comportamiento humano y evitar baneos por parte de Meta.
 */
export async function enqueueWhatsAppMessage(
  appointmentId: string,
  organizationId: string,
  event: WhatsAppTriggerEvent,
) {
  const supabase = createServiceClient()

  const { error } = await supabase.from('whatsapp_message_queue').insert({
    appointment_id: appointmentId,
    organization_id: organizationId,
    event,
    status: 'pending',
  })

  if (error) {
    return { error: error.message }
  }

  // Disparamos el worker sin esperar su respuesta (fire-and-forget).
  // Si falla o no llega a procesar todo, el cron de respaldo (cada 1 min)
  // se encarga de vaciar lo que quede pendiente.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (supabaseUrl && serviceKey) {
    fetch(`${supabaseUrl}/functions/v1/whatsapp-queue-worker`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
    }).catch(() => {
      // Ignoramos errores de red aquí; el cron de respaldo procesará la cola igual.
    })
  }

  return { success: true as const }
}
