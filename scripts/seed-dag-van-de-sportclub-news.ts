// Eenmalige aanmaak/update van het nieuwsbericht "Dag van de Sportclub" (30 sept 2026), met
// bezoekersfoto's aan tot en met 5 oktober 2026 erna.
//   pnpm exec tsx scripts/seed-dag-van-de-sportclub-news.ts
// Idempotent: matcht op title en overschrijft het bestaande record i.p.v. te dupliceren, dus veilig
// om opnieuw te draaien (bv. na een tekstcorrectie, of tegen productie).
import 'dotenv/config'
import { getPayload } from 'payload'

import config from '../src/payload.config'

const TITLE = 'Dag van de Sportclub: breng de krachtbalwereld naar school'

const EXCERPT =
  'Op woensdag 30 september is het Dag van de Sportclub — breng je sportclub mee naar school en laat heel de klas kennismaken met krachtbal!'

const BODY = `Op woensdag 30 september 2026 is het weer zover: de Dag van de Sportclub. Scholen door heel Vlaanderen nodigen die dag sportclubs uit om even binnen te springen — en wij grijpen die kans natuurlijk met beide handen aan om de krachtbalwereld wat groter te maken.

Is jouw club of jouw kind erbij? Geef leerkrachten en klasgenoten een eerste kennismaking met krachtbal: leg uit hoe een worp telt, laat iemand een bal gooien, of vertel gewoon enthousiast over je sport. Iedere krachtbalclub die meedoet, draagt bij aan een dag vol sportplezier onder het motto #sportersbelevenmeer.

Was jij of je kind erbij op school? Deel het hier! Voeg hieronder een foto toe van je sportieveling in actie — zo brengen we de hele krachtbalwereld samen op één plek. De foto's blijven tot en met 5 oktober zichtbaar en worden daarna automatisch verwijderd.

Een initiatief van Vlaamse Sportfederatie, Netwerk Lokaal Sportbeleid, Sport Vlaanderen en meeV, mede gefinancierd door de Europese Unie.`

async function main() {
  const payload = await getPayload({ config: await config })

  const publishedAt = new Date('2026-09-29T12:00:00+02:00').toISOString()
  const photosExpireAt = new Date('2026-10-05T23:59:59+02:00').toISOString()

  const data = {
    title: TITLE,
    excerpt: EXCERPT,
    body: BODY,
    published: true,
    publishedAt,
    photosEnabled: true,
    photosExpireAt,
  }

  const bestaand = await payload.find({
    collection: 'news',
    where: { title: { equals: TITLE } },
    limit: 1,
    overrideAccess: true,
  })

  if (bestaand.docs.length > 0) {
    await payload.update({ collection: 'news', id: bestaand.docs[0].id, data, overrideAccess: true })
    console.log(`Bijgewerkt: nieuwsbericht #${bestaand.docs[0].id} ("${TITLE}").`)
  } else {
    const created = await payload.create({ collection: 'news', data, overrideAccess: true })
    console.log(`Aangemaakt: nieuwsbericht #${created.id} ("${TITLE}").`)
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
