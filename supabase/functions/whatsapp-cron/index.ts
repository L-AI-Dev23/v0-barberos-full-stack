import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

console.log("WhatsApp Cron function up and running!")

serve(async (req) => {
  try {
    // Inicializar cliente Supabase (usando service role para bypass RLS)
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Obtener todas las citas confirmadas que ocurran en exactamente 30 minutos
    const { data: appointments, error: apptError } = await supabaseClient
      .rpc('get_appointments_in_30m') // Esta funcion RPC debe ser creada en supabase
    
    if (apptError) throw apptError

    if (!appointments || appointments.length === 0) {
      return new Response(JSON.stringify({ message: "No appointments found" }), {
        headers: { "Content-Type": "application/json" },
      })
    }

    let messagesSent = 0

    // 2. Por cada cita, obtener el cliente y la configuración de WhatsApp
    for (const appt of appointments) {
      const { data: client } = await supabaseClient
        .from('loyalty_clients')
        .select('name, phone')
        .eq('id', appt.client_id)
        .single()
      
      const { data: org } = await supabaseClient
        .from('organizations')
        .select('whatsapp_api_url, whatsapp_api_key, whatsapp_instance_name, whatsapp_connected')
        .eq('id', appt.organization_id)
        .single()
      
      // 3. Buscar la regla de mensaje para "reminder_30m"
      const { data: rule } = await supabaseClient
        .from('whatsapp_rules')
        .select('message_template')
        .eq('organization_id', appt.organization_id)
        .eq('trigger_event', 'reminder_30m')
        .eq('is_active', true)
        .single()

      if (client?.phone && org?.whatsapp_connected && org.whatsapp_api_url && rule) {
        // Reemplazar variables en el mensaje
        let message = rule.message_template
        message = message.replace(/{nombre_cliente}/g, client.name)
        
        // Formatear fecha y hora
        const apptDate = new Date(appt.appointment_time)
        const timeStr = apptDate.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
        const dateStr = apptDate.toLocaleDateString('es-PE')
        
        message = message.replace(/{hora_cita}/g, timeStr)
        message = message.replace(/{fecha_cita}/g, dateStr)

        // Enviar WhatsApp (Ejemplo con Evolution API u otro Gateway estandarizado)
        try {
          let apiUrl = org.whatsapp_api_url.trim()
          if (!apiUrl.startsWith('http://') && !apiUrl.startsWith('https://')) {
            apiUrl = `https://${apiUrl}`
          }
          if (apiUrl.endsWith('/')) {
            apiUrl = apiUrl.slice(0, -1)
          }
          
          const endpoint = `${apiUrl}/message/sendText/${org.whatsapp_instance_name}`
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': org.whatsapp_api_key || ''
            },
            body: JSON.stringify({
              number: client.phone,
              options: {
                delay: 1200,
                presence: "composing"
              },
              textMessage: {
                text: message
              }
            })
          })

          if (response.ok) {
            messagesSent++
            console.log(`Mensaje enviado a ${client.phone}`)
          } else {
            console.error(`Error enviando mensaje a ${client.phone}: ${await response.text()}`)
          }
        } catch (e) {
          console.error(`Error fetch para ${client.phone}:`, e)
        }
      }
    }

    return new Response(JSON.stringify({ success: true, messagesSent }), {
      headers: { "Content-Type": "application/json" },
    })

  } catch (error) {
    console.error("Function error:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
})
