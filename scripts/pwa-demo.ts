import 'dotenv/config'
import { getPayload } from 'payload'

import { createTournament, planMatch, assignVeld, setHalfMinutes } from '../src/lib/tournament-engine'
import config from '../src/payload.config'

// Zet een nette tornooidag klaar waarmee `scripts/pwa-screenshots.ts` de schermafbeeldingen voor
// het installatievenster maakt.
//
// Waarom niet gewoon de bestaande demodag van de handleiding: die heet "Demotornooi handleiding",
// en dat leest in een etalage als restjes testdata. Waarom niet "de eerste de beste dag uit de
// database": een ontwikkeldatabase zit vol wegwerpwedstrijden uit testruns ("Thuis 1788385900…"),
// en een installatievenster met zulke namen erin is slechter dan géén schermafbeeldingen.
//
// Uitsluitend voor een LOKALE database — het script weigert een andere.

const GROEP = 'Krachtbaltornooi Sint-Michiels'
const PLOEGEN = ['KBC Male', 'Avanti Lissewege', 'Sporting Brugge', 'KRB Jabbeke']

async function main() {
  const url = process.env.DATABASE_URL ?? ''
  if (!url.startsWith('file:')) {
    console.error('Weigering: dit script is voor een lokale SQLite-database (DATABASE_URL=file:…).')
    process.exit(1)
  }

  const payload = await getPayload({ config: await config })

  // Bestaat de dag al? Eerst weg, zodat een tweede fotosessie niet op half gespeelde wedstrijden
  // van de vorige stuit.
  const oud = await payload.find({
    collection: 'tournaments', where: { groep: { equals: GROEP } }, limit: 50, overrideAccess: true,
  })
  for (const t of oud.docs) {
    await payload.delete({ collection: 'tournament-matches', where: { tournament: { equals: t.id } }, overrideAccess: true }).catch(() => {})
    await payload.delete({ collection: 'tournaments', id: t.id, overrideAccess: true }).catch(() => {})
  }

  const tournamentId = await createTournament(payload, {
    name: `${GROEP} — U14`,
    category: 'U14',
    method: 'manual',
    format: 'roundrobin',
    slots: PLOEGEN,
    groep: GROEP,
  })
  await setHalfMinutes(payload, tournamentId, 15)

  // Nette uren vanaf 14:00, om beurten veld 1 en 2 — het beeld dat op een tornooidag op het
  // scherm staat.
  const wedstrijden = await payload.find({
    collection: 'tournament-matches', where: { tournament: { equals: tournamentId } },
    sort: 'id', limit: 50, overrideAccess: true,
  })
  const nu = new Date()
  let i = 0
  for (const m of wedstrijden.docs) {
    const start = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate(), 14, i * 20)
    await planMatch(payload, m.id as number, start.toISOString())
    await assignVeld(payload, m.id as number, (i % 2) + 1)
    i += 1
  }

  console.log(JSON.stringify({ groep: GROEP, tournamentId, wedstrijden: wedstrijden.docs.length }))
  process.exit(0)
}

void main()
