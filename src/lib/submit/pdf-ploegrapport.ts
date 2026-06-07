import { PDFDocument, type PDFFont, type PDFPage, StandardFonts, rgb } from 'pdf-lib'

import type { TeamDanger } from '../player-danger'
import { reeksNaam } from '../reeksen'
import { hasSpeelstijl, parseSpeelstijl, speelstijlSamenvatting } from '../speelstijl'
import type { TeamReport } from '../team-report'

// Visueel scoutingrapport van één ploeg als PDF (pdf-lib): gekleurde kop, KPI-kaarten, grafieken
// (zoneverdeling, worptype, gevaarzone diepte/breedte), een mini-veld met veldbezetting, en een
// verzorgde spelerstabel. Geschikt voor mail/print naar de technische staf.

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
const MARGIN = 36
const CW = A4[0] - 2 * MARGIN // content-breedte

// Kleuren.
const INK = rgb(0.11, 0.13, 0.15)
const DIM = rgb(0.42, 0.46, 0.48)
const ACCENT = rgb(0.02, 0.55, 0.42) // krachtbal-groen
const ACCENT_DK = rgb(0.04, 0.32, 0.24)
const GOLD = rgb(0.85, 0.62, 0.13)
const LINE = rgb(0.86, 0.88, 0.88)
const PANEL = rgb(0.96, 0.97, 0.97)
const WHITE = rgb(1, 1, 1)

