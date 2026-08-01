import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  getAuthenticatedProfile,
  unauthorizedResponse,
  forbiddenResponse,
  requireOrgMembership,
  requireAdmin,
} from '@/lib/auth/api-auth'
import { getEvolutionApiUrl, getEvolutionApiKey, getInstanceName } from '@/lib/whatsapp/config'

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

    let apiUrl: string
    let apiKey: string
    try {
      apiUrl = getEvolutionApiUrl()
      apiKey = getEvolutionApiKey()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Configuración de WhatsApp incompleta en el servidor'
      return NextResponse.json({ error: message }, { status: 500 })
    }

    const instanceName = getInstanceName(organizationId)

    // Revisamos primero si la instancia ya existe y su estado, antes de intentar crearla.
    const stateRes = await fetch(
      `${apiUrl}/instance/connectionState/${instanceName}`,
      { headers: { apikey: apiKey } },
    )

    let stateData = await stateRes.json().catch(() => ({}))
    let instanceExists = stateRes.ok

    if (stateData?.instance?.state === 'open') {
      const supabase = createServiceClient()
      await supabase
        .from('organizations')
        .update({
          whatsapp_connected: true,
          whatsapp_instance_name: instanceName,
        })
        .eq('id', organizationId)

      return NextResponse.json({ status: 'connected' })
    }

    // Si la instancia no existe todavía (404), la creamos.
    if (!instanceExists) {
      const createRes = await fetch(`${apiUrl}/instance/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: apiKey,
        },
        body: JSON.stringify({
          instanceName,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS',
        }),
      })

      const createData = await createRes.json().catch(() => ({}))

      if (!createRes.ok) {
        const errMsg = createData?.message || createData?.error || `HTTP ${createRes.status}`
        return NextResponse.json({
          status: 'disconnected',
          message: `No se pudo crear la instancia en Evolution API. Detalle: ${JSON.stringify(errMsg)}`,
        })
      }

      // El endpoint de creación en v2 ya suele devolver el QR directamente.
      const qrFromCreate = createData?.qrcode?.base64
      if (qrFromCreate) {
        return NextResponse.json({ status: 'qr', qrCode: qrFromCreate })
      }
    }

    const qrRes = await fetch(
      `${apiUrl}/instance/connect/${instanceName}`,
      { headers: { apikey: apiKey } },
    )

    const qrData = await qrRes.json().catch(() => ({}))

    if (!qrRes.ok) {
      const errMsg = qrData?.message || qrData?.error || `HTTP ${qrRes.status}`
      return NextResponse.json({
        status: 'disconnected',
        message: `No se pudo obtener el QR. Detalle del servidor: ${JSON.stringify(errMsg)}`,
      })
    }

    if (qrData.qrcode?.base64) {
      return NextResponse.json({ status: 'qr', qrCode: qrData.qrcode.base64 })
    }

    if (qrData.base64) {
      return NextResponse.json({ status: 'qr', qrCode: qrData.base64 })
    }

    const errMsg = qrData.message || qrData.error || 'No se pudo obtener el QR'
    return NextResponse.json({
      status: 'disconnected',
      message: `No se pudo obtener el QR. Detalle del servidor: ${JSON.stringify(errMsg)}`,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}