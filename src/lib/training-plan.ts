import { TRAINING_METRICS, type TrainingMeting, type TrainingMetricKey } from './training-metrics'

// ── Trainingsplan-generator ("trainingsmachine") ───────────────────────────────────────────
// Bouwt een gepersonaliseerd, periodiek trainingsplan op maat uit de gemeten data (worp 4/9/18 m,
// sprint vooruit/achteruit), de ingestelde doelen en — optioneel — wedstrijd-tendensen. Onderbouwd
// op periodisering + progressieve overload (kracht/power → snelheid → techniek/afwerking, met
// herstel). Pure functies → los testbaar. De UI rendert enkel het resultaat.

export type FocusDomain = 'worpkracht' | 'aanloop' | 'snelheid' | 'wendbaarheid' | 'afwerking' | 'core'

export const DOMAIN_LABEL: Record<FocusDomain, string> = {
  worpkracht: 'Worpkracht & power',
  aanloop: 'Aanloop & worptechniek',
  snelheid: 'Snelheid & acceleratie',
  wendbaarheid: 'Wendbaarheid (achterwaarts)',
  afwerking: 'Afwerking & koelbloedigheid',
  core: 'Core & rompkracht',
}

export interface PlanDrill {
  domain: FocusDomain
  name: string
  how: string
  progressie: string
}

// Research-onderbouwde oefeningbibliotheek (plyometrie, excentrische overload, medicijnbal-worpen,
// sprintmechaniek, afwerken onder vermoeidheid, anti-rotatie core die naar de worp transfereert).
export const DRILLS: PlanDrill[] = [
  { domain: 'worpkracht', name: 'Medicijnbal-worpen (borst + boven het hoofd)', how: '4×6 explosief, volledige extensie', progressie: 'zwaardere bal of meer afstand per week' },
  { domain: 'worpkracht', name: 'Excentrische schouder-/kabelpull', how: '3×8 traag laten zakken (3s), explosief terug', progressie: 'wekelijks +2,5% weerstand' },
  { domain: 'worpkracht', name: 'Push-press / explosieve duw', how: '4×4 met focus op snelheid', progressie: 'last omhoog bij zuivere techniek' },
  { domain: 'aanloop', name: 'Aanloop-timing 4 → 9 → 18 m', how: '6 worpen per aanloop, ritme & laatste pas', progressie: 'meet de afstand, mik op +0,5 m' },
  { domain: 'aanloop', name: 'Sprong-worp uit volle aanloop', how: '5×4, kracht uit de heup, niet enkel arm', progressie: 'langere aanloop bij gecontroleerde landing' },
  { domain: 'snelheid', name: 'Sprint 18 m — acceleratiefocus', how: '6×18 m, volledige recuperatie', progressie: 'tijd meten, mik op −0,1 s' },
  { domain: 'snelheid', name: 'Versnellingsladders / sleeën', how: '4 sets, eerste 5 m explosief', progressie: 'weerstand of aantal herhalingen op' },
  { domain: 'wendbaarheid', name: 'Achterwaarts sprinten + kanteling', how: '6×18 m achteruit, snelle voeten', progressie: 'reactie-start toevoegen' },
  { domain: 'wendbaarheid', name: 'Reactie-shuttle (voor/achter)', how: '5 sets op signaal, lage zwaartepunt', progressie: 'kortere reactietijd / wisselrichting' },
  { domain: 'afwerking', name: 'Doelworpen onder tijdsdruk', how: '10 worpen met klok, score bijhouden', progressie: 'minder tijd of kleiner doel' },
  { domain: 'afwerking', name: 'Afwerken na sprint (vermoeid)', how: 'sprint → meteen doelworp, 8×', progressie: 'meer herhalingen vóór de worp' },
  { domain: 'afwerking', name: 'Zwakke-hand & variatie-afwerking', how: '3×8 bewust de minst gebruikte kant', progressie: 'in wedstrijdtempo afwerken' },
  { domain: 'core', name: 'Anti-rotatie (Pallof-press)', how: '3×10 per kant, romp stabiel', progressie: 'verder van het ankerpunt' },
  { domain: 'core', name: 'Explosieve romprotatie met kabel', how: '4×8 per kant, kracht naar de worp', progressie: 'sneller of zwaarder' },
]

export interface MetricAssessment {
  key: TrainingMetricKey
  label: string
  unit: string
  latest: number | null
  best: number | null
  goal: number | null
  /** latest / best (0..1) — consistentie t.o.v. het persoonlijk record. */
  consistency: number | null
  status: 'sterk' | 'ok' | 'werkpunt' | 'geen-data'
}

export interface PlanFocus {
  domain: FocusDomain
  label: string
  why: string
}

export interface PlanSession {
  day: string
  title: string
  focus: FocusDomain[]
  drills: PlanDrill[]
}

export interface PlanTarget {
  key: TrainingMetricKey
  label: string
  from: number | null
  target: number
  unit: string
  weken: number
}

export interface TrainingPhase {
  key: 'voorbereiding' | 'competitie' | 'uitloop'
  label: string
  note: string
}

