// Uniek id per aantekenaar-actie (idempotentie). De action-route gebruikt het om een heruitgezonden
// actie — offline-wachtrij (at-least-once), een dubbele tik of een handmatige retry — niet dubbel toe
// te passen. De opId reist mee in de offline-wachtrij, zodat een retry exact dezelfde id hergebruikt.
export function genOpId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  } catch {}
  return `op-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
