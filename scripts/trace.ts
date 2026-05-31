// Traceert balbezit-verloop over meerdere in_field-worpen + helftwissel.
//   pnpm exec tsx scripts/trace.ts
import 'dotenv/config'
import { getPayload } from 'payload'

import config from '../src/payload.config'
import { advanceHalf, recordThrow, startMatch } from '../src/lib/match-engine'

async function main() {
  const payload = await getPayload({ config: await config })
  const home = await payload.create({ collection: 'teams', data: { name: 'T-Home', category: 'senioren' }, overrideAccess: true })
  const away = await payload.create({ collection: 'teams', data: { name: 'T-Away', category: 'senioren' }, overrideAccess: true })
  const ph = await payload.create({ collection: 'players', data: { name: 'H7', team: home.id, shirtNumber: 7 }, overrideAccess: true })
  const pa = await payload.create({ collection: 'players', data: { name: 'A9', team: away.id, shirtNumber: 9 }, overrideAccess: true })
  const match = await payload.create({ collection: 'matches', data: { homeTeam: home.id, awayTeam: away.id, date: new Date().toISOString(), category: 'senioren', status: 'scheduled' }, overrideAccess: true })

  const pid = (side: string) => (side === 'home' ? ph.id : pa.id)
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
  for (const id of [ph.id, pa.id]) await payload.delete({ collection: 'players', id, overrideAccess: true })
  for (const id of [home.id, away.id]) await payload.delete({ collection: 'teams', id, overrideAccess: true })
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
