import type { Payload } from 'payload'

import { naamSleutel } from './season-import'
import { normalizeLogoFit, hasLogoAdjustment, type LogoFit } from './logo-fit'

export interface ClubLogoMeta {
  logoUrl: string | null
  logoFit: LogoFit | null
  colorPrimary: string | null
}

// Best-effort logo-opzoeking voor letterlijke archiefnamen (kampioenen/bekerwinnaars/referendum) —
// puur cosmetisch (welk logo tonen naast een naam), dus bij dubbele genormaliseerde namen in de
// 'clubs'-collection (zie enrich-club-contacts.ts) pakken we gewoon de eerste match, in
// tegenstelling tot de striktere enrichment-logica die ambiguë matches bewust overslaat.
export async function buildClubLogoLookup(payload: Payload, namen: string[]): Promise<Record<string, ClubLogoMeta>> {
  const uniekeNamen = [...new Set(namen.filter(Boolean))]
  if (uniekeNamen.length === 0) return {}

  const clubsRes = await payload
    .find({ collection: 'clubs', limit: 1000, overrideAccess: true, depth: 0 })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))

  const clubPerSleutel = new Map<string, Record<string, unknown>>()
  for (const club of clubsRes.docs as Record<string, unknown>[]) {
    const sleutel = naamSleutel(String(club.name ?? ''))
    if (sleutel && !clubPerSleutel.has(sleutel)) clubPerSleutel.set(sleutel, club)
  }

  const result: Record<string, ClubLogoMeta> = {}
  for (const naam of uniekeNamen) {
    const club = clubPerSleutel.get(naamSleutel(naam))
    if (!club) continue

    const logoUrl =
      club.logo && typeof club.logo === 'object'
        ? ((club.logo as { url?: string }).url ?? null)
        : (club.logoUrl as string) || null
    const fitRaw = normalizeLogoFit({
      zoom: club.logoZoom as number,
      offsetX: club.logoOffsetX as number,
      offsetY: club.logoOffsetY as number,
    })

    result[naam] = {
      logoUrl,
      logoFit: hasLogoAdjustment(fitRaw) ? fitRaw : null,
      colorPrimary: (club.colorPrimary as string) || null,
    }
  }
  return result
}
