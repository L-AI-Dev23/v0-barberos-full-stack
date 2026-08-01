'use client'

import { useEffect, useState } from 'react'
import { Bell, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { setupPushNotifications, getNotificationPermissionState } from '@/lib/push/subscribe-client'

export function NotificationPrompt({
  organizationId,
  clientId,
}: {
  organizationId: string
  clientId: string
}) {
  const [visible, setVisible] = useState(false)
  const [loading, setLoading] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const state = getNotificationPermissionState()
    setVisible(state === 'default')
  }, [])

  async function handleEnable() {
    setLoading(true)
    const result = await setupPushNotifications(organizationId, clientId)
    setLoading(false)

    if (result.status === 'subscribed') {
      setVisible(false)
    } else if (result.status === 'denied' || result.status === 'unsupported') {
      setVisible(false)
    }
    // status 'error' -> deja el banner visible para reintentar
  }

  if (!visible || dismissed) return null

  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm">
      <Bell className="h-5 w-5 text-primary shrink-0" />
      <div className="flex-1">
        <p className="text-sm font-medium">Activa las notificaciones</p>
        <p className="text-xs text-muted-foreground">Te avisamos aquí cuando tu cita sea confirmada.</p>
      </div>
      <Button size="sm" onClick={handleEnable} disabled={loading}>
        {loading ? 'Activando...' : 'Activar'}
      </Button>
      <button
        aria-label="Cerrar"
        onClick={() => setDismissed(true)}
        className="text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
