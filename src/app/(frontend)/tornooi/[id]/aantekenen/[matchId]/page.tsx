import { notFound, redirect } from 'next/navigation'

import { magTornooiAantekenen } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { clubColors, clubLogoFit, clubLogoUrl } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { buildTournamentState } from '@/lib/tournament-engine'
import { TournamentScoresheet } from './TournamentScoresheet'
import { TournamentScoresheetPro } from './TournamentScoresheetPro'
import '../../../tornooi.css'

export const dynamic = 'force-dynamic'

// Aantekentafel: één tornooiwedstrijd. Zijn beide ploegen aan een échte ploeg (met spelers)
// gekoppeld, dan gebruiken we exact hetzelfde aantekenblad als bij een gewone wedstrijd
// (scorerkeuze, wissels, logo's). Anders valt het terug op de basis-snelscoretafel.
export default async function AantekenenPage({ params }: { params: Promise<{ id: string; matchId: string }> }) {
  const { id, matchId } = await params
  const tournamentId = Number(id)
  const mId = Number(matchId)
  if (!Number.isFinite(tournamentId) || !Number.isFinite(mId)) notFound()

  // Aantekenen is voor de organisatie (federatie/admin + scheidsrechters). Een supporter die de
  // URL raadt, krijgt geen tafel vol knoppen die toch 403 geven — die volgt op de tornooipagina.
  const user = await getAuthUser()
  if (!magTornooiAantekenen(user)) redirect(`/tornooi/${tournamentId}`)

  const payload = await getPayloadClient()
  let state
  try {
    state = await buildTournamentState(payload, tournamentId)
  } catch {
    notFound()
  }
  const m = [...state.rounds.flatMap((r) => r.matches), state.thirdPlace].find((x) => x && x.id === mId)
  if (!m) notFound()

  // Ploegnaam → echte ploeg (uit het tornooi). Beide gekend + gekoppeld ⇒ het volledige aantekenblad.
  const t = await payload.findByID({ collection: 'tournaments', id: tournamentId, depth: 0 }).catch(() => null)
  const teamTeams = (Array.isArray((t as { teamTeams?: unknown })?.teamTeams)
    ? ((t as { teamTeams?: { name?: string; teamId?: number }[] }).teamTeams ?? [])
    : []) as { name?: string; teamId?: number }[]
  const idForName = (nm: string | null): number | null => {
    if (!nm) return null
    const hit = teamTeams.find((x) => (x.name ?? '').trim().toLowerCase() === nm.trim().toLowerCase())
    return hit?.teamId ?? null
  }
  const homeTeamId = idForName(m.home)
  const awayTeamId = idForName(m.away)

  if (m.home && m.away && homeTeamId && awayTeamId) {
    const [homeTeam, awayTeam] = await Promise.all([
      payload.findByID({ collection: 'teams', id: homeTeamId, depth: 2 }).catch(() => null),
      payload.findByID({ collection: 'teams', id: awayTeamId, depth: 2 }).catch(() => null),
    ])
    if (homeTeam && awayTeam) {
      const players = await payload.find({
        collection: 'players',
        where: { team: { in: [homeTeamId, awayTeamId] } },
        sort: 'shirtNumber',
        depth: 0,
        limit: 200,
      })
      const roster = players.docs.map((p) => {
        const teamId = typeof p.team === 'object' ? p.team.id : p.team
        return {
          id: p.id,
          name: p.name,
          shirtNumber: p.shirtNumber,
          side: teamId === homeTeamId ? ('home' as const) : ('away' as const),
        }
      })
      const teamInfo = (team: typeof homeTeam, name: string) => ({
        id: team.id,
        name,
        logoUrl: clubLogoUrl(team),
        logoFit: clubLogoFit(team),
        colors: clubColors(team),
      })
      return (
        <TournamentScoresheetPro
          id={tournamentId}
          matchId={mId}
          initial={state}
          halfDurationSeconds={state.halfDurationSeconds}
          home={teamInfo(homeTeam, m.home)}
          away={teamInfo(awayTeam, m.away)}
          roster={roster}
        />
      )
    }
  }

  return <TournamentScoresheet id={tournamentId} matchId={mId} initial={state} halfDurationSeconds={state.halfDurationSeconds} />
}
