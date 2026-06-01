// Demo-data voor lokale ontwikkeling: twee ploegen, spelers en een geplande wedstrijd.
//   pnpm seed
import 'dotenv/config'
import { getPayload } from 'payload'

import config from '../src/payload.config'

const CLUBS = [
  { name: 'KV Roeselare', players: ['Jens', 'Wout', 'Lander', 'Senne', 'Robbe', 'Toon'] },
  { name: 'KV Izegem', players: ['Milan', 'Brent', 'Niels', 'Ferre', 'Stan', 'Vince'] },
]

async function main() {
  const payload = await getPayload({ config: await config })

  // Bestaande demo opruimen (idempotent): clubs + hun ploegen + spelers.
  const existingClubs = await payload.find({ collection: 'clubs', where: { name: { in: CLUBS.map((c) => c.name) } }, limit: 10 })
  for (const c of existingClubs.docs) {
    const teams = await payload.find({ collection: 'teams', where: { club: { equals: c.id } }, limit: 50 })
    for (const t of teams.docs) {
      const ps = await payload.find({ collection: 'players', where: { team: { equals: t.id } }, limit: 100 })
      for (const p of ps.docs) await payload.delete({ collection: 'players', id: p.id, overrideAccess: true })
      await payload.delete({ collection: 'teams', id: t.id, overrideAccess: true })
    }
    await payload.delete({ collection: 'clubs', id: c.id, overrideAccess: true })
  }

  const created: { id: number }[] = []
  for (const club of CLUBS) {
    const c = await payload.create({ collection: 'clubs', data: { name: club.name }, overrideAccess: true })
    const t = await payload.create({
      collection: 'teams',
      data: { club: c.id, name: `${club.name} Senioren`, category: 'senioren', reeks: '1NAH' },
      overrideAccess: true,
    })
    created.push(t)
    let n = 4
    for (const name of club.players) {
      await payload.create({ collection: 'players', data: { name, team: t.id, shirtNumber: n++ }, overrideAccess: true })
    }
  }

  const match = await payload.create({
    collection: 'matches',
    data: {
      homeTeam: created[0].id,
      awayTeam: created[1].id,
      date: new Date().toISOString(),
      reeks: '1NAH',
      status: 'scheduled',
      goalAreaDepth: 10,
    },
    overrideAccess: true,
  })

  console.log(`Seed klaar. Demo-wedstrijd id=${match.id}`)
  console.log(`Scorekeeper: /scorekeeper/${match.id}`)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
