// Server-helpers rond het wedstrijdblad: ophalen/aanmaken, selecteerbare roster opbouwen,
// en de laatst-gekende opstelling van een ploeg als voorstel ("klik-klik-klik").

import type { Payload } from 'payload'

import type { Category } from './categories'
import { vastspelenOordeel, vastspelenVoorClub, type VastStatus } from './competitieregels'
import { playerSelectability, type Selectability } from './lineup'
import { reeksRang } from './reeksen'
import { computeReadiness, type Readiness } from './match-readiness'
import { isKnipjesBlocked, openKnipjes } from './sanctions'
import { isSupportersMode } from './score-mode'

export type Side = 'home' | 'away'

/**
 * Of de wedstrijd ontgrendeld is om te openen/starten: opstellingen (op het blad)
 * ingevuld + scheidsrechtersakkoord, of demo. Leest het wedstrijdblad en de match.
 */
export async function getMatchReadiness(
  payload: Payload,
  matchId: number | string,
): Promise<Readiness> {
  const id = Number(matchId)
  const [match, sheetRes] = await Promise.all([
    payload.findByID({ collection: 'matches', id, depth: 0 }).catch(() => null),
    payload.find({ collection: 'matchsheets', where: { match: { equals: id } }, depth: 0, limit: 1 }),
  ])
  const sheet = sheetRes.docs[0]
  const analyseOnly = Boolean((match as { analyseOnly?: boolean } | null)?.analyseOnly)
  // Globale supporters-modus (één knop voor alle wedstrijden) → altijd startklaar. Private
  // analyse-opnames houden wél hun opstellingscontrole (nodig om worpen aan spelers te koppelen).
  const supportersMode = !analyseOnly && (await isSupportersMode(payload))
  // Analysewedstrijd: de opstelling leeft op de MATCH zelf (gekozen via de veldspelers-kiezer in
  // het aantekenscherm) — er is geen wedstrijdblad-flow voor analyse. Map de speler-ids naar
  // {player}-rijen zodat countLineup voor beide bronnen werkt.
  const matchLineup = (v: unknown) => (Array.isArray(v) ? v.map((p) => ({ player: p })) : [])
  return computeReadiness({
    homeLineup: analyseOnly ? matchLineup((match as { homeLineup?: unknown } | null)?.homeLineup) : sheet?.homeLineup,
    awayLineup: analyseOnly ? matchLineup((match as { awayLineup?: unknown } | null)?.awayLineup) : sheet?.awayLineup,
    refereeAkkoord: Boolean((sheet?.wedstrijdstart as { akkoord?: boolean } | undefined)?.akkoord),
    isDemo: Boolean((match as { isDemo?: boolean } | null)?.isDemo),
    analyseOnly,
    supportersMode,
  })
}

export async function getSeasonStartYear(payload: Payload): Promise<number | null> {
  const season = await payload.findGlobal({ slug: 'season', depth: 0 }).catch(() => null)
  const y = (season as { startYear?: number } | null)?.startYear
  return typeof y === 'number' ? y : null
}

/** Haalt het wedstrijdblad voor een match op, of maakt het aan (status concept). */
export async function getOrCreateMatchSheet(payload: Payload, matchId: number | string) {
  const id = Number(matchId)
  const existing = await payload.find({
    collection: 'matchsheets',
    where: { match: { equals: id } },
    limit: 1,
    depth: 0,
  })
  if (existing.docs[0]) return existing.docs[0]
  try {
    return await payload.create({
      collection: 'matchsheets',
      data: { match: id, status: 'concept' },
      overrideAccess: true,
    })
  } catch (err) {
    // Race: de thuis- en uitkaart van de opstellingpagina maken het blad tegelijk aan. `match`
    // is uniek, dus de verliezer krijgt een validatiefout ("The following field is invalid:
    // match") — haal dan gewoon het blad van de winnaar op i.p.v. de fout door te geven.
    const retry = await payload.find({
      collection: 'matchsheets',
      where: { match: { equals: id } },
      limit: 1,
      depth: 0,
    })
    if (retry.docs[0]) return retry.docs[0]
    throw err
  }
}

