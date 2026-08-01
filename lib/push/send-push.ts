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
 * Envía una notificación push a todas las suscripciones activas de un cliente de fidelidad.
 * Elimina automáticamente las suscripciones que ya expiraron (410/404).
 */
export async function sendPushToClient(clientId: string, payload: PushPayload) {
  ensureConfigured()
  const supabase = createServiceClient()

  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('client_id', clientId)

  if (error) {
    return { success: false as const, error: 'Error al buscar suscripciones' }
  }

  if (!subs || subs.length === 0) {
    return { success: false as const, error: 'El cliente no tiene notificaciones push activadas' }
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
