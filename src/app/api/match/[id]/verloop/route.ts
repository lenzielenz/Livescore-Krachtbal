import { formatDateTimeBE } from '@/lib/datetime'
import { logoBron } from '@/lib/logo-bron'
import { buildMatchSheet, buildMatchState, loadMatchThrowData } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { reeksNaam } from '@/lib/reeksen'
import { clientIp, rateLimit } from '@/lib/sse-hub'
import { schotenUitDoelpunten } from '@/lib/wedstrijdverloop'

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
    const [state, worpen] = await Promise.all([buildMatchState(payload, matchId), loadMatchThrowData(payload, matchId)])
    // Zonder worpen (snelscore: enkel +1/+2 per ploeg) bouwen we het verloop uit de doelpunten van
    // het wedstrijdblad, met een geschatte plaats in het doelgebied dat aangevallen werd.
    let shots = worpen.shots
    let geschat = false
    if (!shots.length) {
      const blad = await buildMatchSheet(payload, matchId).catch(() => null)
      if (blad?.goals.length) {
        shots = schotenUitDoelpunten(blad.goals, { goalAreaDepth: match.goalAreaDepth, maten: match.veldSpeelveld != null ? { speelveldM: match.veldSpeelveld } : null })
        geschat = true
      }
    }
    // Het clublogo altijd van ons eigen domein: dan mag het canvas met het logo erop nog bewaard en
    // opgenomen worden (een afbeelding van een ander domein maakt het canvas 'besmet').
    const eigenLogo = (url: string | null) => {
      const bron = logoBron(url)
      if (!bron) return null
      if (bron.startsWith('/')) return bron
      return /^https?:\/\//i.test(bron) ? `/api/logo-proxy?url=${encodeURIComponent(bron)}` : null
    }
    const reeks = match.reeks ? reeksNaam(match.reeks) : 'Krachtbal'
    const datum = match.date ? formatDateTimeBE(String(match.date)) : null
    return Response.json(
      {
        status: state.match.status,
        teams: { home: state.teams.home.name, away: state.teams.away.name },
        // Beide clubkleuren: elke helft van het veld krijgt de banen van haar club (primair en secundair).
        colors: {
          home: state.teams.home.colors?.primary ?? null,
          away: state.teams.away.colors?.primary ?? null,
          homeB: state.teams.home.colors?.secondary ?? null,
          awayB: state.teams.away.colors?.secondary ?? null,
        },
        logos: { home: eigenLogo(state.teams.home.logoUrl), away: eigenLogo(state.teams.away.logoUrl) },
        goalAreaDepth: match.goalAreaDepth ?? null,
        speelveldM: match.veldSpeelveld ?? null,
        matchLabel: `${reeks}${datum ? ` · ${datum}` : ''}`,
        shots,
        geschat,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 404 })
  }
}