export async function generateTeamReportPdf(r: TeamReport, danger?: TeamDanger | null): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  let page: PDFPage = doc.addPage(A4)
  let y = A4[1]

  const txt = (s: string, x: number, yy: number, size: number, f: PDFFont = font, color = INK) =>
    page.drawText(safe(s), { x, y: yy, size, font: f, color })
  const txtW = (s: string, size: number, f: PDFFont = font) => f.widthOfTextAtSize(safe(s), size)
  const rect = (x: number, yy: number, w: number, h: number, color: ReturnType<typeof rgb>, opacity = 1) =>
    page.drawRectangle({ x, y: yy, width: w, height: h, color, opacity })
  const border = (x: number, yy: number, w: number, h: number, color = LINE, bw = 1) =>
    page.drawRectangle({ x, y: yy, width: w, height: h, borderColor: color, borderWidth: bw, color: WHITE, opacity: 0 })

  const ensure = (need: number) => {
    if (y - need < 44) {
      page = doc.addPage(A4)
      y = A4[1] - MARGIN
    }
  }
  const sectionTitle = (s: string) => {
    ensure(34)
    y -= 22
    rect(MARGIN, y - 4, 4, 16, ACCENT)
    txt(s, MARGIN + 10, y, 12.5, bold, ACCENT_DK)
    y -= 10
  }
  // Tekst met automatische woordwrap binnen content-breedte.
  const paragraph = (s: string, size: number, color = INK, indent = 0) => {
    const maxW = CW - indent
    const words = safe(s).split(' ')
    let cur = ''
    const flush = () => {
      ensure(size + 5)
      y -= size + 4
      txt(cur, MARGIN + indent, y, size, font, color)
      cur = ''
    }
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w
      if (txtW(test, size) > maxW && cur) flush()
      else cur = test
    }
    if (cur) flush()
  }

  // ── Kop-band ──
  const headH = 84
  rect(0, A4[1] - headH, A4[0], headH, ACCENT_DK)
  rect(0, A4[1] - headH, 6, headH, GOLD)
  txt('PLOEGRAPPORT', MARGIN, A4[1] - 30, 10, bold, rgb(0.7, 0.9, 0.82))
  txt(r.teamName, MARGIN, A4[1] - 52, 20, bold, WHITE)
  txt(
    `${reeksNaam(r.reeks)}  ·  ${r.matchesAnalyzed} wedstrijden geanalyseerd`,
    MARGIN,
    A4[1] - 70,
    10,
    font,
    rgb(0.78, 0.88, 0.83),
  )
  const gen = `Gegenereerd ${new Date(r.generatedAt).toLocaleDateString('nl-BE')}`
  txt(gen, A4[0] - MARGIN - txtW(gen, 8), A4[1] - 70, 8, font, rgb(0.7, 0.82, 0.77))
  y = A4[1] - headH - 6

  // ── KPI-kaarten ──
  const t = r.totals
  const kpis: { label: string; value: string }[] = [
    { label: 'Wedstrijden', value: String(r.matchesAnalyzed) },
    { label: 'Worpen', value: String(t.throws) },
    { label: 'Doelpunten', value: `${t.goals}` },
    { label: 'Punten', value: String(t.points) },
    { label: 'Conversie', value: `${Math.round(t.conversion * 100)}%` },
    { label: 'Gem. afstand', value: `${t.avgDistance}m` },
    { label: 'Vangsten', value: String(t.catches) },
    { label: 'Balverlies', value: String(t.caughtAgainst) },
  ]
  const perRow = 4
  const gap = 10
  const cardW = (CW - (perRow - 1) * gap) / perRow
  const cardH = 46
  kpis.forEach((k, i) => {
    const col = i % perRow
    const row = Math.floor(i / perRow)
    if (col === 0) {
      ensure(cardH + 6)
      y -= cardH + (row === 0 ? 8 : 8)
    }
    const x = MARGIN + col * (cardW + gap)
    const cy = y
    rect(x, cy, cardW, cardH, PANEL)
    rect(x, cy, cardW, 3, ACCENT)
    txt(k.value, x + 10, cy + cardH - 22, 17, bold, INK)
    txt(k.label, x + 10, cy + 9, 8, font, DIM)
  })
  y -= 4

  // ── Speelstijl (indien ingegeven) ──
  const stijl = parseSpeelstijl(r.speelstijl)
  if (hasSpeelstijl(stijl)) {
    sectionTitle('Speelstijl (eigen profiel)')
    paragraph(speelstijlSamenvatting(stijl).join('  ·  ') || '-', 9.5, INK)
    if (stijl.notitie) paragraph(`Notitie: ${stijl.notitie}`, 8.5, DIM)
  }

  // ── Strategie ──
  if (r.strategy.length) {
    sectionTitle('Strategie')
    for (const s of r.strategy) paragraph(`-  ${s}`, 9, INK)
  }

  // ── Aanbevelingen ──
  if (r.insights.length) {
    sectionTitle('Aanbevelingen uit de data')
    for (const s of r.insights) paragraph(`-  ${s}`, 9, INK)
  }

  // ── Grafieken: zoneverdeling (mini-veld) + worptype ──
  const drawBars = (
    x: number,
    topY: number,
    w: number,
    rows: { label: string; value: number; max: number; sub?: string; color?: ReturnType<typeof rgb> }[],
  ) => {
    const rowH = 16
    const labW = 56
    const valW = 52
    const trackW = w - labW - valW
    rows.forEach((b, i) => {
      const by = topY - i * rowH
      txt(b.label, x, by, 8.5, font, INK)
      rect(x + labW, by - 1, trackW, 8, rgb(0.9, 0.92, 0.92))
      const frac = b.max > 0 ? Math.max(0, Math.min(1, b.value / b.max)) : 0
      rect(x + labW, by - 1, trackW * frac, 8, b.color ?? ACCENT)
      txt(b.sub ?? String(b.value), x + labW + trackW + 6, by, 8, font, DIM)
    })
    return rows.length * rowH
  }

  // Mini-veld met veldbezetting (zone-aandeel van de doelpunten/worpen).
  const drawMiniField = (x: number, topY: number, w: number) => {
    const h = 96
    const fieldY = topY - h
    // veld
    rect(x, fieldY, w, h, rgb(0.06, 0.24, 0.16))
    border(x, fieldY, w, h, rgb(0.85, 0.95, 0.9), 1)
    const zTot = r.zones.links + r.zones.midden + r.zones.rechts || 1
    const zones: [string, number][] = [
      ['Links', r.zones.links],
      ['Midden', r.zones.midden],
      ['Rechts', r.zones.rechts],
    ]
    const colW = w / 3
    zones.forEach(([lbl, v], i) => {
      const frac = v / zTot
      const cx = x + i * colW
      // schaduw per zone, sterker = meer worpen
      rect(cx, fieldY, colW, h, ACCENT, 0.15 + frac * 0.6)
      if (i > 0) page.drawLine({ start: { x: cx, y: fieldY }, end: { x: cx, y: fieldY + h }, thickness: 0.5, color: rgb(0.8, 0.9, 0.85), opacity: 0.5 })
      txt(`${Math.round(frac * 100)}%`, cx + colW / 2 - txtW(`${Math.round(frac * 100)}%`, 11, bold) / 2, fieldY + h / 2, 11, bold, WHITE)
      txt(lbl, cx + colW / 2 - txtW(lbl, 7) / 2, fieldY + 6, 7, font, rgb(0.85, 0.95, 0.9))
    })
    return h
  }

  sectionTitle('Veldbezetting & worpkeuze')
  const colGap = 16
  const colW2 = (CW - colGap) / 2
  ensure(110)
  y -= 14
  const blockTop = y
  // links: mini-veld
  txt('Zoneverdeling (waar de worpen vallen)', MARGIN, blockTop, 8.5, bold, DIM)
  drawMiniField(MARGIN, blockTop - 6, colW2)
  // rechts: worptype-bars
  txt('Worptype (doelpunten)', MARGIN + colW2 + colGap, blockTop, 8.5, bold, DIM)
  const goalsTot = t.goals || 1
  drawBars(MARGIN + colW2 + colGap, blockTop - 18, colW2, [
    { label: 'Nek (+1)', value: t.nek, max: goalsTot, sub: `${t.nek}`, color: ACCENT },
    { label: 'Rug (+2)', value: t.rug, max: goalsTot, sub: `${t.rug}`, color: GOLD },
  ])
  y = blockTop - 6 - 96 - 8

  // ── Gevaarzone (uit de doelpogingen) ──
  if (danger && danger.attempts > 0) {
    sectionTitle('Gevaarzone — vanwaar scoort deze ploeg')
    ensure(110)
    y -= 14
    const gTop = y
    const maxDepth = Math.max(1, ...danger.depthBands.map((b) => b.attempts))
    const maxZone = Math.max(1, ...danger.zoneBands.map((b) => b.attempts))
    txt('Diepte (doelpogingen · conversie)', MARGIN, gTop, 8.5, bold, DIM)
    drawBars(
      MARGIN,
      gTop - 18,
      colW2,
      danger.depthBands.map((b) => ({
        label: b.label,
        value: b.attempts,
        max: maxDepth,
        sub: `${b.attempts} · ${Math.round(b.conversion * 100)}%`,
        color: ACCENT,
      })),
    )
    txt('Breedte (doelpogingen · conversie)', MARGIN + colW2 + colGap, gTop, 8.5, bold, DIM)
    drawBars(
      MARGIN + colW2 + colGap,
      gTop - 18,
      colW2,
      danger.zoneBands.map((b) => ({
        label: b.label,
        value: b.attempts,
        max: maxZone,
        sub: `${b.attempts} · ${Math.round(b.conversion * 100)}%`,
        color: ACCENT,
      })),
    )
    y = gTop - 18 - Math.max(danger.depthBands.length, danger.zoneBands.length) * 16 - 6
  }

  // ── Spelerstabel (zebra) ──
  sectionTitle('Per speler')
  const cols: { label: string; x: number; align?: 'l' | 'r' }[] = [
    { label: '#', x: MARGIN + 4 },
    { label: 'Speler', x: MARGIN + 24 },
    { label: 'M', x: MARGIN + 250 },
    { label: 'W', x: MARGIN + 280 },
    { label: 'D', x: MARGIN + 310 },
    { label: 'Ptn', x: MARGIN + 342 },
    { label: 'Conv', x: MARGIN + 380 },
    { label: 'Afst', x: MARGIN + 425 },
    { label: 'Verl', x: MARGIN + 465 },
    { label: 'Vang', x: MARGIN + 498 },
  ]
  const drawHeader = () => {
    ensure(20)
    y -= 16
    rect(MARGIN, y - 4, CW, 18, ACCENT_DK)
    for (const c of cols) txt(c.label, c.x, y, 8, bold, WHITE)
    y -= 6
  }
  drawHeader()
  let zebra = false
  for (const p of r.players) {
    if (y - 15 < 44) {
      page = doc.addPage(A4)
      y = A4[1] - MARGIN
      drawHeader()
    }
    y -= 15
    if (zebra) rect(MARGIN, y - 4, CW, 15, PANEL)
    zebra = !zebra
    const name = p.name.length > 30 ? p.name.slice(0, 29) + '.' : p.name
    txt(String(p.shirtNumber), cols[0].x, y, 8.5, font, DIM)
    txt(name, cols[1].x, y, 8.5)
    txt(String(p.matches), cols[2].x, y, 8.5)
    txt(String(p.throws), cols[3].x, y, 8.5)
    txt(String(p.goals), cols[4].x, y, 8.5)
    txt(String(p.points), cols[5].x, y, 8.5, bold)
    txt(`${Math.round(p.conversion * 100)}%`, cols[6].x, y, 8.5)
    txt(`${p.avgDistance}m`, cols[7].x, y, 8.5)
    txt(String(p.caughtLost), cols[8].x, y, 8.5)
    txt(String(p.catches), cols[9].x, y, 8.5)
  }
  y -= 12
  paragraph(
    'Legende: M wedstrijden · W worpen · D doelpunten · Ptn punten · Conv conversie · Afst gem. afstand · Verl balverlies door vangst · Vang vangsten.',
    7,
    DIM,
  )

  // ── Tendensen per speler ──
  const tips = r.players.filter((p) => p.tip)
  if (tips.length) {
    sectionTitle('Tendensen per speler')
    for (const p of tips) paragraph(`#${p.shirtNumber} ${p.name}: ${p.tip}`, 8.5, INK)
  }

  return doc.save()
}
