// Speeldagen: welke dagen wordt er gespeeld, en hoeveel wedstrijden staan er dan?
//
// Het live-bord sprong met de pijltjes gewoon één dag verder. In een competitie die enkel in het
// weekend speelt, betekent dat vier keer tikken op leegte voor je bij de volgende wedstrijd bent.
// Met de lijst hieronder springen de pijltjes meteen naar de volgende dag waar écht iets staat, en
// kan de datumkiezer per dag tonen hoeveel wedstrijden er gepland zijn.

export interface Speeldag {
  /** jjjj-mm-dd (Belgische dag). */
  datum: string
  aantal: number
}

/** De eerstvolgende speeldag ná `datum`, of null als er niets meer komt. */
export function volgendeSpeeldag(dagen: Speeldag[], datum: string): string | null {
  for (const d of dagen) if (d.datum > datum) return d.datum
  return null
}

/** De laatste speeldag vóór `datum`, of null als er niets eerder is. */
export function vorigeSpeeldag(dagen: Speeldag[], datum: string): string | null {
  let uit: string | null = null
  for (const d of dagen) {
    if (d.datum >= datum) break
    uit = d.datum
  }
  return uit
}

/** Aantal wedstrijden op een dag (0 als er niets staat). */
export function aantalOp(dagen: Speeldag[], datum: string): number {
  return dagen.find((d) => d.datum === datum)?.aantal ?? 0
}

/**
 * De speeldagen die je in de kiezer toont: rond de huidige datum, zodat een seizoen van tientallen
 * speeldagen niet als één lange sliert opent. Altijd inclusief de huidige dag zelf, ook wanneer
 * daar niets staat (anders lijkt de kiezer je selectie kwijt te zijn).
 */
export function speeldagenRond(dagen: Speeldag[], datum: string, ervoor = 4, erna = 12): Speeldag[] {
  const index = dagen.findIndex((d) => d.datum >= datum)
  const pos = index < 0 ? dagen.length : index
  const van = Math.max(0, pos - ervoor)
  const venster = dagen.slice(van, pos + erna)
  if (venster.some((d) => d.datum === datum)) return venster
  // Huidige dag heeft geen wedstrijden: toch tonen, op de juiste plaats in de reeks.
  const met = [...venster, { datum, aantal: 0 }]
  met.sort((a, b) => a.datum.localeCompare(b.datum))
  return met
}

/**
 * Alle speeldagen van het hele seizoen — voor een datumkiezer die niet na een paar weken afkapt
 * (de kiezer scrollt toch al binnen z'n eigen vak). Zelfde "houd de huidige dag erbij"-garantie als
 * speeldagenRond hierboven.
 */
export function alleSpeeldagen(dagen: Speeldag[], datum: string): Speeldag[] {
  if (dagen.some((d) => d.datum === datum)) return dagen
  const met = [...dagen, { datum, aantal: 0 }]
  met.sort((a, b) => a.datum.localeCompare(b.datum))
  return met
}
