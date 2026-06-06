import type { Payload } from 'payload'

import { buildMatchStats } from './match-engine'
import { seasonClause } from './seasons'

// Tegenstander-/ploegrapport (scouting). Aggregeert de detail-worpdata van één ploeg
// over al haar afgelopen wedstrijden: aanvallend per speler (worpen, doelpunten,
// conversie, zones, afstand) én verdedigend (vangsten — hergebruikt het caughtBy-veld).
// Admin/analyse-only (force-dynamic). Voedt de pagina én de CSV/PDF-export.

export interface TeamReportPlayer {
  playerId: number
  name: string
  shirtNumber: number
  matches: number
  throws: number
  goals: number
  points: number
  nek: number
  rug: number
  goalAttempts: number
  conversion: number
  /** Eigen worpen die door de tegenstander gevangen werden (balverlies). */
  caughtLost: number
  out: number
  score: number
  avgDistance: number
  maxDistance: number
  zones: { links: number; midden: number; rechts: number }
  /** Vangsten: tegenstander-worpen die deze speler ving (verdedigende actie). */
  catches: number
  /** Korte, data-gedreven tendens (bv. "1e worp rechts · scoort via links"). */
  tip?: string
}

export interface TeamReport {
  teamId: number
  teamName: string
  reeks: string
  clubId: number | null
  matchesAnalyzed: number
  totals: {
    throws: number
    goals: number
    points: number
    nek: number
    rug: number
    goalAttempts: number
    conversion: number
    avgDistance: number
    maxDistance: number
    caughtAgainst: number
    out: number
    catches: number
  }
  zones: { links: number; midden: number; rechts: number }
  players: TeamReportPlayer[]
  /** Automatische aanbevelingen/tendensen uit de worpdata (scouting). */
  insights: string[]
  generatedAt: string
}

const rel = (v: unknown): number | null =>
  v && typeof v === 'object' ? ((v as { id?: number }).id ?? null) : typeof v === 'number' ? v : null

