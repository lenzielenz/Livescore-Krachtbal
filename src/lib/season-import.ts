// ── Seizoensimport: van tabel naar geplande wedstrijden ──────────────────────────────────────
// De federatie levert het speelplan als één bestand met álle reeksen door elkaar. Deze module
// zet zo'n tabel (Excel, CSV of geplakte tekst) om in wedstrijden, ploegen en clubs — puur, zonder
// database. Het endpoint (season-import-run.ts) schrijft het resultaat weg.
//
// Uitgangspunt: de kolomvolgorde ligt niet vast. We herkennen de kolommen aan de koprij, met de
// namen die de federatie en Excel-exports in de praktijk gebruiken. Zo hoeft niemand zijn bestand
// te herschikken vóór het importeren.

import type { Category } from './categories'
import { brusselsWallUtc, dateStrBE } from './datetime'
import { REEKS_OPTIONS, reeksCategorie, type Reeks } from './reeksen'
import { cleanTeamName, mapReeks } from './results-import'
import { seasonFromDate } from './seasons'

// ── Kolommen herkennen ───────────────────────────────────────────────────────────────────────

export interface ColumnMap {
  datum: number
  /** Los uuur-kolom; null als het uur al in de datumkolom zit. */
  uur: number | null
  reeks: number
  thuis: number
  uit: number
}

const norm = (s: string) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

// Meerdere schrijfwijzen per kolom. Volgorde telt: de eerste treffer wint, dus zet specifieke
// namen ("thuisploeg") vóór algemene ("ploeg").
const SYNONIEMEN: Record<keyof ColumnMap, string[]> = {
  datum: ['datum', 'speeldatum', 'wedstrijddatum', 'dag', 'date'],
  // "wedstrijduur" en "speeluur" moeten er apart in: de zoeker kijkt naar het BEGIN van een
  // kolomnaam, dus een kop die op "uur" eindigt wordt niet vanzelf gevonden.
  uur: ['uur', 'aanvangsuur', 'startuur', 'beginuur', 'aanvang', 'tijd', 'tijdstip', 'time',
        'start', 'wedstrijduur', 'speeluur', 'aanvangstijdstip'],
  reeks: ['reeks', 'afdeling', 'divisie', 'competitie', 'niveau', 'poule'],
  thuis: ['thuisploeg', 'thuis', 'thuisclub', 'ontvanger', 'home', 'hometeam', 'ploeg1'],
  uit: ['uitploeg', 'bezoekers', 'bezoeker', 'uit', 'tegenstander', 'away', 'awayteam', 'ploeg2'],
}

/** Is dit een koprij? Ze bevat geen datum en wel minstens twee herkenbare kolomnamen. */
export function looksLikeHeader(rij: string[]): boolean {
  const genormaliseerd = rij.map(norm)
  let treffers = 0
  for (const namen of Object.values(SYNONIEMEN)) {
    if (genormaliseerd.some((c) => namen.includes(c))) treffers += 1
  }
  return treffers >= 2
}

export interface ColumnDetection {
  map: ColumnMap | null
  /** Welke verplichte kolommen ontbreken (leesbaar, voor de foutmelding). */
  ontbreekt: string[]
}

/** Zoek de kolommen op basis van de koprij. */
export function detectColumns(header: string[]): ColumnDetection {
  const genormaliseerd = header.map(norm)
  const zoek = (namen: string[]): number => {
    // Eerst een exacte treffer, dan een kolom die met de naam begint ("datumwedstrijd").
    for (const naam of namen) {
      const i = genormaliseerd.indexOf(naam)
      if (i >= 0) return i
    }
    for (const naam of namen) {
      const i = genormaliseerd.findIndex((c) => c.startsWith(naam))
      if (i >= 0) return i
    }
    return -1
  }

  const datum = zoek(SYNONIEMEN.datum)
  const uur = zoek(SYNONIEMEN.uur)
  const reeks = zoek(SYNONIEMEN.reeks)
  const thuis = zoek(SYNONIEMEN.thuis)
  const uit = zoek(SYNONIEMEN.uit)

  const ontbreekt: string[] = []
  if (datum < 0) ontbreekt.push('datum')
  if (reeks < 0) ontbreekt.push('reeks')
  if (thuis < 0) ontbreekt.push('thuisploeg')
  if (uit < 0) ontbreekt.push('uitploeg')
  if (ontbreekt.length > 0) return { map: null, ontbreekt }

  return { map: { datum, uur: uur >= 0 ? uur : null, reeks, thuis, uit }, ontbreekt: [] }
}

