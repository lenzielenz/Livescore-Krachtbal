// Parser + mapping voor de officiële resultaten-export (KVKBF "wedstrijden.xls" — eigenlijk
// een HTML-tabel). Kolomvolgorde per wedstrijd: nr, reeks, datum, uur, THUIS (kol. E),
// BEZOEKER (kol. F), score thuis, score uit, scheidsrechter. De export plakt alle wedstrijden
// van een reeks in één rij; we lezen daarom gewoon álle cellen in volgorde en herkennen een
// wedstrijd aan het datum+uur-anker.

export interface RawResult {
  number: string
  reeksCode: string
  reeks: string | null
  date: string // ISO (yyyy-mm-dd) of leeg
  time: string
  home: string
  away: string
  homeScore: number
  awayScore: number
  referee: string
}

// Federatiecode → interne reeks-waarde. Play-off-poules (bv. "2NHA 123") vallen terug op de
// basisreeks; onbekende codes geven null (worden overgeslagen + gerapporteerd).
const REEKS_MAP: Record<string, string> = {
  '1NHA': '1NAH', '1NH': '1NAH',
  '1NHB': '1NAHB',
  '1ND': '1NAD',
  '2NHA': '2NAH', '2NH': '2NAH',
  '2NHB': '2NAHB',
  LH: 'LH',
  LD: 'LD',
  'REGHA': 'RHA', 'REGH A': 'RHA', 'REG HA': 'RHA', 'RHA': 'RHA',
  'REGHB': 'RHB', 'REGH B': 'RHB', 'REG HB': 'RHB', 'RHB': 'RHB',
  'REGDA': 'RDA', 'REGD A': 'RDA', 'REG DA': 'RDA', 'RDA': 'RDA',
  'REGDB': 'RDB', 'REGD B': 'RDB', 'REG DB': 'RDB', 'RDB': 'RDB',
  // Jeugd
  'U18J': 'U18J', 'U18JA': 'U18J', 'U18JB': 'U18J',
  'U18M': 'U18M',
  'U16J': 'U16J', 'U16M': 'U16M',
  'U14J': 'U14J', 'U14M': 'U14M',
  'U12': 'U12', 'U12B': 'U12', 'U12-16': 'U12', 'U12-44': 'U12',
}

export function mapReeks(code: string): string | null {
  const c = code.trim().replace(/\s+/g, ' ').toUpperCase()
  if (REEKS_MAP[c]) return REEKS_MAP[c]
  // Play-off-poule of jeugd-poule: strip alles vanaf de eerste cijfergroep
  // (bv. "2NHA 123" → "2NHA", "LH 456" → "LH", "U18J 9-12" → "U18J").
  const base = c.replace(/\s+\d.*$/, '').trim()
  return REEKS_MAP[base] ?? null
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#186;|&#xba;|&ordm;/gi, '°').replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ').trim()

function toISO(d: string): string {
  const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return ''
  const [, dd, mm, yyyy] = m
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
}

const DATE_RE = /^\d{1,2}\/\d{1,2}\/\d{4}$/
const TIME_RE = /^\d{1,2}:\d{2}(:\d{2})?$/
const NUM_RE = /^\d{3,7}$/

export function parseResultsHtml(text: string): RawResult[] {
  // Alle tabelcellen in documentvolgorde.
  const cells: string[] = []
  for (const m of text.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)) {
    cells.push(decode(m[1].replace(/<[^>]+>/g, '')))
  }
  const out: RawResult[] = []
  for (let i = 2; i + 6 < cells.length; i++) {
    // Anker: datum op i, uur op i+1, nummer op i-2, reeks op i-1.
    if (!DATE_RE.test(cells[i]) || !TIME_RE.test(cells[i + 1])) continue
    if (!NUM_RE.test(cells[i - 2])) continue
    const number = cells[i - 2]
    const reeksCode = cells[i - 1]
    const home = cells[i + 2]
    const away = cells[i + 3]
    const sh = cells[i + 4]
    const sa = cells[i + 5]
    const ref = cells[i + 6]
    if (!/^\d{1,3}$/.test(sh) || !/^\d{1,3}$/.test(sa)) continue
    out.push({
      number,
      reeksCode,
      reeks: mapReeks(reeksCode),
      date: toISO(cells[i]),
      time: cells[i + 1],
      home,
      away,
      homeScore: Number(sh),
      awayScore: Number(sa),
      referee: ref,
    })
    i += 6
  }
  return out
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

// Is dit een effectief gespeelde wedstrijd? Vrije weekends en niet-gespeelde (0–0 zonder
// scheidsrechter) slaan we over; forfaits (30–0) en echte uitslagen nemen we mee.
export function isPlayed(r: RawResult): boolean {
  if (/\bvrij\b/i.test(r.home) || /\bvrij\b/i.test(r.away)) return false
  if (!r.home || !r.away) return false
  if (r.homeScore === 0 && r.awayScore === 0) return false
  return true
}

export { norm }
