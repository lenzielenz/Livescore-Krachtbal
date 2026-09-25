// Rapporteert clubs die meermaals onder dezelfde genormaliseerde naam (naamSleutel) voorkomen —
// bedoeld als opkuislijst voor de admin, gevraagd na de erelijst-club-enrichment die zulke
// ambiguë matches bewust oversloeg i.p.v. te raden (zie enrich-club-contacts.ts).
//   pnpm exec tsx scripts/report-duplicate-clubs.ts
//
// Puur lezend — schrijft niets. Een club mag bewust twee keer bestaan onder dezelfde naam (een
// echt competitierecord + een analyse-only schaduwrecord, zie collections/Clubs.ts), dus elke
// groep wordt gelabeld als "verwacht (competitie + analyse-only)" of "controleren" (alle andere
// combinaties — bv. twee keer analyseOnly=false, of drie/meer records, of een letterlijk andere
// schrijfwijze binnen dezelfde genormaliseerde naam).
import 'dotenv/config'
import { getPayload } from 'payload'

import config from '../src/payload.config'
import { naamSleutel } from '../src/lib/season-import'

async function main() {
  const payload = await getPayload({ config: await config })

  const clubsRes = await payload.find({ collection: 'clubs', limit: 2000, overrideAccess: true, depth: 0 })
  const clubs = clubsRes.docs as unknown as { id: number; name?: string | null; analyseOnly?: boolean | null; plaats?: string | null }[]

  const perSleutel = new Map<string, typeof clubs>()
  for (const club of clubs) {
    const sleutel = naamSleutel(String(club.name ?? ''))
    if (!sleutel) continue
    const lijst = perSleutel.get(sleutel) ?? []
    lijst.push(club)
    perSleutel.set(sleutel, lijst)
  }

  const groepen = [...perSleutel.entries()].filter(([, leden]) => leden.length > 1).sort((a, b) => a[0].localeCompare(b[0]))

  console.log(`\n${groepen.length} groepen met meer dan één club onder dezelfde genormaliseerde naam:\n`)

  let verwacht = 0
  let controleren = 0
  for (const [sleutel, leden] of groepen) {
    const analyseOnlyCount = leden.filter((c) => c.analyseOnly).length
    const isVerwacht = leden.length === 2 && analyseOnlyCount === 1
    if (isVerwacht) verwacht += 1
    else controleren += 1

    console.log(`${isVerwacht ? '  verwacht ' : '⚠ CONTROLEREN'}  [${sleutel}]`)
    for (const c of leden) {
      const label = c.analyseOnly ? 'analyse-only' : 'competitie'
      console.log(`    #${c.id}  "${c.name}"  (${label})  plaats=${c.plaats ?? '—'}`)
    }
  }

  console.log(`\nKlaar: ${groepen.length} groepen — ${verwacht} verwacht (competitie + analyse-only paar), ${controleren} om te controleren.`)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
