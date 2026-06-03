import { PDFDocument, type PDFPage, StandardFonts, rgb } from 'pdf-lib'

// Genereert een PDF-wedstrijdblad op basis van het officiële aantekenblad (reglement Deel III).
// Tekst-gebaseerde, compacte layout — voldoende voor archivering en mail naar de clubs.

export type PdfLineupRow = { rugnummer?: number; name: string; deelgenomen?: boolean }
export type PdfSignature = { naam?: string; akkoord?: boolean; tijdstip?: string; handtekening?: string }
export type PdfGoal = { half: number; gameClock: number; side: 'home' | 'away'; shirtNumber: number; playerName: string; points: number }

export type MatchSheetPdfData = {
  titel: string
  datum: string
  categorie: string
  reeks?: string
  scheidsrechter?: string
  score?: { home: number; away: number }
  halfScores?: { home: [number, number]; away: [number, number] }
  goals?: PdfGoal[]
  homeTeam: string
  awayTeam: string
  homeLineup: PdfLineupRow[]
  awayLineup: PdfLineupRow[]
  officials: { label: string; naam: string }[]
  keuring: { label: string; waarde: string }[]
  uitsluitingen: string[]
  voorbehoud: string[]
  opmerkingen?: string
  handtekeningen: { label: string; sig: PdfSignature }[]
}

// pdf-lib's StandardFonts (Helvetica) gebruiken WinAnsi-encoding en CRASHEN op glyphs die daar
// niet in zitten (bv. ✓ U+2713). Flemish namen (é, ë, ï, à …) zitten wél in WinAnsi (Latin-1).
// We mappen de bekende "mooie" Unicode-tekens en strippen al de rest, zodat genereren nooit faalt.
function safe(text: string): string {
  return String(text)
    .replace(/[–—]/g, '-') // – —
    .replace(/[‘’′]/g, "'") // ' ' ′
    .replace(/[“”]/g, '"') // " "
    .replace(/✓/g, 'OK') // ✓
    .replace(/[•·]/g, '-') // • ·
    .replace(/ /g, ' ')
    .replace(/[^\x20-\x7E\xA1-\xFF]/g, '') // enkel ASCII + Latin-1 Supplement behouden
}

const A4: [number, number] = [595, 842]

