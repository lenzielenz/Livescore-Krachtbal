// Eenmalige import van het bekerwinnaars-archief (BEKERWINNAARS_DATA, overgenomen van
// krachtbal.be/bekerwinnaars.php) in de 'bekerwinnaars'-collection.
//   pnpm exec tsx scripts/import-bekerwinnaars.ts
// Idempotent: matcht op seizoenKey en overschrijft het bestaande record i.p.v. te dupliceren, dus
// veilig om opnieuw te draaien (bv. na een correctie in bekerwinnaars-data.ts, of tegen productie).
import 'dotenv/config'
import { getPayload } from 'payload'

import config from '../src/payload.config'
import { BEKERWINNAARS_DATA } from './data/bekerwinnaars-data'

async function main() {
  const payload = await getPayload({ config: await config })

  let created = 0
  let updated = 0

  for (const seizoen of BEKERWINNAARS_DATA) {
    const bestaand = await payload.find({
      collection: 'bekerwinnaars',
      where: { seizoenKey: { equals: seizoen.seizoenKey } },
      limit: 1,
      overrideAccess: true,
    })

    const data = {
      seizoen: seizoen.seizoen,
      seizoenKey: seizoen.seizoenKey,
      bron: `https://www.krachtbal.be/bekerwinnaars.php?seizoen=${seizoen.seizoenKey}`,
      winnaars: seizoen.winnaars,
    }

    if (bestaand.docs.length > 0) {
      await payload.update({ collection: 'bekerwinnaars', id: bestaand.docs[0].id, data, overrideAccess: true })
      updated += 1
    } else {
      await payload.create({ collection: 'bekerwinnaars', data, overrideAccess: true })
      created += 1
    }
  }

  console.log(`Klaar: ${created} seizoenen aangemaakt, ${updated} bijgewerkt (totaal ${BEKERWINNAARS_DATA.length}).`)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
