// Zet de coverfoto op het nieuwsbericht "Dag van de Sportclub" — het eigen ontworpen
// banner-beeld (scripts/assets/dag-van-de-sportclub-cover.png, huisstijl-kleuren), i.p.v. de
// campagnegrafiek uit de opdracht (die Instagram-UI-chrome en andermans accountnaam bevatte).
//   pnpm exec tsx scripts/set-dag-van-de-sportclub-cover.ts
// Idempotent: matcht op alt-tekst en werkt dat record bij (ook het bestand zelf) i.p.v. te
// dupliceren — dus ook veilig opnieuw te draaien na een revisie van de banner.
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getPayload } from 'payload'

import config from '../src/payload.config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TITLE = 'Dag van de Sportclub: breng de krachtbalwereld naar school'
const ALT = 'Dag van de Sportclub — 30 september 2026'

async function main() {
  const payload = await getPayload({ config: await config })

  const bestaandArtikel = await payload.find({
    collection: 'news',
    where: { title: { equals: TITLE } },
    limit: 1,
    overrideAccess: true,
  })
  if (bestaandArtikel.docs.length === 0) {
    throw new Error(`Nieuwsbericht "${TITLE}" niet gevonden — draai eerst scripts/seed-dag-van-de-sportclub-news.ts.`)
  }
  const artikel = bestaandArtikel.docs[0]

  const bestaandMedia = await payload.find({
    collection: 'media',
    where: { alt: { equals: ALT } },
    limit: 1,
    overrideAccess: true,
  })

  const filePath = path.join(__dirname, 'assets', 'dag-van-de-sportclub-cover.png')
  const buf = fs.readFileSync(filePath)
  const file = { data: buf, mimetype: 'image/png', name: 'dag-van-de-sportclub-cover.png', size: buf.length }

  let mediaId: number
  if (bestaandMedia.docs.length > 0) {
    mediaId = bestaandMedia.docs[0].id
    await payload.update({ collection: 'media', id: mediaId, data: { alt: ALT }, file, overrideAccess: true })
    console.log(`Bestaande coverfoto bijgewerkt: media #${mediaId}.`)
  } else {
    const created = await payload.create({ collection: 'media', data: { alt: ALT }, file, overrideAccess: true })
    mediaId = created.id
    console.log(`Coverfoto geüpload: media #${mediaId}.`)
  }

  await payload.update({ collection: 'news', id: artikel.id, data: { coverImage: mediaId }, overrideAccess: true })
  console.log(`Nieuwsbericht #${artikel.id} bijgewerkt met coverImage #${mediaId}.`)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
