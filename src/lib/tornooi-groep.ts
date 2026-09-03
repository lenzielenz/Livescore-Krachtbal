import type { Payload } from 'payload'

import { type LogoFit, normalizeLogoFit } from './logo-fit'
import { buildTournamentState, type TMatchState } from './tournament-engine'
import type { Club, Tournament } from '@/payload-types'

// Gedeelde loader voor een tornooidag (hoofdgroep): reeksen, alle wedstrijden, clublogo's en de
// look van de organiserende club. Gebruikt door de publieke groep-API én de server-render van het
// kantinescherm, zodat beide exact dezelfde data zien.

export type GroepMatch = TMatchState & { tournamentId: number; reeksNaam: string }
export type GroepHost = { name: string; logoUrl: string | null; colorPrimary: string | null; colorSecondary: string | null }
export type GroepData = {
  naam: string
  reeksen: { id: number; naam: string; status: string; format: string; teamCount: number | null; champion: string | null; duurMin: number }[]
  matches: GroepMatch[]
  /** Ploegnaam → clublogo-url (expliciete koppeling eerst, naamherkenning als terugval). */
  logos: Record<string, string>
  /** Ploegnaam → primaire clubkleur (zelfde resolutie als de logo's). */
  kleuren: Record<string, string>
  /** Ploegnaam → logo-zoom/positie zoals in de admin ingesteld — zo vult elk logo de badge mooi. */
  fits: Record<string, LogoFit>
  /** Organiserende club (eerste reeks die er een instelde) — kleurt het kantinescherm. */
  host: GroepHost | null
  /** Aantal velden op de tornooidag (eerste reeks die het instelde; null = nog niet gezet). */
  veldCount: number | null
  /** Recent ingestuurde supportersfoto's (enkel id + tijdstip, max 15 min oud): het
   *  kantinescherm gebruikt dit om een nieuwe inzending even feestelijk te tonen. */
  fotos: { id: number; ts: string; opdracht: string | null }[]
  /** Alle foto's van de dag, oudste eerst — de nabeschouwing op het kantinescherm.
   *  Enkel gevuld voor de federatie (zie `opties.archief`); voor iedereen anders leeg, want het
   *  foto-archief is bewust niet publiek. */
  fotoArchief: { id: number; wie: string; opdracht: string | null }[]
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')

function clubLogoUrlOf(c: Club): string | null {
  const media = (c as { logo?: { url?: string } | null }).logo
  if (media && typeof media === 'object' && media.url) return media.url
  return typeof c.logoUrl === 'string' && c.logoUrl ? c.logoUrl : null
}

/** Opties voor {@link loadGroepData}. */
export type GroepOpties = {
  /** Mag de vrager het volledige foto-archief van de dag zien? Enkel de federatie. */
  archief?: boolean
}

export async function loadGroepData(
  payload: Payload,
  naam: string,
  opties: GroepOpties = {},
): Promise<GroepData | null> {
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
  const fitByClubId = new Map<number, LogoFit>()
  const clubsNorm: { norm: string; url: string | null; kleur: string | null; fit: LogoFit | null }[] = []
  for (const c of clubsRes.docs as Club[]) {
    const url = clubLogoUrlOf(c)
    const kleur = typeof c.colorPrimary === 'string' && c.colorPrimary ? c.colorPrimary : null
    // Zoom/positie zoals in de admin ingezoomd — anders "komt het logo er niet door".
    const raw = c as { logoZoom?: number | null; logoOffsetX?: number | null; logoOffsetY?: number | null }
    const f = normalizeLogoFit({ zoom: raw.logoZoom ?? 1, offsetX: raw.logoOffsetX ?? 0, offsetY: raw.logoOffsetY ?? 0 })
    const fit = f.zoom === 1 && f.offsetX === 0 && f.offsetY === 0 ? null : f
    if (!url && !kleur) continue
    if (url) logoByClubId.set(c.id, url)
    if (kleur) kleurByClubId.set(c.id, kleur)
    if (fit) fitByClubId.set(c.id, fit)
    if (c.name) clubsNorm.push({ norm: norm(String(c.name)), url, kleur, fit })
  }
  clubsNorm.sort((a, b) => b.norm.length - a.norm.length)

  const reeksen: GroepData['reeksen'] = []
  const matches: GroepMatch[] = []
  const logos: Record<string, string> = {}
  const kleuren: Record<string, string> = {}
  const fits: Record<string, LogoFit> = {}
  let host: GroepHost | null = null
  // Aantal velden: de eerste reeks die het instelde bepaalt het voor de hele dag.
  let veldCount: number | null = null
  for (const t of tornooien) {
    const n = Number((t as { veldCount?: number | null }).veldCount)
    if (Number.isFinite(n) && n >= 1) {
      veldCount = n
      break
    }
  }

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
      // Wedstrijdduur (min/helft) — manueel per categorie of de leeftijdsstandaard.
      duurMin: Math.round(state.halfDurationSeconds / 60),
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
        const fit = fitByClubId.get(id)
        if (url && !logos[naam2]) logos[naam2] = url
        if (kleur && !kleuren[naam2]) kleuren[naam2] = kleur
        if (fit && !fits[naam2]) fits[naam2] = fit
        if (logos[naam2] && kleuren[naam2]) continue
      }
      const n = norm(naam2)
      const hit = clubsNorm.find((c) => n.includes(c.norm) || c.norm.includes(n))
      if (hit?.url && !logos[naam2]) logos[naam2] = hit.url
      if (hit?.kleur && !kleuren[naam2]) kleuren[naam2] = hit.kleur
      if (hit?.fit && !fits[naam2]) fits[naam2] = hit.fit
    }
  }

  // Verse supportersfoto's (kwartier oud max): alleen de id's — de bytes gaan via een aparte,
  // eveneens tijdsbegrensde route. Zo blijft het foto-archief zelf federatie-only.
  const kwartier = new Date(Date.now() - 15 * 60000).toISOString()
  const fotosRes = await payload
    .find({
      collection: 'tornooi-fotos',
      where: { and: [{ groep: { equals: naam } }, { createdAt: { greater_than: kwartier } }] },
      sort: '-createdAt',
      depth: 0,
      limit: 5,
      overrideAccess: true,
    })
    .catch(() => ({ docs: [] as { id: number; createdAt: string; opdracht?: string | null }[] }))
  // De opdracht mag mee: ze staat onder de foto op het kantinescherm ("📸 Foto met de
  // tegenstander") en verraadt niets over wie ze instuurde — de naam zit hier bewust níét bij.
  const fotos = (fotosRes.docs as { id: number; createdAt: string; opdracht?: string | null }[]).map((f) => ({
    id: f.id,
    ts: f.createdAt,
    opdracht: f.opdracht || null,
  }))

  // Het volledige archief van de dag — enkel voor de federatie, en enkel als erom gevraagd wordt.
  // Het kantinescherm draait daar na afloop een fotoshow mee; een publieke vrager krijgt hier
  // niets, precies zoals bij de foto-route zelf.
  let fotoArchief: GroepData['fotoArchief'] = []
  if (opties.archief) {
    const alle = await payload
      .find({
        collection: 'tornooi-fotos',
        where: { groep: { equals: naam } },
        sort: 'createdAt',
        depth: 0,
        limit: 500,
        overrideAccess: true,
      })
      .catch(() => ({ docs: [] as { id: number; uploaderName?: string | null; opdracht?: string | null }[] }))
    fotoArchief = (alle.docs as { id: number; uploaderName?: string | null; opdracht?: string | null }[]).map((f) => ({
      id: f.id,
      wie: f.uploaderName || '',
      opdracht: f.opdracht || null,
    }))
  }

  return { naam, reeksen, matches, logos, kleuren, fits, host, veldCount, fotos, fotoArchief }
}