/** Vaste volgorde als laatste redmiddel: datum, reeks, thuis, uit. */
export const VASTE_VOLGORDE: ColumnMap = { datum: 0, uur: null, reeks: 1, thuis: 2, uit: 3 }

/**
 * Geen koprij? Lees de kolommen dan af aan de inhoud. Iemand die een stuk uit Excel plakt, laat de
 * koptekst vaak weg — dan mogen we niet blind een vaste volgorde aannemen, want dan mislukt élke
 * rij. We kijken naar de eerste rijen: welke kolom bevat datums, welke uren, welke reeksen? De
 * eerste twee overblijvende tekstkolommen zijn thuis en bezoekers, in die volgorde.
 */
export function detectFromData(rijen: string[][]): ColumnMap | null {
  const proef = rijen.slice(0, 20)
  if (proef.length === 0) return null
  const kolommen = Math.max(...proef.map((r) => r.length))
  const meerderheid = (idx: number, test: (s: string) => boolean) => {
    const gevuld = proef.map((r) => String(r[idx] ?? '').trim()).filter(Boolean)
    if (gevuld.length === 0) return false
    return gevuld.filter(test).length >= Math.ceil(gevuld.length * 0.6)
  }

  let datum = -1
  let uur = -1
  let reeks = -1
  for (let i = 0; i < kolommen; i++) {
    // Een datumkolom eerst: "13/09/2026" mag niet als uur gelezen worden.
    if (datum < 0 && meerderheid(i, (s) => parseDatum(s) !== null)) {
      datum = i
      continue
    }
    if (reeks < 0 && meerderheid(i, (s) => resolveReeks(s) !== null)) {
      reeks = i
      continue
    }
    if (uur < 0 && meerderheid(i, (s) => parseUur(s) !== null)) {
      uur = i
      continue
    }
  }
  if (datum < 0 || reeks < 0) return null

  const bezet = new Set([datum, uur, reeks].filter((i) => i >= 0))
  const tekstKolommen: number[] = []
  for (let i = 0; i < kolommen; i++) {
    if (bezet.has(i)) continue
    if (meerderheid(i, (s) => s.length >= 2 && !/^\d+$/.test(s))) tekstKolommen.push(i)
  }
  if (tekstKolommen.length < 2) return null

  return { datum, uur: uur >= 0 ? uur : null, reeks, thuis: tekstKolommen[0], uit: tekstKolommen[1] }
}

// ── Datum en uur ─────────────────────────────────────────────────────────────────────────────

/**
 * Uur uit een cel. Null als er geen uur in staat.
 *
 * Aanvaardt wat er in de praktijk in zo'n bestand staat:
 *
 *   "14:00"  "14.00"  "14u00"  "14 u 00"  "14u"  "14"  "9:30"     de gewone schrijfwijzen
 *   "14:00:00"                                                     Excel schrijft seconden mee
 *   "om 14:00"  "14:00 uur"  "14u00 stipt"                         zoals een mens het typt
 *   "2:00 PM"                                                      een engelstalig bestand
 *   "0,5833333333"                                                 een uurcel als kaal getal
 *
 * Die seconden zijn geen muggenzifterij: het is precies wat er misging. Een volledige
 * speelkalender kwam binnen met "14:00:00" in de uurkolom, elke cel werd afgekeurd, en élke
 * wedstrijd kwam op 00:00 te staan — zonder dat er iets over gezegd werd.
 *
 * Die laatste vorm is een Excel-uurcel die als kaal getal in een CSV belandt: 14:00 is 14/24 =
 * 0,58333 van een dag. Enkel een getal tussen 0 en 1 telt als zo'n uur — "14" blijft gewoon
 * twee uur 's middags en wordt nooit als fractie gelezen.
 */
