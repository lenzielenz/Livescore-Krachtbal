// Afmetingen van de Postgres-pool — op één plek, zodat payload.config.ts en db-lock.ts dezelfde cijfers gebruiken.

/** Maximum aantal verbindingen van de pool (pg-standaard is 10; Railway-Postgres laat er 100 toe). */
export const DB_POOL_MAX = Math.max(4, Number(process.env.DB_POOL_MAX) || 20)

/**
 * Hoe lang een verzoek op een vrije verbinding wacht vóór het faalt. pg-standaard is 0 = EEUWIG wachten,
 * waardoor een volle pool de hele site laat hangen i.p.v. een snelle, zichtbare fout te geven.
 */
export const DB_CONNECT_TIMEOUT_MS = 15_000

/**
 * Hoeveel verbindingen tegelijk als "slot-houder" (withDbLock) of achtergrondschrijver mogen dienen.
 * Altijd minder dan de helft van de pool: wie een verbinding vasthoudt, vraagt binnenin nog een tweede.
 */
export const DB_HOLDERS_MAX = Math.max(1, Math.floor(DB_POOL_MAX / 2) - 1)
