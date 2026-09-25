import type { Payload } from 'payload'

import { naamSleutel } from './season-import'
import { normalizeLogoFit, hasLogoAdjustment, type LogoFit } from './logo-fit'

export interface ClubLogoMeta {
  logoUrl: string | null
  logoFit: LogoFit | null
  colorPrimary: string | null
}

// Sommige clubs bestaan bewust twee keer onder dezelfde naam: één competitie-record en één
// "analyse-only" schaduwrecord (zie collections/Clubs.ts — useAsTitle/displayTitle-logica). Zo'n
// analyse-only record is geen echte publieke club: /clubs/[id] geeft er een 404 op. Bij meerdere
// gelijknamige clubs kiezen we daarom altijd eerst een niet-analyse-only record.
export function kiesBesteClubMatch<T extends { analyseOnly?: unknown }>(kandidaten: T[]): T | undefined {
  return kandidaten.find((c) => !c.analyseOnly) ?? kandidaten[0]
}

// Best-effort logo-opzoeking voor letterlijke archiefnamen (kampioenen/bekerwinnaars/referendum) —
// puur cosmetisch (welk logo tonen naast een naam). Bij dubbele genormaliseerde namen in de
// 'clubs'-collection kiest kiesBesteClubMatch de niet-analyse-only variant, in tegenstelling tot de
// striktere enrichment-logica (enrich-club-contacts.ts) die een écht ambiguë match bewust overslaat.
export async function buildClubLogoLookup(payload: Payload, namen: string[]): Promise<Record<string, ClubLogoMeta>> {
  const uniekeNamen = [...new Set(namen.filter(Boolean))]
  if (uniekeNamen.length === 0) return {}

  const clubsRes = await payload
    .find({ collection: 'clubs', limit: 1000, overrideAccess: true, depth: 0 })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))

  const clubsPerSleutel = new Map<string, Record<string, unknown>[]>()
  for (const club of clubsRes.docs as Record<string, unknown>[]) {
    const sleutel = naamSleutel(String(club.name ?? ''))
    if (!sleutel) continue
    const lijst = clubsPerSleutel.get(sleutel) ?? []
    lijst.push(club)
    clubsPerSleutel.set(sleutel, lijst)
  }

  const result: Record<string, ClubLogoMeta> = {}
  for (const naam of uniekeNamen) {
    const club = kiesBesteClubMatch(clubsPerSleutel.get(naamSleutel(naam)) ?? [])
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