export function parseUur(raw: string): { uur: number; minuut: number } | null {
  let t = String(raw ?? '').trim().toLowerCase()
  if (!t) return null

  // Beleefdheden eromheen: "om 14:00", "14:00 uur", "14u00 stipt".
  t = t.replace(/^(?:om|vanaf|start|aanvang)\s+/i, '').replace(/\s*(?:uur|stipt|h)\s*$/i, '').trim()

  // Een kale dagfractie uit Excel. Komma of punt als decimaalteken; alles boven 1 is een gewoon
  // uurgetal en hoort hier niet thuis.
  const fractie = /^0[.,](\d+)$/.exec(t)
  if (fractie) {
    const deel = Number(`0.${fractie[1]}`)
    const totaal = Math.round(deel * 24 * 60)
    return { uur: Math.floor(totaal / 60) % 24, minuut: totaal % 60 }
  }

  // De minuten mogen ontbreken ("9u" is een gangbare schrijfwijze), het scheidingsteken ook
  // ("16"), en de seconden mogen erbij staan ("14:00:00") — die doen er niet toe.
  const m = /^(\d{1,2})\s*(?:[:.hu]\s*(\d{1,2})?(?:\s*[:.]\s*\d{1,2})?)?\s*(am|pm)?\s*$/i.exec(t)
  if (!m) return null
  let uur = Number(m[1])
  const minuut = m[2] ? Number(m[2]) : 0
  if (m[3] === 'pm' && uur < 12) uur += 12
  if (m[3] === 'am' && uur === 12) uur = 0
  if (uur > 23 || minuut > 59) return null
  return { uur, minuut }
}

/**
 * Datum uit een cel, eventueel aangevuld met een los uur. Aanvaardt "jjjj-mm-dd" (zoals de
 * Excel-lezer teruggeeft) en "dd/mm/jjjj" met / . of - als scheiding, telkens met optioneel uur.
 * Geeft ISO terug, berekend op Belgische wandkloktijd — 14:00 in het bestand is 14:00 aan het veld.
 */
export function parseDatum(datumCel: string, uurCel?: string): string | null {
  const t = String(datumCel ?? '').trim()
  if (!t) return null

  let jaar: number, maand: number, dag: number
  let uur = 0
  let minuut = 0

  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T]+(\d{1,2})[:.hu](\d{1,2}))?/i.exec(t)
  const be = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:[ T]+(\d{1,2})[:.hu](\d{1,2}))?/i.exec(t)
  if (iso) {
    jaar = Number(iso[1])
    maand = Number(iso[2])
    dag = Number(iso[3])
    if (iso[4]) {
      uur = Number(iso[4])
      minuut = Number(iso[5])
    }
  } else if (be) {
    dag = Number(be[1])
    maand = Number(be[2])
    jaar = Number(be[3])
    if (jaar < 100) jaar += 2000
    if (be[4]) {
      uur = Number(be[4])
      minuut = Number(be[5])
    }
  } else {
    return null
  }

  if (maand < 1 || maand > 12 || dag < 1 || dag > 31) return null

  // Een aparte uur-kolom heeft voorrang op een uur dat al in de datumcel stond: staat er een
  // eigen kolom voor, dan is dat de bedoelde aanvang.
  const los = parseUur(uurCel ?? '')
  if (los) {
    uur = los.uur
    minuut = los.minuut
  }

  const d = brusselsWallUtc(jaar, maand, dag, uur, minuut)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

// ── Reeks ────────────────────────────────────────────────────────────────────────────────────

/** Reeks uit een cel: interne code ("1NAH"), volledige naam, of een federatiecode ("1NH", "REGDA"). */
export function resolveReeks(raw: string): Reeks | null {
  const t = String(raw ?? '').trim()
  if (!t) return null
  const klein = t.toLowerCase()
  const optie = REEKS_OPTIONS.find(
    (o) => o.value.toLowerCase() === klein || o.label.toLowerCase() === klein || o.label.toLowerCase().endsWith(`— ${klein}`),
  )
  if (optie) return optie.value as Reeks
  return (mapReeks(t) as Reeks | null) ?? null
}

// ── Ploegen en clubs ─────────────────────────────────────────────────────────────────────────

/** Vergelijkingssleutel voor namen: hoofdletters, spaties en leestekens doen er niet toe. */
export const naamSleutel = (s: string) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

/** De club achter een ploegnaam: het poule-achtervoegsel (" A", " B" …) hoort bij de ploeg. */
export function clubVanPloeg(ploeg: string): string {
  return cleanTeamName(String(ploeg ?? '').replace(/\s+[A-D]$/i, '').trim())
}

