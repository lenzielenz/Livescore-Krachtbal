// Facturatie van de federatie aan de clubs — pure logica (geen DB), gedeeld door de server, de PDF, de
// bankimport en de schermen van federatie en club.
//
// Kernregel (zoals de worpen in de match-engine): een betaling is een onveranderlijk feit; of een factuur
// betaald, deels betaald, open of vervallen is, wordt ALTIJD berekend uit de betalingen — nooit apart
// opgeslagen. Een verstuurde factuur verandert niet meer (doorlopend nummer, bedrag, lijnen); een fout
// rechtzetten = de factuur annuleren en een nieuwe maken.

export type FactuurStatus = 'concept' | 'verstuurd' | 'geannuleerd'
export type Betaalstand = 'concept' | 'open' | 'deels' | 'betaald' | 'vervallen' | 'geannuleerd'
export type LijnSoort = 'aansluiting' | 'boete' | 'scheidsrechter' | 'ander'

export const LIJN_SOORTEN: { label: string; value: LijnSoort }[] = [
  { label: 'Aansluiting (lidgeld)', value: 'aansluiting' },
  { label: 'Boete', value: 'boete' },
  { label: 'Scheidsrechterskosten', value: 'scheidsrechter' },
  { label: 'Ander', value: 'ander' },
]

export const BETAALSTAND_LABEL: Record<Betaalstand, string> = {
  concept: 'Concept (nog niet verstuurd)',
  open: 'Open',
  deels: 'Deels betaald',
  betaald: 'Betaald',
  vervallen: 'Vervallen',
  geannuleerd: 'Geannuleerd',
}

export type Lijn = {
  soort: LijnSoort
  omschrijving: string
  aantal: number
  eenheidsprijs: number
  /** Wat deze lijn factureert (bv. "boete:12", "aansluiting:2026-2027:345"): nooit twee keer. */
  sleutels?: string[]
}

/** Afronden op centen (in centen rekenen, nooit zwevende komma's optellen). */
export const centen = (euro: number): number => Math.round((euro + Number.EPSILON) * 100)
export const euro = (c: number): number => c / 100

export const lijnBedrag = (l: Pick<Lijn, 'aantal' | 'eenheidsprijs'>): number => euro(centen(l.aantal * l.eenheidsprijs))

export function factuurTotaal(lijnen: Pick<Lijn, 'aantal' | 'eenheidsprijs'>[]): number {
  return euro(lijnen.reduce((t, l) => t + centen(l.aantal * l.eenheidsprijs), 0))
}

// ── Nummer en gestructureerde mededeling ─────────────────────────────────────────────────────────────

/** Het factuurnummer: jaar + doorlopend volgnummer ("2026-0007"). Doorlopend over de verstuurde facturen. */
export const factuurNummer = (jaar: number, volgnr: number): string => `${jaar}-${String(volgnr).padStart(4, '0')}`

/**
 * De Belgische gestructureerde mededeling (OGM/VCS): 10 cijfers + 2 controlecijfers (modulo 97; 0 → 97),
 * getoond als +++123/4567/89012+++. Uit jaar en volgnummer, zodat elke factuur haar eigen mededeling heeft
 * en de bank een betaling er zonder twijfel aan koppelt.
 */
export function ogmVoor(jaar: number, volgnr: number): string {
  const basis = `${String(jaar % 10000).padStart(4, '0')}${String(volgnr).padStart(6, '0')}`.slice(-10)
  return ogmOpmaken(basis)
}

export function ogmOpmaken(basis10: string): string {
  const rest = Number(BigInt(basis10) % 97n)
  const controle = String(rest === 0 ? 97 : rest).padStart(2, '0')
  const c = basis10 + controle
  return `+++${c.slice(0, 3)}/${c.slice(3, 7)}/${c.slice(7)}+++`
}

/** De 12 cijfers van een geldige gestructureerde mededeling, of null. */
export function ogmCijfers(tekst: string): string | null {
  const c = tekst.replace(/\D/g, '')
  if (c.length !== 12) return null
  const rest = Number(BigInt(c.slice(0, 10)) % 97n)
  return Number(c.slice(10)) === (rest === 0 ? 97 : rest) ? c : null
}

/**
 * Alle geldige gestructureerde mededelingen in een vrije tekst (een bankafschrift zet ze op allerlei
 * manieren: +++123/4567/89012+++, ***…***, 123456789012, met spaties).
 */
export function ogmsInTekst(tekst: string): string[] {
  const uit = new Set<string>()
  const kandidaten = String(tekst ?? '').match(/(?:\+{3}|\*{3})?\s*\d{3}\s*[/.\s-]?\s*\d{4}\s*[/.\s-]?\s*\d{5}\s*(?:\+{3}|\*{3})?/g) ?? []
  for (const k of kandidaten) {
    const c = ogmCijfers(k)
    if (c) uit.add(c)
  }
  return [...uit]
}

// ── Betaalstand: altijd berekend ─────────────────────────────────────────────────────────────────────

export type Betaalbeeld = { stand: Betaalstand; totaal: number; betaald: number; open: number }

/** Hoe staat deze factuur ervoor op `nu`? Uit de factuur en de som van haar betalingen. */
export function betaalstand(
  f: { status: FactuurStatus; totaal: number; vervaldatum?: string | Date | null },
  betalingen: { bedrag: number }[],
  nu: Date = new Date(),
): Betaalbeeld {
  const totaalC = centen(f.totaal)
  const betaaldC = betalingen.reduce((t, b) => t + centen(b.bedrag), 0)
  const openC = Math.max(0, totaalC - betaaldC)
  const beeld = (stand: Betaalstand): Betaalbeeld => ({ stand, totaal: euro(totaalC), betaald: euro(betaaldC), open: euro(openC) })
  if (f.status === 'concept') return beeld('concept')
  if (f.status === 'geannuleerd') return beeld('geannuleerd')
  if (openC === 0) return beeld('betaald')
  const verval = f.vervaldatum ? new Date(f.vervaldatum).getTime() : NaN
  if (Number.isFinite(verval) && nu.getTime() > verval + 86_400_000 - 1) return beeld('vervallen')
  return beeld(betaaldC > 0 ? 'deels' : 'open')
}

