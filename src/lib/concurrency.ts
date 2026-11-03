// Kleine hulpmiddelen om de Postgres-pool nooit te overspoelen (zie docs/ARCHITECTURE.md → databankpool).
//
// Achtergrond: op 2026-10-30 viel de productie-app stil nadat tientallen schrijfacties en polls tegelijk
// een verbinding vroegen aan een pool van 10. Elke Payload-transactie houdt een verbinding vast en vraagt
// binnenin nog een tweede (hooks, geneste lezingen) — als álle verbindingen zo wachten op een tweede,
// komt er nooit meer een vrij (deadlock) tot Postgres de transacties na 60 s afsluit. Twee regels voorkomen dat:
//  1. werk dat niet meteen hoeft (bewaren van tellers, periodieke polls) loopt nooit massaal tegelijk;
//  2. een periodieke taak start nooit opnieuw zolang de vorige nog bezig is.

/**
 * Beperkt het aantal gelijktijdige taken tot `max`; de rest wacht in een wachtrij (in-process).
 * Een taak die faalt, houdt de rij niet op: de fout gaat naar de aanroeper.
 */
export function createLimiter(max: number): <T>(fn: () => Promise<T>) => Promise<T> {
  const limit = Math.max(1, Math.floor(max))
  let running = 0
  const waiting: Array<() => void> = []

  const next = () => {
    const start = waiting.shift()
    if (start) start()
    else running -= 1
  }

  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    if (running >= limit) {
      // Wacht tot een lopende taak ons zijn plaats geeft (running blijft dan gelijk: de plaats gaat over).
      await new Promise<void>((resolve) => waiting.push(resolve))
    } else {
      running += 1
    }
    try {
      return await fn()
    } finally {
      next()
    }
  }
}

/**
 * Bewaakt een periodieke taak: `enter()` geeft een sleutel zolang de vorige uitvoering klaar is (of
 * langer dan `maxMs` blijft hangen — een noodgreep zodat één vastgelopen poll de updates niet voor altijd
 * stillegt), anders `null` en dan hoort de tick overgeslagen te worden. Roep `leave(sleutel)` aan als de
 * taak klaar is.
 */
export function createFlightGuard(maxMs = 15_000, now: () => number = Date.now) {
  let current: { since: number } | null = null
  return {
    enter(): object | null {
      if (current && now() - current.since < maxMs) return null
      current = { since: now() }
      return current
    },
    leave(token: object | null): void {
      if (token && current === token) current = null
    },
    get busy(): boolean {
      return current !== null && now() - current.since < maxMs
    },
  }
}
