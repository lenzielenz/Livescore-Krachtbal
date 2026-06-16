import { getAuthUser } from '@/lib/auth-user'
import { addBulletTime } from '@/lib/match-channel'
import { rateLimit } from '@/lib/sse-hub'

export const dynamic = 'force-dynamic'

// Multi-angle "bullet-time": een supporter roept iedereen op om, ieder vanuit zijn eigen hoek,
// hetzelfde moment vast te leggen. Er is een korte aftelling zodat iedereen weet wat er gaat
// gebeuren en zich klaarzet; op nul opent de camera met één tik (geen aparte sluiterknop). Daarna
// speelt de app de hoeken als één sweepende reeks af. Vereist login, per wedstrijd begrensd.
const LEAD_MS = 4000

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isFinite(matchId)) return Response.json({ error: 'Ongeldig match-id' }, { status: 400 })

  const user = await getAuthUser()
  if (!user) return Response.json({ error: 'Log in om een multi-angle te starten.' }, { status: 401 })

  if (!rateLimit(`bullettime:${matchId}`, 1, 30_000)) {
    return Response.json({ error: 'Er loopt al een multi-angle — even wachten.' }, { status: 429 })
  }

  const at = Date.now() + LEAD_MS
  const ok = addBulletTime(matchId, at)
  if (!ok) return Response.json({ error: 'De tribune is niet open.' }, { status: 403 })
  return Response.json({ ok: true, at })
}
