import { authUser } from '@/lib/api-auth'
import { withDbLock } from '@/lib/db-lock'
import { withLock } from '@/lib/async-mutex'
import { getPayloadClient } from '@/lib/payload-client'
import { isOverzetfout, zetVoorstellenOver } from '@/lib/cv-overzetten'
import { mayEditMatchVideo } from '@/lib/video-access'

export const dynamic = 'force-dynamic'

// De bevestigde videovoorstellen omzetten in échte worpen.
//
// GET  = droogloop: hoeveel zou er overgaan, wat valt er af, en wat kan deze weg niet.
// POST = doen. Zonder `bevestig: true` blijft het ook dan een droogloop — dit schrijft in de
//        worp-events, en die zijn onwijzigbaar. Eén verkeerde druk mag geen wedstrijd verzinnen.
//
// De hele overzetting loopt onder dezelfde lock als elke andere mutatie op deze wedstrijd
// (in-process mutex + Postgres advisory lock). Dat is hier geen formaliteit: er gaan tientallen
// worpen achter elkaar doorheen, en een gelijktijdige undo of worp van iemand anders zou de
// balbezit-keten middenin verbouwen.
//
// Belangrijk: dit roept de engine RECHTSTREEKS aan en niet de gewone actie-route. Die route neemt
// zelf de lock (die is niet herbetreedbaar → deadlock) en stuurt bij elk doelpunt een
// pushmelding — bij zestig worpen zouden dat tientallen meldingen naar alle clubfans zijn.

async function toegang(req: Request, matchId: number) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return { fout: Response.json({ error: 'Niet ingelogd.' }, { status: 401 }) }
  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)
  if (!match) return { fout: Response.json({ error: 'Wedstrijd niet gevonden.' }, { status: 404 }) }
  if (!mayEditMatchVideo(user, match as { analyseOnly?: boolean | null; analyseOwner?: unknown })) {
    return { fout: Response.json({ error: 'Geen rechten voor deze analyse.' }, { status: 403 }) }
  }
  return { payload }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isInteger(matchId)) return Response.json({ error: 'Ongeldig match-id.' }, { status: 400 })

  const t = await toegang(req, matchId)
  if ('fout' in t) return t.fout

  const r = await zetVoorstellenOver(t.payload, matchId, { droog: true })
  if (isOverzetfout(r)) return Response.json({ error: r.fout }, { status: r.code })
  return Response.json(r)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isInteger(matchId)) return Response.json({ error: 'Ongeldig match-id.' }, { status: 400 })

  const t = await toegang(req, matchId)
  if ('fout' in t) return t.fout

  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    body = {}
  }
  const droog = body.bevestig !== true

  const r = await withLock(`match:${matchId}`, () =>
    withDbLock(t.payload, 'match', matchId, () => zetVoorstellenOver(t.payload, matchId, { droog })),
  )
  if (isOverzetfout(r)) return Response.json({ error: r.fout }, { status: r.code })
  return Response.json({ ok: true, ...r })
}