export async function buildTeamReport(payload: Payload, teamId: number, seizoen?: string | null): Promise<TeamReport | null> {
  const team = await payload.findByID({ collection: 'teams', id: teamId, depth: 0 }).catch(() => null)
  if (!team) return null
  const reeks = String((team as { reeks?: unknown }).reeks ?? '')
  const clubId = rel((team as { club?: unknown }).club)

  // Spelers van de ploeg (voor de vangsten-telling per speler).
  const playersRes = await payload
    .find({ collection: 'players', where: { team: { equals: teamId } }, depth: 0, limit: 200 })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const playerIds = playersRes.docs.map((p) => p.id as number)

  // Afgelopen wedstrijden waarin de ploeg thuis of uit speelde.
  const matchRes = await payload
    .find({
      collection: 'matches',
      where: {
        and: [
          { status: { equals: 'finished' } },
          { or: [{ homeTeam: { equals: teamId } }, { awayTeam: { equals: teamId } }] },
          ...seasonClause(seizoen),
        ],
      },
      sort: 'date',
      depth: 0,
      limit: 500,
    })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const matches = matchRes.docs.filter((m) => !(m as { isDemo?: boolean }).isDemo)

  const agg = new Map<number, TeamReportPlayer>()
  const distAcc = new Map<number, { sum: number; n: number }>()
  let matchesAnalyzed = 0

  for (const m of matches) {
    const matchId = (m as { id: number }).id
    const homeId = rel((m as { homeTeam?: unknown }).homeTeam)
    const side: 'home' | 'away' = homeId === teamId ? 'home' : 'away'
    let stats
    try {
      ;({ stats } = await buildMatchStats(payload, matchId))
    } catch {
      continue
    }
    const ours = stats.players.filter((p) => p.teamSide === side)
    if (ours.length === 0) continue
    matchesAnalyzed += 1
    for (const p of ours) {
      let s = agg.get(p.playerId)
      if (!s) {
        s = {
          playerId: p.playerId,
          name: p.playerName,
          shirtNumber: p.shirtNumber,
          matches: 0,
          throws: 0,
          goals: 0,
          points: 0,
          nek: 0,
          rug: 0,
          goalAttempts: 0,
          conversion: 0,
          caughtLost: 0,
          out: 0,
          score: 0,
          avgDistance: 0,
          maxDistance: 0,
          zones: { links: 0, midden: 0, rechts: 0 },
          catches: 0,
        }
        agg.set(p.playerId, s)
        distAcc.set(p.playerId, { sum: 0, n: 0 })
      }
      s.matches += 1
      s.throws += p.throws
      s.goals += p.goals.total
      s.points += p.goals.points
      s.nek += p.goals.nek
      s.rug += p.goals.rug
      s.goalAttempts += p.goalAttempts
      s.caughtLost += p.caught
      s.out += p.out
      s.score += p.score
      s.zones.links += p.zones.links
      s.zones.midden += p.zones.midden
      s.zones.rechts += p.zones.rechts
      if (p.distance.max > s.maxDistance) s.maxDistance = p.distance.max
      if (p.distance.avg > 0) {
        const d = distAcc.get(p.playerId)!
        d.sum += p.distance.avg * p.throws
        d.n += p.throws
      }
    }
  }

  // Verdedigend: vangsten per speler (tegenstander-worpen die zij vingen).
  if (playerIds.length) {
    const catchRes = await payload
      .find({ collection: 'throws', where: { caughtBy: { in: playerIds } }, depth: 0, limit: 5000 })
      .catch(() => ({ docs: [] as Record<string, unknown>[] }))
    for (const t of catchRes.docs) {
      const cid = rel((t as { caughtBy?: unknown }).caughtBy)
      if (cid == null) continue
      const s = agg.get(cid)
      if (s) s.catches += 1
      // Spelers die enkel verdedigend voorkomen (geen worpen) tonen we niet apart in dit
      // aanvalsgerichte rapport; hun vangsten zitten enkel in het totaal.
    }
  }

  const players = [...agg.values()]
  for (const s of players) {
    s.conversion = s.goalAttempts ? Math.round((s.goals / s.goalAttempts) * 100) / 100 : 0
    const d = distAcc.get(s.playerId)!
    s.avgDistance = d.n ? Math.round((d.sum / d.n) * 10) / 10 : 0
  }
  players.sort((a, b) => b.points - a.points || b.goals - a.goals || b.throws - a.throws)

  const totals = players.reduce(
    (t, p) => ({
      throws: t.throws + p.throws,
      goals: t.goals + p.goals,
      points: t.points + p.points,
      nek: t.nek + p.nek,
      rug: t.rug + p.rug,
      goalAttempts: t.goalAttempts + p.goalAttempts,
      caughtAgainst: t.caughtAgainst + p.caughtLost,
      out: t.out + p.out,
      catches: t.catches + p.catches,
      distSum: t.distSum + p.avgDistance * p.throws,
      maxDistance: Math.max(t.maxDistance, p.maxDistance),
    }),
    { throws: 0, goals: 0, points: 0, nek: 0, rug: 0, goalAttempts: 0, caughtAgainst: 0, out: 0, catches: 0, distSum: 0, maxDistance: 0 },
  )

  const zones = players.reduce(
    (z, p) => ({ links: z.links + p.zones.links, midden: z.midden + p.zones.midden, rechts: z.rechts + p.zones.rechts }),
    { links: 0, midden: 0, rechts: 0 },
  )

  // ── Aanbevelingen / tendensen uit de ruwe worpen (per worpnummer, richting, type, afstand) ──
  const matchIdList = matches.map((m) => (m as { id: number }).id)
  type TLite = { player: number; throwNumber: number; zone: string | null; outcome: string; type: string; distance: number | null }
  let teamThrows: TLite[] = []
  if (matchIdList.length) {
    const tr = await payload
      .find({ collection: 'throws', where: { and: [{ team: { equals: teamId } }, { match: { in: matchIdList } }] }, depth: 0, limit: 8000 })
      .catch(() => ({ docs: [] as Record<string, unknown>[] }))
    teamThrows = tr.docs.map((t) => ({
      player: rel((t as { player?: unknown }).player) ?? 0,
      throwNumber: Number((t as { throwNumber?: unknown }).throwNumber ?? 0),
      zone: ((t as { zone?: unknown }).zone as string) ?? null,
      outcome: String((t as { outcome?: unknown }).outcome ?? ''),
      type: String((t as { type?: unknown }).type ?? ''),
      distance: ((t as { distance?: unknown }).distance as number | null) ?? null,
    }))
  }

  const ZONE_NL: Record<string, string> = { links: 'links', midden: 'het midden', rechts: 'rechts' }
  const emptyZ = () => ({ links: 0, midden: 0, rechts: 0 }) as Record<string, number>
  const domZone = (z: Record<string, number>) => {
    const tot = z.links + z.midden + z.rechts
    if (!tot) return null
    const top = (['links', 'midden', 'rechts'] as const).reduce((a, b) => (z[b] > z[a] ? b : a), 'links' as 'links' | 'midden' | 'rechts')
    return { zone: top, pct: Math.round((z[top] / tot) * 100) }
  }

  type Bucket = { zones: Record<string, number>; goalZones: Record<string, number>; goalDist: { sum: number; n: number }; goals: number }
  const buckets: Record<number, Bucket> = {
    1: { zones: emptyZ(), goalZones: emptyZ(), goalDist: { sum: 0, n: 0 }, goals: 0 },
    2: { zones: emptyZ(), goalZones: emptyZ(), goalDist: { sum: 0, n: 0 }, goals: 0 },
    3: { zones: emptyZ(), goalZones: emptyZ(), goalDist: { sum: 0, n: 0 }, goals: 0 },
  }
  let rugAll = 0
  let nekAll = 0
  const goalDistAll = { sum: 0, n: 0 }
  for (const t of teamThrows) {
    const b = buckets[Math.min(Math.max(t.throwNumber, 1), 3)]
    if (t.zone) b.zones[t.zone] = (b.zones[t.zone] ?? 0) + 1
    if (t.type === 'rug') rugAll += 1
    else if (t.type === 'nek') nekAll += 1
    if (t.outcome === 'goal') {
      b.goals += 1
      if (t.zone) b.goalZones[t.zone] = (b.goalZones[t.zone] ?? 0) + 1
      if (t.distance != null) {
        b.goalDist.sum += t.distance
        b.goalDist.n += 1
        goalDistAll.sum += t.distance
        goalDistAll.n += 1
      }
    }
  }

  const insights: string[] = []
  const totalTypes = rugAll + nekAll
  if (totalTypes >= 8) {
    insights.push(`Worpkeuze: ${Math.round((rugAll / totalTypes) * 100)}% rugworpen (dubbel) tegenover nekworpen.`)
  }
  for (const n of [1, 2] as const) {
    const dz = domZone(buckets[n].zones)
    if (!dz) continue
    let s = `${n}e worp gaat meestal naar ${ZONE_NL[dz.zone]} (${dz.pct}%).`
    const gz = domZone(buckets[n].goalZones)
    if (buckets[n].goals >= 3 && gz) s += ` Scoort vooral via ${ZONE_NL[gz.zone]}.`
    insights.push(s)
  }
  const allGoalZ = emptyZ()
  for (const n of [1, 2, 3] as const) for (const k of ['links', 'midden', 'rechts']) allGoalZ[k] += buckets[n].goalZones[k]
  const gzAll = domZone(allGoalZ)
  if (gzAll && allGoalZ.links + allGoalZ.midden + allGoalZ.rechts >= 5) {
    insights.push(`Meeste doelpunten vallen via ${ZONE_NL[gzAll.zone]}.`)
  }
  if (goalDistAll.n >= 5) insights.push(`Doelpunten vallen gemiddeld van ${(goalDistAll.sum / goalDistAll.n).toFixed(1)} m.`)

  // Per speler een korte tendens (min. 5 worpen).
  const byPlayer = new Map<number, TLite[]>()
  for (const t of teamThrows) {
    const a = byPlayer.get(t.player) ?? []
    a.push(t)
    byPlayer.set(t.player, a)
  }
  for (const p of players) {
    const ts = byPlayer.get(p.playerId) ?? []
    if (ts.length < 5) continue
    const fz = emptyZ()
    const gz = emptyZ()
    const gd = { sum: 0, n: 0 }
    for (const t of ts) {
      if (t.throwNumber === 1 && t.zone) fz[t.zone] += 1
      if (t.outcome === 'goal') {
        if (t.zone) gz[t.zone] += 1
        if (t.distance != null) {
          gd.sum += t.distance
          gd.n += 1
        }
      }
    }
    const parts: string[] = []
    const fzd = domZone(fz)
    if (fzd) parts.push(`1e worp ${ZONE_NL[fzd.zone]} (${fzd.pct}%)`)
    const gzd = domZone(gz)
    if (gzd) parts.push(`scoort via ${ZONE_NL[gzd.zone]}`)
    if (gd.n >= 2) parts.push(`gem. ${(gd.sum / gd.n).toFixed(1)} m`)
    if (parts.length) p.tip = parts.join(' · ')
  }

  return {
    teamId,
    teamName: String((team as { name?: unknown }).name ?? '—'),
    reeks,
    clubId,
    matchesAnalyzed,
    totals: {
      throws: totals.throws,
      goals: totals.goals,
      points: totals.points,
      nek: totals.nek,
      rug: totals.rug,
      goalAttempts: totals.goalAttempts,
      conversion: totals.goalAttempts ? Math.round((totals.goals / totals.goalAttempts) * 100) / 100 : 0,
      avgDistance: totals.throws ? Math.round((totals.distSum / totals.throws) * 10) / 10 : 0,
      maxDistance: totals.maxDistance,
      caughtAgainst: totals.caughtAgainst,
      out: totals.out,
      catches: totals.catches,
    },
    zones,
    players,
    insights,
    generatedAt: new Date().toISOString(),
  }
}

