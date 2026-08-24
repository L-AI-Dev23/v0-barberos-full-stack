'use client'

import { Share, SquarePlus } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

/**
 * Instrucciones para instalar el sitio como app en iPhone/iPad.
 * En iOS, las notificaciones push SOLO funcionan si el sitio se abrió
 * desde el ícono agregado a la pantalla de inicio (modo standalone),
 * sin importar si el navegador es Safari, Chrome o Firefox.
 */
export function IOSInstallInstructions() {
  return (
    <Alert>
      <Share className="h-4 w-4" />
      <AlertTitle>Un paso más para activar notificaciones en iPhone</AlertTitle>
      <AlertDescription>
        <p className="mt-1">
          En iPhone, las notificaciones solo funcionan si primero agregas este sitio a tu
          pantalla de inicio. Es un paso único de Apple, no importa si usas Safari o Chrome.
        </p>
        <ol className="mt-3 space-y-2 list-decimal list-inside">
          <li>
            Toca el botón <strong>Compartir</strong>{' '}
            <Share className="inline h-3.5 w-3.5 -mt-0.5" /> (en Safari, abajo; en Chrome,
            arriba junto a la barra de direcciones).
          </li>
          <li>
            Baja y selecciona <strong>&quot;Añadir a pantalla de inicio&quot;</strong>{' '}
            <SquarePlus className="inline h-3.5 w-3.5 -mt-0.5" />.
          </li>
          <li>
            Confirma tocando <strong>&quot;Añadir&quot;</strong>.
          </li>
          <li>
            Cierra esta pestaña y abre el sistema desde el <strong>ícono nuevo</strong> que
            apareció en tu pantalla de inicio.
          </li>
          <li>
            Desde ahí, entra a esta misma pantalla y toca &quot;Activar notificaciones&quot;
            de nuevo.
          </li>
        </ol>
      </AlertDescription>
    </Alert>
  )
}
