import { canAnalyse } from '@/lib/access'
import { ownsAnalyse } from '@/lib/analyse-crud'
import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { reeksCategorie, type Reeks } from '@/lib/reeksen'
import type { Club, Match, Team } from '@/payload-types'

type PayloadClient = Awaited<ReturnType<typeof getPayloadClient>>
type AuthedUser = NonNullable<Awaited<ReturnType<typeof authUser>>>

// Analyse-kopie van een echte competitieploeg: hergebruik de eigen analyse-ploeg met dezelfde
// naam + reeks, of maak ze aan (met een eigen analyse-club onder de echte clubnaam, kleuren en
// logo mee overgenomen). Zo blijft de opname volledig los van het live-platform — de echte
// wedstrijd, ploegen en spelers worden nooit aangeraakt — maar oogt ze wel als de echte affiche,
// en zijn de spelers die je ooit toevoegde er bij een volgende opname tegen dezelfde club weer.
async function analyseKopieVan(
  payload: PayloadClient,
  echt: Team,
  reeks: string,
  user: AuthedUser,
): Promise<number> {
  const naam = String(echt.name ?? '').trim() || 'Ploeg'
  const bestaand = await payload
    .find({
      collection: 'teams',
      where: {
        and: [
          { analyseOnly: { equals: true } },
          { analyseOwner: { equals: Number(user.id) } },
          { name: { equals: naam } },
          { reeks: { equals: reeks } },
        ],
      },
      depth: 0,
      limit: 1,
    })
    .catch(() => ({ docs: [] as { id: number }[] }))
  if (bestaand.docs[0]) return bestaand.docs[0].id

  // Eigen analyse-club onder de echte clubnaam (of de ploegnaam als de club onbekend is).
  const echteClub = echt.club && typeof echt.club === 'object' ? (echt.club as Club) : null
  const clubNaam = String(echteClub?.name ?? '').trim() || naam
  const clubRes = await payload
    .find({
      collection: 'clubs',
      where: {
        and: [
          { analyseOnly: { equals: true } },
          { analyseOwner: { equals: Number(user.id) } },
          { name: { equals: clubNaam } },
        ],
      },
      depth: 0,
      limit: 1,
    })
    .catch(() => ({ docs: [] as { id: number }[] }))
  let clubId = clubRes.docs[0]?.id
  if (!clubId) {
    const nieuweClub = await payload.create({
      collection: 'clubs',
      data: {
        name: clubNaam,
        ...(typeof echteClub?.logoUrl === 'string' && echteClub.logoUrl ? { logoUrl: echteClub.logoUrl } : {}),
        ...(typeof echteClub?.colorPrimary === 'string' && echteClub.colorPrimary ? { colorPrimary: echteClub.colorPrimary } : {}),
        ...(typeof echteClub?.colorSecondary === 'string' && echteClub.colorSecondary ? { colorSecondary: echteClub.colorSecondary } : {}),
        analyseOnly: true,
        analyseOwner: Number(user.id),
      },
      overrideAccess: true,
    })
    clubId = (nieuweClub as { id: number }).id
  }

  const nieuw = await payload.create({
    collection: 'teams',
    data: {
      name: naam,
      reeks: reeks as NonNullable<Team['reeks']>,
      category: reeksCategorie(reeks as Reeks),
      club: clubId,
      analyseOnly: true,
      analyseOwner: Number(user.id),
    },
    overrideAccess: true,
  })
  return (nieuw as { id: number }).id
}

