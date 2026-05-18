import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  try {
    const { appointmentId, event } = await req.json();

    console.log(`[WhatsApp API] Solicitud recibida. Evento: ${event}, AppointmentId: ${appointmentId}`);

    if (!appointmentId || !event) {
      console.error('[WhatsApp API] Parámetros insuficientes');
      return NextResponse.json({ error: 'Faltan parámetros appointmentId o event' }, { status: 400 });
    }

    // Inicializar cliente Supabase usando la clave de rol de servicio si está disponible,
    // de lo contrario usar la anon clave. La clave service_role es INDISPENSABLE para saltar el RLS en segundo plano.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.warn('[WhatsApp API] ADVERTENCIA: SUPABASE_SERVICE_ROLE_KEY no está definida en el entorno. Se usará la clave pública anon, lo cual puede fallar por políticas de RLS en consultas anónimas.');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Obtener los detalles de la cita
    console.log(`[WhatsApp API] Buscando cita con ID: ${appointmentId}`);
    const { data: appointment, error: apptError } = await supabase
      .from('appointments')
      .select('*, client:loyalty_clients(*), service:services(*), employee:profiles(*)')
      .eq('id', appointmentId)
      .maybeSingle();

    if (apptError) {
      console.error('[WhatsApp API] Error de base de datos al buscar cita:', apptError);
      return NextResponse.json({ error: 'Error al buscar la cita', detail: apptError }, { status: 500 });
    }

    if (!appointment) {
      console.error('[WhatsApp API] Cita no encontrada');
      return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 });
    }

    console.log(`[WhatsApp API] Cita encontrada. ID Cliente: ${appointment.client_id}`);

    if (!appointment.client || !appointment.client.phone) {
      console.error('[WhatsApp API] El cliente de la cita no posee número telefónico registrado:', appointment.client);
      return NextResponse.json({ error: 'El cliente no tiene un número de teléfono registrado o válido' }, { status: 400 });
    }

    const clientPhone = appointment.client.phone.trim();
    console.log(`[WhatsApp API] Teléfono del cliente registrado: ${clientPhone}`);

    // 2. Obtener la configuración de WhatsApp de la organización
    console.log(`[WhatsApp API] Obteniendo configuración de WhatsApp para Org: ${appointment.organization_id}`);
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('whatsapp_api_url, whatsapp_api_key, whatsapp_instance_name, whatsapp_connected')
      .eq('id', appointment.organization_id)
      .maybeSingle();

    if (orgError) {
      console.error('[WhatsApp API] Error de base de datos al buscar organización:', orgError);
      return NextResponse.json({ error: 'Error al buscar organización', detail: orgError }, { status: 500 });
    }

    if (!org || !org.whatsapp_connected || !org.whatsapp_api_url || !org.whatsapp_api_key || !org.whatsapp_instance_name) {
      console.error('[WhatsApp API] Configuración de WhatsApp incompleta o desactivada en la organización:', org);
      return NextResponse.json({ error: 'La configuración de WhatsApp está incompleta o desactivada' }, { status: 400 });
    }

    console.log(`[WhatsApp API] Configuración de WhatsApp encontrada para Instancia: ${org.whatsapp_instance_name}`);

    // 3. Buscar la regla activa para el evento disparador
    console.log(`[WhatsApp API] Buscando regla activa para el evento: ${event}`);
    const { data: rule, error: ruleError } = await supabase
      .from('whatsapp_rules')
      .select('message_template')
      .eq('organization_id', appointment.organization_id)
      .eq('trigger_event', event)
      .eq('is_active', true)
      .maybeSingle();

    if (ruleError) {
      console.error('[WhatsApp API] Error de base de datos al buscar regla:', ruleError);
      return NextResponse.json({ error: 'Error al buscar regla de WhatsApp', detail: ruleError }, { status: 500 });
    }

    if (!rule || !rule.message_template) {
      console.warn(`[WhatsApp API] No hay regla activa configurada para el evento: ${event}`);
      return NextResponse.json({ error: `No hay una regla activa para el evento: ${event}` }, { status: 404 });
    }

    console.log(`[WhatsApp API] Plantilla de mensaje encontrada: "${rule.message_template}"`);

    // 4. Formatear y sanitizar URL de la API de WhatsApp
    let whatsappApiUrlSanitized = org.whatsapp_api_url.trim();
    if (!whatsappApiUrlSanitized.startsWith('http://') && !whatsappApiUrlSanitized.startsWith('https://')) {
      whatsappApiUrlSanitized = `https://${whatsappApiUrlSanitized}`;
    }
    if (whatsappApiUrlSanitized.endsWith('/')) {
      whatsappApiUrlSanitized = whatsappApiUrlSanitized.slice(0, -1);
    }

    // 5. Formatear el número de teléfono (Evolution API requiere el código de país sin el símbolo +)
    let number = clientPhone.replace(/\D/g, '');
    if (number.length === 9) {
      number = '51' + number; // Prepend código de país de Perú (51) por defecto si tiene 9 dígitos
    }
    
    // Asegurar que no empiece con un +
    if (number.startsWith('+')) {
      number = number.substring(1);
    }

    // 6. Reemplazar variables en la plantilla del mensaje
    let message = rule.message_template;
    message = message.replace(/{nombre_cliente}/g, appointment.client.name);

    const apptDate = new Date(appointment.appointment_time);
    const timeStr = apptDate.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true });
    const dateStr = apptDate.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });

    message = message.replace(/{fecha_cita}/g, dateStr);
    message = message.replace(/{hora_cita}/g, timeStr);

    console.log(`[WhatsApp API] Mensaje formateado: "${message}"`);

    // 7. Enviar la petición a Evolution API
    const endpoint = `${whatsappApiUrlSanitized}/message/sendText/${org.whatsapp_instance_name}`;
    console.log(`[WhatsApp API] Enviando solicitud a Evolution API en: ${endpoint} para número: ${number}`);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': org.whatsapp_api_key
      },
      body: JSON.stringify({
        number: number,
        text: message, // Para Evolution API v2 (requiere propiedad 'text' en la raíz)
        textMessage: {
          text: message // Para Evolution API v1
        },
        options: {
          delay: 1200,
          presence: "composing"
        }
      })
    });

    const responseData = await response.json().catch(() => ({}));
    console.log('[WhatsApp API] Respuesta recibida de Evolution API:', responseData);

    if (response.ok) {
      console.log(`[WhatsApp API] MENSAJE ENVIADO EXITOSAMENTE a ${number}`);
      return NextResponse.json({ success: true, message: 'Mensaje enviado exitosamente', data: responseData });
    } else {
      console.error(`[WhatsApp API] Evolution API devolvió error (HTTP ${response.status}):`, responseData);
      return NextResponse.json({ error: 'Evolution API respondió con error', detail: responseData }, { status: response.status });
    }

  } catch (error: any) {
    console.error('[WhatsApp API] ERROR GENERAL EN CONTROLADOR:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
