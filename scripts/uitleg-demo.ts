import 'dotenv/config'
import { getPayload } from 'payload'

import { createTournament, planMatch, assignVeld, setHalfMinutes } from '../src/lib/tournament-engine'
import config from '../src/payload.config'

// Zet de vaste demo-tornooidag klaar waarmee `scripts/uitleg-screenshots.ts` de handleiding
// fotografeert, plus de beheerder die kan inloggen.
//
// Waarom een eigen tornooidag en niet "de eerste de beste uit de database": de handleiding moet
// er bij elke herbouw hetzelfde uitzien, met nette uren en niets dat al gespeeld is. Een
// screenshot waarop toevallig een wedstrijd van 4671 minuten live staat, leert niemand iets.
//
// Uitsluitend voor een LOKALE database — het script weigert een andere. De schermen tonen
// knoppen die enkel een beheerder ziet (Aantekenen op het dagprogramma), dus de fotograaf moet
// ingelogd zijn; vandaar ook het wegwerp-account. Dat wachtwoord is geen geheim: het bestaat
// alleen in een database op je eigen machine.

const EMAIL = process.env.UITLEG_EMAIL ?? 'handleiding@voorbeeld.be'
const WACHTWOORD = process.env.UITLEG_WACHTWOORD ?? 'handleiding-demo-1234'
export const DEMO_GROEP = 'Demotornooi handleiding'
const PLOEGEN = ['KBC Male', 'Avanti Lissewege', 'Sporting Brugge', 'KRB Jabbeke']

async function main() {
  const url = process.env.DATABASE_URL ?? ''
  if (!url.startsWith('file:')) {
    console.error('Weigering: dit script is voor een lokale SQLite-database (DATABASE_URL=file:…).')
    process.exit(1)
  }

  const payload = await getPayload({ config: await config })

  // ── De beheerder ──
  const bestaandeUser = await payload.find({
    collection: 'users', where: { email: { equals: EMAIL } }, limit: 1, overrideAccess: true,
  })
  if (bestaandeUser.docs[0]) {
    await payload.update({
      collection: 'users', id: bestaandeUser.docs[0].id,
      data: { password: WACHTWOORD, roles: ['admin'] }, overrideAccess: true,
    })
  } else {
    await payload.create({
      collection: 'users',
      data: { email: EMAIL, password: WACHTWOORD, name: 'Handleiding', roles: ['admin'] },
      overrideAccess: true,
    })
  }

  // ── De tornooidag ──
  // Bestaat hij al? Dan eerst weg, zodat een tweede fotosessie niet op half gespeelde
  // wedstrijden van de vorige stuit.
  const oud = await payload.find({
    collection: 'tournaments', where: { groep: { equals: DEMO_GROEP } }, limit: 50, overrideAccess: true,
  })
  for (const t of oud.docs) {
    // Tornooiwedstrijden zijn een eigen collection ('tournament-matches'), niet de gewone
    // competitiewedstrijden.
    await payload.delete({ collection: 'tournament-matches', where: { tournament: { equals: t.id } }, overrideAccess: true }).catch(() => {})
    await payload.delete({ collection: 'tournaments', id: t.id, overrideAccess: true }).catch(() => {})
  }

  const tournamentId = await createTournament(payload, {
    name: `${DEMO_GROEP} — U14`,
    category: 'U14',
    method: 'manual',
    format: 'roundrobin',
    slots: PLOEGEN,
    groep: DEMO_GROEP,
  })
  await setHalfMinutes(payload, tournamentId, 10)

  // Nette uren vanaf 18:00 vandaag, en om beurten veld 1 en 2 — precies het beeld dat aan een
  // tornooitafel op het scherm staat.
  const wedstrijden = await payload.find({
    collection: 'tournament-matches', where: { tournament: { equals: tournamentId } },
    sort: 'id', limit: 50, overrideAccess: true,
  })
  const nu = new Date()
  let i = 0
  for (const m of wedstrijden.docs) {
    const start = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate(), 18, i * 15)
    await planMatch(payload, m.id as number, start.toISOString())
    await assignVeld(payload, m.id as number, (i % 2) + 1)
    i += 1
  }

  console.log(JSON.stringify({ groep: DEMO_GROEP, tournamentId, wedstrijden: wedstrijden.docs.length, user: EMAIL }))
  process.exit(0)
}

void main()
