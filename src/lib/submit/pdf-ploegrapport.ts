import { PDFDocument, type PDFPage, StandardFonts, rgb } from 'pdf-lib'

import type { TeamReport } from '../team-report'
import { reeksNaam } from '../reeksen'

// Tekst-/tabelgebaseerd scoutingrapport van één ploeg als PDF (pdf-lib). Compacte A4-layout,
// geschikt voor mail/print naar de technische staf. Spiegelt de stijl van het wedstrijdblad.

function safe(text: string): string {
  return String(text)
    .replace(/[–—]/g, '-')
    .replace(/[‘’′]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[•·]/g, '-')
    .replace(/ /g, ' ')
    .replace(/[^\x20-\x7E\xA1-\xFF]/g, '')
}

const A4: [number, number] = [595, 842]

export async function generateTeamReportPdf(r: TeamReport): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  const left = 36
  const dark = rgb(0.1, 0.1, 0.12)
  const grey = rgb(0.4, 0.4, 0.45)
  const accent = rgb(0.13, 0.5, 0.35)
  const top = A4[1] - 40
  const bottom = 44

  let page: PDFPage = doc.addPage(A4)
  let y = top
  const newPage = () => {
    page = doc.addPage(A4)
    y = top
  }
  const text = (s: string, x: number, size: number, b = false, color = dark) =>
    page.drawText(safe(s), { x, y, size, font: b ? bold : font, color })

  const line = (s: string, opts: { size?: number; b?: boolean; color?: ReturnType<typeof rgb>; gap?: number } = {}) => {
    const size = opts.size ?? 10
    const gap = opts.gap ?? size + 6
    if (y - gap < bottom) newPage()
    text(s, left, size, opts.b, opts.color)
    y -= gap
  }

  line('PLOEGRAPPORT - SCOUTING', { size: 14, b: true })
  line(r.teamName, { size: 13, b: true, color: accent })
  line(`Reeks ${reeksNaam(r.reeks)}  -  ${r.matchesAnalyzed} wedstrijden geanalyseerd`, { color: grey })
  line(`Gegenereerd: ${new Date(r.generatedAt).toLocaleString('nl-BE')}`, { size: 8, color: grey, gap: 16 })

  // Ploegtotalen.
  const t = r.totals
  line('Ploegtotalen', { size: 11, b: true })
  line(`Worpen ${t.throws}  -  Doelpunten ${t.goals} (nek ${t.nek} / rug ${t.rug})  -  Punten ${t.points}`, { size: 9, color: grey })
  line(`Conversie ${Math.round(t.conversion * 100)}%  -  Gem. afstand ${t.avgDistance}m (max ${t.maxDistance}m)`, { size: 9, color: grey })
  line(`Balverlies door vangst ${t.caughtAgainst}  -  Buiten ${t.out}  -  Vangsten (verdedigend) ${t.catches}`, { size: 9, color: grey })
  const zTot = r.zones.links + r.zones.midden + r.zones.rechts || 1
  line(
    `Zones - links ${Math.round((r.zones.links / zTot) * 100)}%  midden ${Math.round((r.zones.midden / zTot) * 100)}%  rechts ${Math.round((r.zones.rechts / zTot) * 100)}%`,
    { size: 9, color: grey, gap: 16 },
  )

  // Spelers-tabel.
  line('Per speler', { size: 11, b: true })
  const cols: { label: string; x: number }[] = [
    { label: '#', x: left },
    { label: 'Speler', x: left + 22 },
    { label: 'M', x: left + 170 },
    { label: 'W', x: left + 198 },
    { label: 'D', x: left + 226 },
    { label: 'Ptn', x: left + 252 },
    { label: 'Conv', x: left + 288 },
    { label: 'Afst', x: left + 330 },
    { label: 'Verl', x: left + 372 },
    { label: 'Vang', x: left + 414 },
    { label: 'Sco', x: left + 456 },
  ]
  const header = () => {
    for (const c of cols) text(c.label, c.x, 8, true, grey)
    y -= 13
  }
  header()
  for (const p of r.players) {
    if (y - 12 < bottom) {
      newPage()
      header()
    }
    text(String(p.shirtNumber), cols[0].x, 8.5)
    text(p.name.length > 26 ? p.name.slice(0, 25) + '.' : p.name, cols[1].x, 8.5)
    text(String(p.matches), cols[2].x, 8.5)
    text(String(p.throws), cols[3].x, 8.5)
    text(String(p.goals), cols[4].x, 8.5)
    text(String(p.points), cols[5].x, 8.5, true)
    text(`${Math.round(p.conversion * 100)}%`, cols[6].x, 8.5)
    text(`${p.avgDistance}m`, cols[7].x, 8.5)
    text(String(p.caughtLost), cols[8].x, 8.5)
    text(String(p.catches), cols[9].x, 8.5)
    text(p.score > 0 ? `+${p.score}` : String(p.score), cols[10].x, 8.5)
    y -= 12
  }

  y -= 8
  line('Legende: M wedstrijden - W worpen - D doelpunten - Conv conversie - Afst gem. afstand - Verl balverlies door vangst - Vang vangsten - Sco score', { size: 7, color: grey })

  return doc.save()
}
