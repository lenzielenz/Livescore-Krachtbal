// Erelijst: samenvattingen en zoekfunctie over de drie historische archiefcollections
// (kampioenen, bekerwinnaars, referendum-awards). Pure functies → los testbaar, geen Payload-calls
// hier — de pagina haalt de ruwe documenten op en geeft ze hieraan door.

import { CLUB_ALIASSEN } from './club-aliases-data'

const CANONIEKE_NAAM_PER_ALIAS = new Map<string, string>()
for (const groep of CLUB_ALIASSEN) {
  CANONIEKE_NAAM_PER_ALIAS.set(groep.canoniek, groep.canoniek)
  for (const alias of groep.aliassen) CANONIEKE_NAAM_PER_ALIAS.set(alias, groep.canoniek)
}

/** Zet een letterlijke archiefnaam om naar haar canonieke clubnaam (zie club-aliases-data.ts) —
 *  bv. "Robland St. Michiels" en "St. Michiels" tellen zo mee bij "KBC St. Michiels". Een naam
 *  zonder gekende alias komt ongewijzigd terug. */
export function canoniekeClubNaam(naam: string): string {
  return CANONIEKE_NAAM_PER_ALIAS.get(naam) ?? naam
}

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
 *  spelers maar zonder titel hoort hier ook bij, gesorteerd op totaal. Historische naamvarianten
 *  (zie club-aliases-data.ts) tellen samen onder de canonieke naam. */
