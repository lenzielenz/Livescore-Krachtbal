// Eenmalige import van het referendum-archief (REFERENDUM_DATA, overgenomen van
// krachtbal.be/referendum.php) in de 'referendum-awards'-collection.
//   pnpm exec tsx scripts/import-referendum.ts
// Idempotent: matcht op prijs en overschrijft het bestaande record i.p.v. te dupliceren, dus veilig
// om opnieuw te draaien (bv. na een correctie in referendum-data.ts, of tegen productie).
import 'dotenv/config'
import { getPayload } from 'payload'

import config from '../src/payload.config'
import { REFERENDUM_DATA } from './data/referendum-data'

async function main() {
  const payload = await getPayload({ config: await config })

  let created = 0
  let updated = 0

  for (const prijs of REFERENDUM_DATA) {
    const bestaand = await payload.find({
      collection: 'referendum-awards',
      where: { prijs: { equals: prijs.prijs } },
      limit: 1,
      overrideAccess: true,
    })

    const data = {
      prijs: prijs.prijs,
      bron: 'https://www.krachtbal.be/referendum.php',
      winnaars: prijs.winnaars,
    }

    if (bestaand.docs.length > 0) {
      await payload.update({ collection: 'referendum-awards', id: bestaand.docs[0].id, data, overrideAccess: true })
      updated += 1
    } else {
      await payload.create({ collection: 'referendum-awards', data, overrideAccess: true })
      created += 1
    }
  }

  console.log(`Klaar: ${created} prijzen aangemaakt, ${updated} bijgewerkt (totaal ${REFERENDUM_DATA.length}).`)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
