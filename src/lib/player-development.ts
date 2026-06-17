// ── Spelersontwikkeling: Skill + Fame verenigd (geïnspireerd op 4GOAL, on-brand voor krachtbal) ──
//
// Eén ontwikkelings-identiteit per speler, opgebouwd uit ECHTE on-field data — niets apart
// opgeslagen, alles afgeleid (zelfde principe als de rest van het platform):
//   • SKILL  = beter worden   → uit de seizoens-/carrièrestatistiek (worpen, doelpunten, rugworpen,
//                                conversie, afstand) — de prestatie-as.
//   • FAME   = erkenning       → uit 'held van de match'-stemmen die de speler ONTVING, plus
//                                doelpunten en deelnames — de herkennings-as.
// Beide assen hebben niveaus; samen vormen ze een overall ontwikkelingsniveau (medaille-tier).
// De badges hangen aan beide assen. Pure module → los testbaar; de pagina levert de cijfers aan.

export interface PlayerDevInput {
  /** Aantal wedstrijden waarin de speler worpen registreerde. */
  matches: number
  throws: number
  /** Alle doelpunten (nek + rug). */
  goals: number
  /** Rugworp-doelpunten (tellen dubbel en zijn moeilijker → extra gewicht). */
  rug: number
  /** Conversie 0..1 (doelpunten / doelpogingen). */
  conversion: number
  /** Doelpogingen — drempel zodat conversie pas telt bij genoeg volume. */
  goalAttempts: number
  /** Verste worp (m). */
  maxDistance: number
  /** Doelpunten per zone (voor de 'alzijdig'-badge). */
  zones: { links: number; midden: number; rechts: number }
  /** 'Held van de match'-stemmen die de speler ONTVING (Fame). */
  mvpVotesReceived: number
}

export interface DevAxis {
  key: 'skill' | 'fame'
  label: string
  score: number
  level: number
  levelName: string
  /** Punten binnen het huidige niveau. */
  intoLevel: number
  /** Breedte van het huidige niveau in punten (null op het maxniveau). */
  span: number | null
  /** Absolute drempel van het volgende niveau (null op het maxniveau). */
  nextAt: number | null
  /** Voortgang naar het volgende niveau, 0..100. */
  pct: number
  /** Is dit het hoogste niveau? */
  maxed: boolean
}

export interface PlayerDevBadge {
  key: string
  emoji: string
  title: string
  desc: string
  axis: 'skill' | 'fame'
  earned: boolean
  /** Voortgang naar de drempel (enkel bij telbare badges). */
  progress?: { have: number; need: number }
}

export interface PlayerDevelopment {
  skill: DevAxis
  fame: DevAxis
  overall: {
    score: number
    /** Tier-index 1..N. */
    level: number
    tier: string
    nextTier: string | null
    nextAt: number | null
    pct: number
    maxed: boolean
  }
  badges: PlayerDevBadge[]
  earnedBadges: number
  totalBadges: number
}

// ── Niveau-banden ────────────────────────────────────────────────────────────────────────────
// Drempels zijn de absolute score om een niveau te BEREIKEN (index 0 = niveau 1, drempel 0).

export const SKILL_THRESHOLDS = [0, 60, 180, 400, 750, 1300, 2200] as const
export const SKILL_LEVELS = [
  'Rekruut',
  'Werper',
  'Scherpschutter',
  'Sluipschutter',
  'Meesterwerper',
  'Krachtbal-artiest',
  'Legende',
] as const

export const FAME_THRESHOLDS = [0, 15, 50, 120, 250, 500, 900] as const
export const FAME_LEVELS = [
  'Onbekend',
  'Opgemerkt',
  'Publiekskennis',
  'Fanfavoriet',
  'Ster',
  'Idool',
  'Legende',
] as const

export const TIER_THRESHOLDS = [0, 200, 600, 1400, 2800, 5000] as const
export const TIER_NAMES = ['Brons', 'Zilver', 'Goud', 'Platina', 'Diamant', 'Legende'] as const

function band(
  score: number,
  thresholds: readonly number[],
  names: readonly string[],
): { level: number; name: string; intoLevel: number; span: number | null; nextAt: number | null; pct: number; maxed: boolean } {
  const s = Math.max(0, Math.floor(score))
  let level = 1
  for (let i = 0; i < thresholds.length; i++) if (s >= thresholds[i]) level = i + 1
  const idx = level - 1
  const base = thresholds[idx]
  const nextAt = idx + 1 < thresholds.length ? thresholds[idx + 1] : null
  const span = nextAt != null ? nextAt - base : null
  const intoLevel = s - base
  const maxed = nextAt == null
  const pct = span && span > 0 ? Math.min(100, Math.round((intoLevel / span) * 100)) : 100
  return { level, name: names[idx], intoLevel, span, nextAt, pct, maxed }
}

// ── Score-formules (transparant en uitlegbaar) ───────────────────────────────────────────────

/** SKILL: volume (ervaring) + doelpunten + rugworp-bonus + conversie (bij genoeg volume) + afstand. */
export function skillScore(i: PlayerDevInput): number {
  const conv = i.goalAttempts >= 10 ? Math.round(Math.max(0, Math.min(1, i.conversion)) * 80) : 0
  return (
    Math.max(0, i.throws) +
    Math.max(0, i.goals) * 10 +
    Math.max(0, i.rug) * 5 +
    conv +
    Math.round(Math.max(0, i.maxDistance) * 1.5)
  )
}

