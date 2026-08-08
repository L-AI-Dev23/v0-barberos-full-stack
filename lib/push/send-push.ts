import webpush from 'web-push'
import { createServiceClient } from '@/lib/supabase/service'

let configured = false

function ensureConfigured() {
  if (configured) return
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:soporte@ejemplo.com'

  if (!publicKey || !privateKey) {
    throw new Error('Faltan las llaves VAPID (NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)')
  }

  webpush.setVapidDetails(subject, publicKey, privateKey)
  configured = true
}

export interface PushPayload {
  title: string
  body: string
  url?: string
  tag?: string
}

/**
 * Envía una notificación push únicamente a los dispositivos suscritos de UN
 * empleado (barbero). Otros empleados de la misma organización no reciben nada,
 * porque se filtra estrictamente por employee_id en la consulta.
 */
export async function sendPushToEmployee(employeeId: string, payload: PushPayload) {
  ensureConfigured()
  const supabase = createServiceClient()

  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('employee_id', employeeId)

  if (error) {
    return { success: false as const, error: 'Error al buscar suscripciones' }
  }

  if (!subs || subs.length === 0) {
    return { success: false as const, error: 'El empleado no tiene notificaciones push activadas' }
  }

  let sent = 0
  const expiredIds: string[] = []

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload),
        )
        sent++
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode
        // 404/410 = la suscripción ya no existe (el usuario desinstaló, borró
        // datos del navegador, etc.). La limpiamos para no seguir intentando.
        if (statusCode === 404 || statusCode === 410) {
          expiredIds.push(sub.id)
        }
      }
    }),
  )

  if (expiredIds.length > 0) {
    await supabase.from('push_subscriptions').delete().in('id', expiredIds)
  }

  if (sent === 0) {
    return { success: false as const, error: 'No se pudo entregar la notificación a ningún dispositivo' }
  }

  return { success: true as const, sent }
}
