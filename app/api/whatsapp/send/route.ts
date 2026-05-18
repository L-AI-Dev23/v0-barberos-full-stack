import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/client';

export async function POST(req: Request) {
  try {
    const { appointmentId, event } = await req.json();

    if (!appointmentId || !event) {
      return NextResponse.json({ error: 'Faltan parámetros appointmentId o event' }, { status: 400 });
    }

    const supabase = createClient();

    // 1. Obtener los detalles de la cita
    const { data: appointment, error: apptError } = await supabase
      .from('appointments')
      .select('*, client:loyalty_clients(*), service:services(*), employee:profiles(*)')
      .eq('id', appointmentId)
      .single();

    if (apptError || !appointment) {
      return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 });
    }

    if (!appointment.client || !appointment.client.phone) {
      return NextResponse.json({ error: 'El cliente no tiene un número de teléfono registrado' }, { status: 400 });
    }

    // 2. Obtener la configuración de WhatsApp de la organización
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('whatsapp_api_url, whatsapp_api_key, whatsapp_instance_name, whatsapp_connected')
      .eq('id', appointment.organization_id)
      .single();

    if (orgError || !org || !org.whatsapp_connected || !org.whatsapp_api_url || !org.whatsapp_api_key || !org.whatsapp_instance_name) {
      return NextResponse.json({ error: 'La configuración de WhatsApp está incompleta o desactivada' }, { status: 400 });
    }

    // 3. Buscar la regla activa para el evento disparador
    const { data: rule, error: ruleError } = await supabase
      .from('whatsapp_rules')
      .select('message_template')
      .eq('organization_id', appointment.organization_id)
      .eq('trigger_event', event)
      .eq('is_active', true)
      .single();

    if (ruleError || !rule || !rule.message_template) {
      return NextResponse.json({ error: `No hay una regla activa para el evento: ${event}` }, { status: 404 });
    }

    // 4. Formatear y sanitizar URL de la API de WhatsApp
    let whatsappApiUrlSanitized = org.whatsapp_api_url.trim();
    if (!whatsappApiUrlSanitized.startsWith('http://') && !whatsappApiUrlSanitized.startsWith('https://')) {
      whatsappApiUrlSanitized = `https://${whatsappApiUrlSanitized}`;
    }
    if (whatsappApiUrlSanitized.endsWith('/')) {
      whatsappApiUrlSanitized = whatsappApiUrlSanitized.slice(0, -1);
    }

    // 5. Formatear el número de teléfono (Evolution API requiere el código de país)
    let number = appointment.client.phone.replace(/\D/g, '');
    if (number.length === 9) {
      number = '51' + number; // Prepend código de país de Perú (51) por defecto si tiene 9 dígitos
    }

    // 6. Remplazar variables en la plantilla del mensaje
    let message = rule.message_template;
    message = message.replace(/{nombre_cliente}/g, appointment.client.name);

    const apptDate = new Date(appointment.appointment_time);
    const timeStr = apptDate.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true });
    const dateStr = apptDate.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });

    message = message.replace(/{fecha_cita}/g, dateStr);
    message = message.replace(/{hora_cita}/g, timeStr);

    // 7. Enviar la petición a Evolution API
    const endpoint = `${whatsappApiUrlSanitized}/message/sendText/${org.whatsapp_instance_name}`;
    console.log(`Enviando WhatsApp a ${number} por evento ${event}...`);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': org.whatsapp_api_key
      },
      body: JSON.stringify({
        number: number,
        options: {
          delay: 1200,
          presence: "composing"
        },
        textMessage: {
          text: message
        }
      })
    });

    const responseData = await response.json().catch(() => ({}));
    console.log('Response from Evolution API:', responseData);

    if (response.ok) {
      return NextResponse.json({ success: true, message: 'Mensaje enviado exitosamente', data: responseData });
    } else {
      return NextResponse.json({ error: 'Evolution API respondió con error', detail: responseData }, { status: response.status });
    }

  } catch (error: any) {
    console.error('Error en API whatsapp/send:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
