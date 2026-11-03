import { getPayload } from 'payload'

import config from '@/payload.config'

type PgPoolLike = { on?: (event: 'error', cb: (err: Error) => void) => unknown; listenerCount?: (event: string) => number }
const bewaakt = new WeakSet<object>()

/** Gedeelde Payload-instantie voor server-routes en server components. */
export async function getPayloadClient() {
  const payload = await getPayload({ config: await config })
  // Een verbinding die Postgres afsluit terwijl ze ongebruikt in de pool zit (idle-in-transaction-timeout,
  // herstart van de databank, netwerkstoring) geeft een 'error'-event op de pool. Zonder luisteraar wordt dat
  // een `uncaughtException` (2026-10-30: zes keer tegelijk in de logs). De pool ruimt de kapotte verbinding
  // zelf op; wij loggen het enkel.
  const pool = (payload.db as { pool?: PgPoolLike }).pool
  if (pool?.on && !bewaakt.has(pool) && !pool.listenerCount?.('error')) {
    bewaakt.add(pool)
    pool.on('error', (err) => payload.logger.error({ err }, 'Postgres-pool: verbinding verbroken (de pool herstelt zichzelf)'))
  }
  return payload
}
