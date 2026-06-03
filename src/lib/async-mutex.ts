// In-process, per-sleutel async mutex (AUDIT §2). Serialiseert muterende engine-operaties per
// wedstrijd zodat twee gelijktijdige acties (twee toestellen, of throw+undo) nooit interleaven —
// de niet-atomaire read-modify-write in recordThrow/undoLastThrow kan dan geen dubbele
// worpnummers of twee open balbezitten meer veroorzaken.
//
// DECISION: dit beschermt binnen ÉÉN Node-instantie (de huidige Railway-opstelling). Voor échte
// multi-instance schaal hoort hier bovenop een DB-rijlock (Postgres SELECT … FOR UPDATE binnen
// een transactie) te komen. Zie AUDIT-2026-06.md "missing".

const tails = new Map<string, Promise<unknown>>()

/** Voer `fn` uit zodra alle eerder voor dezelfde `key` ingediende taken klaar zijn. */
export function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = tails.get(key) ?? Promise.resolve()
  // Draai fn zodra prev settelt (ongeacht succes/fout — daarom fn op beide callbacks).
  const run = prev.then(fn, fn)
  // Niet-gooiende staart zodat één fout de wachtrij niet vergiftigt.
  const tail = run.then(
    () => undefined,
    () => undefined,
  )
  tails.set(key, tail)
  // Opruimen wanneer deze taak de laatste in de rij was.
  void tail.then(() => {
    if (tails.get(key) === tail) tails.delete(key)
  })
  return run
}
