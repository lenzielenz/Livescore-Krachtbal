import type { Payload, Where } from 'payload'

import { loadAds } from '@/lib/ads'
import { competitionWhere } from '@/lib/analyse-access'
import { clubColorsFrom } from '@/lib/club-colors'
import { formatTimeBE } from '@/lib/datetime'
import { kiesProfiel, sanitizeProfielen } from '@/lib/kantine-profielen'
import {
  ontdubbel,
  schermVenster,
  selectieIsLeeg,
  sorteerSchermWedstrijden,
} from '@/lib/kantine-selectie'
import { buildMatchState } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { REEKS_OPTIONS } from '@/lib/reeksen'

export const dynamic = 'force-dynamic'

// Persoonlijk kantinescherm. Openbaar leesbaar: de tv in de kantine logt niet in, en er staat
// niets gevoeligs op — enkel welke publieke wedstrijden iemand op zijn scherm wil. Samenstellen
// vraagt wél een login (zie /api/kantine/mijn).
const reeksLabel = (v: unknown) =>
  REEKS_OPTIONS.find((o) => o.value === v)?.label ?? (typeof v === 'string' ? v : 'Overig')

/** Alle ploeg-ids van de gekozen clubs, samen met de los gekozen ploegen. */
async function teamIdsVoor(payload: Payload, clubIds: number[], teamIds: number[]): Promise<number[]> {
  const uit = new Set<number>(teamIds)
  if (clubIds.length > 0) {
    const res = await payload
      .find({
        collection: 'teams',
        where: { and: [{ club: { in: clubIds } }, competitionWhere()] },
        depth: 0,
        limit: 500,
      })
      .catch(() => null)
    for (const t of res?.docs ?? []) {
      const n = Number(t.id)
      if (Number.isFinite(n)) uit.add(n)
    }
  }
  return [...uit]
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userId = Number(id)
  if (!Number.isFinite(userId)) return Response.json({ error: 'Ongeldig id' }, { status: 400 })
  // Welk van je schermen? Zonder ?p= het eerste — een tv die nog op de oude link staat blijft zo
  // gewoon draaien.
  const profielId = new URL(req.url).searchParams.get('p')

  try {
    const payload = await getPayloadClient()
    const user = await payload
      .findByID({ collection: 'users', id: userId, depth: 0, overrideAccess: true })
      .catch(() => null)
    if (!user) return Response.json({ error: 'Scherm niet gevonden' }, { status: 404 })

    const profiel = kiesProfiel(sanitizeProfielen((user as { kantineScherm?: unknown }).kantineScherm), profielId)
    const keuze = profiel ?? { clubIds: [], teamIds: [], matchIds: [] }
    // De titel op de tv is de naam van het scherm zelf; die zegt meer dan de accountnaam.
    const titel = profiel?.naam || String((user as { name?: unknown }).name ?? '')

    // Achtergrond in de clubstijl van de eigenaar: dezelfde sfeer als het tornooischerm, zodat de
    // kantine-tv van de club eruitziet als de club. Valt terug op de eerste gekozen club wanneer
    // het account zelf nog niet aan een club hangt.
    const clubId = Number((user as { club?: unknown }).club ?? NaN)
    const stijlClubId = Number.isFinite(clubId) && clubId > 0 ? clubId : keuze.clubIds[0]
    const stijlClub = stijlClubId
      ? await payload.findByID({ collection: 'clubs', id: stijlClubId, depth: 0, overrideAccess: true }).catch(() => null)
      : null
    const stijl = stijlClub
      ? {
          club: String((stijlClub as { name?: unknown }).name ?? ''),
          kleuren: clubColorsFrom(
            (stijlClub as { colorPrimary?: unknown }).colorPrimary,
            (stijlClub as { colorSecondary?: unknown }).colorSecondary,
          ),
        }
      : null

    if (selectieIsLeeg(keuze)) return Response.json({ matches: [], ads: [], leeg: true, titel, stijl })

    const { dagStart, dagEinde, geplandTot } = schermVenster()
    const teamIds = await teamIdsVoor(payload, keuze.clubIds, keuze.teamIds)
    const verborgen: Where[] = [{ isDemo: { not_equals: true } }, { analyseOnly: { not_equals: true } }]

    // Drie zoekopdrachten die elkaar aanvullen (zie kantine-selectie.ts):
    //  1. alles van de gevolgde ploegen dat bezig is — waar je ook speelt, het komt erop;
    //  2. alles van die ploegen dat vandaag of deze week nog gepland staat;
    //  3. de losse wedstrijden die iemand er zelf bij koos.
    const ploegFilter: Where = { or: [{ homeTeam: { in: teamIds } }, { awayTeam: { in: teamIds } }] }
    const heeftPloegen = teamIds.length > 0

    const [liveRes, weekRes, losRes] = await Promise.all([
      heeftPloegen
        ? payload.find({
            collection: 'matches',
            where: { and: [ploegFilter, { status: { equals: 'live' } }, ...verborgen] },
            depth: 0,
            limit: 50,
          })
        : Promise.resolve({ docs: [] as { id: number }[] }),
      heeftPloegen
        ? payload.find({
            collection: 'matches',
            where: {
              and: [
                ploegFilter,
                // Vanaf het begin van vandaag: de uitslag van de match die net gespeeld is,
                // blijft in de kantine staan tot middernacht.
                { date: { greater_than_equal: dagStart, less_than: geplandTot } },
                ...verborgen,
              ],
            },
            sort: 'date',
            depth: 0,
            limit: 100,
          })
        : Promise.resolve({ docs: [] as { id: number }[] }),
      keuze.matchIds.length > 0
        ? payload.find({
            collection: 'matches',
            where: { and: [{ id: { in: keuze.matchIds } }, ...verborgen] },
            depth: 0,
            limit: 50,
          })
        : Promise.resolve({ docs: [] as { id: number }[] }),
    ])

    const docs = ontdubbel([...liveRes.docs, ...losRes.docs, ...weekRes.docs] as {
      id: number
      reeks?: unknown
      date?: unknown
    }[])

    const matches = []
    for (const m of docs) {
      try {
        const s = await buildMatchState(payload, m.id)
        matches.push({
          id: m.id,
          reeks: reeksLabel(m.reeks),
          time: formatTimeBE(m.date as string),
          date: typeof m.date === 'string' ? m.date : null,
          status: s.match.status,
          home: { name: s.teams.home.name, logoUrl: s.teams.home.logoUrl, logoFit: s.teams.home.logoFit, colors: s.teams.home.colors },
          away: { name: s.teams.away.name, logoUrl: s.teams.away.logoUrl, logoFit: s.teams.away.logoFit, colors: s.teams.away.colors },
          score: s.score,
        })
      } catch {
        // Wedstrijd met een ontbrekende ploeg overslaan — één kapotte rij mag het scherm niet leegmaken.
      }
    }

    const ads = await loadAds(payload, 'kantine')
    return Response.json({ matches: sorteerSchermWedstrijden(matches, dagEinde), ads, leeg: false, titel, stijl })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}
