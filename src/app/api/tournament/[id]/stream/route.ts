import { getPayloadClient } from '@/lib/payload-client'
import { buildTournamentState } from '@/lib/tournament-engine'

export const dynamic = 'force-dynamic'

// SSE-livestream van de volledige tornooi-state (schema + standen). Eén stream voedt het
// boomstructuur-, veld- en kantinescherm. Server-side polling, geen extra infra.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tournamentId = Number(id)
  if (!Number.isFinite(tournamentId)) {
    return new Response('Ongeldig tornooi-id', { status: 400 })
  }

  const encoder = new TextEncoder()
  const payload = await getPayloadClient()

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false
      let lastPayload = ''

      const send = (event: string, data: unknown) => {
        if (closed) return
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      const tick = async () => {
        try {
          const state = await buildTournamentState(payload, tournamentId)
          const serialized = JSON.stringify(state)
          if (serialized !== lastPayload) {
            lastPayload = serialized
            send('update', state)
          }
        } catch {
          send('error', { message: 'Tornooi niet gevonden' })
        }
      }

      await tick()
      const interval = setInterval(tick, 1500)
      const heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(`: ping\n\n`))
      }, 15000)

      const cleanup = () => {
        if (closed) return
        closed = true
        clearInterval(interval)
        clearInterval(heartbeat)
        try {
          controller.close()
        } catch {
          /* al gesloten */
        }
      }

      req.signal.addEventListener('abort', cleanup)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
