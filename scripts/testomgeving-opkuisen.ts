import 'dotenv/config'
import { randomBytes } from 'node:crypto'
import { getPayload } from 'payload'

import { isTestOmgeving } from '../src/lib/omgeving'
import config from '../src/payload.config'

// Maakt een KOPIE van de live databank veilig voor de federatie-testomgeving (zie
// docs/TESTOMGEVING.md). Draai dit meteen na het terugzetten van de kopie, mét de variabelen van
// de testomgeving (DATABASE_URL van de test-Postgres, PLATFORM_OMGEVING=federatie-test).
//
// Wat het doet:
//  • medische ongevalsaangiftes en push-abonnementen weg (GDPR: horen niet in een testbank);
//  • spelers: geboortedatum → 1 januari van hetzelfde jaar (de categorie blijft dus kloppen);
//  • gebruikers: naam en e-mail vervangen door "Gebruiker <id>" / gebruiker-<id>@test.invalid, met
//    een willekeurig wachtwoord — behalve de beheerders uit TEST_ADMIN_EMAILS (komma-gescheiden),
//    die hun naam houden en het wachtwoord uit TEST_ADMIN_WACHTWOORD krijgen.
//
// Het script weigert te draaien buiten de testomgeving: per ongeluk tegen live is onomkeerbaar.

async function main() {
  if (!isTestOmgeving()) {
    console.error('Weigering: PLATFORM_OMGEVING staat niet op "federatie-test". Dit script raakt enkel de testomgeving.')
    process.exit(1)
  }
  const admins = new Set(
    (process.env.TEST_ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  )
  const adminWachtwoord = process.env.TEST_ADMIN_WACHTWOORD ?? ''
  if (admins.size > 0 && adminWachtwoord.length < 10) {
    console.error('Geef TEST_ADMIN_WACHTWOORD mee (minstens 10 tekens) voor de beheerders in TEST_ADMIN_EMAILS.')
    process.exit(1)
  }

  const payload = await getPayload({ config: await config })

  for (const collection of ['accidents', 'push-subscriptions'] as const) {
    const res = await payload.delete({ collection, where: { id: { exists: true } }, overrideAccess: true })
    console.log(`${collection}: ${res.docs.length} verwijderd`)
  }

  const spelers = await payload.find({ collection: 'players', where: { birthDate: { exists: true } }, limit: 0, pagination: false, depth: 0, overrideAccess: true })
  let spelersAangepast = 0
  for (const p of spelers.docs) {
    const jaar = new Date(String((p as { birthDate?: unknown }).birthDate)).getUTCFullYear()
    if (!Number.isFinite(jaar)) continue
    await payload.update({ collection: 'players', id: p.id, data: { birthDate: `${jaar}-01-01T00:00:00.000Z` }, overrideAccess: true })
    spelersAangepast++
  }
  console.log(`spelers: ${spelersAangepast} geboortedata afgerond op het jaar`)

  const users = await payload.find({ collection: 'users', limit: 0, pagination: false, depth: 0, overrideAccess: true })
  let anoniem = 0
  let beheer = 0
  for (const u of users.docs) {
    const email = String((u as { email?: unknown }).email ?? '').toLowerCase()
    if (admins.has(email)) {
      await payload.update({ collection: 'users', id: u.id, data: { password: adminWachtwoord }, overrideAccess: true })
      beheer++
      continue
    }
    await payload.update({
      collection: 'users',
      id: u.id,
      data: { name: `Gebruiker ${u.id}`, email: `gebruiker-${u.id}@test.invalid`, password: randomBytes(24).toString('hex') },
      overrideAccess: true,
    })
    anoniem++
  }
  console.log(`gebruikers: ${anoniem} geanonimiseerd, ${beheer} beheerder(s) behouden`)
  console.log('Klaar. De testomgeving staat vast in federatiemodus (zie src/lib/omgeving.ts).')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
