import { getPayloadClient } from './payload-client'

interface Args {
  id: number
  status: string
  prevStatus: string | null
  analyseOnly: boolean
  isDemo: boolean
}

/**
 * Verwittigt geabonneerde supporters met een push wanneer een (gewone) wedstrijd LIVE gaat of
 * AFGELOPEN is. Fire-and-forget en volledig losgekoppeld van de DB-transactie van de match-actie:
 * een trage of mislukte push mag het aantekenen nooit vertragen of breken.
 */
export function notifyMatchStatusChange(args: Args): void {
  // setTimeout(…, 0): draait ná de huidige operatie, met een verse payload-context (zonder req,
  // dus zonder de lopende transactie), zodat het opbouwen en versturen erbuiten valt.
  setTimeout(() => {
    void run(args).catch(() => {})
  }, 0)
}

async function run({ id, status, prevStatus, analyseOnly, isDemo }: Args): Promise<void> {
  if (analyseOnly || isDemo) return // privé-analyses en demo's verwittigen niemand
  if (status === prevStatus) return
  if (status !== 'live' && status !== 'finished') return
  // Een heropening (afgelopen → live) is een correctie, geen nieuwe aftrap: supporters die net
  // een eindstand kregen, mogen daar geen "match begonnen" achteraan krijgen.
  if (status === 'live' && prevStatus === 'finished') return

  const payload = await getPayloadClient()
  const { pushConfigured, sendPushToAll } = await import('./push')
  if (!pushConfigured()) return // geen sleutels → niets te doen (geen lege query's)
  const { buildMatchState } = await import('./match-engine')

  const state = await buildMatchState(payload, id).catch(() => null)
  if (!state) return
  const home = state.teams.home.name
  const away = state.teams.away.name
  const tag = `match-${id}` // nieuwere melding van dezelfde match vervangt de vorige

  const notif =
    status === 'live'
      ? { title: '🟢 Match begonnen', body: `${home} – ${away} is live!`, url: `/match/${id}`, tag }
      : { title: '🏁 Eindstand', body: `${home} ${state.score.home}–${state.score.away} ${away}`, url: `/match/${id}`, tag }

  await sendPushToAll(payload, notif)
}

const rel = (v: unknown): number | null =>
  v && typeof v === 'object' ? ((v as { id?: number }).id ?? null) : typeof v === 'number' ? v : null

/**
 * Verwittigt de fans van de SCORENDE club bij een doelpunt (push naar wie die club als account-club
 * heeft). Fire-and-forget, los van de aantekentransactie. `side` (snelscoremodus) of `playerId`
 * (veldschema) bepaalt welke ploeg scoorde.
 */
export function notifyGoalScored(args: { matchId: number; side?: 'home' | 'away'; playerId?: number }): void {
  setTimeout(() => {
    void runGoal(args).catch(() => {})
  }, 0)
}

async function runGoal({ matchId, side, playerId }: { matchId: number; side?: 'home' | 'away'; playerId?: number }): Promise<void> {
  const payload = await getPayloadClient()
  const { pushConfigured, sendPushToClubs } = await import('./push')
  if (!pushConfigured()) return

  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 2 }).catch(() => null)
  if (!match || match.analyseOnly || (match as { isDemo?: boolean }).isDemo) return
  if (match.status !== 'live') return

  const homeTeam = match.homeTeam as { id?: number; name?: string; club?: unknown } | null
  const awayTeam = match.awayTeam as { id?: number; name?: string; club?: unknown } | null

  // Bepaal de scorende kant: rechtstreeks (snelscore) of via de ploeg van de speler.
  let scoringSide = side ?? null
  if (!scoringSide && playerId != null) {
    const player = await payload.findByID({ collection: 'players', id: playerId, depth: 0 }).catch(() => null)
    const teamId = rel((player as { team?: unknown } | null)?.team)
    if (teamId != null && rel(homeTeam) === teamId) scoringSide = 'home'
    else if (teamId != null && rel(awayTeam) === teamId) scoringSide = 'away'
  }
  if (!scoringSide) return

  const scoringTeam = scoringSide === 'home' ? homeTeam : awayTeam
  const club = (scoringTeam as { club?: unknown } | null)?.club as { id?: number; name?: string } | null
  const clubId = rel(club)
  if (clubId == null) return

  const { buildMatchState } = await import('./match-engine')
  const state = await buildMatchState(payload, matchId).catch(() => null)
  if (!state) return
  const clubName = club?.name || scoringTeam?.name || 'Je club'

  await sendPushToClubs(payload, [clubId], {
    title: `⚽ ${clubName} scoort!`,
    body: `${state.teams.home.name} ${state.score.home}–${state.score.away} ${state.teams.away.name}`,
    url: `/match/${matchId}`,
    tag: `goal-${matchId}`,
  })
}
