import { getAuthUser } from '@/lib/auth-user'
import { addLightshow } from '@/lib/match-channel'
import { rateLimit } from '@/lib/sse-hub'

export const dynamic = 'force-dynamic'

// Lichtshow / digitale tifo: een supporter roept iedereen op; alle toestellen die de wedstrijd
// volgen vormen samen één gesynchroniseerd lichtscherm. Vereist login en is per wedstrijd begrensd
// (één gedeeld moment, geen spamknop). De show start na een korte aftelling en duurt ~21 s.
const LEAD_MS = 4000
const DURATION_MS = 21_000

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isFinite(matchId)) return Response.json({ error: 'Ongeldig match-id' }, { status: 400 })

  const user = await getAuthUser()
  if (!user) return Response.json({ error: 'Log in om de lichtshow te starten.' }, { status: 401 })

  // Eén gedeelde show per wedstrijd: max 1 keer per 30 s.
  if (!rateLimit(`lightshow:${matchId}`, 1, 30_000)) {
    return Response.json({ error: 'Er loopt al een lichtshow — even wachten.' }, { status: 429 })
  }

  const at = Date.now() + LEAD_MS
  const dur = LEAD_MS + DURATION_MS
  const ok = addLightshow(matchId, at, dur)
  if (!ok) return Response.json({ error: 'De tribune is niet open.' }, { status: 403 })
  return Response.json({ ok: true, at, dur })
}