/** Laatst-gekende opstelling van een ploeg (player-ids), als startpunt-voorstel. */
export async function lastKnownLineup(
  payload: Payload,
  teamId: number | string,
  excludeMatchId?: number | string,
): Promise<number[]> {
  const sheets = await payload.find({
    collection: 'matchsheets',
    sort: '-createdAt',
    limit: 25,
    depth: 1,
  })
  for (const sheet of sheets.docs) {
    const match = sheet.match as { id?: number; homeTeam?: number; awayTeam?: number } | number | null
    if (!match || typeof match === 'number') continue
    if (excludeMatchId && match.id === Number(excludeMatchId)) continue
    const homeLineup = (sheet.homeLineup ?? []) as { player?: number | { id: number } }[]
    const awayLineup = (sheet.awayLineup ?? []) as { player?: number | { id: number } }[]
    const ids = (rows: { player?: number | { id: number } }[]) =>
      rows
        .map((r) => (typeof r.player === 'object' ? r.player?.id : r.player))
        .filter((id): id is number => typeof id === 'number')
    if (match.homeTeam === Number(teamId)) {
      const ids2 = ids(homeLineup)
      if (ids2.length) return ids2
    }
    if (match.awayTeam === Number(teamId)) {
      const ids2 = ids(awayLineup)
      if (ids2.length) return ids2
    }
  }
  return []
}

/** Hoe vaak elke speler van een ploeg de afgelopen wedstrijden in de opstelling stond → om de
 *  meest gebruikte spelers bovenaan te tonen (werkt vlotter voor de coach). */
export async function teamLineupUsage(payload: Payload, teamId: number | string): Promise<Map<number, number>> {
  const usage = new Map<number, number>()
  const sheets = await payload
    .find({ collection: 'matchsheets', sort: '-createdAt', limit: 80, depth: 1 })
    .catch(() => null)
  if (!sheets) return usage
  const ids = (rows: { player?: number | { id: number } }[]) =>
    (rows ?? [])
      .map((r) => (typeof r.player === 'object' ? r.player?.id : r.player))
      .filter((id): id is number => typeof id === 'number')
  for (const sheet of sheets.docs) {
    const match = sheet.match as { homeTeam?: number; awayTeam?: number } | number | null
    if (!match || typeof match === 'number') continue
    const rows =
      match.homeTeam === Number(teamId)
        ? (sheet.homeLineup as { player?: number | { id: number } }[])
        : match.awayTeam === Number(teamId)
          ? (sheet.awayLineup as { player?: number | { id: number } }[])
          : null
    if (!rows) continue
    for (const pid of ids(rows)) usage.set(pid, (usage.get(pid) ?? 0) + 1)
  }
  return usage
}

export type RosterEntry = {
  id: number
  name: string
  shirtNumber: number
  vergunningsstatus: string
  selectability: Selectability
  suggested: boolean
  /** Speler uit een lagere ploeg van de club (speelt hier hoger): naam van zijn eigen ploeg. */
  geleendVan?: string
  /** Vastspelen: hoe vaak hij al hoger speelde in deze ploeg, en het maximum (lib/competitieregels.ts). */
  knipjes?: { keer: number; max: number; vastIn: string | null }
}

