import { addReaction } from '@/lib/match-channel'
import { clientIp, rateLimit } from '@/lib/sse-hub'

export const dynamic = 'force-dynamic'

// Supporter-reactie (emoji). Geen login: publiek, maar streng begrensd tegen misbruik:
// - enkel toegelaten emoji's (server-side whitelist in match-channel)
// - per-IP rate limit (max ~10 verzoeken/sec)
// - `count` (eigen client-throttle) wordt server-side geclampt
// - genegeerd als er geen actieve kijkers zijn
// De reacties worden SERVER-SIDE geaggregeerd en per ~300ms-venster gebroadcast (geen event/tik).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isFinite(matchId)) return Response.json({ error: 'Ongeldig match-id' }, { status: 400 })

  const ip = clientIp(req)
  if (!rateLimit(`react:${ip}`, 10, 1000)) {
    return Response.json({ error: 'Te veel reacties.' }, { status: 429 })
  }

  let body: { emoji?: string; count?: number }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  const ok = addReaction(matchId, String(body.emoji ?? ''), Number(body.count) || 1)
  return Response.json({ ok })
}
