// Traceert balbezit-verloop over meerdere in_field-worpen + helftwissel.
//   pnpm exec tsx scripts/trace.ts
import 'dotenv/config'
import { getPayload } from 'payload'

import config from '../src/payload.config'
import { advanceHalf, recordThrow, startMatch } from '../src/lib/match-engine'

async function main() {
  const payload = await getPayload({ config: await config })
  const club = await payload.create({ collection: 'clubs', data: { name: 'T-Club' }, overrideAccess: true })
  const home = await payload.create({ collection: 'teams', data: { club: club.id, name: 'T-Home', category: 'senioren' }, overrideAccess: true })
  const away = await payload.create({ collection: 'teams', data: { club: club.id, name: 'T-Away', category: 'senioren' }, overrideAccess: true })
  const ph = await payload.create({ collection: 'players', data: { name: 'H7', team: home.id, shirtNumber: 7 }, overrideAccess: true })
  const ph2 = await payload.create({ collection: 'players', data: { name: 'H8', team: home.id, shirtNumber: 8 }, overrideAccess: true })
  const pa = await payload.create({ collection: 'players', data: { name: 'A9', team: away.id, shirtNumber: 9 }, overrideAccess: true })
  const pa2 = await payload.create({ collection: 'players', data: { name: 'A10', team: away.id, shirtNumber: 10 }, overrideAccess: true })
  const match = await payload.create({ collection: 'matches', data: { homeTeam: home.id, awayTeam: away.id, date: new Date().toISOString(), category: 'senioren', status: 'scheduled', goalAreaDepth: 10 }, overrideAccess: true })

  // Wissel telkens van speler (mag niet 2× na elkaar).
  let flip = 0
  const pid = (side: string) => (side === 'home' ? (flip++ % 2 ? ph.id : ph2.id) : (flip++ % 2 ? pa.id : pa2.id))
  const log = (label: string, s: any) =>
    console.log(label.padEnd(28), '→ balbezit', s.possession?.side, 'worp', s.possession?.nextThrowNumber + '/' + s.possession?.throwsAllowed, 'dir', s.possession?.dir, 'score', JSON.stringify(s.score))

  let s = await startMatch(payload, match.id, home.id)
  log('start (home, helft1)', s)

  // 3 in_field-worpen die de middellijn netjes overschrijden (home valt 'up' aan = naar y=1)
  for (const y of [0.45, 0.55, 0.62]) {
    const r = await recordThrow(payload, { matchId: match.id, playerId: pid(s.possession!.side), type: 'nek', point: { x: 0.5, y }, tapCount: 1 })
    s = r.state
    log(`worp in_field y=${y} (${r.outcome})`, s)
  }

  console.log('\n--- vangtest: home gooit, away vangt DIEP in eigen helft (over middellijn) → verwacht 3 ---')
  // home valt 'up' aan (naar y=1). away (na vangst) valt 'down' aan; eigen helft = y>0.5.
  {
    const r = await recordThrow(payload, { matchId: match.id, playerId: pid(s.possession!.side), type: 'nek', point: { x: 0.5, y: 0.85 }, tapCount: 2 })
    s = r.state
    log(`gevangen y=0.85 (${r.outcome})`, s)
  }
  console.log('--- vangtest: away gooit, home vangt VOOR de middellijn → verwacht 2 ---')
  {
    // away valt 'down' aan (naar y=0); home (na vangst) valt 'up' aan; eigen helft = y<0.5.
    // vangst bij y=0.6 = home tegenhelft → 2 worpen
    const r = await recordThrow(payload, { matchId: match.id, playerId: pid(s.possession!.side), type: 'nek', point: { x: 0.5, y: 0.6 }, tapCount: 2 })
    s = r.state
    log(`gevangen y=0.6 (${r.outcome})`, s)
  }

  console.log('\n--- naar 2e helft ---')
  s = await advanceHalf(payload, match.id)
  log('na helftwissel', s)
  for (const y of [0.55, 0.45, 0.38]) {
    const r = await recordThrow(payload, { matchId: match.id, playerId: pid(s.possession!.side), type: 'nek', point: { x: 0.5, y }, tapCount: 1 })
    s = r.state
    log(`worp in_field y=${y} (${r.outcome})`, s)
  }

  // opruimen
  for (const c of ['throws', 'possessions', 'match-events'] as const) {
    const d = await payload.find({ collection: c, where: { match: { equals: match.id } }, limit: 200 })
    for (const x of d.docs) await payload.delete({ collection: c, id: x.id, overrideAccess: true })
  }
  await payload.delete({ collection: 'matches', id: match.id, overrideAccess: true })
  for (const id of [ph.id, ph2.id, pa.id, pa2.id]) await payload.delete({ collection: 'players', id, overrideAccess: true })
  for (const id of [home.id, away.id]) await payload.delete({ collection: 'teams', id, overrideAccess: true })
  await payload.delete({ collection: 'clubs', id: club.id, overrideAccess: true })
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
