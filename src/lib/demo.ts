import type { Payload } from 'payload'

// Ingebouwde demo-/oefenwedstrijd: altijd beschikbaar via het menu (/demo), nooit handmatig
// aan te maken. We zorgen (idempotent) voor twee demo-ploegen met elk 8 fictieve spelers en
// één demo-wedstrijd (isDemo), en zetten die telkens terug op een propere, speelbare start.

const DEMO_CLUB = 'Demo Club'
const DEMO_HOME = 'Demo Reds'
const DEMO_AWAY = 'Demo Blues'
// Aparte categorie: 'andere' valt buiten alle competitielijsten (rangschikking, analyse-creator,
// seizoensanalyse) → een demo vervuilt nooit de echte data. Categorie blijft 'senioren' (spelregels).
const DEMO_REEKS = 'andere'
const DEMO_CATEGORY = 'senioren'

// Een demo-wedstrijd vervalt na 1 uur en wordt dan (met al haar data) verwijderd.
const DEMO_TTL_MS = 60 * 60 * 1000

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
  if (existing) {
    // Bestaande demo-ploegen (oude reeks) bijwerken naar de aparte demo-categorie.
    if ((existing as { reeks?: string }).reeks !== DEMO_REEKS) {
      await payload
        .update({ collection: 'teams', id: existing.id, data: { reeks: DEMO_REEKS, category: DEMO_CATEGORY }, overrideAccess: true })
        .catch(() => undefined)
    }
    return existing.id as number
  }
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

/**
 * Verwijdert vervallen demo-wedstrijden (ouder dan 1 uur) met al hun data. Best-effort —
 * wordt opportunistisch aangeroepen (bij een demo-bezoek en bij het laden van het live-bord),
 * zodat demo's vanzelf verdwijnen zonder geplande taak.
 */
export async function purgeExpiredDemos(payload: Payload): Promise<void> {
  const cutoff = new Date(Date.now() - DEMO_TTL_MS).toISOString()
  const expired = await payload
    .find({
      collection: 'matches',
      where: { and: [{ isDemo: { equals: true } }, { createdAt: { less_than: cutoff } }] },
      limit: 100,
      depth: 0,
    })
    .catch(() => ({ docs: [] as { id: number }[] }))
  for (const m of expired.docs) {
    const id = m.id as number
    await Promise.all(
      (['throws', 'possessions', 'match-events', 'matchsheets'] as const).map((collection) =>
        payload.delete({ collection, where: { match: { equals: id } }, overrideAccess: true }).catch(() => undefined),
      ),
    )
    await payload.delete({ collection: 'matches', id, overrideAccess: true }).catch(() => undefined)
  }
}

/**
 * Zorgt dat de ingebouwde demo speelklaar is en geeft het match-id terug. Ruimt eerst de
 * vervallen demo's op en maakt dan een verse demo-wedstrijd aan (elk bezoek een propere start;
 * de demo-ploegen en spelers worden hergebruikt). De demo vervalt na 1 uur (zie purgeExpiredDemos).
 */
export async function ensureDemoMatch(payload: Payload): Promise<number> {
  await purgeExpiredDemos(payload)

  const club =
    (await findByName(payload, 'clubs', DEMO_CLUB)) ??
    (await payload.create({ collection: 'clubs', data: { name: DEMO_CLUB }, overrideAccess: true }))
  const clubId = club.id as number

  const homeId = await ensureTeam(payload, DEMO_HOME, clubId)
  const awayId = await ensureTeam(payload, DEMO_AWAY, clubId)
  await ensurePlayers(payload, homeId, HOME_NAMES)
  await ensurePlayers(payload, awayId, AWAY_NAMES)

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
  return created.id as number
}
