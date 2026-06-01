import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

// Genereert een PDF-wedstrijdblad op basis van het officiële aantekenblad (reglement Deel III).
// Tekst-gebaseerde, compacte layout — voldoende voor archivering en mail naar de clubs.

export type PdfLineupRow = { rugnummer?: number; name: string; deelgenomen?: boolean }
export type PdfSignature = { naam?: string; akkoord?: boolean; tijdstip?: string }

export type MatchSheetPdfData = {
  titel: string
  datum: string
  categorie: string
  reeks?: string
  scheidsrechter?: string
  score?: { home: number; away: number }
  homeTeam: string
  awayTeam: string
  homeLineup: PdfLineupRow[]
  awayLineup: PdfLineupRow[]
  keuring: { label: string; waarde: string }[]
  uitsluitingen: string[]
  voorbehoud: string[]
  opmerkingen?: string
  handtekeningen: { label: string; sig: PdfSignature }[]
}

export async function generateMatchSheetPdf(data: MatchSheetPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([595, 842]) // A4
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const { height } = page.getSize()

  let y = height - 40
  const left = 40
  const dark = rgb(0.1, 0.1, 0.12)
  const grey = rgb(0.4, 0.4, 0.45)

  const line = (text: string, opts: { size?: number; b?: boolean; color?: typeof dark; gap?: number } = {}) => {
    const size = opts.size ?? 10
    page.drawText(text, { x: left, y, size, font: opts.b ? bold : font, color: opts.color ?? dark })
    y -= (opts.gap ?? size + 6)
  }

  line('OFFICIEEL WEDSTRIJDBLAD — KVKBF', { size: 14, b: true })
  line(data.titel, { size: 12, b: true })
  line(`${data.datum}  ·  ${data.categorie}${data.reeks ? `  ·  reeks ${data.reeks}` : ''}`, { color: grey })
  if (data.scheidsrechter) line(`Scheidsrechter: ${data.scheidsrechter}`, { color: grey })
  if (data.score) line(`Eindstand: ${data.homeTeam} ${data.score.home} – ${data.score.away} ${data.awayTeam}`, { b: true, gap: 18 })
  else y -= 8

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
    line(
      `  ${h.label}: ${s.naam ?? '—'}  ${s.akkoord ? '✓ akkoord' : '(niet getekend)'}${s.tijdstip ? `  ${s.tijdstip}` : ''}`,
      { size: 9 },
    )
  }

  return doc.save()
}