/** Bouwt de selecteerbare roster voor één kant van de wedstrijd. */
export async function buildRoster(
  payload: Payload,
  matchId: number | string,
  side: Side,
): Promise<{ teamId: number; teamName: string; category: Category; players: RosterEntry[]; favorites: number[] } | null> {
  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 1 }).catch(() => null)
  if (!match) return null
  const team = (side === 'home' ? match.homeTeam : match.awayTeam) as
    | { id: number; name: string; category: Category; reeks?: string | null; club?: unknown; vasteOpstellingIds?: string | null }
    | number
    | null
  if (!team || typeof team === 'number') return null

  // Onthouden "vaste opstelling" van deze ploeg (komma-gescheiden speler-ids).
  const favorites = String(team.vasteOpstellingIds ?? '')
    .split(',')
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)

  const seasonStartYear = (await getSeasonStartYear(payload)) ?? new Date().getFullYear()
  // Spelers uit LAGERE ploegen van dezelfde club (zelfde categorie) mogen hier hoger spelen —
  // met hun vastspeel-teller (lib/competitieregels.ts). Wie al vast zit in een hogere reeks, mag
  // niet meer in een lagere ploeg.
  const clubId = team.club && typeof team.club === 'object' ? (team.club as { id?: number }).id : (team.club as number | null | undefined)
  const hierRang = reeksRang(team.reeks)
  const lagerePloegen =
    clubId != null && hierRang != null
      ? (
          await payload.find({
            collection: 'teams',
            where: { and: [{ club: { equals: clubId } }, { category: { equals: team.category } }, { id: { not_equals: team.id } }] },
            depth: 0,
            limit: 50,
          })
        ).docs.filter((t) => (reeksRang(t.reeks as string) ?? 0) > hierRang)
      : []
  const ploegNaam = new Map<number, { naam: string; reeks: string | null }>([
    [team.id, { naam: team.name, reeks: team.reeks ?? null }],
    ...lagerePloegen.map((t) => [Number(t.id), { naam: String(t.name ?? ''), reeks: (t.reeks as string | null) ?? null }] as const),
  ])
  const [roster, suggestedIds, settings, vast] = await Promise.all([
    payload.find({ collection: 'players', where: { team: { in: [...ploegNaam.keys()] } }, limit: 500, depth: 0 }),
    lastKnownLineup(payload, team.id, matchId),
    payload.findGlobal({ slug: 'settings', depth: 0 }).catch(() => null),
    clubId != null
      ? vastspelenVoorClub(payload, Number(clubId)).catch(() => new Map<number, VastStatus>())
      : Promise.resolve(new Map<number, VastStatus>()),
  ])
  const usage = await teamLineupUsage(payload, team.id)
  const suggested = new Set(suggestedIds)
  const drempel = (settings as { knipjesDrempel?: number } | null)?.knipjesDrempel ?? 3

  // Openstaande knipjes per speler in deze ploeg.
  const playerIds = roster.docs.map((p) => p.id as number)
  const now = new Date()
  const knipjesPerPlayer = new Map<number, number>()
  if (playerIds.length) {
    const sanctions = await payload.find({
      collection: 'sanctions',
      where: { player: { in: playerIds } },
      limit: 1000,
      depth: 0,
    })
    for (const id of playerIds) {
      const records = sanctions.docs
        .filter((s) => (typeof s.player === 'object' ? s.player?.id : s.player) === id)
        .map((s) => ({ aantal: s.aantal as number, vervallenOp: s.vervallenOp as string }))
      knipjesPerPlayer.set(id, openKnipjes(records, now))
    }
  }

  const players: RosterEntry[] = roster.docs.map((p) => {
    const eigenTeam = typeof p.team === 'object' && p.team ? Number(p.team.id) : Number(p.team)
    const status = vast.get(p.id as number) ?? null
    const oordeel = vastspelenOordeel(status, ploegNaam.get(eigenTeam)?.reeks ?? null, { id: team.id, reeks: team.reeks ?? null })
    const basis = playerSelectability(
      {
        vergunningsstatus: p.vergunningsstatus as string,
        birthDate: p.birthDate as string,
        hogerSpelenVerbod: p.hogerSpelenVerbod as boolean,
        medischAttest: p.medischAttest as boolean,
        actief: p.actief as boolean,
        soortLid: (p as { soortLid?: string | null }).soortLid,
        knipjesGeblokkeerd: isKnipjesBlocked(knipjesPerPlayer.get(p.id as number) ?? 0, drempel),
      },
      team.category,
      seasonStartYear,
    )
    const rang = { ok: 0, warn: 1, block: 2 } as const
    const selectability =
      oordeel.reden != null
        ? {
            level: rang[oordeel.level] > rang[basis.level] ? oordeel.level : basis.level,
            reasons: [...basis.reasons.filter((r) => r !== 'Selecteerbaar.'), oordeel.reden],
          }
        : basis
    const hogerHier = status?.hoger.find((h) => h.teamId === team.id)
    return {
      id: p.id as number,
      name: p.name as string,
      shirtNumber: (p.shirtNumber as number) ?? 0,
      vergunningsstatus: (p.vergunningsstatus as string) ?? 'geen',
      selectability,
      suggested: suggested.has(p.id as number),
      ...(eigenTeam !== team.id ? { geleendVan: ploegNaam.get(eigenTeam)?.naam ?? '' } : {}),
      ...(status ? { knipjes: { keer: hogerHier?.keer ?? 0, max: status.max, vastIn: status.vastIn?.reeks ?? null } } : {}),
    }
  })

  // Volgorde: geblokkeerde leden onderaan; daarboven de favorieten, dan de meest gebruikte spelers
  // (vlotter voor de coach), bij gelijk gebruik op rugnummer.
  const favSet = new Set(favorites)
  players.sort((a, b) => {
    const ba = a.selectability.level === 'block' ? 1 : 0
    const bb = b.selectability.level === 'block' ? 1 : 0
    if (ba !== bb) return ba - bb
    // ⭐ Favorieten van de coach staan altijd bovenaan.
    const fa = favSet.has(a.id) ? 0 : 1
    const fb = favSet.has(b.id) ? 0 : 1
    if (fa !== fb) return fa - fb
    // Eigen spelers vóór spelers uit lagere ploegen.
    const ga = a.geleendVan != null ? 1 : 0
    const gb = b.geleendVan != null ? 1 : 0
    if (ga !== gb) return ga - gb
    const ua = usage.get(a.id) ?? 0
    const ub = usage.get(b.id) ?? 0
    if (ua !== ub) return ub - ua
    return a.shirtNumber - b.shirtNumber
  })
  return { teamId: team.id, teamName: team.name, category: team.category, players, favorites }
}
