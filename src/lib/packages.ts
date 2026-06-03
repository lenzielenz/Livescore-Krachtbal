// Pakketten (abonnementsniveaus) die Krachtbal Live aanbiedt.
//
// Drie niveaus, oplopend in detail. Het pakket hangt aan de CLUB (zie de
// Clubs-collection). Een wedstrijd erft het pakket van de thuisclub
// (resolveMatchPackage), waardoor zowel het aantekenmodel als de publiek
// zichtbare statistieken bepaald worden.
//
// FUNDAMENT: de prijzen hieronder zijn FICTIEF/placeholder — eerst de structuur.
// Pas ze later aan zonder dat de feature-gating verandert.

export type PackageTier = 'starter' | 'team' | 'elite'

export const PACKAGE_TIERS: PackageTier[] = ['starter', 'team', 'elite']

// Aantekenmodel:
//  - 'simple' : snelle scoreknoppen (+1 nekworp / +2 rugworp), géén veldschema.
//               Zelfde model als de tornooi-modus.
//  - 'full'   : volledig 3-staps veldscherm (plek tikken → speler + worptype →
//               afhandeling), met alle afgeleide worpdata.
export type ScoringMode = 'simple' | 'full'

// Welke onderdelen van de statistiekpagina zichtbaar zijn voor dit pakket.
// Het 'full' aantekenmodel registreert altijd ALLE data; deze vlaggen bepalen
// enkel wat publiek getoond wordt ("we houden data achter").
export interface PackageStatsVisibility {
  /** Vergelijkingsbalken per ploeg (worpen, doelpunten, punten, afstand). */
  teamCompare: boolean
  /** Shot map met een punt per worp (uitkomst-kleuren, filters). */
  shotmapDots: boolean
  /** Heatmap-weergave van worpconcentraties op het veld. */
  heatmap: boolean
  /** Aantal meters (worpafstand) per speler. */
  metersPerPlayer: boolean
  /** Volledige spelerstabel (nek/rug, zones, conversie, geforceerd, score). */
  playerTable: boolean
  /** Gedetailleerde speler-kaarten met worptrajecten op een miniveld. */
  playerCards: boolean
}

export interface PackageDef {
  tier: PackageTier
  /** Korte commerciële naam. */
  name: string
  /** Eénregelige omschrijving voor de prijzenpagina. */
  tagline: string
  /** FICTIEVE prijs in EUR per maand (placeholder). */
  priceMonthly: number
  /** Welk aantekenmodel deze club gebruikt. */
  scoringMode: ScoringMode
  /** Bullets voor de prijzenpagina (wat zit erin). */
  features: string[]
  /** Wat publiek zichtbaar is op de statistiekpagina. */
  stats: PackageStatsVisibility
  /** Markeer als aanbevolen op de prijzenpagina. */
  highlight?: boolean
}

const NO_STATS: PackageStatsVisibility = {
  teamCompare: false,
  shotmapDots: false,
  heatmap: false,
  metersPerPlayer: false,
  playerTable: false,
  playerCards: false,
}

const ALL_STATS: PackageStatsVisibility = {
  teamCompare: true,
  shotmapDots: true,
  heatmap: true,
  metersPerPlayer: true,
  playerTable: true,
  playerCards: true,
}

export const PACKAGES: Record<PackageTier, PackageDef> = {
  // Fase 1 — Basis. Snel scoren zoals in een tornooi: +1 nek, +2 rug.
  starter: {
    tier: 'starter',
    name: 'Starter',
    tagline: 'Snel live scoren — ideaal om te starten.',
    priceMonthly: 19,
    scoringMode: 'simple',
    features: [
      'Live scorebord voor het publiek',
      'Snel aantekenen: +1 nekworp, +2 rugworp',
      'Speelklok, time-outs en kruisjes',
      'Eindstand en wedstrijdoverzicht',
    ],
    stats: NO_STATS,
  },

  // Fase 2 — Team. Volledig 3-staps model, maar we houden data achter:
  // enkel meters per speler + heatmap zijn zichtbaar.
  team: {
    tier: 'team',
    name: 'Team',
    tagline: 'Volledig veldscherm met inzicht: meters en heatmap.',
    priceMonthly: 49,
    scoringMode: 'full',
    features: [
      'Alles van Starter',
      'Volledig 3-staps veldscherm (worp per worp)',
      'Heatmap van de worpen',
      'Aantal meters (worpafstand) per speler',
    ],
    stats: {
      ...NO_STATS,
      heatmap: true,
      metersPerPlayer: true,
    },
    highlight: true,
  },

  // Fase 3 — Elite. Alles wat het model aanbiedt.
  elite: {
    tier: 'elite',
    name: 'Elite',
    tagline: 'Alle data die het model biedt — niets achtergehouden.',
    priceMonthly: 99,
    scoringMode: 'full',
    features: [
      'Alles van Team',
      'Volledige spelerstatistieken (nek/rug, conversie, score)',
      'Shot map per worp en richtingverdeling (links/midden/rechts)',
      'Speler-kaarten met worptrajecten',
      'Vergelijkende ploegstatistieken',
    ],
    stats: ALL_STATS,
  },
}

export const DEFAULT_TIER: PackageTier = 'starter'

/** Normaliseer een willekeurige waarde naar een geldig pakketniveau. */
export function asPackageTier(value: unknown): PackageTier {
  return typeof value === 'string' && (PACKAGE_TIERS as string[]).includes(value)
    ? (value as PackageTier)
    : DEFAULT_TIER
}

export function getPackage(tier: unknown): PackageDef {
  return PACKAGES[asPackageTier(tier)]
}

/** Volgorde-lijst voor weergave op de prijzenpagina. */
export const PACKAGE_LIST: PackageDef[] = PACKAGE_TIERS.map((t) => PACKAGES[t])

/** Select-opties voor de Payload-admin (Clubs-collection). */
export const PACKAGE_OPTIONS = PACKAGE_LIST.map((p) => ({
  label: `${p.name} (€${p.priceMonthly}/maand)`,
  value: p.tier,
}))

/**
 * Master-schakelaar voor de pakket-feature (prijspakketten / feature-gating).
 *
 * Op `false` is de feature GEDEACTIVEERD: de hele app valt overal terug op
 * 'Elite' — het volledige veldscherm + alle statistieken, precies zoals vóór de
 * pakketten. De prijzenpagina en de admin pakket-preview verdwijnen.
 *
 * Alle pakketdefinities hierboven blijven bewaard, zodat de feature later weer
 * aangezet kan worden door dit op `true` te zetten.
 */
export const PACKAGES_ENABLED = false

/**
 * Onderliggende afleiding van het clubpakket uit de thuisclub (los van de
 * master-schakelaar). Vereist dat de match met voldoende depth geladen is zodat
 * homeTeam.club een object is (anders valt het terug op het standaardpakket).
 */
export function clubPackageOf(match: { homeTeam?: unknown } | null | undefined): PackageDef {
  const team = match?.homeTeam
  const club = team && typeof team === 'object' ? (team as { club?: unknown }).club : undefined
  const tier = club && typeof club === 'object' ? (club as { package?: unknown }).package : undefined
  return getPackage(tier)
}

/**
 * Effectief pakket van een wedstrijd. Met de pakket-feature uitgeschakeld valt
 * de app terug op 'Elite' (volledige werking); anders erft de wedstrijd het
 * pakket van de thuisclub.
 */
export function resolveMatchPackage(match: { homeTeam?: unknown } | null | undefined): PackageDef {
  if (!PACKAGES_ENABLED) return PACKAGES.elite
  return clubPackageOf(match)
}