// Vrije weekends staan als "vrij"/"bye" in het schema, soms met een poule-letter erbij
// ("Vrij A", "Vrij B" — welke poule er die week vrij is) — geen wedstrijd, dus geen tegenstander.
const VRIJ = /^(vrij|bye|vrijaf|--+)(\s+[a-d])?$/i

// ── Plannen ──────────────────────────────────────────────────────────────────────────────────

export interface PlannedMatch {
  /** Rijnummer in het bestand (1-gebaseerd, koprij meegeteld) — om fouten terug te vinden. */
  rij: number
  reeks: Reeks
  category: Category
  dateIso: string
  seizoen: string
  thuis: string
  uit: string
  thuisClub: string
  uitClub: string
  /** Sleutel om dubbels te herkennen: zelfde reeks, dag en ploegen. */
  sleutel: string
}

export interface RowIssue {
  rij: number
  reden: string
  ruw: string
}

export interface SeasonPlan {
  matches: PlannedMatch[]
  issues: RowIssue[]
  /** Alle clubs die in het bestand voorkomen (schoongemaakte namen, uniek). */
  clubs: string[]
  /** Alle ploegen met hun reeks (uniek per naam + reeks). */
  teams: { naam: string; club: string; reeks: Reeks }[]
  /** Aantal rijen dat als koprij is overgeslagen. */
  header: string[] | null
  /** Wat er van de aanvangsuren terechtkwam — zie `Uurstand`. */
  uren: Uurstand
}

/**
 * Hoe het met de aanvangsuren gesteld is.
 *
 * Dit bestaat omdat een hele speelkalender ooit binnenkwam met élke wedstrijd op 00:00, en de
 * import daar niets over zei: datums, ploegen en reeksen klopten, dus zag het er geslaagd uit.
 * Een uur dat ontbreekt is geen fout die een rij tegenhoudt — maar het is wél iets wat je wil
 * weten vóór driehonderd wedstrijden op middernacht in de agenda staan.
 */
export interface Uurstand {
  /** Is er een kolom met het aanvangsuur gevonden? */
  kolom: boolean
  /** Hoeveel wedstrijden een echt uur kregen. */
  metUur: number
  /** Hoeveel er op middernacht terechtkomen. */
  zonderUur: number
  /** Waarden die er wél stonden maar niet gelezen konden worden (hoogstens een handvol). */
  onleesbaar: string[]
}

/** Eén zin over de aanvangsuren, of null als er niets te melden valt. */
export function uurWaarschuwing(u: Uurstand): string | null {
  if (u.zonderUur === 0) return null
  const alles = u.metUur === 0
  const hoeveel = alles ? 'alle' : `${u.zonderUur} van de ${u.metUur + u.zonderUur}`
  if (u.onleesbaar.length) {
    const voorbeelden = [...new Set(u.onleesbaar)].slice(0, 3).map((v) => `"${v}"`).join(', ')
    return `Het aanvangsuur werd bij ${hoeveel} wedstrijden niet begrepen (${voorbeelden}) — `
      + 'die komen op 00:00 te staan.'
  }
  if (!u.kolom) {
    return `Er is geen kolom met het aanvangsuur gevonden, dus ${hoeveel} wedstrijden komen op `
      + '00:00 te staan. Zet het uur in een kolom "Uur" naast de datum.'
  }
  return `Bij ${hoeveel} wedstrijden stond er geen uur — die komen op 00:00 te staan.`
}

/**
 * Dedupe-sleutel: zelfde reeks, zelfde dag, zelfde ploegen — een gewijzigd aanvangsuur telt niet.
 *
 * De dag is de BELGISCHE kalenderdag, niet de eerste tien tekens van de ISO-tekst. Dat verschil
 * is geen haarkloverij: een wedstrijd om 00:00 wordt bewaard als 22:00 UTC de dág ervoor, dus de
 * afgeknipte tekst zou "12 september" zeggen voor een wedstrijd van de 13de. Dezelfde wedstrijd
 * kreeg zo twee verschillende sleutels naargelang het uur, en dan herkent een tweede import ze
 * niet meer — met een verdubbelde kalender als gevolg. Precies de kalender die door een onleesbaar
 * aanvangsuur op 00:00 stond, liep in die val.
 */
export function matchSleutel(reeks: string, dateIso: string, thuis: string, uit: string): string {
  const d = new Date(dateIso)
  const dag = Number.isNaN(d.getTime()) ? dateIso.slice(0, 10) : dateStrBE(d)
  return `${reeks}|${dag}|${naamSleutel(thuis)}|${naamSleutel(uit)}`
}

