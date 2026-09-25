// Vult ONTBREKENDE accommodatie-/contactvelden aan bij clubs die al in de 'clubs'-collection staan,
// met gegevens overgenomen van de individuele clubpagina's op krachtbal.be/club.php (zie
// scripts/data/club-contacts-data.ts).
//   pnpm exec tsx scripts/enrich-club-contacts.ts
//
// Matcht op club-naam via dezelfde genormaliseerde sleutel als de rest van de import-laag
// (naamSleutel uit src/lib/season-import.ts — lowercase, enkel a-z0-9), tegen zowel de officiële
// lijstnaam als elke bekende alias per club. Schrijft NOOIT een reeds ingevuld veld over — enkel
// velden die nu leeg zijn worden aangevuld. Idempotent en veilig om opnieuw te draaien: een tweede
// run vindt niets meer aan te vullen zodra alles ingevuld is.
//
// Ambigue matches (0 of >1 clubs voor dezelfde contactfiche) worden overgeslagen en gerapporteerd
// i.p.v. geraden — controleer die na het draaien handmatig in de admin.
import 'dotenv/config'
import { getPayload } from 'payload'

import config from '../src/payload.config'
import { naamSleutel } from '../src/lib/season-import'
import { CLUB_CONTACTS_DATA } from './data/club-contacts-data'

const VULBARE_VELDEN = ['accommodatie', 'plaats', 'telefoon', 'website', 'secretarisNaam', 'secretarisEmail', 'jeugdNaam', 'jeugdEmail'] as const

async function main() {
  const payload = await getPayload({ config: await config })

  const clubsRes = await payload.find({ collection: 'clubs', limit: 1000, overrideAccess: true, depth: 0 })
  const clubs = clubsRes.docs as unknown as Record<string, unknown>[]

  // sleutel -> lijst van clubs met die genormaliseerde naam (meestal 1, maar we houden rekening met dubbels).
  const clubsPerSleutel = new Map<string, Record<string, unknown>[]>()
  for (const club of clubs) {
    const sleutel = naamSleutel(String(club.name ?? ''))
    if (!sleutel) continue
    const lijst = clubsPerSleutel.get(sleutel) ?? []
    lijst.push(club)
    clubsPerSleutel.set(sleutel, lijst)
  }

  let bijgewerkt = 0
  let alVolledig = 0
  const onbekend: string[] = []
  const ambigu: string[] = []

  for (const contact of CLUB_CONTACTS_DATA) {
    const sleutels = [contact.naam, ...contact.aliassen].map(naamSleutel).filter(Boolean)
    const gevonden = new Map<number, Record<string, unknown>>()
    for (const sleutel of sleutels) {
      for (const club of clubsPerSleutel.get(sleutel) ?? []) {
        gevonden.set(club.id as number, club)
      }
    }

    if (gevonden.size === 0) {
      onbekend.push(contact.naam)
      continue
    }
    if (gevonden.size > 1) {
      ambigu.push(`${contact.naam} → ${[...gevonden.values()].map((c) => c.name).join(', ')}`)
      continue
    }

    const club = [...gevonden.values()][0]
    const patch: Record<string, string> = {}
    for (const veld of VULBARE_VELDEN) {
      const huidig = club[veld]
      const nieuw = (contact as unknown as Record<string, string>)[veld]
      const isLeeg = huidig == null || (typeof huidig === 'string' && !huidig.trim())
      if (isLeeg && nieuw && nieuw.trim()) {
        patch[veld] = nieuw
      }
    }

    if (Object.keys(patch).length === 0) {
      alVolledig += 1
      continue
    }

    await payload.update({ collection: 'clubs', id: club.id as number, data: patch, overrideAccess: true })
    bijgewerkt += 1
    console.log(`  ${club.name}: ${Object.keys(patch).join(', ')}`)
  }

  console.log(`\nKlaar: ${bijgewerkt} clubs aangevuld, ${alVolledig} al volledig, ${onbekend.length} zonder match, ${ambigu.length} ambigu.`)
  if (onbekend.length) console.log(`Zonder match (controleer handmatig): ${onbekend.join(', ')}`)
  if (ambigu.length) console.log(`Ambigu (meerdere clubs met dezelfde genormaliseerde naam): ${ambigu.join(' | ')}`)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
