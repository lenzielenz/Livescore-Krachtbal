import { NextResponse } from 'next/server'

import { getPayloadClient } from '@/lib/payload-client'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Verwijdert bezoekersfoto's bij nieuwsberichten waarvan de bewaartermijn (News.photosExpireAt,
// gekopieerd naar NewsPhotos.expiresAt bij het plaatsen) voorbij is — bv. de foto's bij "Dag van de
// Sportclub" die na de ingestelde datum weer weg moeten. De upload-route ruimt al op bij elke
// nieuwe foto voor hetzelfde artikel, maar een artikel waar niemand meer op plaatst na de
// vervaldatum wordt daardoor nooit opgeruimd — vandaar dit endpoint voor een scheduler (bv.
// dagelijks), zelfde beveiliging als /api/cron/uitslagen: enkel met het gedeelde geheim uit
// CRON_SECRET.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header = req.headers.get('authorization') ?? ''
  const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  const key = new URL(req.url).searchParams.get('key') ?? ''
  return bearer === secret || key === secret
}

async function run(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json(
      { error: process.env.CRON_SECRET ? 'Ongeldige sleutel.' : 'Geen CRON_SECRET ingesteld.' },
      { status: 401 },
    )
  }

  const payload = await getPayloadClient()
  try {
    const { docs } = await payload.find({
      collection: 'news-photos',
      where: { expiresAt: { less_than: new Date().toISOString() } },
      depth: 0,
      limit: 1000,
      overrideAccess: true,
    })
    for (const doc of docs) {
      await payload.delete({ collection: 'news-photos', id: doc.id, overrideAccess: true }).catch(() => {})
    }
    return NextResponse.json({ ok: true, verwijderd: docs.length })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export const GET = run
export const POST = run
