import type { Payload } from 'payload'

import { loadAds } from '@/lib/ads'
import { authUser } from '@/lib/api-auth'
import { bouwKantineBorden } from '@/lib/kantine-borden'
import { getPayloadClient } from '@/lib/payload-client'

// Centrale kantinescherm-selectie. GET levert de gekozen wedstrijden als live-samenvattingen;
// POST bewaart de selectie (komma-gescheiden match-ids) op de settings-global. Geen login nodig:
// de kantine wordt ter plaatse bediend en de inzet is laag (enkel welke borden tonen).

async function readIds(payload: Payload): Promise<number[]> {
  const s = await payload.findGlobal({ slug: 'settings', depth: 0 }).catch(() => null)
  const raw = (s as { kantineMatchIds?: string | null } | null)?.kantineMatchIds ?? ''
  return String(raw)
    .split(',')
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
}

export async function GET() {
  try {
    const payload = await getPayloadClient()
    const ids = await readIds(payload)
    if (ids.length === 0) return Response.json({ ids, matches: [], ads: await loadAds(payload, 'kantine') })

    // Eén query voor alle gekozen wedstrijden samen, daarna gebatcht de standen (zie
    // kantine-borden.ts). Dit haalde vroeger elke wedstrijd apart op en bouwde er de volledige
    // matchstate van — ~10 query's per bord, sequentieel.
    const res = await payload.find({
      collection: 'matches',
      where: { id: { in: ids } },
      depth: 0,
      limit: ids.length,
    })
    // De volgorde van de selectie is de volgorde op het scherm; een `find` geeft ze niet terug.
    const opId = new Map(res.docs.map((m) => [m.id, m]))
    const docs = ids.map((id) => opId.get(id)).filter((m): m is (typeof res.docs)[number] => Boolean(m))
    const matches = await bouwKantineBorden(payload, docs)

    // De sponsors van het kantinescherm komen mee in hetzelfde antwoord: het scherm pollt toch
    // al, en zo verschijnt een nieuwe reclame vanzelf zonder de tv aan te raken.
    const ads = await loadAds(payload, 'kantine')
    return Response.json({ ids, matches, ads })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  let body: { ids?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }
  const ids = Array.isArray(body.ids)
    ? [...new Set(body.ids.map(Number).filter((n) => Number.isFinite(n) && n > 0))]
    : []
  try {
    const payload = await getPayloadClient()
    // Schermselectie wijzigen vereist een ingelogde operator (blokkeert anonieme defacement);
    // bewust soepel zodat casten "vanaf elk toestel" voor clubmedewerkers blijft werken.
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    await payload.updateGlobal({ slug: 'settings', data: { kantineMatchIds: ids.join(',') }, overrideAccess: true })
    return Response.json({ ok: true, ids })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}
