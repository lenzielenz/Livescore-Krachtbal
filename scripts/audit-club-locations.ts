// Leesalleen audit: welke clubs hebben een logo (bestand of URL) — dus zichtbaar in gebruik op de
// site — en van die clubs, welke missen nog plaats/coördinaten/accommodatie/telefoon? Draait tegen
// productie om te bepalen of scripts/enrich-club-contacts.ts nog iets aan te vullen heeft, en welke
// logo-clubs daarna nog altijd een gat hebben (voor handmatige opvolging of een nieuwe scrape-ronde).
//   pnpm exec tsx scripts/audit-club-locations.ts
import 'dotenv/config'
import { getPayload } from 'payload'

import config from '../src/payload.config'

async function main() {
  const payload = await getPayload({ config: await config })
  const res = await payload.find({ collection: 'clubs', limit: 2000, overrideAccess: true, depth: 0 })
  const clubs = res.docs as unknown as {
    id: number
    name?: string | null
    analyseOnly?: boolean | null
    logo?: unknown
    logoUrl?: string | null
    plaats?: string | null
    lat?: number | null
    lng?: number | null
    accommodatie?: string | null
    telefoon?: string | null
  }[]

  const echte = clubs.filter((c) => !c.analyseOnly)
  const metLogo = echte.filter((c) => Boolean(c.logo) || Boolean(c.logoUrl && c.logoUrl.trim()))

  console.log(`\n${echte.length} echte clubs totaal, waarvan ${metLogo.length} met een logo (bestand of URL).\n`)

  const missendePlaats = metLogo.filter((c) => !c.plaats || !c.plaats.trim())
  const missendeCoords = metLogo.filter((c) => typeof c.lat !== 'number' || typeof c.lng !== 'number')
  const missendeAccommodatie = metLogo.filter((c) => !c.accommodatie || !c.accommodatie.trim())
  const missendeTelefoon = metLogo.filter((c) => !c.telefoon || !c.telefoon.trim())

  console.log(`Clubs met logo maar zonder plaats: ${missendePlaats.length}`)
  for (const c of missendePlaats) console.log(`  #${c.id}  ${c.name}`)

  console.log(`\nClubs met logo maar zonder coördinaten (lat/lng): ${missendeCoords.length}`)
  for (const c of missendeCoords) console.log(`  #${c.id}  ${c.name}  plaats=${c.plaats ?? '—'}`)

  console.log(`\nClubs met logo maar zonder accommodatie-tekst: ${missendeAccommodatie.length}`)
  for (const c of missendeAccommodatie) console.log(`  #${c.id}  ${c.name}`)

  console.log(`\nClubs met logo maar zonder telefoon: ${missendeTelefoon.length}`)
  for (const c of missendeTelefoon) console.log(`  #${c.id}  ${c.name}`)

  console.log(`\nKlaar.`)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
