import type { Payload } from 'payload'

import { buildTournamentState, type TMatchState } from './tournament-engine'
import type { Club, Tournament } from '@/payload-types'

// Gedeelde loader voor een tornooidag (hoofdgroep): reeksen, alle wedstrijden, clublogo's en de
// look van de organiserende club. Gebruikt door de publieke groep-API én de server-render van het
// kantinescherm, zodat beide exact dezelfde data zien.

export type GroepMatch = TMatchState & { tournamentId: number; reeksNaam: string }
export type GroepHost = { name: string; logoUrl: string | null; colorPrimary: string | null; colorSecondary: string | null }
export type GroepData = {
  naam: string
  reeksen: { id: number; naam: string; status: string; format: string; teamCount: number | null; champion: string | null }[]
  matches: GroepMatch[]
  /** Ploegnaam → clublogo-url (expliciete koppeling eerst, naamherkenning als terugval). */
  logos: Record<string, string>
  /** Ploegnaam → primaire clubkleur (zelfde resolutie als de logo's). */
  kleuren: Record<string, string>
  /** Organiserende club (eerste reeks die er een instelde) — kleurt het kantinescherm. */
  host: GroepHost | null
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')

function clubLogoUrlOf(c: Club): string | null {
  const media = (c as { logo?: { url?: string } | null }).logo
  if (media && typeof media === 'object' && media.url) return media.url
  return typeof c.logoUrl === 'string' && c.logoUrl ? c.logoUrl : null
}

export async function loadGroepData(payload: Payload, naam: string): Promise<GroepData | null> {
  const res = await payload
    .find({ collection: 'tournaments', where: { groep: { equals: naam } }, sort: 'createdAt', depth: 1, limit: 50 })
    .catch(() => ({ docs: [] as Tournament[] }))
  const tornooien = res.docs as Tournament[]
  if (tornooien.length === 0) return null

  // Alle clubs één keer laden voor logo's (expliciet via teamClubs, anders naamherkenning).
  const clubsRes = await payload
    .find({ collection: 'clubs', depth: 1, limit: 500 })
    .catch(() => ({ docs: [] as Club[] }))
  const logoByClubId = new Map<number, string>()
  const kleurByClubId = new Map<number, string>()
  const clubsNorm: { norm: string; url: string | null; kleur: string | null }[] = []
  for (const c of clubsRes.docs as Club[]) {
    const url = clubLogoUrlOf(c)
    const kleur = typeof c.colorPrimary === 'string' && c.colorPrimary ? c.colorPrimary : null
    if (!url && !kleur) continue
    if (url) logoByClubId.set(c.id, url)
    if (kleur) kleurByClubId.set(c.id, kleur)
    if (c.name) clubsNorm.push({ norm: norm(String(c.name)), url, kleur })
  }
  clubsNorm.sort((a, b) => b.norm.length - a.norm.length)

  const reeksen: GroepData['reeksen'] = []
  const matches: GroepMatch[] = []
  const logos: Record<string, string> = {}
  const kleuren: Record<string, string> = {}
  let host: GroepHost | null = null

  for (const t of tornooien) {
    const state = await buildTournamentState(payload, t.id).catch(() => null)
    if (!state) continue
    reeksen.push({
      id: state.id,
      naam: state.name,
      status: state.status,
      format: state.format,
      teamCount: t.teamCount ?? null,
      champion: state.champion ?? null,
    })

    // Organiserende club: de eerste reeks die er een instelde bepaalt de look.
    if (!host && t.hostClub && typeof t.hostClub === 'object') {
      const c = t.hostClub as Club
      host = {
        name: String(c.name ?? ''),
        logoUrl: clubLogoUrlOf(c),
        colorPrimary: typeof c.colorPrimary === 'string' ? c.colorPrimary : null,
        colorSecondary: typeof c.colorSecondary === 'string' ? c.colorSecondary : null,
      }
    }

    // Logo per ploegnaam: expliciete teamClubs-koppeling wint, naamherkenning vult aan.
    const teamClubs = Array.isArray(t.teamClubs) ? (t.teamClubs as { name?: unknown; clubId?: unknown }[]) : []
    const namen = new Set<string>()
    const alle = [...state.rounds.flatMap((r) => r.matches), ...(state.thirdPlace ? [state.thirdPlace] : [])]
    for (const m of alle) {
      if (m.home) namen.add(m.home)
      if (m.away) namen.add(m.away)
      if (m.status === 'finished' && (!m.home || !m.away)) continue
      matches.push({ ...m, tournamentId: state.id, reeksNaam: state.name })
    }
    for (const naam2 of namen) {
      if (logos[naam2] && kleuren[naam2]) continue
      const expliciet = teamClubs.find((x) => typeof x?.name === 'string' && x.name === naam2)
      if (expliciet) {
        const id = Number(expliciet.clubId)
        const url = logoByClubId.get(id)
        const kleur = kleurByClubId.get(id)
        if (url && !logos[naam2]) logos[naam2] = url
        if (kleur && !kleuren[naam2]) kleuren[naam2] = kleur
        if (logos[naam2] && kleuren[naam2]) continue
      }
      const n = norm(naam2)
      const hit = clubsNorm.find((c) => n.includes(c.norm) || c.norm.includes(n))
      if (hit?.url && !logos[naam2]) logos[naam2] = hit.url
      if (hit?.kleur && !kleuren[naam2]) kleuren[naam2] = hit.kleur
    }
  }

  return { naam, reeksen, matches, logos, kleuren, host }
}
