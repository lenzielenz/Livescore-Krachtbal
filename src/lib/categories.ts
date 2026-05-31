// Categorie bepaalt speelduur, worpaantal en (later) balgewicht — bron: KVKBF reglement 01072025.
// Eén bron van waarheid, gedeeld door Teams, Matches en de regellogica (fase 3).

export const CATEGORIES = ['U12', 'U14', 'U16', 'U18', 'U20', 'senioren'] as const

export type Category = (typeof CATEGORIES)[number]

export const CATEGORY_OPTIONS = CATEGORIES.map((c) => ({
  label: c === 'senioren' ? 'Senioren' : c,
  value: c,
}))

// Jeugd = U12/U14/U16 (kortere helften, één worp extra per opzet).
const YOUTH: ReadonlySet<Category> = new Set<Category>(['U12', 'U14', 'U16'])

export type CategoryConfig = {
  /** Lengte van één helft in seconden. */
  halfDurationSeconds: number
  /** Worpen bij opzet vanaf eigen helft. */
  throwsFromOwnHalf: number
  /** Worpen bij opzet op tegenhelft. */
  throwsFromOpponentHalf: number
  isYouth: boolean
}

export function categoryConfig(category: Category): CategoryConfig {
  const isYouth = YOUTH.has(category)
  return {
    // 2×20 min jeugd, 2×25 min U18/U20/senioren.
    halfDurationSeconds: (isYouth ? 20 : 25) * 60,
    // Eigen helft: 3 worpen (4 bij jeugd). Tegenhelft: 2 (3 bij jeugd).
    throwsFromOwnHalf: isYouth ? 4 : 3,
    throwsFromOpponentHalf: isYouth ? 3 : 2,
    isYouth,
  }
}