/** FAME: ontvangen MVP-stemmen wegen het zwaarst, plus doelpunten (vallen op) en deelnames. */
export function fameScore(i: PlayerDevInput): number {
  return Math.max(0, i.mvpVotesReceived) * 6 + Math.max(0, i.goals) * 3 + Math.max(0, i.matches) * 2
}

// ── Badges ───────────────────────────────────────────────────────────────────────────────────

const tier = (
  axis: 'skill' | 'fame',
  key: string,
  emoji: string,
  title: string,
  desc: string,
  have: number,
  need: number,
): PlayerDevBadge => ({
  axis,
  key,
  emoji,
  title,
  desc,
  earned: have >= need,
  progress: { have: Math.min(Math.max(0, Math.floor(have)), need), need },
})

const flag = (
  axis: 'skill' | 'fame',
  key: string,
  emoji: string,
  title: string,
  desc: string,
  earned: boolean,
): PlayerDevBadge => ({ axis, key, emoji, title, desc, earned })

export function playerBadges(i: PlayerDevInput): PlayerDevBadge[] {
  const allZones = i.zones.links > 0 && i.zones.midden > 0 && i.zones.rechts > 0
  return [
    // SKILL — volume & afwerking
    tier('skill', 'throws50', '🎯', 'Eerste worpen', 'Registreer 50 worpen', i.throws, 50),
    tier('skill', 'throws250', '💪', 'Ervaren werper', 'Registreer 250 worpen', i.throws, 250),
    tier('skill', 'throws1000', '🛡️', 'Worp-veteraan', 'Registreer 1000 worpen', i.throws, 1000),
    tier('skill', 'goals5', '⚽', 'Scorer', 'Maak 5 doelpunten', i.goals, 5),
    tier('skill', 'goals25', '🔥', 'Doelpuntenmaker', 'Maak 25 doelpunten', i.goals, 25),
    tier('skill', 'goals75', '🚀', 'Goalmachine', 'Maak 75 doelpunten', i.goals, 75),
    tier('skill', 'rug5', '🤸', 'Rugworp-specialist', 'Scoor 5 rugworpen (dubbel)', i.rug, 5),
    tier('skill', 'rug20', '👑', 'Rugworp-koning', 'Scoor 20 rugworpen', i.rug, 20),
    flag('skill', 'sharp', '🏹', 'Scherpschutter', '40%+ conversie (min. 20 pogingen)', i.goalAttempts >= 20 && i.conversion >= 0.4),
    flag('skill', 'range35', '📏', 'Langeafstandsschutter', 'Een worp van 35m+', i.maxDistance >= 35),
    flag('skill', 'range45', '💥', 'Kanon', 'Een worp van 45m+', i.maxDistance >= 45),
    flag('skill', 'allzones', '🧭', 'Alzijdig', 'Scoorde links, midden én rechts', allZones),

    // FAME — erkenning & aanwezigheid
    tier('fame', 'mvp1', '🌟', 'Held van de match', 'Ontvang 1 supporterstem', i.mvpVotesReceived, 1),
    tier('fame', 'mvp25', '💖', 'Publiekslieveling', 'Ontvang 25 supporterstemmen', i.mvpVotesReceived, 25),
    tier('fame', 'mvp100', '🏆', 'Idool', 'Ontvang 100 supporterstemmen', i.mvpVotesReceived, 100),
    tier('fame', 'apps10', '📋', 'Vaste basis', 'Speel 10 wedstrijden', i.matches, 10),
    tier('fame', 'apps25', '🧱', 'Steunpilaar', 'Speel 25 wedstrijden', i.matches, 25),
  ]
}

/** Bouw de volledige ontwikkeling (Skill + Fame + overall + badges) uit de ruwe spelerscijfers. */
export function buildPlayerDevelopment(i: PlayerDevInput): PlayerDevelopment {
  const sScore = skillScore(i)
  const fScore = fameScore(i)
  const sb = band(sScore, SKILL_THRESHOLDS, SKILL_LEVELS)
  const fb = band(fScore, FAME_THRESHOLDS, FAME_LEVELS)
  const oScore = sScore + fScore
  const ob = band(oScore, TIER_THRESHOLDS, TIER_NAMES)

  const skill: DevAxis = { key: 'skill', label: 'Skill', score: sScore, level: sb.level, levelName: sb.name, intoLevel: sb.intoLevel, span: sb.span, nextAt: sb.nextAt, pct: sb.pct, maxed: sb.maxed }
  const fame: DevAxis = { key: 'fame', label: 'Fame', score: fScore, level: fb.level, levelName: fb.name, intoLevel: fb.intoLevel, span: fb.span, nextAt: fb.nextAt, pct: fb.pct, maxed: fb.maxed }

  const badges = playerBadges(i)
  return {
    skill,
    fame,
    overall: {
      score: oScore,
      level: ob.level,
      tier: ob.name,
      nextTier: ob.maxed ? null : TIER_NAMES[ob.level] ?? null,
      nextAt: ob.nextAt,
      pct: ob.pct,
      maxed: ob.maxed,
    },
    badges,
    earnedBadges: badges.filter((b) => b.earned).length,
    totalBadges: badges.length,
  }
}
