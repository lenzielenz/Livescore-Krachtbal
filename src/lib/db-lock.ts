import type { Payload } from 'payload'

// Cross-instance mutex via PostgreSQL advisory locks (AUDIT follow-up: multi-instance schaal).
//
// De in-process async-mutex (async-mutex.ts) serialiseert mutaties binnen ÉÉN Node-proces. Draait
// het platform op meerdere instances (horizontale schaal), dan beschermt dat niet meer. Een
// Postgres advisory lock is een cluster-brede applicatie-mutex: élke writer moet eerst dezelfde
// sleutel claimen vóór hij muteert, ongeacht instance of connectie. Op SQLite (lokaal) bestaat
// dit niet en is de in-process mutex al voldoende → daar is dit een no-op.

type PgPool = { connect: () => Promise<{ query: (q: string, params?: unknown[]) => Promise<unknown>; release: () => void }> }

// classid scheidt de naamruimtes zodat match-id 5 en tornooiwedstrijd-id 5 niet botsen.
const CLASS = { match: 1, tournamentMatch: 2 } as const

export async function withDbLock<T>(
  payload: Payload,
  kind: keyof typeof CLASS,
  objId: number,
  fn: () => Promise<T>,
): Promise<T> {
  const pool = (payload.db as { pool?: PgPool }).pool
  if (!pool || !Number.isFinite(objId)) return fn() // geen Postgres-pool (SQLite) → in-process mutex volstaat
  const client = await pool.connect()
  try {
    await client.query('SELECT pg_advisory_lock($1, $2)', [CLASS[kind], objId])
    return await fn()
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1, $2)', [CLASS[kind], objId])
    } catch {
      /* lock valt sowieso vrij wanneer de sessie sluit */
    }
    client.release()
  }
}
