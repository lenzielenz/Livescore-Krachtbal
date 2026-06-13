import type { Payload, Where } from 'payload'

import { seasonClause } from './seasons'

// ── Aanvalspatronen (scouting) ────────────────────────────────────────────────────────────
// De rest van de analyse kijkt naar losse worpen (waar landen ze, wie scoort). Dit kijkt naar
// het BALBEZIT als één keten: opzet → 1e worp → 2e worp → doelworp. Zo zie je *hoe* een aanval
// verloopt en welke routes terugkeren — en daaruit volgt automatisch "wat doe je ertegen".
//
// De zware aggregatie is een pure functie (analyzeAttackPatterns) zodat ze los te testen is;
// buildAttackPatterns doet enkel de Payload-fetch en de oriëntatie van de coördinaten.

export type Zone = 'links' | 'midden' | 'rechts'
const ZONES: Zone[] = ['links', 'midden', 'rechts']
const ZONE_NL: Record<Zone, string> = { links: 'links', midden: 'het midden', rechts: 'rechts' }
const OTHER_SIDE: Record<Zone, Zone> = { links: 'rechts', midden: 'links', rechts: 'links' }

export interface PatThrow {
  throwNumber: number
  zone: Zone | null
  type: 'nek' | 'rug' | string
  outcome: string
  /** Landingspunt, al genormaliseerd zodat het aangevallen doel ONDERAAN ligt (y→1). */
  x: number | null
  y: number | null
  distance: number | null
  shirt: number | null
  name: string | null
}

export interface PatPossession {
  setupSide: 'own' | 'opponent' | string
  /** Vertrekpunt, genormaliseerd (doel onderaan). */
  setupX: number | null
  setupY: number | null
  endOutcome: string | null
  throws: PatThrow[]
}

export interface ZoneDist {
  links: number
  midden: number
  rechts: number
}

export interface FlowStep {
  /** Stabiele sleutel (worpnummer of 'doel'). */
  key: string
  label: string
  zones: ZoneDist
  dominant: { zone: Zone; pct: number } | null
  count: number
}

export interface AttackPattern {
  setupSide: 'own' | 'opponent'
  zones: Zone[]
  count: number
  goals: number
  conversion: number
  label: string
}

export interface ExampleStep {
  x: number
  y: number
  label: string
  kind: 'setup' | 'throw' | 'goal' | 'loss'
  zone?: Zone | null
  type?: string | null
  distance?: number | null
}

export interface AttackExample {
  steps: ExampleStep[]
  scored: boolean
  setupSideLabel: string
  throws: number
}

export interface AttackPatternsResult {
  possessions: number
  scoringPossessions: number
  setupSplit: { own: number; opponent: number }
  setupConversion: { own: number; opponent: number }
  avgThrowsToGoal: number
  flow: FlowStep[]
  patterns: AttackPattern[]
  example: AttackExample | null
  tips: string[]
}

const emptyZ = (): ZoneDist => ({ links: 0, midden: 0, rechts: 0 })

function dominant(z: ZoneDist): { zone: Zone; pct: number } | null {
  const tot = z.links + z.midden + z.rechts
  if (!tot) return null
  const top = ZONES.reduce((a, b) => (z[b] > z[a] ? b : a), 'links' as Zone)
  return { zone: top, pct: Math.round((z[top] / tot) * 100) }
}

const SETUP_LABEL: Record<'own' | 'opponent', string> = { own: 'eigen helft', opponent: 'tegenhelft' }
const isGoal = (p: PatPossession) => p.endOutcome === 'goal' || p.throws.some((t) => t.outcome === 'goal')
const ordered = (p: PatPossession) => [...p.throws].sort((a, b) => a.throwNumber - b.throwNumber)

/** Pad-handtekening van een balbezit: opzetzijde + zones van de eerste drie worpen. */
function signature(p: PatPossession): { setupSide: 'own' | 'opponent'; zones: Zone[] } | null {
  const side = p.setupSide === 'opponent' ? 'opponent' : p.setupSide === 'own' ? 'own' : null
  if (!side) return null
  const zones = ordered(p)
    .slice(0, 3)
    .map((t) => t.zone)
    .filter((z): z is Zone => z != null)
  if (zones.length === 0) return null
  return { setupSide: side, zones }
}

function patternLabel(setupSide: 'own' | 'opponent', zones: Zone[]): string {
  const path = zones.map((z) => ZONE_NL[z]).join(' → ')
  return `${SETUP_LABEL[setupSide] === 'eigen helft' ? 'Eigen helft' : 'Tegenhelft'}: ${path} → doel`
}

