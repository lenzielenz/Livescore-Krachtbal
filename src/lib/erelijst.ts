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
  referendumprijzen: number
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

/** True voor een placeholder-string uit de brondata (COVID-seizoen, onbekende winnaar, …) —
 * export zodat de pagina club-namen enkel als link toont wanneer het een échte winnaar is. */
export function isPlaceholder(naam: string | undefined | null): boolean {
  const t = (naam ?? '').trim().toLowerCase()
  if (!t) return true
  if (PLACEHOLDERS.has(t)) return true
  if (t.startsWith('geen ')) return true
  if (t.startsWith('competitie stopgezet')) return true
  return false
}

/** Telt per club het aantal titels (kampioenen), bekers (bekerwinnaars) én referendumprijzen van
 *  haar spelers (via het `club`-veld van elke referendumwinnaar) — een club met veel bekroonde
 *  spelers maar zonder titel hoort hier ook bij, gesorteerd op totaal. */
export function telClubTrofeeen(
  kampioenenSeizoenen: KampioenenSeizoenInput[],
  bekerwinnaarsSeizoenen: BekerwinnaarsSeizoenInput[],
  referendumPrijzen: ReferendumPrijsInput[],
): ClubTrofee[] {
  const map = new Map<string, ClubTrofee>()
  const bump = (naam: string | undefined, veld: 'titels' | 'bekers' | 'referendumprijzen') => {
    if (isPlaceholder(naam)) return
    const key = (naam as string).trim()
    const bestaand = map.get(key) ?? { naam: key, titels: 0, bekers: 0, referendumprijzen: 0, totaal: 0 }
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
  for (const prijs of referendumPrijzen) {
    for (const winnaar of prijs.winnaars ?? []) {
      if (isPlaceholder(winnaar.naam)) continue
      bump(winnaar.club, 'referendumprijzen')
    }
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

export interface PrijsJaar {
  jaar: number
  titels: number
  bekers: number
  referendumprijzen: number
}

/** Zet een seizoensstring ("2024-2025") of een los kalenderjaar ("2025") om naar één
 *  representatief jaartal — het laatste jaar van het seizoen (waarin het afloopt) — zodat
 *  kampioenen/bekers (per seizoen) en referendumprijzen (per kalenderjaar) op dezelfde tijdas
 *  passen voor de grafiek op de clubpagina. */
export function seizoenNaarJaar(seizoen: string): number {
  const jaren = seizoen.match(/\d{4}/g)
  if (!jaren || jaren.length === 0) return 0
  return Number(jaren[jaren.length - 1])
}

/** Telt, voor de "prijzen per jaar"-grafiek op de clubpagina, per jaar het aantal titels, bekers
 *  en referendumprijzen van één club — chronologisch, met expliciete nul-jaren opgevuld tussen het
 *  eerste en laatste jaar (een "stille" periode is net zo betekenisvol als een topjaar). */
export function telPrijzenPerJaar(
  titels: { seizoen: string }[],
  bekers: { seizoen: string }[],
  referendumLaureaten: { jaar: string }[],
): PrijsJaar[] {
  const map = new Map<number, PrijsJaar>()
  const bump = (jaar: number, veld: 'titels' | 'bekers' | 'referendumprijzen') => {
    if (!jaar) return
    const bestaand = map.get(jaar) ?? { jaar, titels: 0, bekers: 0, referendumprijzen: 0 }
    bestaand[veld] += 1
    map.set(jaar, bestaand)
  }
  for (const t of titels) bump(seizoenNaarJaar(t.seizoen), 'titels')
  for (const b of bekers) bump(seizoenNaarJaar(b.seizoen), 'bekers')
  for (const r of referendumLaureaten) bump(Number(r.jaar) || 0, 'referendumprijzen')

  if (map.size === 0) return []
  const jaren = [...map.keys()]
  const minJaar = Math.min(...jaren)
  const maxJaar = Math.max(...jaren)
  const result: PrijsJaar[] = []
  for (let jaar = minJaar; jaar <= maxJaar; jaar++) {
    result.push(map.get(jaar) ?? { jaar, titels: 0, bekers: 0, referendumprijzen: 0 })
  }
  return result
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
