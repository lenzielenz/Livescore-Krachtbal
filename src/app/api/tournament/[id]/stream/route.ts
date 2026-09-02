import { getPayloadClient } from '@/lib/payload-client'
import { HARTSLAG_MS } from '@/lib/sse-leven'
import { SSE_HEADERS, acquireConnection, clientIp, releaseConnection, subscribe } from '@/lib/sse-hub'
import { buildTournamentState } from '@/lib/tournament-engine'

export const dynamic = 'force-dynamic'

// SSE-livestream van de volledige tornooi-state (schema + standen). Eén GEDEELDE poller voedt
// het boomstructuur-, veld- en kantinescherm (zie sse-hub.ts) — geen poll-per-verbinding.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tournamentId = Number(id)
  if (!Number.isFinite(tournamentId)) {
    return new Response('Ongeldig tornooi-id', { status: 400 })
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

      unsubscribe = subscribe(
        `tournament:${tournamentId}`,
        () => buildTournamentState(payload, tournamentId),
        (frame) => safeEnqueue(`id: ${frame.id}\nevent: update\ndata: ${JSON.stringify(frame.data)}\n\n`),
      )

      heartbeat = setInterval(() => safeEnqueue(`event: ping\ndata: {}\n\n`), HARTSLAG_MS)
      req.signal.addEventListener('abort', cleanup)
    },
    cancel() {
      cleanup()
    },
  })

  return new Response(stream, { headers: SSE_HEADERS })
}
