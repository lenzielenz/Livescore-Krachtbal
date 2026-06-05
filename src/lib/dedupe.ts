// Normalisatiesleutel om "dezelfde maar net anders geschreven" namen te herkennen
// (ploegen/clubs). Negeert hoofdletters, accenten, leestekens en spaties, en vangt de
// courante varianten op (Sint↔St, & ↔ en). De A/B-poule-suffix blijft behouden, zodat de
// A- en B-ploeg van dezelfde club NIET samengevoegd worden.
export function dedupeKey(name: string): string {
  return String(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\bsint\b/g, 'st')
    .replace(/&/g, 'en')
    .replace(/[^a-z0-9]/g, '')
}
