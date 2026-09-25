// Eenmalige import van het kampioenenarchief (KAMPIOENEN_DATA, overgenomen van
// krachtbal.be/kampioenen.php) in de 'kampioenen'-collection.
//   pnpm exec tsx scripts/import-kampioenen.ts
// Idempotent: matcht op seizoenKey en overschrijft het bestaande record i.p.v. te dupliceren, dus
// veilig om opnieuw te draaien (bv. na een correctie in kampioenen-data.ts, of tegen productie).
import 'dotenv/config'
import { getPayload } from 'payload'

import config from '../src/payload.config'
import { KAMPIOENEN_DATA } from './data/kampioenen-data'

async function main() {
  const payload = await getPayload({ config: await config })

  let created = 0
  let updated = 0

  for (const seizoen of KAMPIOENEN_DATA) {
    const bestaand = await payload.find({
      collection: 'kampioenen',
      where: { seizoenKey: { equals: seizoen.seizoenKey } },
      limit: 1,
      overrideAccess: true,
    })

    const data = {
      seizoen: seizoen.seizoen,
      seizoenKey: seizoen.seizoenKey,
      bron: `https://www.krachtbal.be/kampioenen.php?seizoen=${seizoen.seizoenKey}`,
      reeksen: seizoen.reeksen,
    }

    if (bestaand.docs.length > 0) {
      await payload.update({ collection: 'kampioenen', id: bestaand.docs[0].id, data, overrideAccess: true })
      updated += 1
    } else {
      await payload.create({ collection: 'kampioenen', data, overrideAccess: true })
      created += 1
    }
  }

  console.log(`Klaar: ${created} seizoenen aangemaakt, ${updated} bijgewerkt (totaal ${KAMPIOENEN_DATA.length}).`)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
