import { PDFDocument, type PDFFont, type PDFPage, StandardFonts, rgb } from 'pdf-lib'

import type { DangerShot, TeamDanger } from '../player-danger'
import { reeksNaam } from '../reeksen'
import { hasSpeelstijl, parseSpeelstijl, speelstijlSamenvatting } from '../speelstijl'
import type { TeamReport } from '../team-report'
import { formatDateBE } from '../datetime'

// Volledig scoutingdossier van één ploeg als PDF (pdf-lib): sterktes & zwaktes, automatische
// analyse, analysetekeningen op het veld (aanvals- en verdedigingskaart met kleuren/zones),
// worpkeuze, en een spelerstabel. Leesbaar voor zowel de tegenstander als de eigen ploeg.

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
const CW = A4[0] - 2 * MARGIN

const INK = rgb(0.11, 0.13, 0.15)
const DIM = rgb(0.42, 0.46, 0.48)
const ACCENT = rgb(0.02, 0.55, 0.42)
const ACCENT_DK = rgb(0.04, 0.32, 0.24)
const GOOD = rgb(0.05, 0.5, 0.34)
const GOOD_BG = rgb(0.9, 0.97, 0.93)
const BAD = rgb(0.78, 0.18, 0.22)
const BAD_BG = rgb(0.99, 0.92, 0.92)
const GOLD = rgb(0.85, 0.62, 0.13)
const LINE = rgb(0.86, 0.88, 0.88)
const PANEL = rgb(0.96, 0.97, 0.97)
const GRASS = rgb(0.07, 0.26, 0.18)
const GRASS2 = rgb(0.1, 0.31, 0.22)
const CHALK = rgb(0.85, 0.95, 0.9)
const WHITE = rgb(1, 1, 1)

// Heatkleur: 0 = koel groen, 0.5 = amber, 1 = rood (druk/gevaarlijk). De heetste zone springt
// er zo meteen uit in het rood, koude zones blijven groen.
function heatRgb(t: number) {
  const x = Math.max(0, Math.min(1, t))
  const stops: [number, [number, number, number]][] = [
    [0, [0.05, 0.5, 0.32]],
    [0.5, [0.95, 0.73, 0.15]],
    [1, [0.85, 0.16, 0.2]],
  ]
  let lo = stops[0]
  let hi = stops[stops.length - 1]
  for (let i = 0; i < stops.length - 1; i++) {
    if (x >= stops[i][0] && x <= stops[i + 1][0]) {
      lo = stops[i]
      hi = stops[i + 1]
      break
    }
  }
  const span = hi[0] - lo[0] || 1
  const f = (x - lo[0]) / span
  const c = lo[1].map((v, i) => v + (hi[1][i] - v) * f)
  return rgb(c[0], c[1], c[2])
}

