import zlib from 'zlib'

// ── Minimale .xlsx-lezer ─────────────────────────────────────────────────────────────────────
// Een Excel-bestand is een ZIP met XML erin. We lezen enkel wat we nodig hebben om een blad als
// rijen tekst terug te geven: de gedeelde strings, de celwaarden en de getalopmaak (om te weten
// welke getallen eigenlijk datums zijn).
//
// Bewust zónder extra afhankelijkheid: dit project pakt zulke bestandsformaten zelf uit (zie de
// PDF-parser in reeksindeling-import.ts) en `zlib` zit in Node. Een seizoensplanning is een klein
// bestand; we hebben geen streaming of ZIP64 nodig.

// ── ZIP ──────────────────────────────────────────────────────────────────────────────────────

/** Alle bestanden uit een ZIP → naam → inhoud. Ondersteunt 'opgeslagen' en 'deflate'. */
export function unzip(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>()

  // De centrale directory staat achteraan, na de "End of central directory"-marker (PK\x05\x06).
  // We zoeken hem van achter naar voor: het commentaarveld erna is doorgaans leeg.
  let eocd = -1
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65_536; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('Geen geldig ZIP-/Excel-bestand (einde-marker niet gevonden).')

  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16) // start van de centrale directory

  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) break
    const method = buf.readUInt16LE(p + 10)
    // Maten uit de CENTRALE directory nemen: bij een 'data descriptor' staan ze in de lokale
    // header op 0, hier altijd correct.
    const compSize = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const localOff = buf.readUInt32LE(p + 42)
    const name = buf.slice(p + 46, p + 46 + nameLen).toString('utf8')
    p += 46 + nameLen + extraLen + commentLen

    // Lokale header: de veldlengtes kunnen afwijken van de centrale, dus opnieuw lezen.
    if (buf.readUInt32LE(localOff) !== 0x04034b50) continue
    const lNameLen = buf.readUInt16LE(localOff + 26)
    const lExtraLen = buf.readUInt16LE(localOff + 28)
    const start = localOff + 30 + lNameLen + lExtraLen
    const data = buf.slice(start, start + compSize)

    try {
      out.set(name, method === 0 ? data : zlib.inflateRawSync(data))
    } catch {
      // Eén onleesbaar onderdeel mag de rest niet blokkeren.
    }
  }
  return out
}

// ── XML-hulpjes ──────────────────────────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

export function decodeXml(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (m, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(n) ? String.fromCodePoint(n) : m
    }
    return ENTITIES[code] ?? m
  })
}

/** Kolomletters uit een celverwijzing ("BC12") → 0-gebaseerde index (BC = 54). */
export function colIndex(ref: string): number {
  const letters = /^([A-Z]+)/.exec(ref.toUpperCase())?.[1] ?? ''
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return Math.max(0, n - 1)
}

// ── Datums ───────────────────────────────────────────────────────────────────────────────────

// Excel telt dagen vanaf 1899-12-30 (de bekende 1900-schrikkeljaarbug zit zo al verrekend).
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30)

/**
 * Een Excel-datumgetal → tekst. Hele dagen geven "jjjj-mm-dd", met een tijdsdeel
 * "jjjj-mm-dd uu:mm". Zo blijft de rest van de import met gewone tekst werken.
 */
export function excelSerialToText(serial: number): string {
  const ms = EXCEL_EPOCH_MS + Math.round(serial * 86_400_000)
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return String(serial)
  const p = (n: number) => String(n).padStart(2, '0')
  const datum = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
  const min = d.getUTCHours() * 60 + d.getUTCMinutes()
  return min === 0 ? datum : `${datum} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}

/**
 * Een Excel-TIJDgetal (geen echte datum, enkel een fractie van een dag — bv. een cel opgemaakt
 * als "uu:mm") → "uu:mm". Zo'n cel bevat geen bruikbaar datumdeel: het "epoch"-datumdeel dat
 * excelSerialToText() erbij zou plakken (1899-12-30) is schijn en hoort niet in de tekst, anders
 * herkent parseUur() (season-import.ts) het aanvangsuur niet meer (elke wedstrijd viel terug op
 * 00:00 — zie AUDIT/bugfix seizoensimport 2026-2027).
 */
export function excelSerialToTimeText(serial: number): string {
  const dagFractie = ((serial % 1) + 1) % 1
  const totaalMin = Math.round(dagFractie * 24 * 60) % (24 * 60)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(Math.floor(totaalMin / 60))}:${p(totaalMin % 60)}`
}

// Ingebouwde Excel-opmaakcodes: datum(+tijd) met een echt datumdeel, versus zuiver tijd (enkel
// een fractie van de dag — geen datumdeel om weer te geven).
const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 22])
const BUILTIN_TIME_FORMATS = new Set([18, 19, 20, 21, 45, 46, 47])

/** Bevat deze opmaakcode datum-/tijdonderdelen? (tekst tussen "" telt niet mee) */
export function isDateFormatCode(code: string): boolean {
  const zonderTekst = code.replace(/"[^"]*"/g, '').replace(/\\./g, '')
  return /[ymdhs]/i.test(zonderTekst)
}

/**
 * Is deze eigen opmaakcode zuiver tijd (geen datumdeel)? 'm' is dubbelzinnig in Excel-opmaak
 * (maand óf minuut) — we gebruiken enkel de ondubbelzinnige letters: 'h'/'s' wijzen op tijd,
 * 'y' (jaar) of 'd' (dag) wijzen op een echt datumdeel. Zuiver tijd = wél h/s, geen y/d.
 */