/**
 * Pure kern: zet voorbewerkte balbezitten (coördinaten al goal-onderaan georiënteerd) om in
 * flow-kolommen, terugkerende scoringspatronen, een representatieve voorbeeldaanval en tips.
 */
export function analyzeAttackPatterns(possessions: PatPossession[]): AttackPatternsResult {
  const withThrows = possessions.filter((p) => p.throws.length > 0)
  const scoring = withThrows.filter(isGoal)

  // Opzetverdeling + conversie per opzetzijde.
  const setupSplit = { own: 0, opponent: 0 }
  const setupGoals = { own: 0, opponent: 0 }
  for (const p of withThrows) {
    const side = p.setupSide === 'opponent' ? 'opponent' : p.setupSide === 'own' ? 'own' : null
    if (!side) continue
    setupSplit[side] += 1
    if (isGoal(p)) setupGoals[side] += 1
  }
  const setupConversion = {
    own: setupSplit.own ? Math.round((setupGoals.own / setupSplit.own) * 100) : 0,
    opponent: setupSplit.opponent ? Math.round((setupGoals.opponent / setupSplit.opponent) * 100) : 0,
  }

  // Flow per worpnummer + de doelworp — bij voorkeur over scoringsaanvallen (hoe een aanval scoort),
  // anders over alle aanvallen wanneer er nog te weinig doelpunten zijn.
  const flowBase = scoring.length >= 4 ? scoring : withThrows
  const stepZ: Record<number, ZoneDist> = { 1: emptyZ(), 2: emptyZ(), 3: emptyZ() }
  const stepN: Record<number, number> = { 1: 0, 2: 0, 3: 0 }
  const goalZ = emptyZ()
  let goalN = 0
  for (const p of flowBase) {
    const ts = ordered(p)
    for (const t of ts) {
      const n = Math.min(Math.max(t.throwNumber, 1), 3)
      if (t.zone) {
        stepZ[n][t.zone] += 1
        stepN[n] += 1
      }
    }
    // Doelworp = de scorende worp (of de laatste worp als er niet gescoord werd).
    const goalThrow = ts.find((t) => t.outcome === 'goal') ?? ts[ts.length - 1]
    if (goalThrow?.zone) {
      goalZ[goalThrow.zone] += 1
      goalN += 1
    }
  }
  const flow: FlowStep[] = []
  for (const n of [1, 2, 3] as const) {
    if (stepN[n] === 0) continue
    flow.push({ key: String(n), label: `${n}e worp`, zones: stepZ[n], dominant: dominant(stepZ[n]), count: stepN[n] })
  }
  if (goalN > 0) flow.push({ key: 'doel', label: 'Doelworp', zones: goalZ, dominant: dominant(goalZ), count: goalN })

  // Terugkerende routes: groepeer ALLE aanvallen op handtekening, tel voorkomens + doelpunten.
  const groups = new Map<string, { setupSide: 'own' | 'opponent'; zones: Zone[]; count: number; goals: number }>()
  for (const p of withThrows) {
    const sig = signature(p)
    if (!sig) continue
    const key = `${sig.setupSide}|${sig.zones.join('>')}`
    const g = groups.get(key) ?? { setupSide: sig.setupSide, zones: sig.zones, count: 0, goals: 0 }
    g.count += 1
    if (isGoal(p)) g.goals += 1
    groups.set(key, g)
  }
  const patterns: AttackPattern[] = [...groups.values()]
    .filter((g) => g.goals > 0)
    .map((g) => ({
      setupSide: g.setupSide,
      zones: g.zones,
      count: g.count,
      goals: g.goals,
      conversion: g.count ? Math.round((g.goals / g.count) * 100) : 0,
      label: patternLabel(g.setupSide, g.zones),
    }))
    .sort((a, b) => b.goals - a.goals || b.conversion - a.conversion || b.count - a.count)
    .slice(0, 4)

  // Voorbeeldaanval: een echte scorende aanval die de toproute volgt én volledige coördinaten heeft,
  // zodat ze op het veld te tekenen valt. Anders de scorende aanval met de meeste bruikbare punten.
  const example = pickExample(scoring, patterns[0] ?? null)

  // Gemiddeld aantal worpen tot een doelpunt.
  const throwsToGoal = scoring.map((p) => p.throws.length)
  const avgThrowsToGoal = throwsToGoal.length
    ? Math.round((throwsToGoal.reduce((a, b) => a + b, 0) / throwsToGoal.length) * 10) / 10
    : 0

  // ── Verdedigingstips: "wat doen we ertegen" ──
  const tips: string[] = []
  const setupTot = setupSplit.own + setupSplit.opponent
  if (setupTot >= 6) {
    const ownPct = Math.round((setupSplit.own / setupTot) * 100)
    if (ownPct >= 60) tips.push(`Ze bouwen ${ownPct}% van de aanvallen op vanaf eigen helft — zet vroeg druk en dwing een lange, onzuivere opbouw af.`)
    else if (ownPct <= 40) tips.push(`Ze winnen vaak balbezit op de tegenhelft (${100 - ownPct}%) — wees zuinig in je eigen opbouw, want balverlies vooraan straffen ze meteen af.`)
  }
  const gd = goalN >= 4 ? dominant(goalZ) : null
  if (gd && gd.pct >= 45) {
    tips.push(`Doelpunten vallen vooral via ${ZONE_NL[gd.zone]} (${gd.pct}%) — schuif je verdediging die kant op en duw de bal naar ${ZONE_NL[OTHER_SIDE[gd.zone]]}.`)
  }
  // Rugworp-aandeel in de doelpunten.
  let rugGoals = 0
  let allGoals = 0
  for (const p of scoring) for (const t of p.throws) if (t.outcome === 'goal') { allGoals += 1; if (t.type === 'rug') rugGoals += 1 }
  if (allGoals >= 5) {
    const rugPct = Math.round((rugGoals / allGoals) * 100)
    if (rugPct >= 35) tips.push(`${rugPct}% van hun doelpunten zijn rugworpen (+2) — sluit de diepe en verre worp af; een nekworp toelaten kost je maar half zoveel.`)
  }
  if (avgThrowsToGoal > 0) {
    if (avgThrowsToGoal <= 1.6) tips.push(`Ze scoren gemiddeld al in ${avgThrowsToGoal} worpen — snelle, directe afwerking. Sta meteen goed bij het opzetten.`)
    else if (avgThrowsToGoal >= 2.6) tips.push(`Ze hebben gemiddeld ${avgThrowsToGoal} worpen nodig per doelpunt — geduldige opbouw. Blijf compact; geef de tweede worp geen ruimte.`)
  }
  if (patterns[0]) {
    tips.push(`Meest scorende route: ${patterns[0].label.toLowerCase()} (${patterns[0].goals}×). Herken het patroon en onderbreek het bij de ${patterns[0].zones.length >= 2 ? '2e' : '1e'} worp.`)
  }

  return {
    possessions: withThrows.length,
    scoringPossessions: scoring.length,
    setupSplit,
    setupConversion,
    avgThrowsToGoal,
    flow,
    patterns,
    example,
    tips,
  }
}

