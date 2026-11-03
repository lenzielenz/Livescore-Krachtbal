import type { Payload } from 'payload'

import { createLimiter } from './concurrency'
import { DB_HOLDERS_MAX } from './db-pool'

// Cross-instance mutex via PostgreSQL advisory locks (AUDIT follow-up: multi-instance schaal).
//
// De in-process async-mutex (async-mutex.ts) serialiseert mutaties binnen ÉÉN Node-proces. Draait
// het platform op meerdere instances (horizontale schaal), dan beschermt dat niet meer. Een
// Postgres advisory lock is een cluster-brede applicatie-mutex: élke writer moet eerst dezelfde
// sleutel claimen vóór hij muteert, ongeacht instance of connectie. Op SQLite (lokaal) bestaat
// dit niet en is de in-process mutex al voldoende → daar is dit een no-op.

type PgClient = { query: (q: string, params?: unknown[]) => Promise<unknown>; release: (destroy?: boolean | Error) => void }
type PgPool = { connect: () => Promise<PgClient> }

// classid scheidt de naamruimtes zodat match-id 5 en tornooiwedstrijd-id 5 niet botsen.
const CLASS = { match: 1, tournamentMatch: 2 } as const

// Elke slot-houder bezet een verbinding van de pool ÉN doet daarbinnen nog queries (via andere
// verbindingen). Liet je evenveel acties tegelijk toe als er verbindingen zijn, dan houden ze die
// allemaal vast en wacht elk op een tweede die nooit vrijkomt. Dus: nooit meer dan DB_HOLDERS_MAX
// tegelijk; de rest wacht in een in-process wachtrij (zonder verbinding te bezetten).
const limitHolders = createLimiter(DB_HOLDERS_MAX)

export async function withDbLock<T>(
  payload: Payload,
  kind: keyof typeof CLASS,
  objId: number,
  fn: () => Promise<T>,
): Promise<T> {
  const pool = (payload.db as { pool?: PgPool }).pool
  if (!pool || !Number.isFinite(objId)) return fn() // geen Postgres-pool (SQLite) → in-process mutex volstaat
  return limitHolders(async () => {
    const client = await pool.connect()
    let unlocked = false
    try {
      await client.query('SELECT pg_advisory_lock($1, $2)', [CLASS[kind], objId])
      return await fn()
    } finally {
      try {
        await client.query('SELECT pg_advisory_unlock($1, $2)', [CLASS[kind], objId])
        unlocked = true
      } catch {
        /* zie hieronder: dan sluiten we de verbinding, en daarmee valt de lock vrij */
      }
      // Lukte het ontgrendelen niet, dan zou een teruggegeven verbinding de lock kunnen blijven vasthouden
      // (een sessie-lock leeft zolang de sessie). Vernietig ze dan: Postgres geeft de lock vrij.
      client.release(!unlocked)
    }
  })
}
