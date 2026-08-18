import { competitionWhere } from '@/lib/analyse-access'
import { formatDateTimeBE } from '@/lib/datetime'
import { buildMultiMatchIcs, icsFilenameFor, type MatchIcsInput } from '@/lib/match-ics'
import { getPayloadClient } from '@/lib/payload-client'
import { reeksNaam, type Reeks } from '@/lib/reeksen'
import type { Where } from 'payload'

export const dynamic = 'force-dynamic'

const MAX_MATCHES = 500

// "Zet in je agenda" voor een COMBINATIE i.p.v. één wedstrijd: elke ploeg, club, reeks of losse
// wedstrijd kan gecombineerd worden tot één .ics-download (Google/Apple/Outlook). Publiek en
// leesalleen, net als /api/match/[id]/ics — geen login nodig, dezelfde competitiedata die op
// /ploegen/[id] en /clubs/[id] al zichtbaar is.
//   ?teams=1,2      → alle wedstrijden van die ploeg/ploegen
//   ?clubs=3         → alle wedstrijden van alle ploegen van die club(s)
//   ?matches=10,11   → specifiek losse wedstrijden (bv. favorieten)
//   ?reeks=1NAH       → filtert de bovenstaande selectie op reeks (of staat alleen: hele reeks)
//   ?name=Mijn+agenda → titel van de kalender (X-WR-CALNAME); anders een nette default
const parseIds = (raw: string | null): number[] =>
  (raw ?? '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)

export async function GET(req: Request) {
  const url = new URL(req.url)
  const teamIds = parseIds(url.searchParams.get('teams'))
  const clubIds = parseIds(url.searchParams.get('clubs'))
  const matchIds = parseIds(url.searchParams.get('matches'))
  const reeks = url.searchParams.get('reeks')?.trim() || null
  const name = url.searchParams.get('name')?.trim() || null

  if (teamIds.length === 0 && clubIds.length === 0 && matchIds.length === 0 && !reeks) {
    return new Response('Geef minstens één ploeg, club, wedstrijd of reeks mee.', { status: 400 })
  }

  try {
    const payload = await getPayloadClient()

    // Clubs → hun ploegen erbij, zodat "hele club" en "specifieke ploeg" naadloos combineren.
    if (clubIds.length > 0) {
      const clubTeams = await payload
        .find({ collection: 'teams', where: { club: { in: clubIds } }, depth: 0, limit: 1000 })
        .catch(() => ({ docs: [] as { id: number }[] }))
      for (const t of clubTeams.docs) teamIds.push(t.id)
    }

    const clauses: Where[] = [competitionWhere()]
    const or: Where[] = []
    if (teamIds.length > 0) or.push({ or: [{ homeTeam: { in: teamIds } }, { awayTeam: { in: teamIds } }] })
    if (matchIds.length > 0) or.push({ id: { in: matchIds } })
    if (or.length > 0) clauses.push({ or })
    if (reeks) clauses.push({ reeks: { equals: reeks } })

    const matchesRes = await payload.find({
      collection: 'matches',
      where: { and: clauses },
      sort: 'date',
      depth: 2,
      limit: MAX_MATCHES,
    })

    const origin = url.origin
    const events: MatchIcsInput[] = matchesRes.docs
      .filter((m) => m.date)
      .map((m) => {
        const home = (m.homeTeam && typeof m.homeTeam === 'object' ? m.homeTeam.name : null) ?? 'Thuisploeg'
        const away = (m.awayTeam && typeof m.awayTeam === 'object' ? m.awayTeam.name : null) ?? 'Bezoekers'
        const club = m.homeTeam && typeof m.homeTeam === 'object' && m.homeTeam.club && typeof m.homeTeam.club === 'object' ? m.homeTeam.club : null
        const location = club?.accommodatie?.trim() || club?.plaats?.trim() || null
        const reeksLabel = m.reeks ? reeksNaam(m.reeks as Reeks) : null
        const matchUrl = `${origin}/match/${m.id}`
        return {
          id: m.id,
          home,
          away,
          reeks: reeksLabel,
          startIso: String(m.date),
          location,
          url: matchUrl,
          description: `Krachtbal Live — ${reeksLabel ?? 'wedstrijd'} · ${formatDateTimeBE(String(m.date))}. Volg live: ${matchUrl}`,
        }
      })

    if (events.length === 0) {
      return new Response('Geen wedstrijden gevonden voor deze combinatie.', { status: 404 })
    }

    const calName = name ?? (reeks && teamIds.length === 0 && matchIds.length === 0 ? reeksNaam(reeks as Reeks) : 'Krachtbal Live')
    const ics = buildMultiMatchIcs(calName, events)

    return new Response(ics, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="${icsFilenameFor(name ?? calName)}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    return new Response((err as Error).message, { status: 500 })
  }
}
