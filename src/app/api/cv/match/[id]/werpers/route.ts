import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { groepeerWerpers, leesToewijzing, type Voorstelwerper } from '@/lib/cv-werpers'
import { mayEditMatchVideo } from '@/lib/video-access'

export const dynamic = 'force-dynamic'

// Wie is wie: de werpers die de videoanalyse onderscheidde, en welke speler dat is.
//
// GET  = de groepen (met het meeste werk bovenaan) plus de opstelling om uit te kiezen.
// POST = de toewijzing bewaren.
//
// Waarom dit een eigen scherm verdient: het model leest geen rugnummers van truitjes, maar het
// volgt wél dezelfde persoon zolang die in beeld blijft. Eén keer per werper zeggen wie het is,
// is een handvol keuzes; per worp zou het er zestig zijn.

async function toegang(req: Request, matchId: number) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return { fout: Response.json({ error: 'Niet ingelogd.' }, { status: 401 }) }
  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)
  if (!match) return { fout: Response.json({ error: 'Wedstrijd niet gevonden.' }, { status: 404 }) }
  if (!mayEditMatchVideo(user, match as { analyseOnly?: boolean | null; analyseOwner?: unknown })) {
    return { fout: Response.json({ error: 'Geen rechten voor deze analyse.' }, { status: 403 }) }
  }
  return { payload, match }
}

/** De veldspelers van beide ploegen, om uit te kiezen. */
async function opstelling(
  payload: Awaited<ReturnType<typeof getPayloadClient>>,
  match: { homeTeam?: unknown; awayTeam?: unknown },
) {
  const teamId = (rel: unknown) => (rel && typeof rel === 'object' ? Number((rel as { id: number }).id) : Number(rel))
  const laad = async (id: number, kant: 'home' | 'away') => {
    if (!Number.isFinite(id)) return []
    const res = await payload
      .find({ collection: 'players', where: { team: { equals: id } }, sort: 'shirtNumber', depth: 0, limit: 200 })
      .catch(() => ({ docs: [] as Record<string, unknown>[] }))
    return res.docs.map((p) => ({
      id: Number((p as { id: number }).id),
      naam: String((p as { name?: unknown }).name ?? ''),
      rugnummer: Number((p as { shirtNumber?: unknown }).shirtNumber ?? 0),
      kant,
    }))
  }
  const [thuis, uit] = await Promise.all([
    laad(teamId(match.homeTeam), 'home'),
    laad(teamId(match.awayTeam), 'away'),
  ])
  return [...thuis, ...uit]
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isInteger(matchId)) return Response.json({ error: 'Ongeldig match-id.' }, { status: 400 })

  const t = await toegang(req, matchId)
  if ('fout' in t) return t.fout

  const res = await t.payload
    .find({ collection: 'cv-events', where: { match: { equals: matchId } }, sort: 'videoTimeS', depth: 0, limit: 3000 })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))

  const groepen = groepeerWerpers(res.docs as unknown as Voorstelwerper[])
  const zonderWerper = (res.docs as unknown as Voorstelwerper[]).filter(
    (v) => v.verdict !== 'afgewezen' && typeof v.werper !== 'number',
  ).length

  return Response.json({
    groepen,
    toewijzing: leesToewijzing(t.match.cvWerpers),
    spelers: await opstelling(t.payload, t.match),
    // Voorstellen waar het model niemand kon volgen. Die vallen buiten elke groep, en dat hoort
    // gezegd te worden — anders lijkt een volledige toewijzing dekkender dan ze is.
    zonderWerper,
  })
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
    return Response.json({ error: 'Ongeldige JSON.' }, { status: 400 })
  }

  // Alleen spelers van déze wedstrijd mogen toegewezen worden: anders staat er straks een worp
  // op naam van iemand die niet meespeelde.
  const geldig = new Set((await opstelling(t.payload, t.match)).map((p) => p.id))
  const gevraagd = leesToewijzing(body.toewijzing)
  const toewijzing: Record<string, number> = {}
  for (const [werper, speler] of Object.entries(gevraagd)) {
    if (geldig.has(speler)) toewijzing[werper] = speler
  }

  await t.payload.update({
    collection: 'matches',
    id: matchId,
    data: { cvWerpers: toewijzing },
    overrideAccess: true,
  })
  return Response.json({ ok: true, toewijzing })
}