// ── CSV-export ──
function csvCell(v: string | number): string {
  const s = String(v)
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function teamReportToCsv(r: TeamReport): string {
  const rows: (string | number)[][] = []
  rows.push(['Ploegrapport', r.teamName])
  rows.push(['Reeks', r.reeks])
  rows.push(['Wedstrijden geanalyseerd', r.matchesAnalyzed])
  rows.push([])
  rows.push(['Rugnummer', 'Speler', 'Wedstrijden', 'Worpen', 'Doelpunten', 'Nek', 'Rug', 'Punten', 'Doelpogingen', 'Conversie%', 'Gem.afstand(m)', 'Max(m)', 'Links', 'Midden', 'Rechts', 'Verloren(gevangen)', 'Buiten', 'Score', 'Vangsten'])
  for (const p of r.players) {
    rows.push([
      p.shirtNumber, p.name, p.matches, p.throws, p.goals, p.nek, p.rug, p.points, p.goalAttempts,
      Math.round(p.conversion * 100), p.avgDistance, p.maxDistance, p.zones.links, p.zones.midden, p.zones.rechts,
      p.caughtLost, p.out, p.score, p.catches,
    ])
  }
  rows.push([])
  rows.push(['TOTAAL', '', r.matchesAnalyzed, r.totals.throws, r.totals.goals, r.totals.nek, r.totals.rug, r.totals.points, r.totals.goalAttempts, Math.round(r.totals.conversion * 100), r.totals.avgDistance, r.totals.maxDistance, r.zones.links, r.zones.midden, r.zones.rechts, r.totals.caughtAgainst, r.totals.out, '', r.totals.catches])
  return rows.map((row) => row.map(csvCell).join(';')).join('\n')
}
