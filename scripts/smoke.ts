// Smoke-test van de match-engine tegen de echte SQLite-db. Niet voor CI — handmatig:
//   pnpm exec tsx scripts/smoke.ts
import 'dotenv/config'
import { getPayload } from 'payload'

import config from '../src/payload.config'
import { recordThrow, startMatch, undoLastThrow } from '../src/lib/match-engine'

async function main() {
  const payload = await getPayload({ config: await config })

  const club = await payload.create({ collection: 'clubs', data: { name: 'Smoke Club' }, overrideAccess: true })
  const home = await payload.create({ collection: 'teams', data: { club: club.id, name: 'Smoke Thuis', category: 'senioren' }, overrideAccess: true })
  const away = await payload.create({ collection: 'teams', data: { club: club.id, name: 'Smoke Uit', category: 'senioren' }, overrideAccess: true })
  const p1 = await payload.create({ collection: 'players', data: { name: 'Speler 7', team: home.id, shirtNumber: 7 }, overrideAccess: true })
  const p2 = await payload.create({ collection: 'players', data: { name: 'Speler 9', team: away.id, shirtNumber: 9 }, overrideAccess: true })
  const match = await payload.create({
    collection: 'matches',
    data: { homeTeam: home.id, awayTeam: away.id, date: new Date().toISOString(), reeks: '1NAH', status: 'scheduled', goalAreaDepth: 10 },
    overrideAccess: true,
  })

  console.log('--- start (thuis zet op) ---')
  let state = await startMatch(payload, match.id, home.id)
  console.log('balbezit:', state.possession?.side, 'worpen toegestaan:', state.possession?.throwsAllowed)

  console.log('--- thuis: rugworp doelpunt (verwacht +2) ---')
  const r1 = await recordThrow(payload, { matchId: match.id, playerId: p1.id, type: 'rug', point: { x: 0.5, y: 0.95 }, tapCount: 1 })
  console.log('uitkomst:', r1.outcome, '| score:', r1.state.score, '| nieuw balbezit:', r1.state.possession?.side)

  console.log('--- uit: nekworp doelpunt (verwacht +1) ---')
  const r2 = await recordThrow(payload, { matchId: match.id, playerId: p2.id, type: 'nek', point: { x: 0.5, y: 0.05 }, tapCount: 1 })
  console.log('uitkomst:', r2.outcome, '| score:', r2.state.score)

  console.log('--- undo laatste worp ---')
  state = await undoLastThrow(payload, match.id)
  console.log('score na undo:', state.score, '| balbezit:', state.possession?.side)

  // Opruimen
  const throws = await payload.find({ collection: 'throws', where: { match: { equals: match.id } }, limit: 100 })
  for (const t of throws.docs) await payload.delete({ collection: 'throws', id: t.id, overrideAccess: true })
  const poss = await payload.find({ collection: 'possessions', where: { match: { equals: match.id } }, limit: 100 })
  for (const p of poss.docs) await payload.delete({ collection: 'possessions', id: p.id, overrideAccess: true })
  const ev = await payload.find({ collection: 'match-events', where: { match: { equals: match.id } }, limit: 100 })
  for (const e of ev.docs) await payload.delete({ collection: 'match-events', id: e.id, overrideAccess: true })
  await payload.delete({ collection: 'matches', id: match.id, overrideAccess: true })
  await payload.delete({ collection: 'players', id: p1.id, overrideAccess: true })
  await payload.delete({ collection: 'players', id: p2.id, overrideAccess: true })
  await payload.delete({ collection: 'teams', id: home.id, overrideAccess: true })
  await payload.delete({ collection: 'teams', id: away.id, overrideAccess: true })
  await payload.delete({ collection: 'clubs', id: club.id, overrideAccess: true })
  console.log('--- opgeruimd, klaar ---')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
