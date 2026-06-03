import { buildMatchState, buildTimeline } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { SSE_HEADERS, acquireConnection, clientIp, releaseConnection, subscribe } from '@/lib/sse-hub'

export const dynamic = 'force-dynamic'

// SSE-livestream. Eén GEDEELDE poller per wedstrijd (zie sse-hub.ts) pusht bij elke wijziging
// een nieuw event; deze route doet enkel het fan-out naar deze ene client. Heartbeat houdt de
// verbinding open achter proxies.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isFinite(matchId)) {
    return new Response('Ongeldig match-id', { status: 400 })
  }

  const ip = clientIp(req)
  if (!acquireConnection(ip)) {
    return new Response('Te veel gelijktijdige verbindingen.', { status: 429 })
  }

  const encoder = new TextEncoder()
  const payload = await getPayloadClient()

  let cleanedUp = false
  let unsubscribe: (() => void) | null = null
  let heartbeat: ReturnType<typeof setInterval> | null = null
  // Eén cleanup-functie, bereikbaar vanuit start(), het abort-signaal én cancel().
  let cleanup: () => void = () => {}

  const stream = new ReadableStream({
    start(controller) {
      const safeEnqueue = (chunk: string) => {
        if (cleanedUp) return
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          cleanup() // controller al gesloten/errored → alles opruimen
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

      // Abonneer op de gedeelde poller. Het `id`-veld laat de browser Last-Event-ID bijhouden.
      unsubscribe = subscribe(
        `match:${matchId}`,
        async () => {
          const [state, timeline] = await Promise.all([
            buildMatchState(payload, matchId),
            buildTimeline(payload, matchId),
          ])
          return { state, timeline }
        },
        (frame) => safeEnqueue(`id: ${frame.id}\nevent: update\ndata: ${JSON.stringify(frame.data)}\n\n`),
      )

      heartbeat = setInterval(() => safeEnqueue(`: ping\n\n`), 15000)
      req.signal.addEventListener('abort', cleanup)
    },
    cancel() {
      cleanup()
    },
  })

  return new Response(stream, { headers: SSE_HEADERS })
}
