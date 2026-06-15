import { getAuthUser } from '@/lib/auth-user'
import { addPhotoMoment } from '@/lib/match-channel'
import { rateLimit } from '@/lib/sse-hub'

export const dynamic = 'force-dynamic'

// "Samen-foto": een supporter roept iedereen op om over een paar tellen samen een foto te nemen.
// Alle kijkers krijgen dezelfde aftelklok (gesynchroniseerd via één tijdstip). Vereist login en is
// per wedstrijd begrensd (het is een gedeeld moment, geen knop om te spammen).
const COUNTDOWN_MS = 5000

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isFinite(matchId)) return Response.json({ error: 'Ongeldig match-id' }, { status: 400 })

  const user = await getAuthUser()
  if (!user) return Response.json({ error: 'Log in om een samen-foto te starten.' }, { status: 401 })

  // Eén gedeeld moment per wedstrijd: max 1 keer per 20 s (voorkomt dat het blijft aftellen).
  if (!rateLimit(`photomoment:${matchId}`, 1, 20_000)) {
    return Response.json({ error: 'Er loopt al een samen-foto — even wachten.' }, { status: 429 })
  }

  const at = Date.now() + COUNTDOWN_MS
  const ok = addPhotoMoment(matchId, at)
  if (!ok) return Response.json({ error: 'De tribune is niet open.' }, { status: 403 })
  return Response.json({ ok: true, at })
}
