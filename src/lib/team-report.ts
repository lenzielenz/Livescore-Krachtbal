import type { Payload, Where } from 'payload'

import { buildMatchStats } from './match-engine'
import { seasonClause } from './seasons'
import { buildStrategie, parseSpeelstijl, type Speelstijl } from './speelstijl'

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

/** Eén as van het radar-profiel (0-100, hoger = sterker op die dimensie). */
export interface RadarAxis {
  key: string
  label: string
  value: number
  display: string
}

/** Eén bevinding (sterkte of zwakte) met een gewicht voor de sortering. */
export interface Finding {
  area: 'Aanval' | 'Verdediging' | 'Balbezit' | 'Tactiek' | 'Spelers'
  title: string
  detail: string
  weight: number
}

export interface TeamProfile {
  /** Korte DNA-labels (bv. "Rechts-dominant", "Krachtploeg"). */
  tags: string[]
  radar: RadarAxis[]
  strengths: Finding[]
  weaknesses: Finding[]
  /** Aandeel van de topscorer in de totale punten (afhankelijkheid). */
  topScorerShare: number
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
  /** Door de coach ingegeven speelstijl van deze ploeg (tactisch profiel). */
  speelstijl: Speelstijl
  /** Strategie-aanbevelingen: speelstijl naast de gemeten data gelegd. */
  strategy: string[]
  /** Gesynthetiseerd profiel: radar, DNA-labels en geprioriteerde sterktes/zwaktes. */
  profile: TeamProfile
  generatedAt: string
}

const rel = (v: unknown): number | null =>
  v && typeof v === 'object' ? ((v as { id?: number }).id ?? null) : typeof v === 'number' ? v : null

