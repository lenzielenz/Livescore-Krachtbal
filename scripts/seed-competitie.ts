// Maakt de competitie-clubs aan en plaatst ze in de juiste reeksen (KVKBF).
// Idempotent: bestaande clubs/ploegen worden hergebruikt, niet gedupliceerd.
// Bron ploeglijsten: krachtbal.be / Wikipedia (seizoen 2023–2024). Vul gerust extra reeksen aan.
//
// Lokaal:      pnpm tsx scripts/seed-competitie.ts
// Productie:   $env:DATABASE_URL = "postgres://…"; pnpm tsx scripts/seed-competitie.ts
import 'dotenv/config'
import { getPayload } from 'payload'

import config from '../src/payload.config'
import { reeksCategorie, type Reeks } from '../src/lib/reeksen'

// Reeks → clubs die erin spelen. Eén ploeg per club per reeks (de reeks bepaalt de categorie).
const COMPETITIE: { reeks: Reeks; clubs: string[] }[] = [
  {
    reeks: '1NAH',
    clubs: [
      'Osiris Aalst',
      'KSVV Inter Assebroek',
      'HO Beitem',
      'Sporting Brugge',
      "'t Klaverken Buggenhout",
      'KBK Ichtegem',
      'KRB Jabbeke',
      'Durf en Win Koekelare',
      'Avanti Lissewege',
      'KBC Male',
      'KBC Sint-Michiels',
      'WWR Ingelmunster',
    ],
  },
  {
    reeks: '1NAD',
    clubs: [
      "'t Botterken Baasrode",
      'HO Beitem',
      "'t Klaverken Buggenhout",
      'Noordster Dudzele',
      'KBC Heist',
      'Woweja Rangers Ingelmunster',
      'KBC Male',
      'KBC Sint-Michiels',
    ],
  },
]

async function main() {
  const payload = await getPayload({ config: await config })

  // Club-cache: maak elke club maar één keer aan (clubs spelen vaak in meerdere reeksen).
  const clubIdByName = new Map<string, number>()
  const getClub = async (name: string): Promise<number> => {
    const cached = clubIdByName.get(name)
    if (cached) return cached
    const existing = await payload.find({ collection: 'clubs', where: { name: { equals: name } }, limit: 1 })
    const id = existing.docs[0]
      ? (existing.docs[0].id as number)
      : ((await payload.create({ collection: 'clubs', data: { name }, overrideAccess: true })).id as number)
    clubIdByName.set(name, id)
    return id
  }

  let teamsCreated = 0
  let teamsSkipped = 0
  for (const { reeks, clubs } of COMPETITIE) {
    const category = reeksCategorie(reeks)
    for (const clubName of clubs) {
      const clubId = await getClub(clubName)
      // Bestaat er al een ploeg van deze club in deze reeks?
      const existing = await payload.find({
        collection: 'teams',
        where: { and: [{ club: { equals: clubId } }, { reeks: { equals: reeks } }] },
        limit: 1,
      })
      if (existing.docs[0]) {
        teamsSkipped += 1
        continue
      }
      await payload.create({
        collection: 'teams',
        data: { club: clubId, name: clubName, category, reeks },
        overrideAccess: true,
      })
      teamsCreated += 1
    }
  }

  console.info(
    `Competitie-seed klaar. Clubs: ${clubIdByName.size} · ploegen aangemaakt: ${teamsCreated} · al aanwezig: ${teamsSkipped}`,
  )
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
