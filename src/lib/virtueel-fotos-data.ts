import type { Payload } from 'payload'

import { isAdultReeks, type Reeks } from './reeksen'
import type { GalerijFoto, GalerijWedstrijd } from './virtueel-fotos'

// Laadt de supportersfoto's (match-instants) van live wedstrijden van één club, voor de
// fotogalerij in het virtuele stadion. Zelfde grens als op de wedstrijdpagina: ENKEL foto's van
// volwassen wedstrijden (safeguarding — zie isAdultReeks), geen demo- of analysewedstrijden, en
// geen video's.

const relId = (v: unknown): number | null => {
  const raw = v && typeof v === 'object' ? (v as { id?: unknown }).id : v
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

export async function laadClubFotos(
  payload: Payload,
  clubId: number,
  max = 60,
): Promise<{ fotos: GalerijFoto[]; wedstrijden: Map<number, GalerijWedstrijd> }> {
  const leeg = { fotos: [], wedstrijden: new Map<number, GalerijWedstrijd>() }
  const teams = await payload.find({ collection: 'teams', where: { club: { equals: clubId } }, depth: 0, pagination: false, select: { name: true } })
  const teamIds = teams.docs.map((t) => t.id)
  if (teamIds.length === 0) return leeg

  const matches = await payload.find({
    collection: 'matches',
    where: {
      and: [
        { or: [{ homeTeam: { in: teamIds } }, { awayTeam: { in: teamIds } }] },
        { isDemo: { not_equals: true } },
        { analyseOnly: { not_equals: true } },
      ],
    },
    depth: 0,
    pagination: false,
    select: { reeks: true, date: true, homeTeam: true, awayTeam: true },
  })
  const volwassen = matches.docs.filter((m) => isAdultReeks((m as { reeks?: unknown }).reeks as Reeks))
  if (volwassen.length === 0) return leeg

  const instants = await payload.find({
    collection: 'match-instants',
    where: { and: [{ match: { in: volwassen.map((m) => m.id) } }, { kind: { equals: 'photo' } }] },
    sort: '-createdAt',
    depth: 0,
    limit: max,
  })
  if (instants.docs.length === 0) return leeg

  // Ploegnamen voor het onderschrift ("thuis – uit"), enkel voor de wedstrijden met foto's.
  const metFoto = new Set(instants.docs.map((d) => relId((d as { match?: unknown }).match)))
  const gebruikt = volwassen.filter((m) => metFoto.has(m.id))
  const ploegIds = [...new Set(gebruikt.flatMap((m) => [relId(m.homeTeam), relId(m.awayTeam)]).filter((x): x is number => x != null))]
  const ploegen = await payload.find({ collection: 'teams', where: { id: { in: ploegIds } }, depth: 0, pagination: false, select: { name: true } })
  const naam = new Map(ploegen.docs.map((t) => [t.id, String((t as { name?: unknown }).name ?? '')]))

  const wedstrijden = new Map<number, GalerijWedstrijd>()
  for (const m of gebruikt) {
    wedstrijden.set(m.id, {
      label: `${naam.get(relId(m.homeTeam) ?? -1) ?? '?'} – ${naam.get(relId(m.awayTeam) ?? -1) ?? '?'}`,
      datum: String((m as { date?: unknown }).date ?? ''),
    })
  }
  const fotos: GalerijFoto[] = instants.docs
    .map((d) => {
      const filename = (d as { filename?: string | null }).filename
      return {
        id: Number(d.id),
        // Relatieve same-origin URL, zoals op de wedstrijdpagina en het kantinescherm.
        url: filename ? `/api/match-instants/file/${encodeURIComponent(filename)}` : ((d as { url?: string | null }).url ?? ''),
        auteur: (d as { authorName?: string | null }).authorName || 'Supporter',
        matchId: relId((d as { match?: unknown }).match) ?? NaN,
      }
    })
    .filter((f) => f.url && wedstrijden.has(f.matchId))
  return { fotos, wedstrijden }
}
