// Bepaalt of een wedstrijd ontgrendeld is om te openen/starten in het aantekenscherm.
// Pure module (geen payload-imports) → veilig in zowel server- als client-bundels.
//
// Een wedstrijd is "klaar" wanneer:
//   - beide ploegen een volledige opstelling hebben (≥ LINEUP_MIN veldspelers), én
//   - de scheidsrechter akkoord gaf om te starten (controle vooraf).
// Een demo-/oefenwedstrijd is altijd klaar (alle controles worden overgeslagen). Ook een
// supporters-wedstrijd (vrije livescore) is altijd klaar: de scheidsrechterflow valt daar weg.

// Een volledige opstelling telt 4 veldspelers (= FIELD_PLAYERS in match-engine).
export const LINEUP_MIN = 4

export type Readiness = {
  homeCount: number
  awayCount: number
  homeOk: boolean
  awayOk: boolean
  refereeOk: boolean
  isDemo: boolean
  analyseOnly: boolean
  /** Supporters-modus: vrije livescore, geen scheidsrechter-/aftekenflow. */
  supportersMode: boolean
  /** Volledig klaar om te openen (demo/supporters OF alle controles in orde). */
  ready: boolean
}

/** Telt de gevulde opstellingsregels (rijen met een gekoppelde speler). */
export function countLineup(rows: unknown): number {
  if (!Array.isArray(rows)) return 0
  return rows.filter((r) => (r as { player?: unknown } | null)?.player != null).length
}

export function computeReadiness(opts: {
  homeLineup: unknown
  awayLineup: unknown
  refereeAkkoord: boolean
  isDemo: boolean
  analyseOnly?: boolean
  supportersMode?: boolean
}): Readiness {
  const homeCount = countLineup(opts.homeLineup)
  const awayCount = countLineup(opts.awayLineup)
  const homeOk = homeCount >= LINEUP_MIN
  const awayOk = awayCount >= LINEUP_MIN
  const refereeOk = Boolean(opts.refereeAkkoord)
  const isDemo = Boolean(opts.isDemo)
  const analyseOnly = Boolean(opts.analyseOnly)
  const supportersMode = Boolean(opts.supportersMode)
  return {
    homeCount,
    awayCount,
    homeOk,
    awayOk,
    refereeOk,
    isDemo,
    analyseOnly,
    supportersMode,
    // Analyse-wedstrijd: geen scheidsrechtersakkoord nodig, maar wél opstellingen
    // (anders kunnen we worpen niet aan spelers koppelen). Demo/supporters: altijd klaar.
    ready: isDemo || supportersMode || (homeOk && awayOk && (refereeOk || analyseOnly)),
  }
}

/** De ontbrekende stappen, voor een korte foutmelding/checklist. */
export function missingSteps(r: Readiness): string[] {
  // Supporters-wedstrijd: vrije livescore, geen voorwaarden om te starten.
  if (r.supportersMode) return []
  const missing: string[] = []
  if (!r.homeOk) missing.push('opstelling thuis')
  if (!r.awayOk) missing.push('opstelling uit')
  // Een analysewedstrijd heeft geen scheidsrechtersakkoord nodig — niet als ontbrekend melden.
  if (!r.refereeOk && !r.analyseOnly) missing.push('akkoord scheidsrechter')
  return missing
}