/**
 * Zet een tabel om naar een seizoensplan. Rijen die niet kloppen komen als `issue` terug in plaats
 * van de hele import te laten mislukken: bij 600 wedstrijden mag één rare regel de rest niet tegenhouden.
 */
export function planSeason(rows: string[][]): SeasonPlan {
  const matches: PlannedMatch[] = []
  const issues: RowIssue[] = []
  const clubs = new Map<string, string>()
  const teams = new Map<string, { naam: string; club: string; reeks: Reeks }>()
  const gezien = new Set<string>()

  const nietLeeg = rows.filter((r) => r.some((c) => String(c ?? '').trim() !== ''))
  const uren: Uurstand = { kolom: false, metUur: 0, zonderUur: 0, onleesbaar: [] }
  if (nietLeeg.length === 0) return { matches, issues, clubs: [], teams: [], header: null, uren }

  const eerste = nietLeeg[0]
  const heeftHeader = looksLikeHeader(eerste)
  const detectie: ColumnDetection = heeftHeader
    ? detectColumns(eerste)
    : { map: detectFromData(nietLeeg) ?? VASTE_VOLGORDE, ontbreekt: [] }

  if (!detectie.map) {
    return {
      matches,
      issues: [
        {
          rij: 1,
          reden: `Kolommen niet gevonden: ${detectie.ontbreekt.join(', ')}. Zet ze in de koprij (bv. Datum, Uur, Reeks, Thuisploeg, Bezoekers).`,
          ruw: eerste.join(' | '),
        },
      ],
      clubs: [],
      teams: [],
      header: eerste,
      uren,
    }
  }

  const map = detectie.map
  uren.kolom = map.uur != null
  const dataRijen = heeftHeader ? nietLeeg.slice(1) : nietLeeg
  const offset = heeftHeader ? 2 : 1 // rijnummer zoals de gebruiker het in Excel ziet

  dataRijen.forEach((r, i) => {
    const rij = i + offset
    const ruw = r.join(' | ')
    const cel = (idx: number | null) => (idx == null ? '' : String(r[idx] ?? '').trim())

    const thuisRuw = cel(map.thuis)
    const uitRuw = cel(map.uit)
    if (!thuisRuw && !uitRuw) return // volledig lege wedstrijdregel: stil overslaan
    if (VRIJ.test(thuisRuw) || VRIJ.test(uitRuw)) return // vrij weekend is geen wedstrijd

    const reeks = resolveReeks(cel(map.reeks))
    if (!reeks) {
      issues.push({ rij, reden: `Onbekende reeks: "${cel(map.reeks)}"`, ruw })
      return
    }
    const uurRuw = cel(map.uur)
    const dateIso = parseDatum(cel(map.datum), uurRuw)
    if (!dateIso) {
      issues.push({ rij, reden: `Onbruikbare datum: "${cel(map.datum)}"`, ruw })
      return
    }
    // Bijhouden wat er van het aanvangsuur terechtkwam. Een ontbrekend uur houdt de rij niet
    // tegen — maar het hoort wel gezegd te worden vóór er driehonderd wedstrijden op middernacht
    // in de agenda staan. Het uur komt ofwel uit de eigen kolom, ofwel uit de datumcel zelf.
    if (parseUur(uurRuw) || /[ T]\d{1,2}\s*[:.hu]\s*\d{1,2}/.test(cel(map.datum))) {
      uren.metUur += 1
    } else {
      uren.zonderUur += 1
      // Stond er wél iets in de uurkolom, dan is die waarde niet begrepen — dan willen we ze
      // kunnen laten zien, want dát is wat de gebruiker moet aanpassen.
      if (uurRuw && uren.onleesbaar.length < 5) uren.onleesbaar.push(uurRuw)
    }
    if (!thuisRuw || !uitRuw) {
      issues.push({ rij, reden: 'Thuis- of uitploeg ontbreekt', ruw })
      return
    }

    const thuis = cleanTeamName(thuisRuw)
    const uit = cleanTeamName(uitRuw)
    if (naamSleutel(thuis) === naamSleutel(uit)) {
      issues.push({ rij, reden: 'Thuis en uit zijn dezelfde ploeg', ruw })
      return
    }

    const sleutel = matchSleutel(reeks, dateIso, thuis, uit)
    if (gezien.has(sleutel)) {
      issues.push({ rij, reden: 'Staat twee keer in het bestand', ruw })
      return
    }
    gezien.add(sleutel)

    const thuisClub = clubVanPloeg(thuis)
    const uitClub = clubVanPloeg(uit)
    for (const c of [thuisClub, uitClub]) if (c) clubs.set(naamSleutel(c), c)
    for (const [naam, club] of [
      [thuis, thuisClub],
      [uit, uitClub],
    ] as const) {
      teams.set(`${naamSleutel(naam)}|${reeks}`, { naam, club, reeks })
    }

    matches.push({
      rij,
      reeks,
      category: reeksCategorie(reeks),
      dateIso,
      seizoen: seasonFromDate(new Date(dateIso)),
      thuis,
      uit,
      thuisClub,
      uitClub,
      sleutel,
    })
  })

  return {
    matches,
    issues,
    clubs: [...clubs.values()].sort((a, b) => a.localeCompare(b)),
    teams: [...teams.values()].sort((a, b) => a.naam.localeCompare(b.naam)),
    header: heeftHeader ? eerste : null,
    uren,
  }
}

