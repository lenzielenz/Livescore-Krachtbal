// Server-helpers rond het wedstrijdblad: ophalen/aanmaken, selecteerbare roster opbouwen,
// en de laatst-gekende opstelling van een ploeg als voorstel ("klik-klik-klik").

import type { Payload } from 'payload'

import type { Category } from './categories'
import { playerSelectability, type Selectability } from './lineup'
import { computeReadiness, type Readiness } from './match-readiness'
import { isKnipjesBlocked, openKnipjes } from './sanctions'

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
  return computeReadiness({
    homeLineup: sheet?.homeLineup,
    awayLineup: sheet?.awayLineup,
    refereeAkkoord: Boolean((sheet?.wedstrijdstart as { akkoord?: boolean } | undefined)?.akkoord),
    isDemo: Boolean((match as { isDemo?: boolean } | null)?.isDemo),
    analyseOnly: Boolean((match as { analyseOnly?: boolean } | null)?.analyseOnly),
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
  return payload.create({
    collection: 'matchsheets',
    data: { match: id, status: 'concept' },
    overrideAccess: true,
  })
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

export type RosterEntry = {
  id: number
  name: string
  shirtNumber: number
  vergunningsstatus: string
  selectability: Selectability
  suggested: boolean
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
    | { id: number; name: string; category: Category; vasteOpstellingIds?: string | null }
    | number
    | null
  if (!team || typeof team === 'number') return null

  // Onthouden "vaste opstelling" van deze ploeg (komma-gescheiden speler-ids).
  const favorites = String(team.vasteOpstellingIds ?? '')
    .split(',')
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)

  const seasonStartYear = (await getSeasonStartYear(payload)) ?? new Date().getFullYear()
  const [roster, suggestedIds, settings] = await Promise.all([
    payload.find({ collection: 'players', where: { team: { equals: team.id } }, limit: 200, depth: 0 }),
    lastKnownLineup(payload, team.id, matchId),
    payload.findGlobal({ slug: 'settings', depth: 0 }).catch(() => null),
  ])
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

  const players: RosterEntry[] = roster.docs.map((p) => ({
    id: p.id as number,
    name: p.name as string,
    shirtNumber: (p.shirtNumber as number) ?? 0,
    vergunningsstatus: (p.vergunningsstatus as string) ?? 'geen',
    selectability: playerSelectability(
      {
        vergunningsstatus: p.vergunningsstatus as string,
        birthDate: p.birthDate as string,
        hogerSpelenVerbod: p.hogerSpelenVerbod as boolean,
        medischAttest: p.medischAttest as boolean,
        actief: p.actief as boolean,
        knipjesGeblokkeerd: isKnipjesBlocked(knipjesPerPlayer.get(p.id as number) ?? 0, drempel),
      },
      team.category,
      seasonStartYear,
    ),
    suggested: suggested.has(p.id as number),
  }))

  players.sort((a, b) => a.shirtNumber - b.shirtNumber)
  return { teamId: team.id, teamName: team.name, category: team.category, players, favorites }
}
