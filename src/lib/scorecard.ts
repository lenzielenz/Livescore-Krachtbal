// Scorecard-logica (puur, los testbaar). De radar combineert twee bronnen:
//  • echte matchstatistiek (percentiel binnen de eigen reeks) wanneer het lid aan een speler met
//    wedstrijddata gekoppeld is;
//  • anders een zelf-/coachbeoordeling (skills 0..100) zodat élk lid een kaart heeft.
// De assen lopen gelijk met de analyse-radar (lib/radar-stats + SpelerRadar).

import type { RadarPlayer } from './radar-stats'

export interface ScorecardAxis {
  key: string
  label: string
  /** Korte uitleg (tooltip). */
  full: string
  /** Ruwe waarde uit de matchstatistiek (voor percentielberekening). */
  get: (p: RadarPlayer) => number
  /** Weergave van de ruwe waarde op de kaart. */
  fmt: (v: number) => string
}

export const SCORECARD_AXES: ScorecardAxis[] = [
  { key: 'aanval', label: 'Aanval', full: 'Worpen per wedstrijd', get: (p) => p.throwsPerMatch, fmt: (v) => v.toFixed(1) },
  { key: 'doel', label: 'Doelpunten', full: 'Doelpunten per wedstrijd', get: (p) => p.goalsPerMatch, fmt: (v) => v.toFixed(1) },
  { key: 'succes', label: 'Succes', full: 'Conversie — doelpunten per poging', get: (p) => p.conversion * 100, fmt: (v) => `${Math.round(v)}%` },
  { key: 'effic', label: 'Efficiëntie', full: 'Punten boven/onder verwachting (xG)', get: (p) => p.diff, fmt: (v) => (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1)) },
  { key: 'afstand', label: 'Afstand', full: 'Gemiddelde worpafstand', get: (p) => p.avgDistance, fmt: (v) => `${v.toFixed(1)}m` },
  { key: 'forceren', label: 'Forceren', full: 'Geforceerde worpen per wedstrijd', get: (p) => p.forcedPerMatch, fmt: (v) => v.toFixed(1) },
  { key: 'verded', label: 'Verdediging', full: 'Vangsten per wedstrijd', get: (p) => p.catchesPerMatch, fmt: (v) => v.toFixed(1) },
]

export const SKILL_KEYS: string[] = SCORECARD_AXES.map((a) => a.key)

export type ScorecardSkills = Record<string, number>

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** Percentiel (0..1) van waarde v binnen een lijst: aandeel waarden ≤ v. */
export function percentile(values: number[], v: number): number {
  if (values.length === 0) return 0
  let le = 0
  for (const x of values) if (x <= v) le++
  return le / values.length
}

/** Radar-fracties (0..1 per as) uit echte matchstatistiek: percentiel binnen de reeks-set. */
export function radarFromStats(player: RadarPlayer, all: RadarPlayer[]): number[] {
  return SCORECARD_AXES.map((a) => percentile(all.map((p) => a.get(p)), a.get(player)))
}

/** Radar-fracties (0..1 per as) uit een zelf-/coachbeoordeling (skills 0..100). */
export function radarFromSkills(skills: ScorecardSkills | null | undefined): number[] {
  return SCORECARD_AXES.map((a) => {
    const raw = skills?.[a.key]
    return clamp((typeof raw === 'number' ? raw : 0) / 100, 0, 1)
  })
}

/** Algemene rating (0..100) als gemiddelde van de radar-fracties. */
export function ratingFromFracs(fracs: number[]): number {
  if (fracs.length === 0) return 0
  return Math.round((fracs.reduce((s, f) => s + f, 0) / fracs.length) * 100)
}

/** Saneert een ruwe skills-input naar gehele waarden 0..100 voor enkel de gekende assen. */
export function sanitizeSkills(raw: unknown): ScorecardSkills {
  const out: ScorecardSkills = {}
  if (raw && typeof raw === 'object') {
    for (const key of SKILL_KEYS) {
      const v = (raw as Record<string, unknown>)[key]
      const n = Number(v)
      if (Number.isFinite(n)) out[key] = clamp(Math.round(n), 0, 100)
    }
  }
  return out
}
