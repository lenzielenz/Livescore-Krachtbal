// Ploegen zoeken zoals mensen ze noemen.
//
// Clubnamen staan officieel anders in de databank dan hoe supporters ze typen: "KBC St. Michiels B"
// zoek je als "Sint Michiels", "'T Botterken Baasrode" als "baasro". Een gewone `includes` faalt
// daarop — op het punt, op de afkorting en op de woordvolgorde.
//
// Regel hier: knip beide kanten in woorden, maak ze gelijkvormig (accenten en leestekens weg,
// courante afkortingen uitgeschreven), en zeg JA wanneer élk getypt woord het BEGIN is van een
// woord in de naam. "sint michiels" vindt dus "KBC St. Michiels B", "baasro" vindt "'T Botterken
// Baasrode", en "michiels sint" (omgekeerde volgorde) werkt ook.

/** Afkortingen die in clubnamen door elkaar gebruikt worden. Beide kanten worden hierop herleid. */
const SYNONIEMEN: Record<string, string> = {
  st: 'sint',
  ste: 'sint',
  snt: 'sint',
  kbc: 'kbc',
  hgn: 'hgn',
}

/** Naam → losse, vergelijkbare woorden. */
export function zoekWoorden(tekst: string): string[] {
  return String(tekst ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // accenten
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ') // punten, apostroffen, koppeltekens, &
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => SYNONIEMEN[w] ?? w)
}

/**
 * Past de zoekterm bij minstens één van de meegegeven velden (ploegnaam, clubnaam, reeks)?
 * Een lege zoekterm past altijd — dan filter je niet.
 */
export function pastBijZoekterm(zoekterm: string, ...velden: (string | null | undefined)[]): boolean {
  const gezocht = zoekWoorden(zoekterm)
  if (gezocht.length === 0) return true
  const doel = velden.filter((v): v is string => Boolean(v)).flatMap(zoekWoorden)
  if (doel.length === 0) return false
  // Elk getypt woord moet ergens vooraan in een woord van de naam zitten. Zo vindt "baasro" wél
  // "Baasrode", maar levert "sint" geen treffer op bij een ploeg die enkel "Michiels" heet.
  return gezocht.every((w) => doel.some((d) => d.startsWith(w)))
}