function pickExample(scoring: PatPossession[], top: AttackPattern | null): AttackExample | null {
  const usable = (p: PatPossession) =>
    p.throws.every((t) => t.x != null && t.y != null) && ordered(p).slice(0, 3).some((t) => t.zone != null)
  const matchesTop = (p: PatPossession) => {
    if (!top) return false
    const sig = signature(p)
    return sig != null && sig.setupSide === top.setupSide && sig.zones.join('>') === top.zones.join('>')
  }
  const candidates = scoring.filter(usable)
  if (candidates.length === 0) return null
  const chosen = candidates.find(matchesTop) ?? candidates[0]
  const ts = ordered(chosen)
  const steps: ExampleStep[] = []
  if (chosen.setupX != null && chosen.setupY != null) {
    steps.push({ x: chosen.setupX, y: chosen.setupY, label: 'Opzet', kind: 'setup' })
  }
  ts.forEach((t, i) => {
    if (t.x == null || t.y == null) return
    const scored = t.outcome === 'goal'
    const lost = t.outcome === 'caught' || t.outcome === 'out_side' || t.outcome === 'out_back'
    steps.push({
      x: t.x,
      y: t.y,
      label: scored ? 'Doel' : `${i + 1}`,
      kind: scored ? 'goal' : lost ? 'loss' : 'throw',
      zone: t.zone,
      type: t.type,
      distance: t.distance,
    })
  })
  if (steps.length < 2) return null
  const side = chosen.setupSide === 'opponent' ? 'opponent' : 'own'
  return { steps, scored: true, setupSideLabel: SETUP_LABEL[side], throws: ts.length }
}

const rel = (v: unknown): number | null =>
  v && typeof v === 'object' ? ((v as { id?: number }).id ?? null) : typeof v === 'number' ? v : null