// Maakt een "enkel voor analyse"-wedstrijd aan (niet live/publiek zichtbaar). Toegankelijk voor
// iedereen met analyse-toegang. Beide ploegen moeten EIGEN analyse-ploegen zijn — competitie-ploegen
// kunnen hier nooit gekozen worden. De opname wordt op naam van de gebruiker gezet (analyseOwner)
// zodat de analyse-database privé per persoon blijft.
export async function POST(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    if (!canAnalyse(user)) return Response.json({ error: 'Geen analyse-toegang.' }, { status: 403 })

    let homeTeam = Number(body.homeTeam)
    let awayTeam = Number(body.awayTeam)
    let reeks = typeof body.reeks === 'string' ? body.reeks : ''
    let date = typeof body.date === 'string' && body.date ? body.date : new Date().toISOString()

    // "Uit de echte kalender": neem reeks/datum/affiche over van een competitiewedstrijd, maar
    // werk verder met eigen analyse-kopieën van de ploegen. De echte wedstrijd wordt enkel
    // GELEZEN — wat je in de analyse invult, blijft in de analyse en raakt het live-platform niet.
    if (body.fromMatch != null) {
      const echtId = Number(body.fromMatch)
      if (!Number.isFinite(echtId)) return Response.json({ error: 'Ongeldige wedstrijd.' }, { status: 400 })
      const echt = (await payload.findByID({ collection: 'matches', id: echtId, depth: 2 }).catch(() => null)) as Match | null
      if (!echt || echt.analyseOnly || (echt as { isDemo?: boolean }).isDemo) {
        return Response.json({ error: 'Wedstrijd niet gevonden in de kalender.' }, { status: 404 })
      }
      const echtThuis = echt.homeTeam && typeof echt.homeTeam === 'object' ? (echt.homeTeam as Team) : null
      const echtUit = echt.awayTeam && typeof echt.awayTeam === 'object' ? (echt.awayTeam as Team) : null
      if (!echtThuis || !echtUit || !echt.reeks) {
        return Response.json({ error: 'Deze kalenderwedstrijd is onvolledig.' }, { status: 400 })
      }
      reeks = String(echt.reeks)
      date = echt.date ? String(echt.date) : date
      ;[homeTeam, awayTeam] = await Promise.all([
        analyseKopieVan(payload, echtThuis, reeks, user),
        analyseKopieVan(payload, echtUit, reeks, user),
      ])
    }

    if (!Number.isFinite(homeTeam) || !Number.isFinite(awayTeam)) {
      return Response.json({ error: 'Kies een thuis- en uitploeg.' }, { status: 400 })
    }
    if (homeTeam === awayTeam) {
      return Response.json({ error: 'Thuis- en uitploeg moeten verschillen.' }, { status: 400 })
    }
    if (!reeks) return Response.json({ error: 'Kies een reeks.' }, { status: 400 })

    // Beide ploegen moeten eigen analyse-ploegen zijn — competitie-ploegen zijn nooit selecteerbaar.
    const [homeDoc, awayDoc] = await Promise.all([
      payload.findByID({ collection: 'teams', id: homeTeam, depth: 0 }).catch(() => null),
      payload.findByID({ collection: 'teams', id: awayTeam, depth: 0 }).catch(() => null),
    ])
    if (!ownsAnalyse(homeDoc as Team | null, user) || !ownsAnalyse(awayDoc as Team | null, user)) {
      return Response.json({ error: 'Kies twee van je eigen analyse-ploegen.' }, { status: 400 })
    }

    // De opname hoort bij de eigenaar van de ploegen: maak je een wedstrijd met ploegen van
    // iemand die jou "meedoen & aanpassen" gaf, dan komt de opname in DIENS set terecht (zo
    // blijft de gedeelde analyse-database één geheel). Eigen ploegen → eigen set, zoals altijd.
    const teamOwner = homeDoc && typeof (homeDoc as Team).analyseOwner !== 'undefined'
      ? (typeof (homeDoc as Team).analyseOwner === 'object' && (homeDoc as Team).analyseOwner
          ? ((homeDoc as Team).analyseOwner as { id: number }).id
          : ((homeDoc as Team).analyseOwner as number | null))
      : null

    const created = await payload.create({
      collection: 'matches',
      data: {
        reeks: reeks as NonNullable<Match['reeks']>,
        homeTeam,
        awayTeam,
        date,
        status: 'scheduled',
        goalAreaDepth: 10,
        analyseOnly: true,
        analyseOwner: Number(teamOwner ?? user.id),
      },
    })

    // De huidige (onthouden) spelers van beide ploegen meegeven, zodat de creator ze toont
    // en je er nieuwe aan kan toevoegen die voortaan ook geselecteerd kunnen worden.
    const loadRoster = async (teamId: number) => {
      const r = await payload
        .find({ collection: 'players', where: { team: { equals: teamId } }, sort: 'shirtNumber', depth: 0, limit: 200 })
        .catch(() => ({ docs: [] as Record<string, unknown>[] }))
      return r.docs.map((p) => ({
        id: p.id as number,
        name: String((p as { name?: unknown }).name ?? ''),
        shirtNumber: Number((p as { shirtNumber?: unknown }).shirtNumber ?? 0),
        position: ((p as { position?: unknown }).position as string | undefined) ?? null,
      }))
    }
    const [homeRoster, awayRoster] = await Promise.all([loadRoster(homeTeam), loadRoster(awayTeam)])

    // Namen mee teruggeven: bij een kalender-keuze kent de client de (zonet aangemaakte)
    // analyse-ploegen nog niet.
    const naamVan = async (id: number) => {
      const t = (await payload.findByID({ collection: 'teams', id, depth: 0 }).catch(() => null)) as Team | null
      return String(t?.name ?? '')
    }
    const [homeName, awayName] = await Promise.all([naamVan(homeTeam), naamVan(awayTeam)])
    return Response.json({ id: (created as { id: number }).id, homeTeam, awayTeam, homeName, awayName, homeRoster, awayRoster })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
