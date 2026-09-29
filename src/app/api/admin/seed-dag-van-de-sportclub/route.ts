import fs from 'fs'
import path from 'path'
import { NextResponse } from 'next/server'

import { getPayloadClient } from '@/lib/payload-client'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Eenmalige provisioning van het nieuwsbericht "Dag van de Sportclub" ÉN zijn coverfoto op
// productie. `scripts/seed-dag-van-de-sportclub-news.ts` en `scripts/set-dag-van-de-sportclub-
// cover.ts` doen exact hetzelfde lokaal, maar de coverfoto moet als bestand op de Railway
// Volume van de live app terechtkomen (media/) — dat kan geen los script tegen een externe
// DATABASE_URL, enkel code die al binnen déze deployment draait (met dezelfde
// RAILWAY_VOLUME_MOUNT_PATH). Vandaar dit endpoint i.p.v. het script rechtstreeks tegen
// productie te draaien.
//
// Beveiliging: eigen secret (SEED_SECRET), niet CRON_SECRET — dit is geen terugkerende taak.
// Idempotent (matcht op title/alt), dus veilig om per ongeluk twee keer te raken.
function authorized(req: Request): boolean {
  const secret = process.env.SEED_SECRET
  if (!secret) return false
  const header = req.headers.get('authorization') ?? ''
  const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  const key = new URL(req.url).searchParams.get('key') ?? ''
  return bearer === secret || key === secret
}

const TITLE = 'Dag van de Sportclub: breng de krachtbalwereld naar school'
const ALT = 'Dag van de Sportclub — 30 september 2026'

const EXCERPT =
  'Op woensdag 30 september is het Dag van de Sportclub — breng je sportclub mee naar school en laat heel de klas kennismaken met krachtbal!'

const BODY = `Op woensdag 30 september 2026 is het weer zover: de Dag van de Sportclub. Scholen door heel Vlaanderen nodigen die dag sportclubs uit om even binnen te springen — en wij grijpen die kans natuurlijk met beide handen aan om de krachtbalwereld wat groter te maken.

Is jouw club of jouw kind erbij? Geef leerkrachten en klasgenoten een eerste kennismaking met krachtbal: leg uit hoe een worp telt, laat iemand een bal gooien, of vertel gewoon enthousiast over je sport. Iedere krachtbalclub die meedoet, draagt bij aan een dag vol sportplezier onder het motto #sportersbelevenmeer.

Was jij of je kind erbij op school? Deel het hier! Voeg hieronder een foto toe van je sportieveling in actie — zo brengen we de hele krachtbalwereld samen op één plek. De foto's blijven tot en met 5 oktober zichtbaar en worden daarna automatisch verwijderd.

Een initiatief van Vlaamse Sportfederatie, Netwerk Lokaal Sportbeleid, Sport Vlaanderen en meeV, mede gefinancierd door de Europese Unie.`

async function run(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json(
      { error: process.env.SEED_SECRET ? 'Ongeldige sleutel.' : 'Geen SEED_SECRET ingesteld.' },
      { status: 401 },
    )
  }

  const payload = await getPayloadClient()
  const publishedAt = new Date('2026-09-29T12:00:00+02:00').toISOString()
  const photosExpireAt = new Date('2026-10-05T23:59:59+02:00').toISOString()

  const bestaandArtikel = await payload.find({
    collection: 'news',
    where: { title: { equals: TITLE } },
    limit: 1,
    overrideAccess: true,
  })
  const artikelData = {
    title: TITLE,
    excerpt: EXCERPT,
    body: BODY,
    published: true,
    publishedAt,
    photosEnabled: true,
    photosExpireAt,
  }
  const artikel =
    bestaandArtikel.docs.length > 0
      ? await payload.update({ collection: 'news', id: bestaandArtikel.docs[0].id, data: artikelData, overrideAccess: true })
      : await payload.create({ collection: 'news', data: artikelData, overrideAccess: true })

  const filePath = path.join(process.cwd(), 'scripts', 'assets', 'dag-van-de-sportclub-cover.png')
  let mediaId: number | null = null
  if (fs.existsSync(filePath)) {
    const buf = fs.readFileSync(filePath)
    const file = { data: buf, mimetype: 'image/png', name: 'dag-van-de-sportclub-cover.png', size: buf.length }
    const bestaandMedia = await payload.find({ collection: 'media', where: { alt: { equals: ALT } }, limit: 1, overrideAccess: true })
    const media =
      bestaandMedia.docs.length > 0
        ? await payload.update({ collection: 'media', id: bestaandMedia.docs[0].id, data: { alt: ALT }, file, overrideAccess: true })
        : await payload.create({ collection: 'media', data: { alt: ALT }, file, overrideAccess: true })
    mediaId = media.id as number
    await payload.update({ collection: 'news', id: artikel.id, data: { coverImage: mediaId }, overrideAccess: true })
  }

  return NextResponse.json({ ok: true, newsId: artikel.id, mediaId })
}

export const GET = run
export const POST = run
