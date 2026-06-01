// Maakt alle competitie-clubs aan en plaatst ze in de juiste reeksen met hun vaste thuisuur.
// Bron: KVKBF Reeksindeling 2025-2026 (Kalendercommissie 7/7/2025). Idempotent.
//
// Leeswijze bron: laatste kolom = thuisdag + uur (bv. "za 20:00").
// thuisUur wordt opgeslagen als "za 20:00" (dag + uur samen).
// A/B-poules: clubs die 2× in dezelfde reeks staan met dezelfde naam worden samengevoegd tot één ploeg.
//
// Lokaal:    pnpm tsx scripts/seed-competitie.ts
// Productie: $env:DATABASE_URL = "postgres://…"; pnpm tsx scripts/seed-competitie.ts
import 'dotenv/config'
import { getPayload } from 'payload'

import config from '../src/payload.config'
import { reeksCategorie, type Reeks } from '../src/lib/reeksen'

type Entry = [naam: string, uur: string]

// Reeks (intern) → ploegen (naam + vast thuisuur). Codes uit de bron: 1ND→1NAD, REGD→RDA/RDB,
// 1NH→1NAH, 1NHB→1NAHB, 2NH→2NAH, 2NHB→2NAHB, REGH→RHA/RHB, RRL→recreatief.
const COMPETITIE: { reeks: Reeks; clubs: Entry[] }[] = [
  {
    reeks: '1NAD',
    clubs: [
      ['t Botterken Baasrode', 'za 20:00'],
      ['Grenskracht Menen', 'za 15:00'],
      ['Atlas Varsenare', 'zo 9:00'],
      ['WWR Ingelmunster', 'zo 9:00'],
      ['KRB Jabbeke', 'zo 11:30'],
      ['KBC Heist', 'za 18:30'],
      ['KBC Male', 'za 16:00'],
      ['KBC St. Michiels A', 'za 13:30'],
      ['KBC St. Michiels B', 'za 14:45'],
      ['t Klaverken Buggenhout', 'zo 16:15'],
      ['KBK Ichtegem', 'zo 10:15'],
    ],
  },
  {
    reeks: 'LD',
    clubs: [
      ['D&W Koekelare', 'za 9:00'],
      ['KBC Maldegem-Donk', 'zo 10:00'],
      ['Grenskracht Menen', 'za 10:15'],
      ['Sporting Brugge', 'za 18:45'],
      ['KRB Jabbeke', 'zo 10:15'],
      ['KBC Male', 'za 17:15'],
      ['KBC St. Michiels', 'za 14:00'],
      ['Noordster Dudzele', 'za 20:00'],
      ['t Botterken Baasrode', 'za 20:00'],
    ],
  },
  {
    reeks: 'RDA',
    clubs: [
      ['D&W Koekelare', 'za 9:00'],
      ['t Botterken Baasrode', 'za 20:00'],
      ['KBK Temse', 'zo 10:45'],
      ['Grenskracht Menen', 'za 13:45'],
      ['Atlas Varsenare', 'zo 11:30'],
      ['HO Beitem', 'zo 9:00'],
      ['KRB Jabbeke', 'zo 9:00'],
      ['KBC Heist A', 'za 17:15'],
      ['KBC St. Michiels', 'za 17:15'],
      ['Avanti Lissewege', 'za 16:15'],
      ['t Klaverken Buggenhout A', 'zo 12:30'],
      ['t Klaverken Buggenhout B', 'zo 15:00'],
      ['KBK Ichtegem', 'zo 9:00'],
    ],
  },
  {
    reeks: 'RDB',
    clubs: [
      ['t Botterken Baasrode', 'za 20:00'],
      ['Grenskracht Menen', 'za 9:00'],
      ['HO Beitem', 'zo 10:15'],
      ['KRB Jabbeke', 'zo 11:15'],
      ['KBC Heist', 'za 16:00'],
      ['KBC Male', 'za 15:00'],
      ['KBC St. Michiels', 'za 18:30'],
      ['Noordster Dudzele', 'za 18:45'],
      ['Avanti Lissewege', 'za 10:00'],
      ['t Klaverken Buggenhout A', 'zo 13:45'],
      ['KBK Ichtegem', 'zo 11:30'],
      ['t Klaverken Buggenhout B', 'zo 15:00'],
    ],
  },
  {
    reeks: '1NAH',
    clubs: [
      ['Krachtbal Snellegem', 'za 18:45'],
      ['D&W Koekelare', 'za 18:00'],
      ['t Botterken Baasrode', 'za 20:00'],
      ['Grenskracht Menen', 'za 14:15'],
      ['HO Beitem', 'zo 11:30'],
      ['Sporting Brugge', 'za 20:00'],
      ['KRB Jabbeke', 'zo 10:15'],
      ['KBK Ichtegem', 'zo 11:30'],
      ['KBC Male', 'za 19:45'],
      ['Osiris Aalst', 'za 18:00'],
      ['KBC St. Michiels', 'za 17:15'],
      ['t Klaverken Buggenhout', 'zo 16:15'],
    ],
  },
  {
    reeks: '1NAHB',
    clubs: [
      ['Krachtbal Snellegem', 'za 17:30'],
      ['D&W Koekelare', 'za 18:00'],
      ['t Botterken Baasrode', 'za 18:45'],
      ['Grenskracht Menen', 'za 13:00'],
      ['HO Beitem', 'zo 10:15'],
      ['Sporting Brugge', 'za 18:45'],
      ['KRB Jabbeke', 'zo 9:00'],
      ['KBK Ichtegem', 'zo 10:15'],
      ['KBC Male', 'za 18:30'],
      ['Osiris Aalst', 'za 16:45'],
      ['KBC St. Michiels', 'za 16:00'],
      ['t Klaverken Buggenhout', 'zo 15:00'],
    ],
  },
  {
    reeks: '2NAH',
    clubs: [
      ['D&W Koekelare', 'za 18:00'],
      ['KBK Temse', 'zo 10:45'],
      ['HO Beitem', 'zo 10:15'],
      ['WWR Ingelmunster', 'zo 10:15'],
      ['KBC Heist', 'za 20:00'],
      ['KBC Male', 'za 14:45'],
      ['KBC St. Michiels', 'za 19:45'],
      ['Avanti Lissewege', 'za 20:00'],
      ['KSVV Inter Assebroek', 'za 19:15'],
    ],
  },
  {
    reeks: '2NAHB',
    clubs: [
      ['D&W Koekelare', 'za 18:00'],
      ['KBK Temse', 'zo 9:30'],
      ['HO Beitem', 'zo 9:00'],
      ['WWR Ingelmunster', 'zo 9:00'],
      ['KBC Heist', 'za 18:45'],
      ['KBC Male', 'za 13:30'],
      ['KBC St. Michiels', 'za 18:30'],
      ['Avanti Lissewege', 'za 18:45'],
      ['KSVV Inter Assebroek', 'za 18:00'],
    ],
  },
  {
    reeks: 'LH',
    clubs: [
      ['KB Moerdamme', 'za 20:00'],
      ['Atlas Varsenare', 'zo 10:15'],
      ['HO Beitem', 'zo 9:00'],
      ['KBC Aalter', 'za 19:30'],
      ['KBC St. Michiels', 'zo 10:30'],
      ['Z.A.K. Beveren', 'zo 9:30'],
      ['KBK Ichtegem', 'zo 9:00'],
      ['KSVV Inter Assebroek', 'za 16:45'],
      ['KBC Opstal', 'za 19:00'],
    ],
  },
  {
    reeks: 'RHA',
    clubs: [
      ['D&W Koekelare', 'za 9:00'],
      ['KBK Temse', 'zo 9:30'],
      ['Atlas Varsenare', 'zo 9:00'],
      ['KBC Aalter', 'za 18:15'],
      ['Helios Halle', 'zo 10:00'],
      ['KRB Jabbeke', 'zo 10:15'],
      ["Buffalo's Sijsele", 'zo 9:00'],
      ['KBC Male', 'za 16:15'],
      ['KBC St. Michiels A', 'za 13:30'],
      ['KBC St. Michiels B', 'za 16:00'],
      ['t Klaverken Buggenhout', 'zo 13:45'],
      ['KBK Ichtegem', 'zo 9:00'],
      ['Krachtbal Snellegem', 'za 16:15'],
    ],
  },
  {
    reeks: 'RHB',
    clubs: [
      ['KSVV Inter Assebroek', 'za 15:30'],
      ['t Klaverken Buggenhout', 'zo 12:30'],
      ['Noordster Dudzele', 'za 17:30'],
      ['KBC St. Michiels', 'za 14:45'],
      ['KBC Male', 'za 17:30'],
      ['KBC Heist', 'za 17:30'],
      ['KRB Jabbeke', 'zo 11:30'],
      ['Sporting Brugge', 'za 17:30'],
      ['KBC Aalter', 'za 17:00'],
      ['HO Beitem', 'zo 11:30'],
      ['Grenskracht Menen', 'za 15:30'],
      ['t Botterken Baasrode', 'za 20:00'],
      ['D&W Koekelare', 'za 9:00'],
    ],
  },
  {
    reeks: 'recreatief',
    clubs: [
      ['KBC Edegem', 'zo 10:30'],
      ['HO Grote Brogel', 'za 18:00'],
      ['PJ Kaulille', 'za 19:00'],
      ['KBC Overpelt', 'zo 10:30'],
      ['Lozen Bocholt', 'zo 11:00'],
    ],
  },
  {
    reeks: 'U18J',
    clubs: [
      ['Krachtbal Snellegem', 'za 15:00'],
      ['t Botterken Baasrode A', 'za 17:30'],
      ['Grenskracht Menen', 'za 11:00'],
      ['HO Beitem', 'za 16:30'],
      ['KRB Jabbeke', 'zo 9:00'],
      ['t Botterken Baasrode B', 'za 17:30'],
      ['KBC St. Michiels', 'za 10:00'],
      ['Avanti Lissewege', 'za 17:30'],
      ['KBK Ichtegem', 'zo 9:00'],
      ['t Klaverken Buggenhout', 'zo 16:15'],
      ['KBC Aalter', 'za 15:45'],
      ['Krachtbal Torhout', 'zo 13:00'],
      ['D&W Koekelare', 'za 16:00'],
    ],
  },
  {
    reeks: 'U18M',
    clubs: [
      ['D&W Koekelare', 'za 9:00'],
      ['HO Beitem', 'zo 11:30'],
      ['KRB Jabbeke', 'zo 10:00'],
      ['KBC St. Michiels', 'za 10:00'],
      ['Noordster Dudzele', 'za 15:15'],
      ['Avanti Lissewege', 'za 11:15'],
      ['KBK Ichtegem', 'zo 10:15'],
    ],
  },
  {
    reeks: 'U16J',
    clubs: [
      ['D&W Koekelare A', 'za 9:00'],
      ['D&W Koekelare B', 'za 9:00'],
      ['Krachtbal Torhout', 'zo 12:00'],
      ['KBK Temse', 'zo 12:00'],
      ['Grenskracht Menen', 'za 10:00'],
      ['HO Beitem', 'za 17:00'],
      ['Sporting Brugge', 'za 10:30'],
      ['KRB Jabbeke', 'zo 11:30'],
      ["Buffalo's Sijsele", 'zo 11:15'],
      ['Avanti Lissewege', 'za 15:15'],
      ['t Klaverken Buggenhout A', 'zo 13:45'],
      ['t Klaverken Buggenhout B', 'zo 15:00'],
      ['KBK Ichtegem', 'zo 10:15'],
    ],
  },
  {
    reeks: 'U16M',
    clubs: [
      ['Krachtbal Snellegem', 'za 20:00'],
      ['D&W Koekelare', 'za 9:00'],
      ['t Botterken Baasrode', 'za 17:30'],
      ['Grenskracht Menen', 'za 9:00'],
      ['HO Beitem', 'za 15:00'],
      ['Sporting Brugge', 'za 11:30'],
      ['KRB Jabbeke', 'zo 9:00'],
      ["Buffalo's Sijsele", 'za 10:30'],
      ['KBC St. Michiels', 'za 11:15'],
      ['Noordster Dudzele', 'za 14:15'],
      ['Avanti Lissewege', 'za 9:30'],
      ['t Klaverken Buggenhout', 'zo 16:15'],
      ['KBK Ichtegem', 'zo 11:30'],
    ],
  },
  {
    reeks: 'U14J',
    clubs: [
      ['Krachtbal Snellegem', 'za 14:00'],
      ['Krachtbal Torhout', 'zo 11:00'],
      ['Grenskracht Menen', 'za 12:00'],
      ['HO Beitem', 'za 16:00'],
      ['KBC Aalter', 'za 14:45'],
      ['KBC Heist', 'za 14:45'],
      ['Avanti Lissewege', 'za 14:15'],
      ['KBK Ichtegem', 'zo 9:15'],
      ['t Klaverken Buggenhout', 'zo 13:45'],
      ['KBC Male', 'za 10:00'],
      ["Buffalo's Sijsele", 'zo 10:15'],
      ['WWR Ingelmunster', 'zo 10:15'],
      ['Atlas Varsenare', 'zo 12:15'],
      ['t Botterken Baasrode', 'za 16:30'],
      ['D&W Koekelare', 'za 9:00'],
    ],
  },
  {
    reeks: 'U14M',
    clubs: [
      ['Krachtbal Snellegem', 'za 12:00'],
      ['t Botterken Baasrode', 'za 16:30'],
      ['Grenskracht Menen', 'za 12:30'],
      ['Atlas Varsenare', 'zo 10:15'],
      ['HO Beitem', 'za 14:00'],
      ["Buffalo's Sijsele", 'za 9:30'],
      ['KBC Male', 'za 11:00'],
      ['KBC St. Michiels', 'za 12:30'],
      ['Noordster Dudzele', 'za 16:30'],
      ['Avanti Lissewege', 'za 10:30'],
      ['t Klaverken Buggenhout', 'zo 12:30'],
      ['KBK Ichtegem', 'zo 11:15'],
    ],
  },
  {
    reeks: 'U12',
    clubs: [
      ['D&W Koekelare', 'za 9:00'],
      ['Krachtbal Torhout', 'zo 10:00'],
      ['Grenskracht Menen', 'za 11:30'],
      ['HO Beitem A', 'za 13:30'],
      ['HO Beitem B', 'za 15:30'],
      ['KRB Jabbeke', 'zo 11:30'],
      ['KBC Male', 'za 9:00'],
      ['Avanti Lissewege', 'za 11:30'],
      ['t Klaverken Buggenhout A', 'zo 12:30'],
      ['t Klaverken Buggenhout B', 'zo 11:15'],
      ['KBK Ichtegem', 'zo 9:00'],
      ['Krachtbal Snellegem', 'za 13:00'],
      ['KBC St. Michiels', 'za 12:30'],
      ['KBC Heist', 'za 13:30'],
      ['Sporting Brugge', 'za 9:30'],
      ['Atlas Varsenare', 'zo 11:15'],
      ['t Botterken Baasrode', 'za 16:30'],
    ],
  },
]

// Clubnaam = ploegnaam zonder achtervoegsel " A"/" B" (poule-aanduiding).
const clubNameOf = (teamName: string): string => teamName.replace(/\s+[AB]$/, '')

async function main() {
  const payload = await getPayload({ config: await config })

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

  let created = 0
  let skipped = 0
  for (const { reeks, clubs } of COMPETITIE) {
    const category = reeksCategorie(reeks)
    for (const [teamName, uur] of clubs) {
      const clubId = await getClub(clubNameOf(teamName))
      const existing = await payload.find({
        collection: 'teams',
        where: { and: [{ club: { equals: clubId } }, { reeks: { equals: reeks } }, { name: { equals: teamName } }] },
        limit: 1,
      })
      if (existing.docs[0]) {
        skipped += 1
        continue
      }
      await payload.create({
        collection: 'teams',
        data: { club: clubId, name: teamName, category, reeks, thuisUur: uur },
        overrideAccess: true,
      })
      created += 1
    }
  }

  console.info(`Competitie-seed klaar. Clubs: ${clubIdByName.size} · ploegen aangemaakt: ${created} · al aanwezig: ${skipped}`)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
