self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// Este listener corre en segundo plano gestionado por el navegador/SO,
// por eso la notificación llega aunque la pestaña esté cerrada o el
// celular bloqueado.
self.addEventListener('push', (event) => {
  let payload = { title: 'Nueva cita', body: 'Tienes una actualización' }

  if (event.data) {
    try {
      payload = event.data.json()
    } catch {
      payload = { title: 'Nueva cita', body: event.data.text() }
    }
  }

  const title = payload.title || 'Nueva cita'
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icon-192.png',
    badge: payload.badge || '/icon-192.png',
    data: { url: payload.url || '/dashboard/appointments' },
    tag: payload.tag || undefined,
    requireInteraction: false,
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus()
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url)
      }
    }),
  )
})
