import type { Payload, Where } from 'payload'

import { normaliseerUitsnede, type ReclameUitsnede } from './reclame'

export type AdAchtergrond = 'donker' | 'wit' | 'geen'

export type Ad = {
  id: number
  url: string
  naam: string
  /** Bijgesneden in de admin: zoom, verschuiving en draaiing (zie lib/reclame.ts). */
  uitsnede: ReclameUitsnede
  /** De achtergrond van de tegel — een logo dat op wit hoort, valt weg op een donkere balk. */
  achtergrond: AdAchtergrond
}

// Actieve reclames ophalen voor een bepaalde plek (bv. 'veldscherm'). "Overal" telt overal mee.
// Server-side; geeft enkel reclames met een geldige afbeelding terug.
export async function loadAds(payload: Payload, plek: string): Promise<Ad[]> {
  const where: Where = {
    and: [{ actief: { equals: true } }, { or: [{ plaatsing: { equals: plek } }, { plaatsing: { equals: 'overal' } }] }],
  }
  const res = await payload
    .find({ collection: 'advertenties', where, sort: 'volgorde', depth: 1, limit: 50 })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const ads: Ad[] = []
  for (const d of res.docs) {
    const img = (d as { afbeelding?: unknown }).afbeelding
    const url = img && typeof img === 'object' ? (img as { url?: string }).url : null
    if (!url) continue
    const r = d as { zoom?: number; offsetX?: number; offsetY?: number; rotatie?: number; achtergrond?: string }
    const acht = r.achtergrond === 'wit' || r.achtergrond === 'geen' ? r.achtergrond : 'donker'
    ads.push({
      id: Number((d as { id: number }).id),
      url,
      naam: String((d as { naam?: unknown }).naam ?? ''),
      uitsnede: normaliseerUitsnede(r),
      achtergrond: acht,
    })
  }
  return ads
}
