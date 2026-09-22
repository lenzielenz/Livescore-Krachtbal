import { joinDay, joinWeekend } from '@/lib/day-channel'
import { getPayloadClient } from '@/lib/payload-client'
import { HARTSLAG_MS } from '@/lib/sse-leven'
import { SSE_HEADERS, acquireConnection, clientIp, releaseConnection } from '@/lib/sse-hub'

export const dynamic = 'force-dynamic'

// Live-stand voor een hele speeldag (het bord op / en /live). Eén gedeelde poller per dag
// (zie day-channel.ts) doet het databankwerk; deze route doet enkel het fan-out naar deze client.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const date = url.searchParams.get('date') ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return new Response('Ongeldige datum', { status: 400 })
  }
  // Weekend-weergave (za+zo): `date` is dan de zaterdag (zie weekendZaterdag), en we sluiten aan
  // op het gedeelde weekendkanaal i.p.v. het dagkanaal — anders krijgt de zondag geen live-updates.
  const isWeekend = url.searchParams.get('view') === 'weekend'

  const ip = clientIp(req)
  if (!acquireConnection(ip)) {
    return new Response('Te veel gelijktijdige verbindingen.', { status: 429 })
  }

  const encoder = new TextEncoder()
  // Het slot is al geclaimd: gaat hier iets mis (databank even weg tijdens een deploy), dan moet
  // het terug, anders lekt de teller van dit IP omhoog tot een hele kantine of zaal 429 krijgt.
  let payload
  try {
    payload = await getPayloadClient()
  } catch (err) {
    releaseConnection(ip)
    throw err
  }

  let cleanedUp = false
  let unsubscribe: (() => void) | null = null
  let heartbeat: ReturnType<typeof setInterval> | null = null
  let cleanup: () => void = () => {}

  const stream = new ReadableStream({
    start(controller) {
      const safeEnqueue = (chunk: string) => {
        if (cleanedUp) return
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          cleanup()
        }
      }

      cleanup = () => {
        if (cleanedUp) return
        cleanedUp = true
        unsubscribe?.()
        if (heartbeat) clearInterval(heartbeat)
        try {
          controller.close()
        } catch {
          /* al gesloten */
        }
        releaseConnection(ip)
      }

      const onFrame = (event: string, data: unknown, id?: number) => {
        const idLine = id !== undefined ? `id: ${id}\n` : ''
        safeEnqueue(`${idLine}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      }
      unsubscribe = isWeekend ? joinWeekend(payload, date, onFrame) : joinDay(payload, date, onFrame)

      // Heartbeat houdt de verbinding open achter proxies die stille sockets sluiten.
      heartbeat = setInterval(() => safeEnqueue(`event: ping\ndata: {}\n\n`), HARTSLAG_MS)
      req.signal.addEventListener('abort', cleanup)
    },
    cancel() {
      cleanup()
    },
  })

  return new Response(stream, { headers: SSE_HEADERS })
}