export async function buildTeamReport(payload: Payload, teamId: number, seizoen?: string | null, matchFilter?: Where | null): Promise<TeamReport | null> {
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
          ...(matchFilter ? [matchFilter] : []),
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

  // Verre worp (+15 m): in krachtbal speelt een ploeg de bal soms ver "links of rechts over".
  // We tonen hoe vaak en langs welke kant, zodat de tegenstander zich kan voorbereiden.
  const FAR_M = 15
  const farZ = emptyZ()
  let farTot = 0
  for (const t of teamThrows) {
    if ((t.distance ?? 0) >= FAR_M && t.zone) {
      farZ[t.zone] += 1
      farTot += 1
    }
  }
  if (farTot >= 3) {
    const parts: string[] = []
    if (farZ.links) parts.push(`${farZ.links}× links over`)
    if (farZ.rechts) parts.push(`${farZ.rechts}× rechts over`)
    if (farZ.midden) parts.push(`${farZ.midden}× centraal`)
    insights.push(`Verre worp (+15 m): ${parts.join(' · ')}.`)
  }

  // ── Verdedigend: waar de ploeg het ZWAKST staat (vanwaar de tegenstanders scoren). ──
  const concededZ = emptyZ()
  let concededTot = 0
  let concededRug = 0
  let concededFar = 0
  if (matchIdList.length) {
    const cr = await payload
      .find({
        collection: 'throws',
        where: { and: [{ match: { in: matchIdList } }, { team: { not_equals: teamId } }, { outcome: { equals: 'goal' } }] },
        depth: 0,
        limit: 8000,
      })
      .catch(() => ({ docs: [] as Record<string, unknown>[] }))
    for (const t of cr.docs) {
      const z = (t as { zone?: string }).zone
      if (z && z in concededZ) concededZ[z] += 1
      concededTot += 1
      if (String((t as { type?: unknown }).type) === 'rug') concededRug += 1
      if (((t as { distance?: number | null }).distance ?? 0) >= FAR_M) concededFar += 1
    }
    if (concededTot >= 5) {
      const cz = domZone(concededZ)
      if (cz) insights.push(`Verdedigend zwak: tegendoelpunten vallen vooral via ${ZONE_NL[cz.zone]} (${cz.pct}%).`)
      if (concededRug / concededTot >= 0.25) {
        insights.push(`Verdedigend: ${Math.round((concededRug / concededTot) * 100)}% van de tegendoelpunten zijn rugworpen (dubbel) — let op de verre/diepe worp.`)
      }
      if (concededFar >= 3) {
        insights.push(`Verdedigend: ${concededFar} tegendoelpunten van ver (+15 m) — sluit de verre worp beter af.`)
      }
    }
  }

  // ── Strategie: de ingegeven speelstijl ("hoe spelen wij") naast de gemeten data. ──
  const speelstijl = parseSpeelstijl((team as { speelstijl?: unknown }).speelstijl)
  const strategy = buildStrategie(speelstijl, {
    goalZone: gzAll && allGoalZ.links + allGoalZ.midden + allGoalZ.rechts >= 5 ? gzAll : null,
    rugShare: totalTypes >= 8 ? rugAll / totalTypes : null,
    verreWorpen: farTot,
  })

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

  // ── Gesynthetiseerd profiel: radar + DNA-labels + geprioriteerde sterktes/zwaktes ──
  const clampPct = (v: number) => Math.max(0, Math.min(100, Math.round(v)))
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  const goalsTot = totals.goals
  const conv = totals.goalAttempts ? totals.goals / totals.goalAttempts : 0
  // Conversie kan in de ruwe data >100% lijken als doelpogingen ondergeteld zijn — toon ze nooit boven 100%.
  const convPct = Math.min(100, Math.round(conv * 100))
  const rugShareGoals = goalsTot ? totals.rug / goalsTot : 0
  const avgDist = totals.throws ? totals.distSum / totals.throws : 0
  const zdom = domZone(zones) // {zone, pct} of null
  const domPct = zdom ? zdom.pct / 100 : 0.34
  const lossRate = totals.throws ? (totals.caughtAgainst + totals.out) / totals.throws : 0
  const catchesPerMatch = matchesAnalyzed ? totals.catches / matchesAnalyzed : 0
  const scorers = players.filter((p) => p.points > 0)
  const top = players[0]
  const topScorerShare = totals.points ? (top?.points ?? 0) / totals.points : 0

  const radar: RadarAxis[] = [
    { key: 'afwerking', label: 'Afwerking', value: clampPct(((conv - 0.25) / 0.35) * 100), display: `${convPct}%` },
    { key: 'kracht', label: 'Kracht (rug)', value: clampPct((rugShareGoals / 0.5) * 100), display: `${Math.round(rugShareGoals * 100)}% dubbel` },
    { key: 'diepgang', label: 'Diepgang', value: clampPct(((avgDist - 6) / 12) * 100), display: `${avgDist.toFixed(1)} m` },
    { key: 'spreiding', label: 'Spreiding', value: clampPct(((0.66 - domPct) / 0.32) * 100), display: zdom ? `${zdom.pct}% ${zdom.zone}` : '—' },
    { key: 'balveilig', label: 'Balveiligheid', value: clampPct(((0.2 - lossRate) / 0.15) * 100), display: `${Math.round(lossRate * 100)}% verlies` },
    { key: 'verdediging', label: 'Verdediging', value: clampPct((catchesPerMatch / 8) * 100), display: `${catchesPerMatch.toFixed(1)}/match` },
  ]

  const strengths: Finding[] = []
  const weaknesses: Finding[] = []

  if (top && top.points > 0) {
    strengths.push({ area: 'Spelers', title: `Sterspeler #${top.shirtNumber} ${top.name}`, detail: `${top.points} ptn · ${top.goals} doelpunten${top.tip ? ` — ${top.tip}` : ''}. Hou hem kort.`, weight: 95 })
  }
  if (totals.goalAttempts >= 6 && conv >= 0.5) strengths.push({ area: 'Aanval', title: 'Koelbloedig voor doel', detail: `${convPct}% van de doelpogingen raak — moeilijk af te stoppen.`, weight: clampPct(conv * 100) })
  if (goalsTot >= 8 && rugShareGoals >= 0.3) strengths.push({ area: 'Aanval', title: 'Sterke rugworp (+2)', detail: `${Math.round(rugShareGoals * 100)}% van de doelpunten zijn dubbel — let op de diepe en verre worp.`, weight: clampPct(rugShareGoals * 120) })
  if (totals.throws >= 20 && avgDist >= 14) strengths.push({ area: 'Aanval', title: 'Speelt met diepgang', detail: `Gemiddeld ${avgDist.toFixed(1)} m per worp — rekt je verdediging uit elkaar.`, weight: clampPct(avgDist * 4) })
  if (zdom && domPct <= 0.42 && totals.throws >= 20) strengths.push({ area: 'Tactiek', title: 'Onvoorspelbaar', detail: 'Worpen mooi verdeeld over links, midden en rechts — moeilijk te lezen.', weight: 70 })
  if (totals.throws >= 25 && lossRate <= 0.08) strengths.push({ area: 'Balbezit', title: 'Veilig balbezit', detail: `Amper balverlies (${Math.round(lossRate * 100)}%) — geduldig in de opbouw.`, weight: 72 })
  if (matchesAnalyzed >= 2 && catchesPerMatch >= 5) strengths.push({ area: 'Verdediging', title: 'Sterke verdediging', detail: `${catchesPerMatch.toFixed(1)} vangsten per match — zij pakken veel ballen af.`, weight: clampPct(catchesPerMatch * 10) })
  if (scorers.length >= 4 && topScorerShare <= 0.25) strengths.push({ area: 'Spelers', title: 'Brede aanval', detail: `${scorers.length} spelers scoren — één man uitschakelen volstaat niet.`, weight: 68 })

  if (totals.goalAttempts >= 6 && conv <= 0.4) weaknesses.push({ area: 'Aanval', title: 'Wisselvallige afwerking', detail: `Slechts ${Math.round(conv * 100)}% conversie — onder druk haperen ze.`, weight: clampPct((0.4 - conv) * 250) })
  if (zdom && domPct >= 0.55) weaknesses.push({ area: 'Tactiek', title: `Voorspelbaar via ${zdom.zone}`, detail: `${zdom.pct}% van de worpen gaat naar ${ZONE_NL[zdom.zone]} — overlaad die kant en duw hen weg van hun voorkeur.`, weight: clampPct(domPct * 110) })
  if (totals.throws >= 20 && lossRate >= 0.16) weaknesses.push({ area: 'Balbezit', title: 'Slordig balbezit', detail: `${totals.caughtAgainst}× gevangen en ${totals.out}× buiten — vol druk zetten loont.`, weight: clampPct(lossRate * 320) })
  if (matchesAnalyzed >= 2 && catchesPerMatch <= 1.5) weaknesses.push({ area: 'Verdediging', title: 'Weinig onderscheppingen', detail: `Amper ${totals.catches} vangsten — zij pakken weinig ballen af, durf te combineren.`, weight: 64 })
  if (scorers.length >= 3 && topScorerShare >= 0.4 && top) weaknesses.push({ area: 'Spelers', title: 'Eenmansafhankelijk', detail: `${Math.round(topScorerShare * 100)}% van de punten komt van #${top.shirtNumber} ${top.name} — neutraliseer hem en de motor valt stil.`, weight: clampPct(topScorerShare * 130) })
  if (concededTot >= 5) {
    const cz = domZone(concededZ)
    if (cz) weaknesses.push({ area: 'Verdediging', title: `Kwetsbaar via ${cz.zone}`, detail: `${cz.pct}% van de tegendoelpunten valt via ${ZONE_NL[cz.zone]} — zoek bewust die ruimte op.`, weight: clampPct(cz.pct * 1.1) })
    if (concededRug / concededTot >= 0.25) weaknesses.push({ area: 'Verdediging', title: 'Gevoelig voor de rugworp', detail: `${Math.round((concededRug / concededTot) * 100)}% van de tegendoelpunten zijn rugworpen — durf van afstand en diep af te werken.`, weight: 66 })
    if (concededFar >= 3) weaknesses.push({ area: 'Verdediging', title: 'Geeft ver weg', detail: `${concededFar} tegendoelpunten van ver (+15 m) — werk gerust van afstand af.`, weight: 62 })
  }

  strengths.sort((a, b) => b.weight - a.weight)
  weaknesses.sort((a, b) => b.weight - a.weight)

  const tags: string[] = []
  if (zdom && domPct >= 0.45) tags.push(`${cap(zdom.zone)}-dominant`)
  else if (zdom && domPct <= 0.4) tags.push('Evenwichtig verdeeld')
  if (rugShareGoals >= 0.3) tags.push('Krachtploeg')
  if (avgDist >= 14) tags.push('Sterk van ver')
  if (totals.goalAttempts >= 6 && conv >= 0.5 && convPct >= 50) tags.push('Klinisch')
  if (matchesAnalyzed >= 2 && catchesPerMatch >= 5) tags.push('Sterke verdediging')
  if (scorers.length >= 3 && topScorerShare >= 0.4) tags.push('Sterspeler-afhankelijk')
  else if (scorers.length >= 4 && topScorerShare <= 0.25) tags.push('Brede aanval')

  const profile: TeamProfile = { tags: tags.slice(0, 5), radar, strengths: strengths.slice(0, 6), weaknesses: weaknesses.slice(0, 6), topScorerShare }

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
    speelstijl,
    strategy,
    profile,
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
