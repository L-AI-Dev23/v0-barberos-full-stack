import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

// Máximo de mensajes a procesar en una sola invocación, para no acercarnos
// al límite de tiempo de ejecución de la función. Si sobra cola, el cron
// de respaldo (cada 1 minuto) retoma desde donde quedó.
const MAX_MESSAGES_PER_RUN = 8
// Si un candado quedó "pegado" (ej. la función anterior se cortó a mitad),
// lo consideramos vencido después de este tiempo y lo liberamos.
const STALE_LOCK_MS = 3 * 60 * 1000

function randomDelayMs() {
  return Math.floor(Math.random() * (20000 - 10000 + 1)) + 10000
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

serve(async (_req) => {
  const supabase = createClient(
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
    return new Response(JSON.stringify({ error: 'Faltan EVOLUTION_API_URL / EVOLUTION_API_KEY en los secrets' }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }

  // --- Intentar tomar el candado ---
  const { data: lockRow } = await supabase
    .from('whatsapp_queue_lock')
    .select('is_locked, locked_at')
    .eq('id', 1)
    .single()

  const lockIsStale =
    lockRow?.is_locked &&
    lockRow.locked_at &&
    Date.now() - new Date(lockRow.locked_at).getTime() > STALE_LOCK_MS

  if (lockRow?.is_locked && !lockIsStale) {
    // Otra ejecución ya está procesando la cola en este momento.
    return new Response(JSON.stringify({ message: 'Ya hay un worker procesando la cola' }), {
      headers: { "Content-Type": "application/json" },
    })
  }

  const { data: acquired } = await supabase
    .from('whatsapp_queue_lock')
    .update({ is_locked: true, locked_at: new Date().toISOString() })
    .eq('id', 1)
    .eq('is_locked', lockRow?.is_locked ?? false)
    .select('id')
    .maybeSingle()

  if (!acquired) {
    // Alguien más se adelantó a tomar el candado justo ahora.
    return new Response(JSON.stringify({ message: 'No se pudo tomar el candado, otro worker está activo' }), {
      headers: { "Content-Type": "application/json" },
    })
  }

  let processed = 0

  try {
    for (let i = 0; i < MAX_MESSAGES_PER_RUN; i++) {
      const { data: next } = await supabase
        .from('whatsapp_message_queue')
        .select('id, organization_id, appointment_id, event')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (!next) break

      // Demora aleatoria antes de cada envío (simula comportamiento humano).
      await sleep(randomDelayMs())

      const result = await sendOne(supabase, evolutionApiUrl, evolutionApiKey, next)

      await supabase
        .from('whatsapp_message_queue')
        .update({
          status: result.ok ? 'sent' : 'failed',
          error: result.ok ? null : result.error,
          sent_at: new Date().toISOString(),
        })
        .eq('id', next.id)

      processed++
    }
  } finally {
    await supabase
      .from('whatsapp_queue_lock')
      .update({ is_locked: false })
      .eq('id', 1)
  }

  return new Response(JSON.stringify({ success: true, processed }), {
    headers: { "Content-Type": "application/json" },
  })
})

async function sendOne(
  supabase: ReturnType<typeof createClient>,
  evolutionApiUrl: string,
  evolutionApiKey: string,
  item: { id: string; organization_id: string; appointment_id: string; event: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: appointment } = await supabase
    .from('appointments')
    .select('*, client:loyalty_clients(*)')
    .eq('id', item.appointment_id)
    .maybeSingle()

  if (!appointment?.client?.phone) {
    return { ok: false, error: 'Cita o teléfono del cliente no encontrado' }
  }

  const { data: org } = await supabase
    .from('organizations')
    .select('whatsapp_connected')
    .eq('id', item.organization_id)
    .maybeSingle()

  if (!org?.whatsapp_connected) {
    return { ok: false, error: 'WhatsApp no está conectado para esta organización' }
  }

  const { data: rule } = await supabase
    .from('whatsapp_rules')
    .select('message_template')
    .eq('organization_id', item.organization_id)
    .eq('trigger_event', item.event)
    .eq('is_active', true)
    .maybeSingle()

  if (!rule?.message_template) {
    return { ok: false, error: `No hay regla activa para el evento: ${item.event}` }
  }

  let number = String(appointment.client.phone).replace(/\D/g, '')
  if (number.length === 9) {
    number = `51${number}`
  }

  let message = rule.message_template
  message = message.replace(/{nombre_cliente}/g, appointment.client.name)

  const apptDate = new Date(appointment.appointment_time)
  const timeStr = apptDate.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Lima' })
  const dateStr = apptDate.toLocaleDateString('es-PE', { timeZone: 'America/Lima' })
  message = message.replace(/{fecha_cita}/g, dateStr)
  message = message.replace(/{hora_cita}/g, timeStr)

  const instanceName = `org-${item.organization_id}`
  const endpoint = `${evolutionApiUrl}/message/sendText/${instanceName}`

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: evolutionApiKey,
      },
      body: JSON.stringify({
        number,
        text: message,
        textMessage: { text: message },
        options: { delay: 1200, presence: 'composing' },
      }),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      return { ok: false, error: `HTTP ${response.status}: ${body}` }
    }

    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de red' }
  }
}