// ── Antwoord van de import ───────────────────────────────────────────────────────────────────
// Staat hier (en niet bij de uitvoering) omdat het importscherm een client-component is: die mag
// geen module aanraken die Payload binnentrekt.

export interface ImportSamenvatting {
  /** Wat er in het bestand stond. */
  gelezen: { rijen: number; wedstrijden: number }
  nieuweClubs: string[]
  nieuwePloegen: { naam: string; club: string; reeks: Reeks }[]
  nieuweWedstrijden: number
  bestaandeWedstrijden: number
  issues: RowIssue[]
  /** Enkele voorbeelden, zodat de gebruiker ziet dat de kolommen goed gelezen zijn. */
  voorbeeld: { datum: string; reeks: string; thuis: string; uit: string }[]
  header: string[] | null
  /** Alleen bij een echte import ingevuld. */
  aangemaakt?: { clubs: number; ploegen: number; wedstrijden: number }
  /** Enkel ingevuld wanneer "vervang volledig speelplan" aangevraagd is: hoeveel bestaande
   *  wedstrijden (elk seizoen, elke reeks — met al hun worpen/statistieken/wedstrijdbladen) er
   *  vóór de import verwijderd zouden worden. */
  teVerwijderen?: number
  /** Alleen bij een echte wipe-commit ingevuld: hoeveel wedstrijden er effectief verwijderd zijn. */
  verwijderd?: number
  /** Wat er van de aanvangsuren terechtkwam, en één zin daarover als er iets te melden valt. */
  uren: Uurstand
  uurWaarschuwing: string | null
  /** Bestaande wedstrijden waarvan het aanvangsuur afwijkt van het bestand (proefronde). */
  teCorrigerenUren?: number
  /** Hoeveel aanvangsuren er effectief rechtgezet zijn (echte import). */
  bijgewerkteUren?: number
}

// ── Tekst (CSV / geplakt) ────────────────────────────────────────────────────────────────────

/**
 * Geplakte tekst of CSV → rijen. Herkent de scheiding zelf (tab, puntkomma of komma) en
 * ondersteunt aanhalingstekens rond velden met een scheidingsteken erin.
 */
export function parseDelimited(text: string): string[][] {
  const regels = String(text ?? '').split(/\r?\n/)
  const eerste = regels.find((l) => l.trim() !== '') ?? ''
  const scheiding = eerste.includes('\t') ? '\t' : eerste.includes(';') ? ';' : ','

  const out: string[][] = []
  for (const regel of regels) {
    if (regel.trim() === '') continue
    const cellen: string[] = []
    let huidig = ''
    let inAanhaling = false
    for (let i = 0; i < regel.length; i++) {
      const ch = regel[i]
      if (inAanhaling) {
        if (ch === '"') {
          if (regel[i + 1] === '"') {
            huidig += '"'
            i++
          } else inAanhaling = false
        } else huidig += ch
      } else if (ch === '"') inAanhaling = true
      else if (ch === scheiding) {
        cellen.push(huidig.trim())
        huidig = ''
      } else huidig += ch
    }
    cellen.push(huidig.trim())
    out.push(cellen)
  }
  return out
}
