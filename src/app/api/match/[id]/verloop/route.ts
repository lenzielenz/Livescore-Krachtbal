import { formatDateTimeBE } from '@/lib/datetime'
import { buildMatchState, loadMatchThrowData } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { reeksNaam } from '@/lib/reeksen'
import { clientIp, rateLimit } from '@/lib/sse-hub'

export const dynamic = 'force-dynamic'

// De gegevens voor het 3D-wedstrijdverloop (components/Verloop3DKnop.tsx): de worpen van één
// wedstrijd met de ploegen, hun clubkleuren en de veldmaten. Pas opgehaald als iemand op de knop
// tikt, zodat de wedstrijdpagina zelf niets extra laadt. Leest enkel; dezelfde zichtbaarheid als
// de wedstrijdpagina (een analysewedstrijd bestaat hier niet).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isFinite(matchId)) return Response.json({ error: 'Ongeldig match-id' }, { status: 400 })
  if (!rateLimit(`verloop:${clientIp(req)}`, 30, 60_000)) return Response.json({ error: 'Even geduld.' }, { status: 429 })
  try {
    const payload = await getPayloadClient()
    const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 0, overrideAccess: true }).catch(() => null)
    if (!match || match.analyseOnly) return Response.json({ error: 'Wedstrijd niet gevonden' }, { status: 404 })
    const [state, { shots }] = await Promise.all([buildMatchState(payload, matchId), loadMatchThrowData(payload, matchId)])
    const reeks = match.reeks ? reeksNaam(match.reeks) : 'Krachtbal'
    const datum = match.date ? formatDateTimeBE(String(match.date)) : null
    return Response.json(
      {
        status: state.match.status,
        teams: { home: state.teams.home.name, away: state.teams.away.name },
        colors: { home: state.teams.home.colors?.primary ?? null, away: state.teams.away.colors?.primary ?? null },
        goalAreaDepth: match.goalAreaDepth ?? null,
        speelveldM: match.veldSpeelveld ?? null,
        matchLabel: `${reeks}${datum ? ` · ${datum}` : ''}`,
        shots,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 404 })
  }
}
