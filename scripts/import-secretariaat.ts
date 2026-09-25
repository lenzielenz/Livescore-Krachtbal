// Eenmalige import van de secretariaat-contactgegevens, overgenomen van
// krachtbal.be/secretariaat.php, in de 'secretariaat'-global.
//   pnpm exec tsx scripts/import-secretariaat.ts
// Idempotent: een global heeft altijd precies één record, dus dit overschrijft telkens gewoon dat
// ene record — veilig om opnieuw te draaien (bv. na een correctie, of tegen productie).
import 'dotenv/config'
import { getPayload } from 'payload'

import config from '../src/payload.config'

async function main() {
  const payload = await getPayload({ config: await config })

  await payload.updateGlobal({
    slug: 'secretariaat',
    data: {
      adres: 'Oude Burg 23, 8000 Brugge - bezoek enkel na afspraak',
      routeUrl: 'https://www.krachtbal.be/Route_KSplus.pdf',
      telefoon: '0474/84.99.14',
      telefoonAlt: '02/246 67 01',
      email: 'info@krachtbal.be',
      meldenUitslagen: 'on-line en info@krachtbal.be',
      federatieApiContact: 'camille.vandensteen@okrapsportplus.be',
      bron: 'https://www.krachtbal.be/secretariaat.php',
    },
    overrideAccess: true,
  })

  console.log('Klaar: secretariaat-gegevens bijgewerkt.')
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
