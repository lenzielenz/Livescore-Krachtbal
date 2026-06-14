// ── Bonusrad ────────────────────────────────────────────────────────────────────────────────
// De winnaar van de pronostiek van vórig weekend mag aan een rad draaien. Het rad kiest 3
// wedstrijden van het komende weekend die DUBBELE punten waard worden. Pure helpers → los testbaar;
// de server (API/loader) doet de payload-kant.

/** Puntenmultiplier voor een bonuswedstrijd. */
export const BONUS_MULTIPLIER = 2
/** Aantal wedstrijden dat het rad uitkiest. */
export const BONUS_COUNT = 3

/** ISO-datum van zeven dagen geleden — om het venster van "vorig weekend" te bepalen. */
export function prevWeekendDateIso(now: Date = new Date()): string {
  const d = new Date(now)
  d.setDate(d.getDate() - 7)
  return d.toISOString()
}

/**
 * Kies (tot) `count` verschillende items uit `items` met een meegegeven random-bron (0..1).
 * Partiële Fisher-Yates: onvertekend en stopt zodra we er genoeg hebben. Met een vaste rng
 * is dit deterministisch → testbaar.
 */
export function pickBonusMatches<T>(items: T[], count: number, rand: () => number = Math.random): T[] {
  const pool = items.slice()
  const n = Math.min(count, pool.length)
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rand() * (pool.length - i))
    const k = Math.max(i, Math.min(pool.length - 1, j))
    ;[pool[i], pool[k]] = [pool[k], pool[i]]
  }
  return pool.slice(0, n)
}
