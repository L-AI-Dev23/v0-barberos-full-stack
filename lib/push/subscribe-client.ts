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
  | { status: 'ios-needs-install' }
  | { status: 'denied' }
  | { status: 'error'; message: string }
  | { status: 'subscribed' }

/** Detecta iPhone/iPad, incluyendo iPadOS 13+ que se identifica como "Mac". */
export function isIOSDevice(): boolean {
  if (typeof window === 'undefined') return false
  const ua = window.navigator.userAgent
  const isAppleTouch = /iPhone|iPad|iPod/.test(ua)
  const isIpadDesktopMode = ua.includes('Macintosh') && 'ontouchend' in document
  return isAppleTouch || isIpadDesktopMode
}

/**
 * En iOS, Push solo está disponible cuando el sitio se abrió como PWA
 * instalada (Añadir a pantalla de inicio), sin importar el navegador
 * (Safari, Chrome y Firefox en iOS comparten el mismo motor WebKit).
 * Este helper detecta si estamos corriendo en modo standalone.
 */
export function isRunningAsInstalledApp(): boolean {
  if (typeof window === 'undefined') return false
  const standaloneMedia = window.matchMedia?.('(display-mode: standalone)').matches
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true
  return !!standaloneMedia || !!iosStandalone
}

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
    // En iOS, si no está instalado como PWA, faltan estas APIs incluso en
    // Chrome/Safari/Firefox — no es un problema real del navegador.
    if (isIOSDevice() && !isRunningAsInstalledApp()) {
      return { status: 'ios-needs-install' }
    }
    return { status: 'unsupported' }
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return { status: 'denied' }
  }

  try {
    // Si quedó un registro de un intento anterior (por ejemplo, de antes de
    // instalar la app en iOS) puede quedar en un estado roto que hace fallar
    // el registro nuevo. Lo limpiamos primero para partir de cero.
    const existingRegistration = await navigator.serviceWorker.getRegistration('/sw.js')
    if (existingRegistration && !existingRegistration.active) {
      await existingRegistration.unregister().catch(() => {})
    }

    let registration: ServiceWorkerRegistration
    try {
      registration = await navigator.serviceWorker.register('/sw.js')
    } catch (registerError) {
      return {
        status: 'error',
        message:
          'No se pudo registrar el service worker. Cierra la app desde el multitasking, vuelve a abrirla y prueba de nuevo.',
      }
    }

    // navigator.serviceWorker.ready puede quedarse colgado indefinidamente
    // en algunos casos de iOS; le ponemos un límite de tiempo.
    const readyOrTimeout = Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
    ])
    try {
      await readyOrTimeout
    } catch {
      return {
        status: 'error',
        message: 'El service worker no respondió a tiempo. Cierra la app por completo y vuelve a abrirla.',
      }
    }

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!vapidPublicKey) {
      return { status: 'error', message: 'Falta NEXT_PUBLIC_VAPID_PUBLIC_KEY' }
    }

    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      try {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        })
      } catch (subscribeError) {
        return {
          status: 'error',
          message:
            'No se pudo crear la suscripción push. En iPhone, confirma que abriste la app desde el ícono de la pantalla de inicio (no desde una pestaña normal).',
        }
      }
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
