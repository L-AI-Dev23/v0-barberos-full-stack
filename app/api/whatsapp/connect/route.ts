import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/client';

export async function POST(req: Request) {
  try {
    const { organizationId } = await req.json();

    if (!organizationId) {
      return NextResponse.json({ error: 'Falta organizationId' }, { status: 400 });
    }

    // Usar cliente anonimo de supabase para obtener la configuracion de la organizacion
    const supabase = createClient();
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('whatsapp_api_url, whatsapp_api_key, whatsapp_instance_name')
      .eq('id', organizationId)
      .single();

    if (orgError || !org || !org.whatsapp_api_url || !org.whatsapp_api_key || !org.whatsapp_instance_name) {
      return NextResponse.json({ error: 'Configuración de WhatsApp no encontrada o incompleta' }, { status: 404 });
    }

    const { whatsapp_api_url, whatsapp_api_key, whatsapp_instance_name } = org;

    // Sanitizar y formatear URL de la API de WhatsApp
    let whatsappApiUrlSanitized = whatsapp_api_url.trim();
    if (!whatsappApiUrlSanitized.startsWith('http://') && !whatsappApiUrlSanitized.startsWith('https://')) {
      whatsappApiUrlSanitized = `https://${whatsappApiUrlSanitized}`;
    }
    if (whatsappApiUrlSanitized.endsWith('/')) {
      whatsappApiUrlSanitized = whatsappApiUrlSanitized.slice(0, -1);
    }

    // 1. Intentar crear la instancia en Evolution API
    try {
      const createRes = await fetch(`${whatsappApiUrlSanitized}/instance/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': whatsapp_api_key
        },
        body: JSON.stringify({
          instanceName: whatsapp_instance_name,
          qrcode: true
        })
      });
      const createData = await createRes.json().catch(() => ({}));
      console.log('Create instance API Response:', createData);
    } catch (e) {
      console.log('La instancia ya podría existir, continuando...', e);
    }

    // 2. Obtener el estado actual de la conexión o el código QR
    const stateRes = await fetch(`${whatsappApiUrlSanitized}/instance/connectionState/${whatsapp_instance_name}`, {
      headers: { 'apikey': whatsapp_api_key }
    });

    const stateData = await stateRes.json().catch(() => ({}));
    console.log('Connection state API Response:', stateData);

    if (stateData.instance?.state === 'open') {
      return NextResponse.json({ status: 'connected' });
    }

    // 3. Si no está conectado, pedir el código QR
    const qrRes = await fetch(`${whatsappApiUrlSanitized}/instance/connect/${whatsapp_instance_name}`, {
      headers: { 'apikey': whatsapp_api_key }
    });

    const qrData = await qrRes.json().catch(() => ({}));
    console.log('Connect/QR API Response:', qrData);

    if (qrData.qrcode?.base64) {
      return NextResponse.json({ status: 'qr', qrCode: qrData.qrcode.base64 });
    }

    // Retornar mensaje detallado si la API devolvió un error específico
    const errMsg = qrData.message || qrData.error || JSON.stringify(qrData);
    return NextResponse.json({ 
      status: 'disconnected', 
      message: `No se pudo obtener el QR. Detalle del servidor: ${errMsg}` 
    });

  } catch (error: any) {
    console.error('Error en API connect:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
