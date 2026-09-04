import { authUser } from '@/lib/api-auth'
import {
  herrekenFysiek,
  leesMatchPosities,
  leesSporenVingerafdruk,
  positiesVingerafdruk,
  spoorOverzicht,
} from '@/lib/cv-fysiek'
import { leesToewijzing } from '@/lib/cv-werpers'
import { getPayloadClient } from '@/lib/payload-client'
import { mayEditMatchVideo } from '@/lib/video-access'

export const dynamic = 'force-dynamic'

// Wie is wie in de spelerstracking: de sporen die tracking.py volgde, en welke speler dat is.
//
// GET  = de sporen met hun hints (leefperiode, gemiddelde plek, gelopen meters — het
//        scherm-equivalent van het --sjabloon-bestand van cv/fysiek.py) plus de spelers om uit
//        te kiezen en de huidige toewijzing.
// POST = de toewijzing bewaren én de fysieke stats meteen herrekenen naar matches.cvFysiek.
//
// Dit is een ándere toewijzing dan /werpers: de werper-volgnummers komen uit cv/houding.py, de
// tracking-sporen uit cv/tracking.py — twee id-ruimtes die niets met elkaar te maken hebben.
// Sporen van camera 2 dragen +1000 (CAMERA2_BASIS).

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

/** De veldspelers van beide ploegen, om uit te kiezen — zelfde vorm als bij /werpers. */
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
    return res.docs
      .map((p) => ({
        id: Number((p as { id: number }).id),
        naam: String((p as { name?: unknown }).name ?? ''),
        rugnummer: Number((p as { shirtNumber?: unknown }).shirtNumber ?? 0),
        kant,
      }))
      // Enkel spelers met een rugnummer dat het fysiek-contract aankan (0–99, zelfde grens als
      // fysiek.py): anders wordt een toewijzing wél bewaard maar valt de speler bij het
      // herrekenen stilzwijgend weg — een rij die "gezet" kleurt zonder ooit cijfers te tonen.
      .filter((p) => Number.isInteger(p.rugnummer) && p.rugnummer >= 0 && p.rugnummer <= 99)
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

  const posities = await leesMatchPosities(matchId)
  // Een toewijzing die bij een vórige tracking-run hoort, is waardeloos: de spoornummers zijn
  // intussen opnieuw uitgedeeld. Dan tonen we lege selectors plus de reden — niet de oude
  // nummers alsof ze nog iets betekenen.
  const bewaard = leesSporenVingerafdruk(t.match.cvSporen)
  const verouderd = bewaard != null && posities.length > 0 && bewaard !== positiesVingerafdruk(posities)
  return Response.json({
    sporen: spoorOverzicht(posities),
    toewijzing: verouderd ? {} : leesToewijzing(t.match.cvSporen),
    spelers: await opstelling(t.payload, t.match),
    verouderd,
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

  // Alleen spelers van déze wedstrijd: anders lopen er straks meters op naam van iemand die
  // niet meespeelde.
  const geldig = new Set((await opstelling(t.payload, t.match)).map((p) => p.id))
  const gevraagd = leesToewijzing(body.toewijzing)
  const toewijzing: Record<string, number> = {}
  for (const [spoor, speler] of Object.entries(gevraagd)) {
    if (geldig.has(speler)) toewijzing[spoor] = speler
  }

  // De vingerafdruk van de huidige tracking-run gaat mee de bewaring in: zo weet elke latere
  // herrekening (ook de automatische na een her-analyse) of deze toewijzing nog bij de
  // posities hoort — spoornummers zijn een artefact van één run.
  const posities = await leesMatchPosities(matchId)
  await t.payload.update({
    collection: 'matches',
    id: matchId,
    data: {
      cvSporen: posities.length ? { ...toewijzing, _posities: positiesVingerafdruk(posities) } : toewijzing,
    },
    overrideAccess: true,
  })

  // Meteen herrekenen: de toewijzing is precies waar de fysieke telling op wachtte. Zelfde
  // contract als het fysiek-endpoint — een herberekening met een betere toewijzing wint altijd.
  const rapport = await herrekenFysiek(t.payload, matchId)
  return Response.json({ ok: true, toewijzing, fysiek: rapport })
}