export function telClubTrofeeen(
  kampioenenSeizoenen: KampioenenSeizoenInput[],
  bekerwinnaarsSeizoenen: BekerwinnaarsSeizoenInput[],
  referendumPrijzen: ReferendumPrijsInput[],
): ClubTrofee[] {
  const map = new Map<string, ClubTrofee>()
  const bump = (naam: string | undefined, veld: 'titels' | 'bekers' | 'referendumprijzen') => {
    if (isPlaceholder(naam)) return
    const key = canoniekeClubNaam((naam as string).trim())
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

// Een enkel jaar kende de prijs weleens gedeeld toe aan twee speelsters tegelijk — het archief
// noteert dat als één rij met beide namen samen ("Nathalie Lievens & Kristel Braem"). Die rij
// blijft zo staan in de seizoenslijst (historisch correct: het was een gedeelde titel), maar voor
// de telling moet elke speelster gewoon haar eigen +1 krijgen — anders bestaat "Nathalie Lievens &
// Kristel Braem" als een derde, aparte "persoon" naast de twee echte laureaten.
function gedeeldeWinnaars(naam: string): string[] {
  return naam
    .split(/\s*&\s*/)
    .map((n) => n.trim())
    .filter(Boolean)
}

/** Telt per persoon het aantal referendum-prijzen, gesorteerd op totaal. Een gedeelde prijs
 *  ("X & Y") levert voor beide namen apart een punt op, niet voor de samengestelde naam. */
export function telLaureaten(referendumPrijzen: ReferendumPrijsInput[]): Laureaat[] {
  const map = new Map<string, Laureaat>()
  for (const prijs of referendumPrijzen) {
    for (const winnaar of prijs.winnaars ?? []) {
      if (isPlaceholder(winnaar.naam)) continue
      for (const key of gedeeldeWinnaars(winnaar.naam)) {
        const bestaand = map.get(key) ?? { naam: key, aantal: 0, prijzen: [] }
        bestaand.aantal += 1
        if (!bestaand.prijzen.includes(prijs.prijs)) bestaand.prijzen.push(prijs.prijs)
        map.set(key, bestaand)
      }
    }
  }
  return [...map.values()].sort((a, b) => b.aantal - a.aantal || a.naam.localeCompare(b.naam))
}

export interface PrijsJaar {
  jaar: number
  titels: number
  bekers: number
  referendumprijzen: number
  /** Naam van elke reeks die dat jaar gewonnen werd — voor het uitgeklapte jaardetail. */
  titelDetails: string[]
  /** Categorie van elke beker die dat jaar gewonnen werd. */
  bekerDetails: string[]
  /** Speler + prijs van elke referendumprijs die dat jaar gewonnen werd. */
  referendumDetails: { naam: string; prijs: string }[]
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

const leegPrijsJaar = (jaar: number): PrijsJaar => ({
  jaar,
  titels: 0,
  bekers: 0,
  referendumprijzen: 0,
  titelDetails: [],
  bekerDetails: [],
  referendumDetails: [],
})

/** Telt, voor de "prijzen per jaar"-grafiek op de clubpagina, per jaar het aantal titels, bekers
 *  en referendumprijzen van één club — chronologisch, met expliciete nul-jaren opgevuld tussen het
 *  eerste en laatste jaar (een "stille" periode is net zo betekenisvol als een topjaar). Houdt ook
 *  per jaar bij wát er precies gewonnen werd, zodat een klik op een balk het jaardetail kan tonen. */
export function telPrijzenPerJaar(
  titels: { seizoen: string; reeksNaam: string }[],
  bekers: { seizoen: string; categorie: string }[],
  referendumLaureaten: { jaar: string; naam: string; prijs: string }[],
): PrijsJaar[] {
  const map = new Map<number, PrijsJaar>()
  const get = (jaar: number): PrijsJaar | null => {
    if (!jaar) return null
    const bestaand = map.get(jaar) ?? leegPrijsJaar(jaar)
    map.set(jaar, bestaand)
    return bestaand
  }
  for (const t of titels) {
    const rij = get(seizoenNaarJaar(t.seizoen))
    if (!rij) continue
    rij.titels += 1
    rij.titelDetails.push(t.reeksNaam)
  }
  for (const b of bekers) {
    const rij = get(seizoenNaarJaar(b.seizoen))
    if (!rij) continue
    rij.bekers += 1
    rij.bekerDetails.push(b.categorie)
  }
  for (const r of referendumLaureaten) {
    const rij = get(Number(r.jaar) || 0)
    if (!rij) continue
    rij.referendumprijzen += 1
    rij.referendumDetails.push({ naam: r.naam, prijs: r.prijs })
  }

  if (map.size === 0) return []
  const jaren = [...map.keys()]
  const minJaar = Math.min(...jaren)
  const maxJaar = Math.max(...jaren)
  const result: PrijsJaar[] = []
  for (let jaar = minJaar; jaar <= maxJaar; jaar++) {
    result.push(map.get(jaar) ?? leegPrijsJaar(jaar))
  }
  return result
}

// Woordniveau-normalisatie voor reeksnamen: het archief spant tientallen jaren en dezelfde reeks
// werd door de jaren heen net iets anders genoteerd ("1e"/"1ste"/"Eerste"/"1N" voor hetzelfde
// ordinaal, wisselende hoofdletters). `canoniekeReeksNaam` herschrijft enkel de herkenbare
// bouwstenen (ordinaal, niveau, geslacht/leeftijd, beloften/reserven) naar de schrijfwijze van
// REEKS_OPTIONS (zie lib/reeksen.ts) — onbekende woorden (oude afdelingen, "Miniemen",
// "Scholieren", …) blijven letterlijk staan i.p.v. te raden naar een hedendaags equivalent.
const ORDINAAL_WOORD: Record<string, string> = {
  '1e': '1ste',
  '1ste': '1ste',
  eerste: '1ste',
  '2e': '2de',
  '2de': '2de',
  tweede: '2de',
  '3e': '3de',
  '3de': '3de',
  derde: '3de',
  '4e': '4de',
  '4de': '4de',
  vierde: '4de',
}
// "1N"/"2N"/… is de oude afkorting voor "1ste Nationale"/"2de Nationale" ineen — ontvouwt naar
// twee woorden zodat het samensmelt met de voluit geschreven varianten.
const ORDINAAL_NATIONAAL: Record<string, string[]> = {
  '1n': ['1ste', 'Nationale'],
  '2n': ['2de', 'Nationale'],
  '3n': ['3de', 'Nationale'],
  '4n': ['4de', 'Nationale'],
}
const REEKS_WOORD: Record<string, string> = {
  nationale: 'Nationale',
  landelijke: 'Landelijke',
  regionale: 'Regionale',
  afdeling: 'Afdeling',
  heren: 'Heren',
  dames: 'Dames',
  jongens: 'Jongens',
  meisjes: 'Meisjes',
  beloften: 'Beloften',
  reserven: 'Reserven',
}

/** Normaliseert een letterlijke archief-reeksnaam naar de huidige schrijfwijze (zie
 *  reeksen.ts) — puur op woordniveau, zodat dezelfde reeks niet als aparte rijen opduikt in
 *  "Totaal per reeks" enkel omdat de spelling door de jaren heen wat verschilde. */
export function canoniekeReeksNaam(naam: string): string {
  const woorden = naam.trim().split(/\s+/)
  const out: string[] = []
  for (const woord of woorden) {
    const sleutel = woord.toLowerCase()
    if (ORDINAAL_NATIONAAL[sleutel]) {
      out.push(...ORDINAAL_NATIONAAL[sleutel])
    } else if (ORDINAAL_WOORD[sleutel]) {
      out.push(ORDINAAL_WOORD[sleutel])
    } else if (REEKS_WOORD[sleutel]) {
      out.push(REEKS_WOORD[sleutel])
    } else {
      out.push(woord)
    }
  }
  return out.join(' ')
}

export interface GroepTotaal {
  naam: string
  aantal: number
}

/** Telt hoe vaak elke waarde voorkomt (bv. reeksnaam bij kampioenschappen, categorie bij bekers) —
 *  voor het "totaal per reeks"-overzicht op de clubpagina, los van het jaar. Gesorteerd op aantal. */
export function telPerGroep(namen: string[]): GroepTotaal[] {
  const map = new Map<string, number>()
  for (const naam of namen) {
    map.set(naam, (map.get(naam) ?? 0) + 1)
  }
  return [...map.entries()]
    .map(([naam, aantal]) => ({ naam, aantal }))
    .sort((a, b) => b.aantal - a.aantal || a.naam.localeCompare(b.naam))
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