// ── Bankafschrift (CSV) inlezen ──────────────────────────────────────────────────────────────────────

export type BankRegel = { datum: string; bedrag: number; mededeling: string; tegenpartij: string; referentie: string; ogms: string[] }

/** Splitst één CSV-regel (`;` of `,`), met aanhalingstekens. */
function csvRegel(regel: string, sep: string): string[] {
  const uit: string[] = []
  let cel = ''
  let tussen = false
  for (let i = 0; i < regel.length; i++) {
    const c = regel[i]!
    if (c === '"') {
      if (tussen && regel[i + 1] === '"') {
        cel += '"'
        i++
      } else tussen = !tussen
    } else if (c === sep && !tussen) {
      uit.push(cel.trim())
      cel = ''
    } else cel += c
  }
  uit.push(cel.trim())
  return uit
}

/** "1.234,56" / "1234.56" / "-12,50" / "€ 12,50" → getal. */
export function bedragUitTekst(t: string): number | null {
  let s = String(t ?? '').replace(/[€\s]/g, '').replace(/^\+/, '')
  if (!s) return null
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  else if (s.includes(',')) s = s.replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** "13/11/2026", "13-11-2026", "2026-11-13" → "2026-11-13". */
export function datumUitTekst(t: string): string | null {
  const s = String(t ?? '').trim()
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(s)
  if (m) return `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`
  return null
}

/** Per kolom de koppen die we herkennen, de meest specifieke eerst ("Naam tegenpartij" vóór "Naam"). */
const KOLOMMEN: Record<keyof Omit<BankRegel, 'ogms'>, RegExp[]> = {
  datum: [/^(uitvoeringsdatum|boekingsdatum|transactiedatum|execution date|booking date)/i, /^(datum|date)\b/i, /^valutadatum/i],
  bedrag: [/^(bedrag|amount|montant)/i],
  mededeling: [/^(gestructureerde mededeling|mededeling|communicatie|communication|vrije mededeling)/i, /^(omschrijving|description|details)/i],
  tegenpartij: [/^(naam tegenpartij|naam van de tegenpartij|tegenpartij|counterparty|begunstigde)/i],
  referentie: [/^(referentie|reference|transactienummer|transaction id)/i],
}

const kolomVan = (kop: string[], patronen: RegExp[]): number => {
  for (const re of patronen) {
    const i = kop.findIndex((c) => re.test(c.trim()))
    if (i >= 0) return i
  }
  return -1
}

/**
 * Leest een bankafschrift als CSV (KBC, BNP Paribas Fortis, Belfius, ING… exporteren elk een eigen variant).
 * De kolommen worden herkend aan hun kop. Enkel binnenkomende bedragen (> 0) tellen; per regel de geldige
 * gestructureerde mededelingen. Gooit een fout met uitleg als datum of bedrag niet te vinden is.
 */
export function leesBankCsv(tekst: string): BankRegel[] {
  const regels = String(tekst ?? '')
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((r) => r.trim() !== '')
  if (regels.length < 2) throw new Error('Het bestand bevat geen verrichtingen.')
  // De kopregel: de eerste regel (van de eerste vijf) waarin een datum- en een bedragkolom staan.
  for (let k = 0; k < Math.min(5, regels.length); k++) {
    const sep = (regels[k]!.match(/;/g)?.length ?? 0) >= (regels[k]!.match(/,/g)?.length ?? 0) ? ';' : ','
    const kop = csvRegel(regels[k]!, sep).map((c) => c.replace(/^"|"$/g, ''))
    const pos = Object.fromEntries(Object.entries(KOLOMMEN).map(([naam, re]) => [naam, kolomVan(kop, re)])) as Record<keyof typeof KOLOMMEN, number>
    if (pos.datum < 0 || pos.bedrag < 0) continue
    const uit: BankRegel[] = []
    for (const r of regels.slice(k + 1)) {
      const c = csvRegel(r, sep)
      const datum = datumUitTekst(c[pos.datum] ?? '')
      const bedrag = bedragUitTekst(c[pos.bedrag] ?? '')
      if (!datum || bedrag == null || bedrag <= 0) continue
      const mededeling = pos.mededeling >= 0 ? (c[pos.mededeling] ?? '') : ''
      // Sommige banken zetten de gestructureerde mededeling in een andere kolom: zoek ze in de hele regel.
      uit.push({
        datum,
        bedrag,
        mededeling,
        tegenpartij: pos.tegenpartij >= 0 ? (c[pos.tegenpartij] ?? '') : '',
        referentie: pos.referentie >= 0 ? (c[pos.referentie] ?? '') : '',
        ogms: ogmsInTekst(c.join(' ')),
      })
    }
    return uit
  }
  throw new Error('Geen kolommen "datum" en "bedrag" gevonden. Exporteer het afschrift als CSV met kopregel.')
}

/** Een vaste sleutel voor een bankregel (tegen dubbel importeren): de referentie, of datum+bedrag+mededeling. */
export function bankSleutel(r: Pick<BankRegel, 'datum' | 'bedrag' | 'mededeling' | 'referentie'>): string {
  const ref = r.referentie.trim()
  return ref ? `bank:ref:${ref}` : `bank:${r.datum}:${centen(r.bedrag)}:${r.mededeling.replace(/\s+/g, ' ').trim().slice(0, 80)}`
}
