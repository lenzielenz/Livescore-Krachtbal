// Uitslagen overnemen van de federatiesite (krachtbal.be).
//
// Er bestond al een importer voor de officiële export ("wedstrijden.xls", in werkelijkheid een
// HTML-tabel met een vaste kolomvolgorde — zie results-import.ts). Die vraagt om een bestand dat
// iemand eerst downloadt en plakt. Tijdens het seizoen wil je dat automatisch: de server haalt de
// kalenderpagina op en neemt de eindstanden over.
//
// De kalenderpagina heeft niet noodzakelijk dezelfde kolommen als de export. Daarom parseren we
// hier op HERKENNING in plaats van op vaste posities: per tabelrij zoeken we de score (twee losse
// getallen naast elkaar, óf één cel als "12 - 8"), en de twee namen die eraan voorafgaan zijn thuis
// en bezoeker. De datum mag ergens in de rij staan, de reeks in de rij zelf of in een tussentitel
// erboven. Zo overleeft de import een layoutwijziging die vaste kolomnummers zou breken.

import { mapReeks, type RawResult } from './results-import'

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/\s+/g, ' ')
    .trim()

/** dd/mm/jjjj, dd-mm-jjjj of jjjj-mm-dd, ergens in de tekst. */
const DATE_IN = /(\d{1,2})[/-](\d{1,2})[/-](\d{4})|(\d{4})-(\d{1,2})-(\d{1,2})/
const TIME_IN = /\b(\d{1,2}):(\d{2})\b/
/** Eén cel met beide scores: "12 - 8", "12–8", "12 : 8". */
const SCORE_PAIR = /^(\d{1,3})\s*[-–—:]\s*(\d{1,3})$/
/** Een uur ("15:00") ziet er met een dubbelpunt uit als een score — daarom apart herkennen.
 *  Twee cijfers na het dubbelpunt = uur; "12 : 8" (één cijfer) blijft een score. */
const IS_TIME = /^\d{1,2}\s*:\s*\d{2}$/
const NUMBER_ONLY = /^\d{1,3}$/

function toISO(text: string): string {
  const m = DATE_IN.exec(text)
  if (!m) return ''
  if (m[4]) return `${m[4]}-${m[5].padStart(2, '0')}-${m[6].padStart(2, '0')}`
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

/** Cellen van één rij, in documentvolgorde (td én th). */
function cellsOf(row: string): string[] {
  const out: string[] = []
  for (const m of row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)) out.push(decode(m[1]))
  return out
}

/** Ziet deze cel eruit als een ploegnaam? (niet leeg, niet louter cijfers/datum/uur) */
function looksLikeTeam(c: string): boolean {
  if (!c || c.length < 2) return false
  if (NUMBER_ONLY.test(c) || SCORE_PAIR.test(c)) return false
  if (DATE_IN.test(c) || TIME_IN.test(c)) return false
  // Een rugnummer-achtige lange cijferreeks (wedstrijdnummer) is geen ploeg.
  if (/^\d+$/.test(c)) return false
  return /[a-zA-ZÀ-ÿ]/.test(c)
}

/**
 * Leest wedstrijden met een eindstand uit een HTML-pagina met tabellen.
 * Rijen zonder score (nog te spelen, uitgesteld) worden overgeslagen.
 */
