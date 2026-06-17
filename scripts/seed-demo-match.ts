// Genereert een GESPEELDE demo-match met echte worpen + MVP-stemmen, zodat de publieke
// speler-/ploegprofielen (Skill+Fame, shot map, badges) gevuld zijn voor een visuele check.
//   pnpm exec tsx scripts/seed-demo-match.ts
import 'dotenv/config'
import { getPayload } from 'payload'

import config from '../src/payload.config'
import { finishMatch, recordThrow, startMatch } from '../src/lib/match-engine'

const HOME = ['Jens Dem', 'Wout Vermeersch', 'Lander Coppens', 'Senne Maes', 'Robbe Declerck', 'Toon Vanhove']
const AWAY = ['Milan Peeters', 'Brent Janssens', 'Niels De Smet', 'Ferre Claes', 'Stan Willems', 'Vince Boateng']

async function main() {
  const payload = await getPayload({ config: await config })

  const club = await payload.create({ collection: 'clubs', data: { name: 'KV Demostad' }, overrideAccess: true })
  const home = await payload.create({ collection: 'teams', data: { club: club.id, name: 'KV Demostad', category: 'senioren', reeks: '1NAH' }, overrideAccess: true })
  const awayClub = await payload.create({ collection: 'clubs', data: { name: 'KV Tegenstad' }, overrideAccess: true })
  const away = await payload.create({ collection: 'teams', data: { club: awayClub.id, name: 'KV Tegenstad', category: 'senioren', reeks: '1NAH' }, overrideAccess: true })

  const mk = async (names: string[], teamId: number, start: number) => {
    const out: { id: number }[] = []
    let n = start
    for (const name of names) out.push(await payload.create({ collection: 'players', data: { name, team: teamId, shirtNumber: n++ }, overrideAccess: true }))
    return out
  }
  const hp = await mk(HOME, home.id, 4)
  const ap = await mk(AWAY, away.id, 4)
  const star = hp[0] // de speler die we screenshotten

  const match = await payload.create({
    collection: 'matches',
    data: { homeTeam: home.id, awayTeam: away.id, date: new Date().toISOString(), reeks: '1NAH', status: 'scheduled', goalAreaDepth: 10 },
    overrideAccess: true,
  })

  let state = await startMatch(payload, match.id, home.id)
  let lastPid = -1
  // Een gevarieerde reeks worpen: doelworpen scoren meestal (afwisselend nek/rug), met af en toe een
  // miss of een gevangen bal → realistische conversie, zones en afstanden.
  for (let i = 0; i < 76 && state.possession; i++) {
    const poss = state.possession
    const side = poss.side
    const sidePlayers = side === 'home' ? hp : ap
    const isDoel = (poss.nextThrowNumber ?? 1) >= (poss.throwsAllowed ?? 1)
    // Speler kiezen: doelworp thuis → de ster (tenzij die net wierp); anders roteren, nooit 2× na elkaar.
    let pid = isDoel && side === 'home' && star.id !== lastPid ? star.id : (sidePlayers.find((p) => p.id !== lastPid)?.id ?? sidePlayers[0].id)
    const dir = poss.dir ?? 'up'
    const goalY = dir === 'up' ? 0.96 : 0.04
    const x = 0.2 + ((i * 0.13) % 0.6) // varieer de zone (links/midden/rechts)
    let type: 'nek' | 'rug' = i % 3 === 0 ? 'rug' : 'nek'
    let tapCount: 1 | 2 = 1
    let y = 0.5
    if (isDoel) {
      const r = i % 5
      if (r === 4) { y = dir === 'up' ? 1.04 : -0.04; type = 'nek' } // miss → buiten achterlijn
      else if (r === 3) { y = dir === 'up' ? 0.7 : 0.3; tapCount = 2 } // gevangen
      else y = goalY // doelpunt
    } else {
      y = dir === 'up' ? 0.55 + (i % 3) * 0.08 : 0.45 - (i % 3) * 0.08 // diepte richting doel
    }
    try {
      const r = await recordThrow(payload, { matchId: match.id, playerId: pid, type, point: { x: Math.max(0.02, Math.min(0.98, x)), y: Math.max(-0.05, Math.min(1.05, y)), }, tapCount, gameClock: i * 18 })
      state = r.state
      lastPid = pid
    } catch {
      // bv. "zelfde speler 2× na elkaar" door een rare rotatie → andere speler proberen
      const alt = sidePlayers.find((p) => p.id !== lastPid && p.id !== pid)
      if (alt) { try { const r = await recordThrow(payload, { matchId: match.id, playerId: alt.id, type, point: { x, y: Math.max(-0.05, Math.min(1.05, y)) }, tapCount, gameClock: i * 18 }); state = r.state; lastPid = alt.id } catch {} }
    }
  }
  await finishMatch(payload, match.id)

  // FAME: een aantal supporters stemmen 'held van de match' op de ster (elk een eigen account).
  for (let k = 0; k < 12; k++) {
    const u = await payload.create({ collection: 'users', data: { name: `Supporter ${k + 1}`, email: `demo-fan-${k + 1}-${Date.now()}@demo.local`, password: 'demo12345', roles: ['viewer'] }, overrideAccess: true }).catch(() => null)
    if (!u) continue
    await payload.create({ collection: 'match-mvp-votes', data: { match: match.id, user: u.id, player: star.id, playerName: HOME[0], shirtNumber: 4, side: 'home' }, overrideAccess: true }).catch(() => {})
  }

  console.log('KLAAR-DEMO')
  console.log(`STAR_PLAYER_ID=${star.id}`)
  console.log(`HOME_TEAM_ID=${home.id}`)
  console.log(`MATCH_ID=${match.id}`)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