export interface PlayerTrainingPlan {
  playerName: string
  shirtNumber: number | null
  phase: TrainingPhase
  assessment: MetricAssessment[]
  focus: PlanFocus[]
  week: PlanSession[]
  targets: PlanTarget[]
}

export interface MatchHints {
  conversion?: number | null
  avgDistance?: number | null
  rugShare?: number | null
  lossRate?: number | null
}

const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d

export function trainingPhase(now: Date): TrainingPhase {
  const m = now.getMonth() // 0=jan
  if (m >= 5 && m <= 7) return { key: 'voorbereiding', label: 'Voorbereiding', note: 'Bouw de basis: veel kracht, power en techniek. Hoog volume, opbouwende intensiteit.' }
  if (m === 4) return { key: 'uitloop', label: 'Uitloop / herstel', note: 'Einde seizoen: onderhoud, herstel en blessurepreventie. Lager volume.' }
  return { key: 'competitie', label: 'Competitie', note: 'In het seizoen: onderhoud kracht, scherp techniek & afwerking aan. Korte, explosieve sessies; spaar de benen voor de match.' }
}

function valuesFor(metingen: TrainingMeting[], key: TrainingMetricKey): number[] {
  return metingen
    .map((m) => m[key])
    .filter((v): v is number => typeof v === 'number' && !Number.isNaN(v))
}

function assess(metingen: TrainingMeting[], goals: Map<string, number>): MetricAssessment[] {
  return TRAINING_METRICS.map((metric) => {
    const vals = valuesFor(metingen, metric.key)
    const latest = vals.length ? vals[vals.length - 1] : null
    const best = vals.length ? Math.max(...vals) : null
    const goal = goals.get(metric.key) ?? null
    const consistency = latest != null && best != null && best > 0 ? round(latest / best, 2) : null
    let status: MetricAssessment['status'] = 'geen-data'
    if (best != null) {
      if (goal != null && best >= goal) status = 'sterk'
      else if (goal != null && best < goal * 0.9) status = 'werkpunt'
      else if (consistency != null && consistency < 0.85) status = 'werkpunt'
      else status = 'ok'
    }
    return { key: metric.key, label: metric.kort, unit: metric.unit, latest, best, goal, consistency, status }
  })
}

const isWorp = (k: TrainingMetricKey) => k === 'worp4' || k === 'worp9' || k === 'worp18'

function pickFocus(assessment: MetricAssessment[], hints: MatchHints): PlanFocus[] {
  const byKey = new Map(assessment.map((a) => [a.key, a]))
  const focus: PlanFocus[] = []
  const add = (domain: FocusDomain, why: string) => {
    if (!focus.some((f) => f.domain === domain)) focus.push({ domain, label: DOMAIN_LABEL[domain], why })
  }

  // Worpkracht: een worp-metriek is werkpunt, of de matchdata toont weinig diepgang.
  const worpWeak = assessment.some((a) => isWorp(a.key) && a.status === 'werkpunt')
  if (worpWeak) add('worpkracht', 'Een werpafstand blijft onder doel — bouw explosieve kracht op.')
  if (hints.avgDistance != null && hints.avgDistance < 11) add('worpkracht', `Gemiddeld maar ${round(hints.avgDistance)} m per worp in de match — meer power nodig.`)

  // Aanloop: langere aanloop levert te weinig extra afstand op.
  const w4 = byKey.get('worp4')?.best ?? null
  const w18 = byKey.get('worp18')?.best ?? null
  if (w4 != null && w18 != null && w18 - w4 < 2) add('aanloop', 'De lange aanloop levert amper extra afstand — timing en pas afwerken.')

  // Snelheid & wendbaarheid.
  if (byKey.get('snelheidVooruit')?.status === 'werkpunt') add('snelheid', 'Sprint vooruit blijft achter — werk aan acceleratie.')
  const vsv = byKey.get('snelheidVooruit')?.best ?? null
  const vsa = byKey.get('snelheidAchteruit')?.best ?? null
  if (vsv != null && vsa != null && vsa < vsv * 0.8) add('wendbaarheid', 'Achterwaarts veel trager dan vooruit — verbeter de wendbaarheid.')

  // Afwerking uit de matchdata.
  if (hints.conversion != null && hints.conversion < 0.45) add('afwerking', `Conversie ${Math.round(hints.conversion * 100)}% — afwerken onder druk trainen.`)
  if (hints.lossRate != null && hints.lossRate >= 0.16) add('afwerking', 'Veel balverlies — koelbloedigheid en zuivere afwerking.')

  // Altijd een fundament als er nog plaats is.
  if (focus.length < 3) add('core', 'Rompkracht is de motor van een krachtige, stabiele worp.')
  if (focus.length === 0) add('worpkracht', 'Algemene opbouw: kracht, power en techniek.')

  return focus.slice(0, 4)
}