export function parseUitslagenHtml(html: string): RawResult[] {
  const out: RawResult[] = []
  // Reeks uit een tussentitel ("1e Nationale Heren" of een code) blijft gelden tot de volgende.
  let huidigeReeks: { code: string; reeks: string } | null = null

  // Tussentitels buiten tabellen (h1-h4) én rijen: in documentvolgorde aflopen.
  const blokken = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>|<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi)]
  for (const blok of blokken) {
    if (blok[2] !== undefined) {
      const titel = decode(blok[2])
      const r = mapReeks(titel)
      if (r) huidigeReeks = { code: titel, reeks: r }
      continue
    }
    const cells = cellsOf(blok[1] ?? '')
    if (cells.length === 0) continue

    // Rij die enkel een reekstitel bevat ("LH", "Landelijke Heren").
    const gevuld = cells.filter((c) => c)
    if (gevuld.length <= 2) {
      for (const c of gevuld) {
        const r = mapReeks(c)
        if (r) huidigeReeks = { code: c, reeks: r }
      }
      continue
    }

    // Reeks in de rij zelf heeft voorrang op de tussentitel.
    let rijReeksCode = ''
    let rijReeks: string | null = null
    for (const c of cells) {
      const r = mapReeks(c)
      // Enkel korte codes/namen als reeks beschouwen — een ploegnaam mag hier niet in trappen.
      if (r && c.length <= 24) {
        rijReeksCode = c
        rijReeks = r
        break
      }
    }

    // Score zoeken: eerst een gecombineerde cel, anders twee getallen naast elkaar.
    let scoreIdx = -1
    let homeScore = -1
    let awayScore = -1
    let scoreBreedte = 0
    for (let i = 0; i < cells.length; i++) {
      const pair = IS_TIME.test(cells[i]) ? null : SCORE_PAIR.exec(cells[i])
      if (pair) {
        scoreIdx = i
        homeScore = Number(pair[1])
        awayScore = Number(pair[2])
        scoreBreedte = 1
        break
      }
      if (NUMBER_ONLY.test(cells[i]) && i + 1 < cells.length && NUMBER_ONLY.test(cells[i + 1])) {
        // Twee losse getallen: enkel geldig als er vóór de eerste twee namen staan.
        const namen = cells.slice(0, i).filter(looksLikeTeam)
        if (namen.length >= 2) {
          scoreIdx = i
          homeScore = Number(cells[i])
          awayScore = Number(cells[i + 1])
          scoreBreedte = 2
          break
        }
      }
    }
    if (scoreIdx < 0) continue

    // De twee namen die het dichtst vóór de score staan, zijn thuis en bezoeker.
    const namenVoor = cells.slice(0, scoreIdx).filter(looksLikeTeam)
    if (namenVoor.length < 2) continue
    const home = namenVoor[namenVoor.length - 2]
    const away = namenVoor[namenVoor.length - 1]

    const rijTekst = cells.join(' ')
    const date = toISO(rijTekst)
    const tijd = TIME_IN.exec(rijTekst)
    const nummer = cells.find((c) => /^\d{3,7}$/.test(c)) ?? ''
    const referee = cells.slice(scoreIdx + scoreBreedte).find(looksLikeTeam) ?? ''

    out.push({
      number: nummer,
      reeksCode: rijReeksCode || huidigeReeks?.code || '',
      reeks: rijReeks ?? huidigeReeks?.reeks ?? null,
      date,
      time: tijd ? `${tijd[1].padStart(2, '0')}:${tijd[2]}` : '',
      home,
      away,
      homeScore,
      awayScore,
      referee,
    })
  }
  return out
}

/** Dedup-sleutel: dezelfde wedstrijd mag maar één keer in de lijst staan. */
const sleutel = (r: RawResult) =>
  r.number ? `#${r.number}` : `${r.reeks ?? '?'}|${r.date}|${r.home.toLowerCase()}|${r.away.toLowerCase()}`

/**
 * Combineert beide leeswijzen: de strikte kolomvolgorde van de officiële export én de
 * herkennende lezing hierboven. Wat de strikte parser vindt, telt eerst (die kent de
 * kolombetekenis zeker); de rest wordt aangevuld.
 */
export function parseUitslagen(html: string, strict: (t: string) => RawResult[]): RawResult[] {
  const uit = new Map<string, RawResult>()
  for (const r of strict(html)) uit.set(sleutel(r), r)
  for (const r of parseUitslagenHtml(html)) if (!uit.has(sleutel(r))) uit.set(sleutel(r), r)
  return [...uit.values()]
}
