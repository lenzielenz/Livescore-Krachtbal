// Demo-data voor lokale ontwikkeling: twee ploegen, spelers en een geplande wedstrijd.
//   pnpm seed
import 'dotenv/config'
import { getPayload } from 'payload'

import config from '../src/payload.config'

const TEAMS = [
  { name: 'KV Roeselare', players: ['Jens', 'Wout', 'Lander', 'Senne', 'Robbe', 'Toon'] },
  { name: 'KV Izegem', players: ['Milan', 'Brent', 'Niels', 'Ferre', 'Stan', 'Vince'] },
]

async function main() {
  const payload = await getPayload({ config: await config })

  // Bestaande demo opruimen (idempotent).
  const existing = await payload.find({ collection: 'teams', where: { name: { in: TEAMS.map((t) => t.name) } }, limit: 10 })
  for (const t of existing.docs) {
    const ps = await payload.find({ collection: 'players', where: { team: { equals: t.id } }, limit: 100 })
    for (const p of ps.docs) await payload.delete({ collection: 'players', id: p.id, overrideAccess: true })
    await payload.delete({ collection: 'teams', id: t.id, overrideAccess: true })
  }

  const created: { id: number }[] = []
  for (const team of TEAMS) {
    const t = await payload.create({ collection: 'teams', data: { name: team.name, category: 'senioren' }, overrideAccess: true })
    created.push(t)
    let n = 4
    for (const name of team.players) {
      await payload.create({ collection: 'players', data: { name, team: t.id, shirtNumber: n++ }, overrideAccess: true })
    }
  }

  const match = await payload.create({
    collection: 'matches',
    data: {
      homeTeam: created[0].id,
      awayTeam: created[1].id,
      date: new Date().toISOString(),
      category: 'senioren',
      status: 'scheduled',
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
