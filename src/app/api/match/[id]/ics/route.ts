import { formatDateTimeBE } from '@/lib/datetime'
import { buildMatchState } from '@/lib/match-engine'
import { buildMatchIcs, icsFilename } from '@/lib/match-ics'
import { getPayloadClient } from '@/lib/payload-client'
import { reeksNaam, type Reeks } from '@/lib/reeksen'

export const dynamic = 'force-dynamic'

// "Zet in je agenda": een .ics-bestand voor één wedstrijd (Google/Apple/Outlook). Concurrenten
// (FlashScore, SportEasy, Spond …) bieden dit standaard; nu wij ook.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isFinite(matchId)) return new Response('Ongeldig match-id', { status: 400 })

  try {
    const payload = await getPayloadClient()
    const [state, doc] = await Promise.all([
      buildMatchState(payload, matchId).catch(() => null),
      payload.findByID({ collection: 'matches', id: matchId, depth: 2 }).catch(() => null),
    ])
    if (!state || !doc || (doc as { analyseOnly?: boolean }).analyseOnly) {
      return new Response('Wedstrijd niet gevonden', { status: 404 })
    }
    const date = (doc as { date?: string }).date
    if (!date) return new Response('Geen datum', { status: 404 })

    const reeks = (doc as { reeks?: Reeks }).reeks ? reeksNaam((doc as { reeks?: Reeks }).reeks as Reeks) : null
    const club = ((doc as { homeTeam?: { club?: { accommodatie?: string; plaats?: string } } }).homeTeam)?.club
    const location = club?.accommodatie?.trim() || club?.plaats?.trim() || null
    const origin = new URL(req.url).origin
    const url = `${origin}/match/${matchId}`
    const home = state.teams.home.name
    const away = state.teams.away.name

    const ics = buildMatchIcs({
      id: matchId,
      home,
      away,
      reeks,
      startIso: date,
      location,
      url,
      description: `Krachtbal Live — ${reeks ?? 'wedstrijd'} · ${formatDateTimeBE(date)}. Volg live: ${url}`,
    })

    return new Response(ics, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="${icsFilename(home, away)}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    return new Response((err as Error).message, { status: 500 })
  }
}
