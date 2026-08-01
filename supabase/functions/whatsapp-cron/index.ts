import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

serve(async (req) => {
  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const evolutionApiUrlRaw = Deno.env.get('EVOLUTION_API_URL') ?? ''
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY') ?? ''

    let evolutionApiUrl = evolutionApiUrlRaw.trim()
    if (evolutionApiUrl && !evolutionApiUrl.startsWith('http://') && !evolutionApiUrl.startsWith('https://')) {
      evolutionApiUrl = `https://${evolutionApiUrl}`
    }
    if (evolutionApiUrl.endsWith('/')) {
      evolutionApiUrl = evolutionApiUrl.slice(0, -1)
    }

    if (!evolutionApiUrl || !evolutionApiKey) {
      return new Response(JSON.stringify({ error: 'Faltan EVOLUTION_API_URL / EVOLUTION_API_KEY en los secrets de la función' }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    }

    const { data: appointments, error: apptError } = await supabaseClient
      .rpc('get_appointments_in_30m')

    if (apptError) throw apptError

    if (!appointments || appointments.length === 0) {
      return new Response(JSON.stringify({ message: "No appointments found" }), {
        headers: { "Content-Type": "application/json" },
      })
    }

    let messagesSent = 0

    for (const appt of appointments) {
      const { data: client } = await supabaseClient
        .from('loyalty_clients')
        .select('name, phone')
        .eq('id', appt.client_id)
        .single()

      const { data: org } = await supabaseClient
        .from('organizations')
        .select('whatsapp_connected')
        .eq('id', appt.organization_id)
        .single()

      const { data: rule } = await supabaseClient
        .from('whatsapp_rules')
        .select('message_template')
        .eq('organization_id', appt.organization_id)
        .eq('trigger_event', 'reminder_30m')
        .eq('is_active', true)
        .single()

      if (client?.phone && org?.whatsapp_connected && rule) {
        let message = rule.message_template
        message = message.replace(/{nombre_cliente}/g, client.name)

        const apptDate = new Date(appt.appointment_time)
        const timeStr = apptDate.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
        const dateStr = apptDate.toLocaleDateString('es-PE')

        message = message.replace(/{hora_cita}/g, timeStr)
        message = message.replace(/{fecha_cita}/g, dateStr)

        try {
          const instanceName = `org-${appt.organization_id}`
          const endpoint = `${evolutionApiUrl}/message/sendText/${instanceName}`
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': evolutionApiKey
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
          } else {
            console.error(`WhatsApp reminder failed for appointment ${appt.id}: HTTP ${response.status}`)
          }
        } catch (e) {
          console.error(`WhatsApp reminder fetch error for appointment ${appt.id}:`, e)
        }
      }
    }

    return new Response(JSON.stringify({ success: true, messagesSent }), {
      headers: { "Content-Type": "application/json" },
    })

  } catch (error) {
    console.error("WhatsApp cron error:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
})