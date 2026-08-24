'use client'

import { useEffect, useState } from 'react'
import { Bell, BellOff, BellRing } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  setupEmployeePushNotifications,
  disableEmployeePushNotifications,
  getNotificationPermissionState,
  isIOSDevice,
  isRunningAsInstalledApp,
} from '@/lib/push/subscribe-client'
import { IOSInstallInstructions } from '@/components/dashboard/ios-install-instructions'

export function EmployeePushToggle({
  organizationId,
  employeeId,
}: {
  organizationId: string
  employeeId: string
}) {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported' | 'ios-needs-install'>(
    'default',
  )
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function checkSubscription() {
      // En iOS sin instalar como PWA, faltan las APIs de push aunque el
      // navegador en sí las soporte una vez instalado. Lo distinguimos de
      // "navegador no compatible" para no mandar al usuario por el camino
      // equivocado (cambiar de navegador no arregla nada acá).
      if (isIOSDevice() && !isRunningAsInstalledApp()) {
        if (!cancelled) setPermission('ios-needs-install')
        return
      }

      const state = getNotificationPermissionState()
      if (cancelled) return
      setPermission(state)

      if (state === 'granted' && 'serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration('/sw.js')
        const sub = await registration?.pushManager.getSubscription()
        if (!cancelled) setSubscribed(!!sub)
      }
    }

    checkSubscription()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleEnable() {
    setLoading(true)
    setError(null)
    const result = await setupEmployeePushNotifications(organizationId, employeeId)
    setLoading(false)

    if (result.status === 'subscribed') {
      setSubscribed(true)
      setPermission('granted')
    } else if (result.status === 'denied') {
      setPermission('denied')
    } else if (result.status === 'error') {
      setError(result.message)
    } else if (result.status === 'ios-needs-install') {
      setPermission('ios-needs-install')
    } else {
      setPermission('unsupported')
    }
  }

  async function handleDisable() {
    setLoading(true)
    await disableEmployeePushNotifications(employeeId)
    setLoading(false)
    setSubscribed(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRing className="h-5 w-5" />
          Notificaciones de citas
        </CardTitle>
        <CardDescription>
          Recibe una notificación en este celular cada vez que te asignen una cita nueva,
          aunque tengas la pantalla bloqueada o estés usando otra app.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {permission === 'ios-needs-install' && <IOSInstallInstructions />}

        {permission === 'unsupported' && (
          <p className="text-sm text-muted-foreground">
            Tu navegador no soporta notificaciones push. Prueba abrir el sistema desde Chrome.
          </p>
        )}

        {permission === 'denied' && (
          <p className="text-sm text-muted-foreground">
            Bloqueaste las notificaciones para este sitio. Actívalas desde los ajustes del
            navegador (icono de candado en la barra de direcciones) y recarga la página.
          </p>
        )}

        {permission !== 'unsupported' && permission !== 'denied' && (
          <>
            {subscribed ? (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm text-emerald-600">
                  <Bell className="h-4 w-4" />
                  Notificaciones activadas en este dispositivo
                </div>
                <Button size="sm" variant="outline" onClick={handleDisable} disabled={loading}>
                  <BellOff className="h-4 w-4 mr-2" />
                  Desactivar
                </Button>
              </div>
            ) : (
              <Button size="sm" onClick={handleEnable} disabled={loading}>
                <Bell className="h-4 w-4 mr-2" />
                {loading ? 'Activando...' : 'Activar notificaciones en este celular'}
              </Button>
            )}
          </>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}
