// Administratieve knipjes (sancties) — type B (WEDSTRIJDBLAD-PROMPT §Knipjes B).
// Teller per speler over het seizoen; bij of boven de drempel kan een speler niet
// geselecteerd worden. Drempel is configureerbaar (Settings.knipjesDrempel), met defaults —
// de echte boetelijst-regels komen later van de federatie.

export type KnipjeRecord = {
  aantal?: number | null
  vervallenOp?: string | Date | null
}

/** Som van de openstaande (niet-vervallen) knipjes van een speler. */
export function openKnipjes(records: KnipjeRecord[], now: Date): number {
  return records.reduce((sum, r) => {
    if (r.vervallenOp) {
      const v = r.vervallenOp instanceof Date ? r.vervallenOp : new Date(r.vervallenOp)
      if (!Number.isNaN(v.getTime()) && v.getTime() <= now.getTime()) return sum // vervallen → telt niet
    }
    return sum + (typeof r.aantal === 'number' ? r.aantal : 1)
  }, 0)
}

/** Geblokkeerd voor selectie wanneer het aantal openstaande knipjes ≥ drempel. */
export function isKnipjesBlocked(openKnipjesTotaal: number, drempel: number): boolean {
  return openKnipjesTotaal >= drempel
}