function isTimeOnlyFormatCode(code: string): boolean {
  const zonderTekst = code.replace(/"[^"]*"/g, '').replace(/\\./g, '')
  return /[hs]/i.test(zonderTekst) && !/[yd]/i.test(zonderTekst)
}

/**
 * Welke stijlindexen (cellen) tonen een datum(+tijd), en welke enkel een tijd (geen datumdeel)?
 * Leest styles.xml: de eigen opmaakcodes (numFmts) plus de ingebouwde, gekoppeld aan cellXfs.
 */
export function dateStyleIndexes(stylesXml: string): { date: Set<number>; time: Set<number> } {
  const eigen = new Map<number, string>()
  for (const m of stylesXml.matchAll(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"[^>]*\/?>/g)) {
    eigen.set(Number(m[1]), decodeXml(m[2]))
  }
  const date = new Set<number>()
  const time = new Set<number>()
  const cellXfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml)?.[1] ?? ''
  let i = 0
  for (const m of cellXfs.matchAll(/<xf\b[^>]*>/g)) {
    const id = Number(/numFmtId="(\d+)"/.exec(m[0])?.[1] ?? '0')
    const code = eigen.get(id)
    if (BUILTIN_TIME_FORMATS.has(id)) time.add(i)
    else if (BUILTIN_DATE_FORMATS.has(id)) date.add(i)
    else if (code !== undefined && isTimeOnlyFormatCode(code)) time.add(i)
    else if (code !== undefined && isDateFormatCode(code)) date.add(i)
    i++
  }
  return { date, time }
}

// ── Werkblad ─────────────────────────────────────────────────────────────────────────────────

export interface XlsxSheet {
  name: string
  /** Rijen × kolommen, alles als tekst. Lege cellen zijn ''. */
  rows: string[][]
}

function parseSharedStrings(xml: string): string[] {
  const out: string[] = []
  for (const si of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    // Een string kan uit meerdere stukken bestaan (rich text): plak alle <t> aan elkaar.
    let s = ''
    for (const t of si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) s += decodeXml(t[1])
    out.push(s)
  }
  return out
}

function parseSheet(xml: string, shared: string[], dateStyles: { date: Set<number>; time: Set<number> }): string[][] {
  const rows: string[][] = []
  for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = []
    for (const c of r[1].matchAll(/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1]
      const inner = c[2] ?? ''
      const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1]
      const idx = ref ? colIndex(ref) : cells.length
      const type = /t="([^"]+)"/.exec(attrs)?.[1] ?? 'n'
      const style = Number(/s="(\d+)"/.exec(attrs)?.[1] ?? '-1')

      let waarde = ''
      if (type === 'inlineStr') {
        for (const t of inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) waarde += decodeXml(t[1])
      } else {
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1]
        if (v !== undefined) {
          const raw = decodeXml(v)
          if (type === 's') waarde = shared[Number(raw)] ?? ''
          else if (type === 'b') waarde = raw === '1' ? 'WAAR' : 'ONWAAR'
          else if (type === 'n' && raw !== '' && Number.isFinite(Number(raw)) && dateStyles.time.has(style)) {
            waarde = excelSerialToTimeText(Number(raw))
          } else if (type === 'n' && raw !== '' && Number.isFinite(Number(raw)) && dateStyles.date.has(style)) {
            waarde = excelSerialToText(Number(raw))
          } else waarde = raw
        }
      }
      while (cells.length < idx) cells.push('')
      cells[idx] = waarde.trim()
    }
    rows.push(cells)
  }
  return rows
}

/** Bladnamen in de volgorde van het werkboek, gekoppeld aan hun bestand in de ZIP. */
function sheetOrder(files: Map<string, Buffer>): { name: string; path: string }[] {
  const workbook = files.get('xl/workbook.xml')?.toString('utf8') ?? ''
  const rels = files.get('xl/_rels/workbook.xml.rels')?.toString('utf8') ?? ''
  const doelPerId = new Map<string, string>()
  for (const m of rels.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g)) {
    const target = m[2].replace(/^\/?xl\//, '').replace(/^\.\//, '')
    doelPerId.set(m[1], `xl/${target}`)
  }
  const out: { name: string; path: string }[] = []
  for (const m of workbook.matchAll(/<sheet\b[^>]*\/>/g)) {
    const name = decodeXml(/name="([^"]*)"/.exec(m[0])?.[1] ?? `Blad ${out.length + 1}`)
    const rid = /r:id="([^"]+)"/.exec(m[0])?.[1] ?? ''
    const path = doelPerId.get(rid)
    if (path && files.has(path)) out.push({ name, path })
  }
  // Geen werkboek-info (of een afwijkende schrijver): val terug op de bladbestanden zelf.
  if (out.length === 0) {
    for (const key of [...files.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()) {
      out.push({ name: key.replace(/^xl\/worksheets\//, '').replace(/\.xml$/, ''), path: key })
    }
  }
  return out
}

/** Lees een .xlsx uit tot bladen met rijen tekst. Gooit bij een onleesbaar bestand. */
export function readXlsx(buf: Buffer): XlsxSheet[] {
  const files = unzip(buf)
  const shared = parseSharedStrings(files.get('xl/sharedStrings.xml')?.toString('utf8') ?? '')
  const dateStyles = dateStyleIndexes(files.get('xl/styles.xml')?.toString('utf8') ?? '')
  const sheets = sheetOrder(files)
  if (sheets.length === 0) throw new Error('Geen werkblad gevonden in het Excel-bestand.')
  return sheets.map((s) => ({
    name: s.name,
    rows: parseSheet(files.get(s.path)!.toString('utf8'), shared, dateStyles),
  }))
}