export async function generateMatchSheetPdf(data: MatchSheetPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  const left = 40
  const dark = rgb(0.1, 0.1, 0.12)
  const grey = rgb(0.4, 0.4, 0.45)
  const top = A4[1] - 40
  const bottom = 50

  let page: PDFPage = doc.addPage(A4)
  let y = top

  const newPage = () => {
    page = doc.addPage(A4)
    y = top
  }

  const line = (
    text: string,
    opts: { size?: number; b?: boolean; color?: ReturnType<typeof rgb>; gap?: number } = {},
  ) => {
    const size = opts.size ?? 10
    const gap = opts.gap ?? size + 6
    if (y - gap < bottom) newPage() // automatische pagina-overgang (geen rijen meer verliezen)
    page.drawText(safe(text), { x: left, y, size, font: opts.b ? bold : font, color: opts.color ?? dark })
    y -= gap
  }

  line('OFFICIEEL WEDSTRIJDBLAD — KVKBF', { size: 14, b: true })
  line(data.titel, { size: 12, b: true })
  line(`${data.datum}  ·  ${data.categorie}${data.reeks ? `  ·  reeks ${data.reeks}` : ''}`, { color: grey })
  if (data.scheidsrechter) line(`Scheidsrechter: ${data.scheidsrechter}`, { color: grey })
  if (data.score) line(`Eindstand: ${data.homeTeam} ${data.score.home} – ${data.score.away} ${data.awayTeam}`, { b: true, gap: 16 })
  else y -= 8

  // Per-helft score (Item 19: de scheidsrechter stelt de score per helft vast).
  if (data.halfScores) {
    const h = data.halfScores
    line(
      `Per helft — ${data.homeTeam}: ${h.home[0]} / ${h.home[1]}   ·   ${data.awayTeam}: ${h.away[0]} / ${h.away[1]}`,
      { size: 9, color: grey, gap: 16 },
    )
  }

  const lineup = (title: string, rows: PdfLineupRow[]) => {
    line(title, { b: true, size: 11 })
    if (rows.length === 0) line('  (geen opstelling)', { color: grey })
    for (const r of rows) {
      line(`  ${String(r.rugnummer ?? '–').padStart(2)}  ${r.name}${r.deelgenomen ? '  (O)' : ''}`)
    }
    y -= 6
  }
  lineup(`Opstelling thuis — ${data.homeTeam}`, data.homeLineup)
  lineup(`Opstelling uit — ${data.awayTeam}`, data.awayLineup)

  // Doelpunten per maker (chronologisch) — vervangt het papieren doelpunten-vak.
  if (data.goals && data.goals.length) {
    line('Doelpunten', { b: true, size: 11 })
    for (const g of data.goals) {
      const team = g.side === 'home' ? data.homeTeam : data.awayTeam
      const clock = `${String(Math.floor(g.gameClock / 60)).padStart(2, '0')}:${String(g.gameClock % 60).padStart(2, '0')}`
      line(`  ${g.half}H ${clock}  ${team}  #${g.shirtNumber} ${g.playerName}  (+${g.points})`, { size: 9 })
    }
    y -= 6
  }

  const ingevuldeOfficials = data.officials.filter((o) => o.naam.trim())
  if (ingevuldeOfficials.length) {
    line('Officials', { b: true, size: 11 })
    for (const o of ingevuldeOfficials) line(`  ${o.label}: ${o.naam}`, { size: 9 })
    y -= 6
  }

  line('Materiële keuring', { b: true, size: 11 })
  line('  ' + data.keuring.map((k) => `${k.label}: ${k.waarde}`).join('  ·  '), { size: 9 })
  y -= 6

  if (data.uitsluitingen.length) {
    line('Uitsluitingen', { b: true, size: 11 })
    data.uitsluitingen.forEach((u) => line('  ' + u, { size: 9 }))
  }
  if (data.voorbehoud.length) {
    line('Voorbehoud', { b: true, size: 11 })
    data.voorbehoud.forEach((v) => line('  ' + v, { size: 9 }))
  }
  if (data.opmerkingen) {
    line('Opmerkingen / kwetsuren', { b: true, size: 11 })
    line('  ' + data.opmerkingen, { size: 9 })
  }

  y -= 10
  line('Handtekeningen', { b: true, size: 11 })
  for (const h of data.handtekeningen) {
    const s = h.sig
    line(`  ${h.label}: ${s.naam ?? '—'}  ${s.akkoord ? '(akkoord)' : '(niet getekend)'}${s.tijdstip ? `  ${s.tijdstip}` : ''}`, {
      size: 9,
    })
    await drawSignatureImage(doc, () => page, () => y, (v) => (y = v), newPage, left, bottom, s.handtekening)
  }

  return doc.save()
}

// Bedt de getekende handtekening (canvas data-URL) in onder het label. Faalt stil terug op
// enkel de tekstregel als de data-URL ontbreekt of ongeldig is (nooit de PDF laten crashen).
async function drawSignatureImage(
  doc: PDFDocument,
  getPage: () => PDFPage,
  getY: () => number,
  setY: (v: number) => void,
  newPage: () => void,
  left: number,
  bottom: number,
  dataUrl?: string,
): Promise<void> {
  if (!dataUrl || !dataUrl.startsWith('data:image/')) return
  try {
    const isPng = dataUrl.includes('image/png')
    const b64 = dataUrl.split(',')[1]
    if (!b64) return
    const bytes = Buffer.from(b64, 'base64')
    const img = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes)
    const w = 120
    const h = (img.height / img.width) * w
    if (getY() - h < bottom) newPage()
    getPage().drawImage(img, { x: left + 10, y: getY() - h, width: w, height: h })
    setY(getY() - h - 8)
  } catch {
    /* ongeldige handtekening-data → tekstregel volstaat */
  }
}