/**
 * Laadt de balbezitten van één ploeg over haar afgelopen wedstrijden, oriënteert de coördinaten
 * (aangevallen doel onderaan, y→1) en levert de geanalyseerde aanvalspatronen.
 */
export async function buildAttackPatterns(
  payload: Payload,
  teamId: number,
  seizoen?: string | null,
  matchFilter?: Where | null,
): Promise<AttackPatternsResult> {
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
  const matchIdList = matchRes.docs.filter((m) => !(m as { isDemo?: boolean }).isDemo).map((m) => (m as { id: number }).id)
  if (matchIdList.length === 0) return analyzeAttackPatterns([])

  const [posRes, throwRes] = await Promise.all([
    payload
      .find({ collection: 'possessions', where: { and: [{ team: { equals: teamId } }, { match: { in: matchIdList } }] }, depth: 0, limit: 8000 })
      .catch(() => ({ docs: [] as Record<string, unknown>[] })),
    payload
      .find({ collection: 'throws', where: { and: [{ team: { equals: teamId } }, { match: { in: matchIdList } }] }, depth: 0, limit: 12000 })
      .catch(() => ({ docs: [] as Record<string, unknown>[] })),
  ])

  // Spelernamen/rugnummers voor het voorbeeld (compact opgehaald).
  const playerIds = [...new Set(throwRes.docs.map((t) => rel((t as { player?: unknown }).player)).filter((n): n is number => n != null))]
  const playerMap = new Map<number, { shirt: number | null; name: string | null }>()
  if (playerIds.length) {
    const pr = await payload
      .find({ collection: 'players', where: { id: { in: playerIds } }, depth: 0, limit: 500 })
      .catch(() => ({ docs: [] as Record<string, unknown>[] }))
    for (const p of pr.docs) {
      playerMap.set(p.id as number, {
        shirt: typeof (p as { shirtNumber?: unknown }).shirtNumber === 'number' ? (p as { shirtNumber: number }).shirtNumber : null,
        name: ((p as { name?: unknown }).name as string) ?? null,
      })
    }
  }

  // Oriënteer naar één canonieke richting: aangevallen doel onderaan (y → 1).
  //  dir 'up'  → speelt al naar y=1 → behoud; dir 'down' → spiegel y' = 1 − y.
  const orientY = (y: number | null, dir: unknown): number | null => {
    if (y == null) return null
    return dir === 'down' ? 1 - y : y
  }

  const byPossession = new Map<number, Record<string, unknown>[]>()
  for (const t of throwRes.docs) {
    const pid = rel((t as { possession?: unknown }).possession)
    if (pid == null) continue
    const arr = byPossession.get(pid) ?? []
    arr.push(t as Record<string, unknown>)
    byPossession.set(pid, arr)
  }

  const possessions: PatPossession[] = posRes.docs.map((p) => {
    const dir = (p as { dir?: unknown }).dir
    const raw = byPossession.get(p.id as number) ?? []
    const throws: PatThrow[] = raw.map((t) => {
      const player = rel((t as { player?: unknown }).player)
      const info = player != null ? playerMap.get(player) : null
      return {
        throwNumber: Number((t as { throwNumber?: unknown }).throwNumber ?? 0),
        zone: (((t as { zone?: unknown }).zone as Zone) ?? null) || null,
        type: String((t as { type?: unknown }).type ?? ''),
        outcome: String((t as { outcome?: unknown }).outcome ?? ''),
        x: typeof (t as { landingX?: unknown }).landingX === 'number' ? (t as { landingX: number }).landingX : null,
        y: orientY(typeof (t as { landingY?: unknown }).landingY === 'number' ? (t as { landingY: number }).landingY : null, dir),
        distance: typeof (t as { distance?: unknown }).distance === 'number' ? (t as { distance: number }).distance : null,
        shirt: info?.shirt ?? null,
        name: info?.name ?? null,
      }
    })
    return {
      setupSide: String((p as { setupSide?: unknown }).setupSide ?? ''),
      setupX: typeof (p as { setupX?: unknown }).setupX === 'number' ? (p as { setupX: number }).setupX : null,
      setupY: orientY(typeof (p as { setupY?: unknown }).setupY === 'number' ? (p as { setupY: number }).setupY : null, dir),
      endOutcome: ((p as { endOutcome?: unknown }).endOutcome as string) ?? null,
      throws,
    }
  })

  return analyzeAttackPatterns(possessions)
}