export async function generateTeamReportPdf(
  r: TeamReport,
  danger?: TeamDanger | null,
  conceded?: TeamDanger | null,
): Promise<Uint8Array> {
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
  const dot = (x: number, yy: number, rad: number, color: ReturnType<typeof rgb>, opacity = 1) =>
    page.drawCircle({ x, y: yy, size: rad, color, opacity })
  const vline = (x: number, y1: number, y2: number, color: ReturnType<typeof rgb>, thickness = 1, opacity = 1) =>
    page.drawLine({ start: { x, y: y1 }, end: { x, y: y2 }, thickness, color, opacity })
  // Gevulde polygoon (pdf-lib spiegelt de y-as intern, dus lokale (lx,ly) → pagina (x+lx, y-ly)).
  const fillPoly = (cx: number, cy: number, pts: { x: number; y: number }[], color: ReturnType<typeof rgb>, opacity = 1) => {
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') + ' Z'
    page.drawSvgPath(d, { x: cx, y: cy, color, opacity, borderWidth: 0 })
  }
  const star = (sx: number, sy: number, outer: number, color: ReturnType<typeof rgb>, opacity = 1) => {
    const inner = outer * 0.45
    const pts = Array.from({ length: 10 }, (_, i) => {
      const rr = i % 2 === 0 ? outer : inner
      const a = (-90 + i * 36) * (Math.PI / 180)
      return { x: rr * Math.cos(a), y: rr * Math.sin(a) }
    })
    fillPoly(sx, sy, pts, color, opacity)
  }

  const ensure = (need: number) => {
    if (y - need < 44) {
      page = doc.addPage(A4)
      y = A4[1] - MARGIN
    }
  }
  const sectionTitle = (s: string) => {
    ensure(34)
    y -= 24
    rect(MARGIN, y - 4, 4, 16, ACCENT)
    txt(s, MARGIN + 10, y, 12.5, bold, ACCENT_DK)
    y -= 10
  }
  const wrap = (s: string, size: number, maxW: number, f: PDFFont = font): string[] => {
    const out: string[] = []
    let cur = ''
    for (const w of safe(s).split(' ')) {
      const test = cur ? `${cur} ${w}` : w
      if (f.widthOfTextAtSize(test, size) > maxW && cur) {
        out.push(cur)
        cur = w
      } else cur = test
    }
    if (cur) out.push(cur)
    return out
  }
  const paragraph = (s: string, size: number, color = INK, indent = 0) => {
    for (const ln of wrap(s, size, CW - indent)) {
      ensure(size + 5)
      y -= size + 4
      txt(ln, MARGIN + indent, y, size, font, color)
    }
  }

  // ── Kop ──
  const headH = 86
  rect(0, A4[1] - headH, A4[0], headH, ACCENT_DK)
  rect(0, A4[1] - headH, 6, headH, GOLD)
  txt('SCOUTINGRAPPORT', MARGIN, A4[1] - 28, 10, bold, rgb(0.7, 0.9, 0.82))
  txt(r.teamName, MARGIN, A4[1] - 52, 20, bold, WHITE)
  txt(`${reeksNaam(r.reeks)}  ·  ${r.matchesAnalyzed} wedstrijden geanalyseerd`, MARGIN, A4[1] - 70, 10, font, rgb(0.78, 0.88, 0.83))
  const gen = `Gegenereerd ${formatDateBE(new Date(r.generatedAt))}`
  txt(gen, A4[0] - MARGIN - txtW(gen, 8), A4[1] - 70, 8, font, rgb(0.7, 0.82, 0.77))
  y = A4[1] - headH - 6

  // ── KPI-kaarten ──
  const t = r.totals
  const kpis = [
    ['Wedstrijden', String(r.matchesAnalyzed)],
    ['Worpen', String(t.throws)],
    ['Doelpunten', String(t.goals)],
    ['Punten', String(t.points)],
    ['Conversie', `${Math.round(t.conversion * 100)}%`],
    ['Gem. afstand', `${t.avgDistance}m`],
    ['Vangsten', String(t.catches)],
    ['Balverlies', String(t.caughtAgainst)],
  ]
  const perRow = 4
  const gap = 10
  const cardW = (CW - (perRow - 1) * gap) / perRow
  const cardH = 44
  kpis.forEach(([label, value], i) => {
    const col = i % perRow
    if (col === 0) {
      y -= cardH + 8
    }
    const x = MARGIN + col * (cardW + gap)
    rect(x, y, cardW, cardH, PANEL)
    rect(x, y, cardW, 3, ACCENT)
    txt(value, x + 10, y + cardH - 21, 16, bold, INK)
    txt(label, x + 10, y + 8, 8, font, DIM)
  })
  y -= 6

  // ── Profiel: DNA-labels + radar ──
  const prof = r.profile
  if (prof.tags.length || prof.radar.some((a) => a.value > 0)) {
    sectionTitle('Profiel')
    if (prof.tags.length) paragraph(`DNA: ${prof.tags.join('  ·  ')}`, 9, INK)
    // Radar (6 assen) — gevuld, met rasterringen en een gloed-outline.
    ensure(206)
    const radR = 74
    const cx = MARGIN + CW / 2
    const cy = y - radR - 26
    const nAx = prof.radar.length
    const rv = (i: number, rr: number) => {
      const a = (-90 + i * (360 / nAx)) * (Math.PI / 180)
      return { x: cx + rr * Math.cos(a), y: cy - rr * Math.sin(a) }
    }
    // Zachte achtergrondgloed + rasterringen.
    dot(cx, cy, radR + 9, ACCENT, 0.05)
    for (const ring of [0.25, 0.5, 0.75, 1]) {
      for (let i = 0; i < nAx; i++) {
        page.drawLine({ start: rv(i, ring * radR), end: rv((i + 1) % nAx, ring * radR), thickness: ring === 1 ? 0.8 : 0.5, color: LINE, opacity: ring === 1 ? 0.9 : 0.45 })
      }
    }
    for (let i = 0; i < nAx; i++) page.drawLine({ start: { x: cx, y: cy }, end: rv(i, radR), thickness: 0.4, color: LINE, opacity: 0.45 })
    // Gevuld datavlak (lokale coördinaten voor fillPoly).
    const dataLocal = prof.radar.map((a, i) => {
      const ang = (-90 + i * (360 / nAx)) * (Math.PI / 180)
      const rr = (Math.max(0, Math.min(100, a.value)) / 100) * radR
      return { x: rr * Math.cos(ang), y: rr * Math.sin(ang) }
    })
    fillPoly(cx, cy, dataLocal, ACCENT, 0.18)
    const dataPts = prof.radar.map((a, i) => rv(i, (Math.max(0, Math.min(100, a.value)) / 100) * radR))
    for (let i = 0; i < dataPts.length; i++) page.drawLine({ start: dataPts[i], end: dataPts[(i + 1) % dataPts.length], thickness: 3.4, color: ACCENT, opacity: 0.2 })
    for (let i = 0; i < dataPts.length; i++) page.drawLine({ start: dataPts[i], end: dataPts[(i + 1) % dataPts.length], thickness: 1.6, color: ACCENT })
    for (const p of dataPts) { dot(p.x, p.y, 2.3, ACCENT); dot(p.x, p.y, 0.9, WHITE) }
    dot(cx, cy, 1.4, ACCENT)
    prof.radar.forEach((a, i) => {
      const lp = rv(i, radR + 13)
      const w = txtW(a.label, 7.5, bold)
      const lx = lp.x < cx - 4 ? lp.x - w : lp.x > cx + 4 ? lp.x : lp.x - w / 2
      txt(a.label, lx, lp.y + (lp.y > cy ? 2 : -6), 7.5, bold, INK)
      const vw = txtW(a.display, 7, bold)
      const vx = lp.x < cx - 4 ? lp.x - vw : lp.x > cx + 4 ? lp.x : lp.x - vw / 2
      txt(a.display, vx, lp.y + (lp.y > cy ? 2 : -6) - 9, 7, bold, ACCENT_DK)
    })
    y = cy - radR - 26
  }

  // ── Sterktes & Zwaktes ──
  const strong = prof.strengths.map((f) => `${f.title}: ${f.detail}`)
  const weak = prof.weaknesses.map((f) => `${f.title}: ${f.detail}`)
  sectionTitle('Sterktes & zwaktes')
  const colGap = 14
  const colW = (CW - colGap) / 2
  const swTop = y
  const drawSW = (x: number, title: string, items: string[], col: ReturnType<typeof rgb>, bg: ReturnType<typeof rgb>) => {
    let yy = swTop
    // bereken hoogte
    const lines: string[][] = items.map((s) => wrap(`- ${s}`, 8.5, colW - 20))
    const bodyH = lines.reduce((a, ls) => a + ls.length * 12, 0)
    const boxH = 22 + Math.max(bodyH, 12) + 8
    rect(x, yy - boxH, colW, boxH, bg)
    rect(x, yy - boxH, 3, boxH, col)
    txt(title, x + 10, yy - 15, 11, bold, col)
    yy -= 30
    for (const ls of lines) {
      for (const ln of ls) {
        txt(ln, x + 10, yy, 8.5, font, INK)
        yy -= 12
      }
    }
    return boxH
  }
  const hL = drawSW(MARGIN, 'STERK', strong.length ? strong : ['Nog te weinig data.'], GOOD, GOOD_BG)
  const hR = drawSW(MARGIN + colW + colGap, 'ZWAK', weak.length ? weak : ['Nog te weinig data.'], BAD, BAD_BG)
  y = swTop - Math.max(hL, hR) - 6

  // ── Analysetekeningen op het veld ──
  // Liggend veld: lange as = lengte (aanval naar rechts = aangevallen doel), korte as = breedte.
  const drawFieldMap = (
    x: number,
    topY: number,
    w: number,
    shots: DangerShot[],
    goalColor: ReturnType<typeof rgb>,
    zoneShare: { links: number; midden: number; rechts: number },
    highlight: 'links' | 'midden' | 'rechts' | null,
  ): number => {
    const d = 10
    const total = 26 + 2 * d
    const h = w * (14 / total) // liggend: hoogte = breedte-verhouding
    const fy = topY - h
    // Gemaaide stroken voor een echte pitch-look.
    const stripes = 9
    for (let i = 0; i < stripes; i++) rect(x + i * (w / stripes), fy, w / stripes + 0.6, h, i % 2 ? GRASS2 : GRASS)
    // Zone-heat (3 horizontale stroken): heatkleur naar relatieve intensiteit — heetste zone = rood.
    const zs: [string, number][] = [
      ['links', zoneShare.links],
      ['midden', zoneShare.midden],
      ['rechts', zoneShare.rechts],
    ]
    const maxZone = Math.max(zoneShare.links, zoneShare.midden, zoneShare.rechts, 1)
    zs.forEach(([name, v], i) => {
      const stripH = h / 3
      const sy = fy + i * stripH
      const t = v / maxZone
      rect(x, sy, w, stripH, heatRgb(t), 0.28 + 0.5 * t)
      if (highlight === name) {
        // Richtindicator: een gouden pijl die de heetste (voorkeurs)zone aanwijst.
        const ay = sy + stripH / 2
        page.drawLine({ start: { x: x + 6, y: ay }, end: { x: x + 22, y: ay }, thickness: 1.4, color: GOLD })
        page.drawLine({ start: { x: x + 22, y: ay }, end: { x: x + 17, y: ay + 3 }, thickness: 1.4, color: GOLD })
        page.drawLine({ start: { x: x + 22, y: ay }, end: { x: x + 17, y: ay - 3 }, thickness: 1.4, color: GOLD })
      }
      if (i > 0) page.drawLine({ start: { x, y: sy }, end: { x: x + w, y: sy }, thickness: 0.4, color: CHALK, opacity: 0.3 })
    })
    const g = d / total
    const ft = (d + 4) / total
    // Doelgebied (rechts) lichtjes oplichten.
    const gx = x + (1 - g) * w
    rect(gx, fy, x + w - gx, h, WHITE, 0.07)
    // Veldlijnen.
    page.drawRectangle({ x, y: fy, width: w, height: h, borderColor: CHALK, borderWidth: 1.2, opacity: 0 })
    vline(x + 0.5 * w, fy, fy + h, CHALK, 1, 0.7) // middellijn (vol)
    page.drawCircle({ x: x + 0.5 * w, y: fy + h / 2, size: 9, color: CHALK, borderColor: CHALK, borderWidth: 0.8, opacity: 0, borderOpacity: 0.6 })
    vline(gx, fy, fy + h, CHALK, 1.2, 0.85) // aangevallen doellijn
    vline(x + (1 - ft) * w, fy, fy + h, CHALK, 0.6, 0.45) // vrijworplijn
    // Vier streepjes die buiten de doellijn steken (reglement).
    for (const fr of [0.12, 0.38, 0.62, 0.88]) {
      const sy = fy + fr * h
      page.drawLine({ start: { x: gx, y: sy }, end: { x: gx + 5, y: sy }, thickness: 0.8, color: CHALK, opacity: 0.7 })
    }
    // Doel (rechts) als korte dikke paal + label.
    const gcy = fy + h / 2
    vline(x + w - 1.5, gcy - h * 0.13, gcy + h * 0.13, WHITE, 2.6, 0.95)
    txt('doel', x + w - 24, gcy - 3, 7, bold, CHALK)
    // Aanvalsrichting bovenaan.
    const ar = fy + h - 7
    page.drawLine({ start: { x: x + w * 0.34, y: ar }, end: { x: x + w * 0.62, y: ar }, thickness: 1, color: CHALK, opacity: 0.55 })
    page.drawLine({ start: { x: x + w * 0.62, y: ar }, end: { x: x + w * 0.62 - 4, y: ar + 2.6 }, thickness: 1, color: CHALK, opacity: 0.55 })
    page.drawLine({ start: { x: x + w * 0.62, y: ar }, end: { x: x + w * 0.62 - 4, y: ar - 2.6 }, thickness: 1, color: CHALK, opacity: 0.55 })
    txt('aanval', x + w * 0.34, ar - 9, 6.5, font, CHALK)
    // Scoreflow: dunne lijn van het vertrekpunt naar de landingsplek van elk doelpunt.
    const cl = (v: number) => Math.max(0, Math.min(1, v))
    for (const s of shots) {
      if (!s.goal) continue
      const ox = x + cl(s.y) * w
      const oy = fy + cl(s.x) * h
      const px = x + cl(s.landY) * w
      const py = fy + cl(s.landX) * h
      page.drawLine({ start: { x: ox, y: oy }, end: { x: px, y: py }, thickness: 0.6, color: goalColor, opacity: 0.35 })
      dot(ox, oy, 0.9, goalColor, 0.5)
    }
    // Schoten: doelpunten als sterren, missers als kleine doffe stippen.
    for (const s of shots) {
      const px = x + cl(s.landY) * w
      const py = fy + cl(s.landX) * h
      if (s.goal) {
        star(px, py, 4.3, WHITE, 0.9)
        star(px, py, 3.4, goalColor, 1)
        star(px, py, 1.5, WHITE, 0.95)
      } else dot(px, py, 1.4, rgb(0.78, 0.83, 0.83), 0.45)
    }
    return h
  }

  const domZoneShare = (z: { links: number; midden: number; rechts: number }): 'links' | 'midden' | 'rechts' | null => {
    const tot = z.links + z.midden + z.rechts
    if (!tot) return null
    return (['links', 'midden', 'rechts'] as const).reduce((a, b) => (z[b] > z[a] ? b : a), 'links')
  }

  if (danger && danger.attempts > 0) {
    sectionTitle('Aanvalskaart - waar zij gooien & scoren')
    paragraph('Elke ster is een doelpunt; de lijn toont van waar ze gooiden (de scoreflow). De donkere strook + gouden pijl tonen hun voorkeurszone. Sluit die ruimte.', 8.5, DIM)
    ensure(120)
    y -= 8
    const used = drawFieldMap(MARGIN, y, CW, danger.shots, ACCENT, r.zones, domZoneShare(r.zones))
    y -= used + 6
    star(MARGIN + 5, y + 3, 3.2, ACCENT)
    txt(`Doelpunt`, MARGIN + 12, y, 8, font, INK)
    dot(MARGIN + 70, y + 3, 1.5, rgb(0.75, 0.8, 0.8))
    txt(`Gemiste poging`, MARGIN + 76, y, 8, font, DIM)
    txt('Rood = heetste zone (gouden pijl)', MARGIN + 176, y, 8, font, DIM)
    y -= 6
  }

  if (conceded && conceded.attempts > 0) {
    const cz = { links: conceded.zoneBands[0]?.attempts ?? 0, midden: conceded.zoneBands[1]?.attempts ?? 0, rechts: conceded.zoneBands[2]?.attempts ?? 0 }
    sectionTitle('Verdedigingskaart - waar tegen hen gescoord wordt')
    paragraph('Hier maken tegenstanders het verschil tegen deze ploeg. De gemarkeerde strook is hun zwakste kant - zoek die ruimte bewust op.', 8.5, DIM)
    ensure(120)
    y -= 8
    const used = drawFieldMap(MARGIN, y, CW, conceded.shots, BAD, cz, domZoneShare(cz))
    y -= used + 6
    star(MARGIN + 5, y + 3, 3.2, BAD)
    txt('Tegendoelpunt', MARGIN + 12, y, 8, font, INK)
    txt('Rood = hun zwakste zone (gouden pijl)', MARGIN + 120, y, 8, font, DIM)
    y -= 6
  }

  // ── Worpkeuze & afstand ──
  const drawBars = (x: number, topY: number, w: number, rows: { label: string; value: number; max: number; sub: string; color?: ReturnType<typeof rgb> }[]) => {
    const rowH = 16
    const labW = 64
    const valW = 60
    const trackW = w - labW - valW
    rows.forEach((b, i) => {
      const by = topY - i * rowH
      txt(b.label, x, by, 8.5, font, INK)
      rect(x + labW, by - 1, trackW, 8, rgb(0.9, 0.92, 0.92))
      const frac = b.max > 0 ? Math.max(0, Math.min(1, b.value / b.max)) : 0
      rect(x + labW, by - 1, trackW * frac, 8, b.color ?? ACCENT)
      txt(b.sub, x + labW + trackW + 6, by, 8, font, DIM)
    })
    return rows.length * rowH
  }
  sectionTitle('Worpkeuze & afstand')
  ensure(70)
  y -= 14
  const wkTop = y
  txt('Worptype (doelpunten)', MARGIN, wkTop, 8.5, bold, DIM)
  const goalsTot = t.goals || 1
  drawBars(MARGIN, wkTop - 16, colW, [
    { label: 'Nek (+1)', value: t.nek, max: goalsTot, sub: String(t.nek), color: ACCENT },
    { label: 'Rug (+2)', value: t.rug, max: goalsTot, sub: String(t.rug), color: GOLD },
  ])
  if (danger) {
    txt('Diepte (poging · conversie)', MARGIN + colW + colGap, wkTop, 8.5, bold, DIM)
    const maxD = Math.max(1, ...danger.depthBands.map((b) => b.attempts))
    drawBars(
      MARGIN + colW + colGap,
      wkTop - 16,
      colW,
      danger.depthBands.map((b) => ({ label: b.label, value: b.attempts, max: maxD, sub: `${b.attempts}·${Math.round(b.conversion * 100)}%` })),
    )
  }
  y = wkTop - 16 - 3 * 16 - 6

  // ── Speelstijl + extra analyse (niets verbergen) ──
  const stijl = parseSpeelstijl(r.speelstijl)
  if (hasSpeelstijl(stijl) || r.strategy.length) {
    sectionTitle('Tactisch profiel & strategie')
    if (hasSpeelstijl(stijl)) paragraph(`Speelstijl: ${speelstijlSamenvatting(stijl).join('  ·  ')}`, 9, INK)
    for (const s of r.strategy) paragraph(`-  ${s}`, 9, INK)
  }

  // ── Spelerstabel ──
  sectionTitle('Spelers (op punten)')
  const cols = [
    { label: '#', x: MARGIN + 4 },
    { label: 'Speler', x: MARGIN + 22 },
    { label: 'M', x: MARGIN + 220 },
    { label: 'D', x: MARGIN + 250 },
    { label: 'Ptn', x: MARGIN + 284 },
    { label: 'Conv', x: MARGIN + 322 },
    { label: 'Afst', x: MARGIN + 366 },
    { label: 'Verl', x: MARGIN + 408 },
    { label: 'Vang', x: MARGIN + 448 },
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
    txt(String(p.goals), cols[3].x, y, 8.5)
    txt(String(p.points), cols[4].x, y, 8.5, bold)
    txt(`${Math.round(p.conversion * 100)}%`, cols[5].x, y, 8.5)
    txt(`${p.avgDistance}m`, cols[6].x, y, 8.5)
    txt(String(p.caughtLost), cols[7].x, y, 8.5)
    txt(String(p.catches), cols[8].x, y, 8.5)
  }

  // ── Tendensen per speler ──
  const tips = r.players.filter((p) => p.tip)
  if (tips.length) {
    sectionTitle('Tendensen per speler')
    for (const p of tips) paragraph(`#${p.shirtNumber} ${p.name}: ${p.tip}`, 8.5, INK)
  }

  y -= 12
  paragraph('Legende: M wedstrijden · D doelpunten · Ptn punten · Conv conversie · Afst gem. afstand · Verl balverlies (gevangen) · Vang vangsten.', 7, DIM)

  return doc.save()
}
