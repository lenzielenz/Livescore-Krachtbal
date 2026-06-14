// Privé-pronostiekpools: een groepje binnen een club dat een eigen pronostiekje speelt over een
// bepaalde scope (hele club, één ploeg of een reeks), met een apart klassement. Opgeslagen als
// json op de club. Voorspellingen blijven globaal per lid/wedstrijd en tellen mee in elke pool.

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

/** Label voor een scope, gegeven een reeks-namer. */
export function poolScopeLabel(scope: string, teamName: (id: number) => string, reeksName: (code: string) => string): string {
  if (scope.startsWith('team:')) return teamName(Number(scope.slice(5)))
  if (scope.startsWith('reeks:')) return `Reeks · ${reeksName(scope.slice(6))}`
  return 'Hele club'
}
