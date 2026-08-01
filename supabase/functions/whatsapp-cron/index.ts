import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

serve(async (_req) => {
  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: appointments, error: apptError } = await supabaseClient
      .rpc('get_appointments_in_30m')

    if (apptError) throw apptError

    if (!appointments || appointments.length === 0) {
      return new Response(JSON.stringify({ message: "No appointments found" }), {
        headers: { "Content-Type": "application/json" },
      })
    }

    let queued = 0

    for (const appt of appointments) {
      // Evitar encolar el mismo recordatorio dos veces si el cron corre
      // varias veces mientras la cita sigue dentro de la ventana de 30 min.
      const { data: existing } = await supabaseClient
        .from('whatsapp_message_queue')
        .select('id')
        .eq('appointment_id', appt.id)
        .eq('event', 'reminder_30m')
        .maybeSingle()

      if (existing) continue

      const { error: insertError } = await supabaseClient
        .from('whatsapp_message_queue')
        .insert({
          appointment_id: appt.id,
          organization_id: appt.organization_id,
          event: 'reminder_30m',
          status: 'pending',
        })

      if (!insertError) queued++
    }

    if (queued > 0) {
      // Disparamos el worker sin esperar respuesta; si no llega a procesar
      // todo, el propio cron del worker (cada 1 min) retoma la cola.
      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      fetch(`${supabaseUrl}/functions/v1/whatsapp-queue-worker`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${serviceKey}` },
      }).catch(() => {})
    }

    return new Response(JSON.stringify({ success: true, queued }), {
      headers: { "Content-Type": "application/json" },
    })

  } catch (error) {
    console.error("WhatsApp cron error:", error)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Error interno' }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
})