import { addBlast } from '@/lib/match-channel'
import { clientIp, rateLimit } from '@/lib/sse-hub'

export const dynamic = 'force-dynamic'

// Vuur een clubkleuren-viering af op ALLE schermen van deze wedstrijd. Publiek (zoals de emoji-
// reacties), maar begrensd: de knop wordt client-side pas "ontgrendeld" na een rugworp of elke
// 5 doelpunten; hier voorkomen we enkel spam met een per-IP rate limit.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isFinite(matchId)) return Response.json({ error: 'Ongeldig match-id' }, { status: 400 })

  const ip = clientIp(req)
  if (!rateLimit(`blast:${ip}`, Number(process.env.BLAST_MAX_PER_MIN) || 6, 60_000)) {
    return Response.json({ error: 'Even wachten met vieren.' }, { status: 429 })
  }

  let body: { side?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }
  const side = body.side === 'away' ? 'away' : body.side === 'home' ? 'home' : null
  if (!side) return Response.json({ error: 'Kies thuis of uit.' }, { status: 400 })

  const ok = addBlast(matchId, side)
  return Response.json({ ok })
}
