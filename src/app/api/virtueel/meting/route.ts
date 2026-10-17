import { isFederationLevel } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { clientIp, rateLimit } from '@/lib/sse-hub'
import { fpsVan, leesMeting, vatSamen, type Meting } from '@/lib/virtueel-meting'

export const dynamic = 'force-dynamic'

// Hoe vlot loopt het virtuele stadion (zie lib/virtueel-meting.ts)?
//  POST  — de browser stuurt elke minuut (en bij het sluiten) de stand van zijn bezoek; één record
//          per bezoek, dat telkens bijgewerkt wordt. Anoniem en zonder login (ook wie niet
//          ingelogd is, loopt rond), dus begrensd: kleine berichten, een tempo-limiet per IP, en
//          de server neemt enkel opgeschoonde cijfers aan. Schrijft niets anders dan metingen.
//  GET   — het overzicht voor de federatie: per plek en per grafische kaart, de traagste eerst.
//          ?dagen=7 (standaard 14, max 30), ?ruw=1 voor de losse metingen.

const BEWAAR_DAGEN = 30
const MAX_BYTES = 24_000

export async function POST(req: Request) {
  // Een zaal supporters zit vaak achter één IP (wifi van de kantine): ruim genoeg voor tientallen
  // bezoekers die elk één keer per minuut iets sturen.
  if (!rateLimit(`meting:${clientIp(req)}`, 60, 60_000)) return Response.json({ ok: false }, { status: 429 })
  const tekst = await req.text().catch(() => '')
  if (!tekst || tekst.length > MAX_BYTES) return Response.json({ error: 'Ongeldige meting.' }, { status: 400 })
  let ruw: unknown
  try {
    ruw = JSON.parse(tekst)
  } catch {
    return Response.json({ error: 'Ongeldige meting.' }, { status: 400 })
  }
  const meting = leesMeting(ruw)
  if (!meting || Object.keys(meting.plekken).length === 0) return Response.json({ error: 'Ongeldige meting.' }, { status: 400 })
  const payload = await getPayloadClient()
  const velden = { sessie: meting.sessie, gpu: meting.toestel.gpu, licht: meting.toestel.licht, duur: meting.duur, fps: fpsVan(meting), data: meting }
  const bestaand = await payload.find({ collection: 'virtuele-metingen', where: { sessie: { equals: meting.sessie } }, limit: 1, depth: 0, overrideAccess: true })
  if (bestaand.docs[0]) await payload.update({ collection: 'virtuele-metingen', id: bestaand.docs[0].id, data: velden, overrideAccess: true })
  else {
    await payload.create({ collection: 'virtuele-metingen', data: velden, overrideAccess: true })
    // Af en toe opruimen wat ouder is dan een maand.
    if (Math.random() < 0.05) {
      const grens = new Date(Date.now() - BEWAAR_DAGEN * 86_400_000).toISOString()
      await payload.delete({ collection: 'virtuele-metingen', where: { createdAt: { less_than: grens } }, overrideAccess: true }).catch(() => {})
    }
  }
  return Response.json({ ok: true })
}

export async function GET(req: Request) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user || !isFederationLevel(user)) return Response.json({ error: 'Enkel voor de federatie.' }, { status: 403 })
  const url = new URL(req.url)
  const dagen = Math.max(1, Math.min(BEWAAR_DAGEN, Number(url.searchParams.get('dagen')) || 14))
  const sinds = new Date(Date.now() - dagen * 86_400_000).toISOString()
  const r = await payload.find({ collection: 'virtuele-metingen', where: { updatedAt: { greater_than: sinds } }, sort: '-updatedAt', limit: 5000, depth: 0, overrideAccess: true })
  const metingen = r.docs.map((d) => leesMeting(d.data)).filter((m): m is Meting => m != null)
  const samenvatting = vatSamen(metingen)
  return Response.json(url.searchParams.get('ruw') ? { dagen, samenvatting, metingen } : { dagen, samenvatting })
}
