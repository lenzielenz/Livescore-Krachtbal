import { authUser } from '@/lib/api-auth'
import { klachtIndienen } from '@/lib/klacht'
import { getPayloadClient } from '@/lib/payload-client'
import { voorbehoudBeantwoorden } from '@/lib/voorbehoud'

// Klachten en voorbehouden, kant van de club:
//   POST { matchId, reden }                                   → een klacht over een ingediend blad (lib/klacht.ts)
//   POST { actie: 'bekrachtigen', id, relaas }                → een voorbehoud bekrachtigen binnen 5 werkdagen (lib/voorbehoud.ts)
//   POST { actie: 'afzien', id }                              → afzien van een voorbehoud (geen kosten)
export async function POST(req: Request) {
  const payload = await getPayloadClient()
  const me = await authUser(payload, req)
  if (!me) return Response.json({ error: 'Log in om een klacht in te dienen.' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as { matchId?: unknown; reden?: unknown; actie?: unknown; id?: unknown; relaas?: unknown }

  if (body.actie === 'bekrachtigen' || body.actie === 'afzien') {
    const id = Number(body.id)
    if (!Number.isInteger(id) || id <= 0) return Response.json({ error: 'Welk voorbehoud?' }, { status: 400 })
    const r = await voorbehoudBeantwoorden(payload, me, id, body.actie, String(body.relaas ?? ''))
    return r.ok ? Response.json(r) : Response.json({ error: r.error }, { status: r.status })
  }

  const matchId = Number(body.matchId)
  if (!Number.isInteger(matchId) || matchId <= 0) return Response.json({ error: 'Kies een wedstrijd.' }, { status: 400 })
  try {
    const k = await klachtIndienen(payload, me, matchId, String(body.reden ?? ''))
    return Response.json({ ok: true, id: k.id })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Indienen mislukt.' }, { status: 400 })
  }
}
