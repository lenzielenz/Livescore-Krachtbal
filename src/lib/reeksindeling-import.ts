import zlib from 'zlib'

// Parser voor de reeksindeling-PDF (KVKBF) → per ploeg het thuisuur (dag + uur) per reeks.
// De PDF-tekst komt er "per glyph gespatieerd" uit; door alle spaties te verwijderen
// reconstrueert elke regel netjes als <index><ploeg><reekscode><za|zo><u:mm>.

export interface ReeksEntry {
  team: string // ploegnaam zoals in de PDF (zonder spaties), bv. "KBCSt.MichielsA"
  code: string // federatie-reekscode, bv. "1NH", "REGD", "U14J"
  reeksen: string[] // overeenkomende interne reeks-waarden (regionaal kan A én B zijn)
  day: string // "za" | "zo"
  time: string // "16:00"
}

// Tekst uit een PDF halen: inflate de (Flate)streams en verzamel alle (..)-tekststukken.
export function extractPdfText(buf: Buffer): string {
  const lat = buf.toString('latin1')
  const parts: string[] = []
  const re = /stream\r?\n/g
  let m: RegExpExecArray | null
  while ((m = re.exec(lat))) {
    const start = m.index + m[0].length
    const end = lat.indexOf('endstream', start)
    if (end < 0) continue
    const raw = Buffer.from(lat.slice(start, end), 'latin1')
    let txt: string
    try {
      txt = zlib.inflateSync(raw).toString('latin1')
    } catch {
      try {
        txt = zlib.inflateRawSync(raw).toString('latin1')
      } catch {
        txt = raw.toString('latin1')
      }
    }
    for (const mm of txt.matchAll(/\(((?:[^()\\]|\\.)*)\)/g)) {
      parts.push(mm[1].replace(/\\([()\\])/g, '$1'))
    }
  }
  return parts.join('').replace(/ /g, '')
}

// Federatie-reekscode → interne reeks-waarde(n). Regionaal (REGD/REGH) kent in de app een
// A- en B-reeks; we zetten het thuisuur op beide (de PDF maakt geen onderscheid).
const CODE_TO_REEKS: Record<string, string[]> = {
  '1NH': ['1NAH'], '1NHB': ['1NAHB'], '1ND': ['1NAD'],
  '2NH': ['2NAH'], '2NHB': ['2NAHB'],
  LH: ['LH'], LD: ['LD'],
  REGD: ['RDA', 'RDB'], REGH: ['RHA', 'RHB'],
  REGDA: ['RDA'], REGDB: ['RDB'], REGHA: ['RHA'], REGHB: ['RHB'],
  U18J: ['U18J'], U18M: ['U18M'], U16J: ['U16J'], U16M: ['U16M'],
  U14J: ['U14J'], U14M: ['U14M'], U12: ['U12'],
}

// Langste codes eerst zodat suffix-matching klopt (bv. "1NHB" vóór "1NH").
const CODES = Object.keys(CODE_TO_REEKS).sort((a, b) => b.length - a.length)

export function parseReeksindeling(pdfText: string): ReeksEntry[] {
  const nos = pdfText
  const out: ReeksEntry[] = []
  let prev = 0
  for (const m of nos.matchAll(/(za|zo)(\d{1,2}:\d{2})/g)) {
    const seg = nos.slice(prev, m.index)
    prev = (m.index ?? 0) + m[0].length
    const code = CODES.find((c) => seg.endsWith(c))
    if (!code) continue
    const rest = seg.slice(0, seg.length - code.length)
    const mm = rest.match(/^(\d{1,3})(.+)$/)
    if (!mm) continue
    out.push({ team: mm[2], code, reeksen: CODE_TO_REEKS[code], day: m[1], time: m[2] })
  }
  return out
}

// Naam-normalisatie voor het matchen met bestaande ploegen (negeer hoofdletters/leestekens/spaties).
export const teamKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

// ── Volledige reeksindeling: clubs + ploegen + reeks + thuisuur ──
// Anders dan extractPdfText behoudt dit de spaties (de federatie-PDF schrijft de ploegnamen
// mét spaties, bv. "KBC St. Michiels A") zodat we nette namen kunnen aanmaken.
export function extractPdfTextSpaced(buf: Buffer): string {
  const lat = buf.toString('latin1')
  const parts: string[] = []
  const re = /stream\r?\n/g
  let m: RegExpExecArray | null
  while ((m = re.exec(lat))) {
    const start = m.index + m[0].length
    const end = lat.indexOf('endstream', start)
    if (end < 0) continue
    const raw = Buffer.from(lat.slice(start, end), 'latin1')
    let txt: string
    try {
      txt = zlib.inflateSync(raw).toString('latin1')
    } catch {
      try {
        txt = zlib.inflateRawSync(raw).toString('latin1')
      } catch {
        txt = raw.toString('latin1')
      }
    }
    for (const mm of txt.matchAll(/\(((?:[^()\\]|\\.)*)\)/g)) {
      parts.push(mm[1].replace(/\\([()\\])/g, '$1'))
    }
  }
  return parts.join('').replace(/\s+/g, ' ').trim()
}

export interface ReeksTeamEntry {
  team: string // volledige ploegnaam (bv. "KBC St. Michiels A")
  club: string // club zonder poule-suffix (bv. "KBC St. Michiels")
  reeks: string // interne reeks-waarde
  day: string // "za" | "zo"
  time: string // "20:00"
}

const stripPoule = (s: string) => s.replace(/\s+[AB]$/, '').trim()

// Regionaal (REGD/REGH) heeft twee poules; kies op basis van de A/B-suffix, anders poule A.
function reeksForEntry(code: string, team: string): string {
  const opts = CODE_TO_REEKS[code] ?? []
  if (opts.length <= 1) return opts[0] ?? ''
  const suf = /\s([AB])$/.exec(team)?.[1]
  return suf === 'B' ? (opts[1] ?? opts[0]) : opts[0]
}

// Elke regel: <rij><ploegnaam><reekscode><za|zo><u:mm>. Op de spatiebehoudende tekst geeft dit
// nette ploeg-/clubnamen. Legende-/notitietekst onderaan wordt eruit gefilterd (te lang / vreemd).
export function parseReeksindelingTeams(pdfText: string): ReeksTeamEntry[] {
  const out: ReeksTeamEntry[] = []
  let prev = 0
  for (const mm of pdfText.matchAll(/(za|zo)\s*(\d{1,2}:\d{2})/g)) {
    const seg = pdfText.slice(prev, mm.index)
    prev = (mm.index ?? 0) + mm[0].length
    const trimmed = seg.replace(/\s+$/, '')
    const code = CODES.find((c) => trimmed.endsWith(c))
    if (!code) continue
    const rest = trimmed.slice(0, trimmed.length - code.length)
    const r = rest.match(/^\s*(\d{1,3})\s*(.+?)\s*$/)
    if (!r) continue
    const team = r[2].trim()
    if (team.length < 2 || team.length > 40 || /[>/]/.test(team)) continue // legende/notities overslaan
    const reeks = reeksForEntry(code, team)
    if (!reeks) continue
    out.push({ team, club: stripPoule(team), reeks, day: mm[1], time: mm[2] })
  }
  return out
}
