'use client'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export type PushSetupResult =
  | { status: 'unsupported' }
  | { status: 'denied' }
  | { status: 'error'; message: string }
  | { status: 'subscribed' }

/**
 * Pide permiso de notificaciones a ESTE navegador/dispositivo, registra el
 * service worker, se suscribe al push manager del navegador y guarda esa
 * suscripción vinculada al empleado logueado. A partir de aquí, este
 * dispositivo específico recibirá push solo cuando se le asignen citas
 * a este empleado.
 */
export async function setupEmployeePushNotifications(
  organizationId: string,
  employeeId: string,
): Promise<PushSetupResult> {
  if (typeof window === 'undefined') return { status: 'unsupported' }

  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return { status: 'unsupported' }
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return { status: 'denied' }
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!vapidPublicKey) {
      return { status: 'error', message: 'Falta NEXT_PUBLIC_VAPID_PUBLIC_KEY' }
    }

    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      })
    }

    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizationId,
        employeeId,
        subscription: subscription.toJSON(),
      }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return { status: 'error', message: data.error || 'No se pudo guardar la suscripción' }
    }

    return { status: 'subscribed' }
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : 'Error desconocido' }
  }
}

/** Revisa si este navegador ya tiene permiso concedido/denegado, sin pedirlo. */
export function getNotificationPermissionState(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return Notification.permission
}

/** Cancela la suscripción de este navegador (deja de recibir push). */
export async function disableEmployeePushNotifications(employeeId: string): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

  const registration = await navigator.serviceWorker.getRegistration('/sw.js')
  const subscription = await registration?.pushManager.getSubscription()

  if (subscription) {
    await fetch('/api/push/subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId, endpoint: subscription.endpoint }),
    })
    await subscription.unsubscribe()
  }
}
