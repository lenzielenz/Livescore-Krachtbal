import { addPollVote } from '@/lib/match-channel'
import { clientIp, rateLimit } from '@/lib/sse-hub'

export const dynamic = 'force-dynamic'

// Voorspel-poll: één stem (home/draw/away). Geen login (publiek), maar per-IP begrensd. De client
// onthoudt z'n stem lokaal (één keer); de server aggregeert en broadcast de tellers via SSE.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isFinite(matchId)) return Response.json({ error: 'Ongeldig match-id' }, { status: 400 })

  const ip = clientIp(req)
  if (!rateLimit(`poll:${ip}`, Number(process.env.POLL_MAX_PER_SEC) || 20, 1000)) {
    return Response.json({ error: 'Te veel stemmen.' }, { status: 429 })
  }

  let body: { option?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  const ok = addPollVote(matchId, String(body.option ?? ''), 1)
  return Response.json({ ok })
}
