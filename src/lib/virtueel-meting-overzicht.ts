import type { Payload } from 'payload'

import { analyseer, type Knelpunt } from './virtueel-analyse'
import { leesMeting, vatSamen, type Meting, type Samenvatting } from './virtueel-meting'

// Het overzicht van de metingen van het virtuele stadion, voor GET /api/virtueel/meting en de pagina
// /federatie/stadion: de metingen van de laatste dagen, samengevat en geanalyseerd. Enkel aanroepen
// na een federatie-check (overrideAccess).

export const BEWAAR_DAGEN = 30

/** Welke versie van de site draait (de commit op Railway), om metingen per versie te vergelijken. */
export function siteVersie(): string {
  return (process.env.RAILWAY_GIT_COMMIT_SHA || '').slice(0, 7) || 'lokaal'
}

export type Overzicht = { dagen: number; samenvatting: Samenvatting; analyse: Knelpunt[]; metingen: Meting[] }

export async function laadOverzicht(payload: Payload, dagen: number): Promise<Overzicht> {
  const d = Math.max(1, Math.min(BEWAAR_DAGEN, Math.round(dagen) || 14))
  const sinds = new Date(Date.now() - d * 86_400_000).toISOString()
  const r = await payload.find({ collection: 'virtuele-metingen', where: { updatedAt: { greater_than: sinds } }, sort: '-updatedAt', limit: 5000, depth: 0, overrideAccess: true })
  const metingen: Meting[] = []
  for (const doc of r.docs) {
    const m = leesMeting(doc.data)
    if (!m) continue
    const versie = (doc.data as { versie?: unknown } | null)?.versie
    if (typeof versie === 'string' && /^[\w.-]{1,40}$/.test(versie)) m.versie = versie
    m.dag = String(doc.updatedAt ?? '').slice(0, 10) || undefined
    metingen.push(m)
  }
  const samenvatting = vatSamen(metingen)
  return { dagen: d, samenvatting, analyse: analyseer(samenvatting), metingen }
}
