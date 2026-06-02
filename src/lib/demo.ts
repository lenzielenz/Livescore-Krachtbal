import type { Payload } from 'payload'

// Ingebouwde demo-/oefenwedstrijd: altijd beschikbaar via het menu (/demo), nooit handmatig
// aan te maken. We zorgen (idempotent) voor twee demo-ploegen met elk 8 fictieve spelers en
// één demo-wedstrijd (isDemo), en zetten die telkens terug op een propere, speelbare start.

const DEMO_CLUB = 'Demo Club'
const DEMO_HOME = 'Demo Reds'
const DEMO_AWAY = 'Demo Blues'
const DEMO_REEKS = '1NAH' // 1ste Nationale Heren → categorie senioren
const DEMO_CATEGORY = 'senioren'

const HOME_NAMES = [
  'Tom Aerts', 'Jan Beckers', 'Wout Claes', 'Niels De Smet',
  'Lars Engels', 'Ruben Foppe', 'Senne Geerts', 'Milan Haes',
]
const AWAY_NAMES = [
  'Bram Ivens', 'Kobe Janssen', 'Vince Knol', 'Daan Luyten',
  'Stan Maes', 'Joren Neels', 'Tijl Ory', 'Ward Pauwels',
]

async function findByName(payload: Payload, collection: 'clubs' | 'teams', name: string) {
  const res = await payload.find({ collection, where: { name: { equals: name } }, limit: 1, depth: 0 })
  return res.docs[0] ?? null
}

async function ensureTeam(payload: Payload, name: string, clubId: number): Promise<number> {
  const existing = await findByName(payload, 'teams', name)
  if (existing) return existing.id as number
  const created = await payload.create({
    collection: 'teams',
    data: { name, club: clubId, category: DEMO_CATEGORY, reeks: DEMO_REEKS },
    overrideAccess: true,
  })
  return created.id as number
}

async function ensurePlayers(payload: Payload, teamId: number, names: string[]): Promise<void> {
  const existing = await payload.find({ collection: 'players', where: { team: { equals: teamId } }, limit: 50, depth: 0 })
  for (let i = existing.docs.length; i < names.length; i++) {
    await payload.create({
      collection: 'players',
      data: { name: names[i], team: teamId, shirtNumber: i + 1, actief: true, vergunningsstatus: 'geldig' },
      overrideAccess: true,
    })
  }
}

/** Zet de demo terug op een propere start: geen live-data, status gepland, klok op nul. */
async function resetDemo(payload: Payload, matchId: number, homeId: number, awayId: number): Promise<void> {
  await Promise.all(
    (['throws', 'possessions', 'match-events'] as const).map((collection) =>
      payload.delete({ collection, where: { match: { equals: matchId } }, overrideAccess: true }).catch(() => undefined),
    ),
  )
  await payload.update({
    collection: 'matches',
    id: matchId,
    data: {
      // Herstel ook de ploegen (voor het geval een oude demo-match andere ploegen had).
      homeTeam: homeId,
      awayTeam: awayId,
      status: 'scheduled',
      currentHalf: 1,
      clockSeconds: 0,
      clockRunning: false,
      clockUpdatedAt: null,
      homeLineup: [],
      awayLineup: [],
    },
    overrideAccess: true,
  })
}

/**
 * Zorgt dat de ingebouwde demo bestaat + speelklaar is, en geeft het match-id terug.
 * Bij elke aanroep wordt de demo gereset zodat je altijd opnieuw kan spelen.
 */
export async function ensureDemoMatch(payload: Payload): Promise<number> {
  const club =
    (await findByName(payload, 'clubs', DEMO_CLUB)) ??
    (await payload.create({ collection: 'clubs', data: { name: DEMO_CLUB }, overrideAccess: true }))
  const clubId = club.id as number

  const homeId = await ensureTeam(payload, DEMO_HOME, clubId)
  const awayId = await ensureTeam(payload, DEMO_AWAY, clubId)
  await ensurePlayers(payload, homeId, HOME_NAMES)
  await ensurePlayers(payload, awayId, AWAY_NAMES)

  const found = await payload.find({ collection: 'matches', where: { isDemo: { equals: true } }, sort: 'createdAt', limit: 1, depth: 0 })
  let matchId: number
  if (found.docs[0]) {
    matchId = found.docs[0].id as number
  } else {
    const created = await payload.create({
      collection: 'matches',
      data: {
        reeks: DEMO_REEKS,
        homeTeam: homeId,
        awayTeam: awayId,
        date: new Date().toISOString(),
        status: 'scheduled',
        goalAreaDepth: 10,
        isDemo: true,
      },
      overrideAccess: true,
    })
    matchId = created.id as number
  }

  await resetDemo(payload, matchId, homeId, awayId)
  return matchId
}