function drillsFor(domains: FocusDomain[], max: number): PlanDrill[] {
  const out: PlanDrill[] = []
  for (const d of domains) {
    for (const drill of DRILLS) {
      if (drill.domain === d && !out.includes(drill)) {
        out.push(drill)
        break
      }
    }
  }
  // Vul aan met een tweede oefening uit de eerste domeinen als er ruimte is.
  for (const d of domains) {
    if (out.length >= max) break
    for (const drill of DRILLS) {
      if (drill.domain === d && !out.includes(drill)) {
        out.push(drill)
        break
      }
    }
  }
  return out.slice(0, max)
}

function buildWeek(focus: PlanFocus[]): PlanSession[] {
  const f = focus.map((x) => x.domain)
  const has = (d: FocusDomain) => f.includes(d)
  // Drie sessies + rust, in een logische volgorde (zwaar → techniek → snelheid/wedstrijd).
  const s1: FocusDomain[] = ['worpkracht', 'core', ...(has('aanloop') ? (['aanloop'] as FocusDomain[]) : [])]
  const s2: FocusDomain[] = ['aanloop', 'afwerking']
  const s3: FocusDomain[] = ['snelheid', ...(has('wendbaarheid') ? (['wendbaarheid'] as FocusDomain[]) : []), 'afwerking']
  return [
    { day: 'Sessie 1', title: 'Kracht & power', focus: s1, drills: drillsFor(s1, 4) },
    { day: 'Sessie 2', title: 'Techniek & afwerking', focus: s2, drills: drillsFor(s2, 4) },
    { day: 'Sessie 3', title: 'Snelheid & wedstrijdvorm', focus: s3, drills: drillsFor(s3, 4) },
  ]
}

function targets(assessment: MetricAssessment[], focus: PlanFocus[]): PlanTarget[] {
  const focusWorp = focus.some((x) => x.domain === 'worpkracht' || x.domain === 'aanloop')
  const focusSpeed = focus.some((x) => x.domain === 'snelheid' || x.domain === 'wendbaarheid')
  const out: PlanTarget[] = []
  for (const a of assessment) {
    if (a.best == null) continue
    const relevant = (isWorp(a.key) && focusWorp) || (!isWorp(a.key) && focusSpeed)
    if (!relevant && a.status !== 'werkpunt') continue
    // Doel: het ingestelde doel als dat hoger ligt, anders een haalbare +6% op het PR.
    const stretch = round(a.best * 1.06, a.unit === 'm/s' ? 2 : 1)
    const target = a.goal != null && a.goal > a.best ? a.goal : stretch
    if (target <= a.best) continue
    out.push({ key: a.key, label: a.label, from: a.best, target, unit: a.unit, weken: 6 })
  }
  return out
}

export function buildPlayerTrainingPlan(input: {
  name: string
  shirtNumber?: number | null
  metingen: TrainingMeting[]
  goals: { metriek: string; doel: number }[]
  now?: Date
  hints?: MatchHints
}): PlayerTrainingPlan {
  const now = input.now ?? new Date()
  const goalMap = new Map(input.goals.map((g) => [g.metriek, g.doel]))
  const sorted = [...input.metingen].sort((a, b) => (a.datum < b.datum ? -1 : 1))
  const assessment = assess(sorted, goalMap)
  const focus = pickFocus(assessment, input.hints ?? {})
  return {
    playerName: input.name,
    shirtNumber: input.shirtNumber ?? null,
    phase: trainingPhase(now),
    assessment,
    focus,
    week: buildWeek(focus),
    targets: targets(assessment, focus),
  }
}

// ── Ploegplan: aggregeer de werkpunten van de selectie → gedeelde focus + weekstructuur. ──
export interface TeamTrainingPlan {
  phase: TrainingPhase
  players: number
  focus: PlanFocus[]
  week: PlanSession[]
  /** Per domein: hoeveel spelers er een werkpunt op hebben. */
  spread: { domain: FocusDomain; label: string; count: number }[]
}

export function buildTeamTrainingPlan(input: {
  squad: { name: string; metingen: TrainingMeting[]; goals: { metriek: string; doel: number }[]; hints?: MatchHints }[]
  now?: Date
}): TeamTrainingPlan {
  const now = input.now ?? new Date()
  const tally = new Map<FocusDomain, number>()
  for (const p of input.squad) {
    const plan = buildPlayerTrainingPlan({ name: p.name, metingen: p.metingen, goals: p.goals, now, hints: p.hints })
    for (const f of plan.focus) tally.set(f.domain, (tally.get(f.domain) ?? 0) + 1)
  }
  const spread = [...tally.entries()]
    .map(([domain, count]) => ({ domain, label: DOMAIN_LABEL[domain], count }))
    .sort((a, b) => b.count - a.count)
  const focus: PlanFocus[] = spread.slice(0, 4).map((s) => ({
    domain: s.domain,
    label: s.label,
    why: `${s.count} ${s.count === 1 ? 'speler heeft' : 'spelers hebben'} hier een werkpunt.`,
  }))
  return { phase: trainingPhase(now), players: input.squad.length, focus, week: buildWeek(focus), spread }
}
