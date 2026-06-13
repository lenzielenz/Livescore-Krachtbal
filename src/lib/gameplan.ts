import type { AttackPatternsResult } from './attack-patterns'
import type { TeamReport } from './team-report'

// ── Matchplan-dossier ─────────────────────────────────────────────────────────────────────
// Eén geprioriteerd gameplan tegen een ploeg, gesynthetiseerd uit de reeds berekende scouting:
// het ploegrapport (sterspelers, zwaktes, DNA) + de aanvalspatronen (routes, verdedigingstips).
// Coaches willen niet zes panelen scrollen — ze willen het PLAN: wie kort houden, hoe verdedigen,
// waar zélf toeslaan, en drie sleutels. Pure functie → los testbaar.

export interface PlanItem {
  title: string
  detail: string
}

export interface GamePlan {
  opponent: string
  /** Eén tactische kopzin die de match samenvat. */
  headline: string
  tags: string[]
  /** Wie neutraliseren (sleutelspelers). */
  watch: PlanItem[]
  /** Hoe hun aanval stoppen. */
  defend: PlanItem[]
  /** Waar wij hen kunnen pijn doen (hun zwaktes). */
  attack: PlanItem[]
  /** Drie korte sleutels tot de match. */
  keys: string[]
  /** Hoeveel wedstrijden de scouting beslaat (vertrouwen). */
  matchesAnalyzed: number
}

const first = (n: string) => n.split(/\s+/)[0]

export function buildGamePlan(report: TeamReport, patterns: AttackPatternsResult | null): GamePlan {
  const players = report.players
  const share = Math.round(report.profile.topScorerShare * 100)

  // ── Wie kort houden ──
  const watch: PlanItem[] = []
  const top = players.find((p) => p.points > 0) ?? null
  if (top) {
    const bits: string[] = []
    if (share > 0) bits.push(`${share}% van hun punten`)
    if (top.tip) bits.push(top.tip)
    else bits.push(`${top.goals} doelpunt${top.goals === 1 ? '' : 'en'}`)
    watch.push({ title: `#${top.shirtNumber} ${first(top.name)} kort houden`, detail: `${bits.join(' · ')}. Dwing de bal naar een andere afwerker.` })
  }
  const rugSpec = [...players].filter((p) => p.rug >= 2 && (!top || p.playerId !== top.playerId)).sort((a, b) => b.rug - a.rug)[0]
  if (rugSpec) {
    watch.push({ title: `#${rugSpec.shirtNumber} ${first(rugSpec.name)} — rugworp (+2)`, detail: `${rugSpec.rug}× dubbel gescoord. Sluit voor hem de diepe en verre worp af.` })
  }
  const keyDef = [...players].filter((p) => p.catches >= 3 && (!top || p.playerId !== top.playerId) && (!rugSpec || p.playerId !== rugSpec.playerId)).sort((a, b) => b.catches - a.catches)[0]
  if (keyDef && watch.length < 3) {
    watch.push({ title: `#${keyDef.shirtNumber} ${first(keyDef.name)} — sterke verdediger`, detail: `${keyDef.catches} vangsten. Speel niet blind in zijn zone; zoek de andere kant.` })
  }

  // ── Hoe verdedigen ── (de patroon-afgeleide tips zijn al als counters geformuleerd)
  const defend: PlanItem[] = []
  for (const t of patterns?.tips ?? []) {
    if (defend.length >= 4) break
    // Splits "kop: rest" als de tip een natuurlijke titel heeft, anders een generieke titel.
    const m = t.match(/^(.*?)(?:\s[—-]\s)(.*)$/)
    if (m) defend.push({ title: m[1].replace(/\.$/, ''), detail: m[2] })
    else defend.push({ title: 'Verdedigingsfocus', detail: t })
  }

  // ── Waar wij toeslaan ── (hun zwaktes die wij kunnen uitbuiten)
  const attack: PlanItem[] = report.profile.weaknesses
    .filter((w) => w.area === 'Verdediging' || w.area === 'Tactiek' || w.area === 'Balbezit')
    .slice(0, 3)
    .map((w) => ({ title: w.title, detail: w.detail }))

  // ── Sleutels tot de match ──
  const keys: string[] = []
  if (watch[0]) keys.push(`Stop hun motor: ${watch[0].title.replace(' kort houden', '')}`)
  const goalZoneTip = (patterns?.tips ?? []).find((t) => t.toLowerCase().includes('vallen vooral via'))
  if (goalZoneTip) keys.push('Sluit hun voorkeurzone af en duw hen naar de zwakke kant')
  else if (defend[0]) keys.push(defend[0].title)
  if (attack[0]) keys.push(`Buit uit: ${attack[0].title.toLowerCase()}`)

  // ── Kopzin: grootste dreiging + grootste opening ──
  let headline: string
  if (top && attack[0]) {
    headline = `Neutraliseer #${top.shirtNumber} ${first(top.name)} en speel naar hun opening: ${attack[0].title.toLowerCase()}.`
  } else if (top) {
    headline = `Alles draait om #${top.shirtNumber} ${first(top.name)} (${share}% van de punten) — schakel hem uit.`
  } else if (report.profile.tags.length) {
    headline = `${report.teamName}: ${report.profile.tags.slice(0, 2).join(' · ').toLowerCase()}.`
  } else {
    headline = `Scoutingplan tegen ${report.teamName}.`
  }

  return {
    opponent: report.teamName,
    headline,
    tags: report.profile.tags.slice(0, 5),
    watch: watch.slice(0, 3),
    defend: defend.slice(0, 4),
    attack,
    keys: keys.slice(0, 3),
    matchesAnalyzed: report.matchesAnalyzed,
  }
}
