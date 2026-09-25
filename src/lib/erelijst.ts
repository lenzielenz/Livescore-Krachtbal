// Erelijst: samenvattingen en zoekfunctie over de drie historische archiefcollections
// (kampioenen, bekerwinnaars, referendum-awards). Pure functies → los testbaar, geen Payload-calls
// hier — de pagina haalt de ruwe documenten op en geeft ze hieraan door.

export interface KampioenenSeizoenInput {
  seizoen: string
  seizoenKey?: string | null
  reeksen: { reeksNaam: string; kampioen: string }[]
}

export interface BekerwinnaarsSeizoenInput {
  seizoen: string
  seizoenKey?: string | null
  winnaars: { categorie: string; ploeg: string }[]
}

export interface ReferendumPrijsInput {
  prijs: string
  winnaars: { jaar: string; naam: string; club: string }[]
}

export interface ClubTrofee {
  naam: string
  titels: number
  bekers: number
  totaal: number
}

export interface Laureaat {
  naam: string
  aantal: number
  prijzen: string[]
}

export type ErelijstZoekresultaat =
  | { type: 'kampioen'; seizoen: string; reeksNaam: string; naam: string }
  | { type: 'beker'; seizoen: string; categorie: string; naam: string }
  | { type: 'referendum'; prijs: string; jaar: string; naam: string; club: string }

// Placeholders die in de brondata bewust letterlijk overgenomen zijn (COVID-seizoenen, onbekende
// winnaar "?", ontbrekende data) — tellen niet mee als een "prijs" in de samenvattingen.
const PLACEHOLDERS = new Set(['?', '-', '--', '---', 'geen', 'nihil', '(geen gegevens)', '(geen gegevens beschikbaar)'])

function isPlaceholder(naam: string | undefined | null): boolean {
  const t = (naam ?? '').trim().toLowerCase()
  if (!t) return true
  if (PLACEHOLDERS.has(t)) return true
  if (t.startsWith('geen ')) return true
  if (t.startsWith('competitie stopgezet')) return true
  return false
}

/** Telt per club het aantal titels (kampioenen) en bekers (bekerwinnaars), gesorteerd op totaal. */
export function telClubTrofeeen(kampioenenSeizoenen: KampioenenSeizoenInput[], bekerwinnaarsSeizoenen: BekerwinnaarsSeizoenInput[]): ClubTrofee[] {
  const map = new Map<string, ClubTrofee>()
  const bump = (naam: string | undefined, veld: 'titels' | 'bekers') => {
    if (isPlaceholder(naam)) return
    const key = (naam as string).trim()
    const bestaand = map.get(key) ?? { naam: key, titels: 0, bekers: 0, totaal: 0 }
    bestaand[veld] += 1
    bestaand.totaal += 1
    map.set(key, bestaand)
  }
  for (const seizoen of kampioenenSeizoenen) {
    for (const reeks of seizoen.reeksen ?? []) bump(reeks.kampioen, 'titels')
  }
  for (const seizoen of bekerwinnaarsSeizoenen) {
    for (const winnaar of seizoen.winnaars ?? []) bump(winnaar.ploeg, 'bekers')
  }
  return [...map.values()].sort((a, b) => b.totaal - a.totaal || a.naam.localeCompare(b.naam))
}

/** Telt per persoon het aantal referendum-prijzen, gesorteerd op totaal. */
export function telLaureaten(referendumPrijzen: ReferendumPrijsInput[]): Laureaat[] {
  const map = new Map<string, Laureaat>()
  for (const prijs of referendumPrijzen) {
    for (const winnaar of prijs.winnaars ?? []) {
      if (isPlaceholder(winnaar.naam)) continue
      const key = winnaar.naam.trim()
      const bestaand = map.get(key) ?? { naam: key, aantal: 0, prijzen: [] }
      bestaand.aantal += 1
      if (!bestaand.prijzen.includes(prijs.prijs)) bestaand.prijzen.push(prijs.prijs)
      map.set(key, bestaand)
    }
  }
  return [...map.values()].sort((a, b) => b.aantal - a.aantal || a.naam.localeCompare(b.naam))
}

/** Zoekt een club- of spelernaam (deelstring, hoofdletterongevoelig) doorheen alle drie archieven. */
export function zoekErelijst(
  query: string,
  kampioenenSeizoenen: KampioenenSeizoenInput[],
  bekerwinnaarsSeizoenen: BekerwinnaarsSeizoenInput[],
  referendumPrijzen: ReferendumPrijsInput[],
): ErelijstZoekresultaat[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const resultaten: ErelijstZoekresultaat[] = []

  for (const seizoen of kampioenenSeizoenen) {
    for (const reeks of seizoen.reeksen ?? []) {
      if (isPlaceholder(reeks.kampioen)) continue
      if (reeks.kampioen.toLowerCase().includes(q)) {
        resultaten.push({ type: 'kampioen', seizoen: seizoen.seizoen, reeksNaam: reeks.reeksNaam, naam: reeks.kampioen })
      }
    }
  }
  for (const seizoen of bekerwinnaarsSeizoenen) {
    for (const winnaar of seizoen.winnaars ?? []) {
      if (isPlaceholder(winnaar.ploeg)) continue
      if (winnaar.ploeg.toLowerCase().includes(q)) {
        resultaten.push({ type: 'beker', seizoen: seizoen.seizoen, categorie: winnaar.categorie, naam: winnaar.ploeg })
      }
    }
  }
  for (const prijs of referendumPrijzen) {
    for (const winnaar of prijs.winnaars ?? []) {
      if (isPlaceholder(winnaar.naam)) continue
      if (winnaar.naam.toLowerCase().includes(q)) {
        resultaten.push({ type: 'referendum', prijs: prijs.prijs, jaar: winnaar.jaar, naam: winnaar.naam, club: winnaar.club })
      }
    }
  }

  // Recentste eerst: seizoen/jaar zijn strings die al aflopend chronologisch binnenkomen vanuit de
  // pagina (payload.find sort: '-seizoen'/'-winnaars.jaar' is niet betrouwbaar op array-subvelden),
  // dus sorteer hier expliciet op het jaartal dat uit elk resultaat te halen valt.
  const jaartal = (r: ErelijstZoekresultaat) => {
    const bron = r.type === 'referendum' ? r.jaar : r.seizoen
    const match = bron.match(/\d{4}/)
    return match ? Number(match[0]) : 0
  }
  return resultaten.sort((a, b) => jaartal(b) - jaartal(a))
}
