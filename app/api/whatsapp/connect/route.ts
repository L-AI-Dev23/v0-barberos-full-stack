import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  getAuthenticatedProfile,
  unauthorizedResponse,
  forbiddenResponse,
  requireOrgMembership,
  requireAdmin,
} from '@/lib/auth/api-auth'

export async function POST(req: Request) {
  try {
    const { organizationId } = await req.json()

    if (!organizationId) {
      return NextResponse.json({ error: 'Falta organizationId' }, { status: 400 })
    }

    const profile = await getAuthenticatedProfile()
    if (!profile) {
      return unauthorizedResponse()
    }

    if (!requireAdmin(profile)) {
      return forbiddenResponse()
    }

    if (!requireOrgMembership(profile, organizationId)) {
      return forbiddenResponse()
    }

    const supabase = createServiceClient()
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('whatsapp_api_url, whatsapp_api_key, whatsapp_instance_name')
      .eq('id', organizationId)
      .single()

    if (orgError || !org?.whatsapp_api_url || !org?.whatsapp_api_key || !org?.whatsapp_instance_name) {
      return NextResponse.json({ error: 'Configuración de WhatsApp no encontrada o incompleta' }, { status: 404 })
    }

    const { whatsapp_api_url, whatsapp_api_key, whatsapp_instance_name } = org

    let whatsappApiUrlSanitized = whatsapp_api_url.trim()
    if (!whatsappApiUrlSanitized.startsWith('http://') && !whatsappApiUrlSanitized.startsWith('https://')) {
      whatsappApiUrlSanitized = `https://${whatsappApiUrlSanitized}`
    }
    if (whatsappApiUrlSanitized.endsWith('/')) {
      whatsappApiUrlSanitized = whatsappApiUrlSanitized.slice(0, -1)
    }

    try {
      await fetch(`${whatsappApiUrlSanitized}/instance/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: whatsapp_api_key,
        },
        body: JSON.stringify({
          instanceName: whatsapp_instance_name,
          qrcode: true,
        }),
      })
    } catch {
      // La instancia puede existir ya; continuar con el flujo de conexión.
    }

    const stateRes = await fetch(
      `${whatsappApiUrlSanitized}/instance/connectionState/${whatsapp_instance_name}`,
      { headers: { apikey: whatsapp_api_key } },
    )

    const stateData = await stateRes.json().catch(() => ({}))

    if (stateData.instance?.state === 'open') {
      return NextResponse.json({ status: 'connected' })
    }

    const qrRes = await fetch(
      `${whatsappApiUrlSanitized}/instance/connect/${whatsapp_instance_name}`,
      { headers: { apikey: whatsapp_api_key } },
    )

    const qrData = await qrRes.json().catch(() => ({}))

    if (qrData.qrcode?.base64) {
      return NextResponse.json({ status: 'qr', qrCode: qrData.qrcode.base64 })
    }

    const errMsg = qrData.message || qrData.error || 'No se pudo obtener el QR'
    return NextResponse.json({
      status: 'disconnected',
      message: `No se pudo obtener el QR. Detalle del servidor: ${errMsg}`,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
