import type { Payload } from 'payload'

// Privé-pronostiekpools: een groepje dat een eigen pronostiekje speelt over een bepaalde scope
// (hele club, één ploeg of een reeks), met een apart klassement. Opgeslagen als json op de club
// die de pool host. Leden kunnen van een ándere ploeg/club zijn (uitnodiging via deelcode).
// Voorspellingen blijven globaal per lid/wedstrijd en tellen mee in elke pool waarin je zit.

export interface Pool {
  id: string
  name: string
  /** 'club' | 'team:<teamId>' | 'reeks:<reeksCode>' */
  scope: string
  ownerId: number
  members: number[]
  code: string
  seizoen: string
  createdAt: number
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // zonder verwarrende tekens (0/O, 1/I)

export function genPoolCode(): string {
  let s = ''
  for (let i = 0; i < 6; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  return s
}

export function genPoolId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

/** Leest de pools van een club veilig uit het json-veld. */
export function readPools(raw: unknown): Pool[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (p): p is Pool =>
      Boolean(p) && typeof (p as Pool).id === 'string' && typeof (p as Pool).code === 'string' && Array.isArray((p as Pool).members),
  )
}

export interface HostedPool {
  pool: Pool
  hostClubId: number
}

/** Alle pools van alle clubs (met host-club), zodat joinen/leden over ploeg- en clubgrenzen werkt. */
export async function loadAllPools(payload: Payload): Promise<HostedPool[]> {
  const res = await payload
    .find({ collection: 'clubs', depth: 0, limit: 1000, pagination: false, select: { pronostiekPools: true } })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const out: HostedPool[] = []
  for (const c of res.docs) {
    const hostClubId = Number((c as { id: number }).id)
    for (const pool of readPools((c as { pronostiekPools?: unknown }).pronostiekPools)) out.push({ pool, hostClubId })
  }
  return out
}

/** Label voor een scope, gegeven een reeks-namer. */
export function poolScopeLabel(scope: string, teamName: (id: number) => string, reeksName: (code: string) => string): string {
  if (scope.startsWith('team:')) return teamName(Number(scope.slice(5)))
  if (scope.startsWith('reeks:')) return `Reeks · ${reeksName(scope.slice(6))}`
  return 'Hele club'
}
