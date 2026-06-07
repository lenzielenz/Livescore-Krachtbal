import { PDFDocument, type PDFFont, type PDFPage, StandardFonts, rgb } from 'pdf-lib'

import type { DangerShot, TeamDanger } from '../player-danger'
import { reeksNaam } from '../reeksen'
import { hasSpeelstijl, parseSpeelstijl, speelstijlSamenvatting } from '../speelstijl'
import type { TeamReport } from '../team-report'

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
const WHITE = rgb(1, 1, 1)

const ZONE_NL: Record<string, string> = { links: 'links', midden: 'het midden', rechts: 'rechts', Links: 'links', Midden: 'het midden', Rechts: 'rechts' }

// ── Afgeleide sterktes & zwaktes uit alle beschikbare data ──
function bestBand(bands: { label: string; attempts: number; conversion: number }[], min = 3) {
  return bands.filter((b) => b.attempts >= min).sort((a, b) => b.conversion - a.conversion)[0] ?? null
}
function worstBand(bands: { label: string; attempts: number; conversion: number }[], min = 3) {
  return bands.filter((b) => b.attempts >= min).sort((a, b) => a.conversion - b.conversion)[0] ?? null
}
function topBand(bands: { label: string; attempts: number }[]) {
  return [...bands].sort((a, b) => b.attempts - a.attempts)[0] ?? null
}

function strengthsWeaknesses(r: TeamReport, danger?: TeamDanger | null, conceded?: TeamDanger | null) {
  const strong: string[] = []
  const weak: string[] = []
  const t = r.totals

  if (r.players[0]?.points > 0) {
    const p = r.players[0]
    strong.push(`Gevaarlijkste speler: #${p.shirtNumber} ${p.name} (${p.points} ptn, ${p.goals} doelpunten). Schakel hem uit.`)
  }
  if (t.goalAttempts >= 6 && t.conversion >= 0.55) strong.push(`Koelbloedig voor doel: ${Math.round(t.conversion * 100)}% van de doelpogingen raak.`)
  if (t.goals > 0 && t.rug / t.goals >= 0.4) strong.push(`Sterk in de rugworp (+2): ${Math.round((t.rug / t.goals) * 100)}% van de doelpunten zijn dubbel.`)
  if (danger) {
    const bz = bestBand(danger.zoneBands)
    if (bz && bz.conversion >= 0.5) strong.push(`Scoort vlot via ${ZONE_NL[bz.label] ?? bz.label}: ${Math.round(bz.conversion * 100)}% rendement.`)
    const far = danger.depthBands.find((b) => /ver/i.test(b.label))
    if (far && far.attempts >= 3 && far.conversion >= 0.4) strong.push(`Dreigt ook van ver: ${Math.round(far.conversion * 100)}% raak van afstand.`)
  }
  if (t.avgDistance >= 16) strong.push(`Speelt met diepgang: gemiddeld ${t.avgDistance} m per worp.`)

  // Zwaktes.
  if (conceded && conceded.attempts >= 5) {
    const cz = topBand(conceded.zoneBands)
    if (cz) weak.push(`Verdedigend kwetsbaar via ${ZONE_NL[cz.label] ?? cz.label}: daar scoren tegenstanders het vaakst tegen hen. Zoek die ruimte op.`)
    const cd = topBand(conceded.depthBands)
    if (cd && /ver/i.test(cd.label)) weak.push('Geeft veel kansen weg van ver - durf van afstand af te werken.')
  }
  if (danger) {
    const wz = worstBand(danger.zoneBands)
    const bz = bestBand(danger.zoneBands)
    if (wz && bz && wz.label !== bz.label && wz.conversion <= 0.35) weak.push(`Minder gevaarlijk via ${ZONE_NL[wz.label] ?? wz.label} (${Math.round(wz.conversion * 100)}%) - duw hen die kant op.`)
  }
  if (t.caughtAgainst >= 4) weak.push(`Verliest geregeld de bal door vangst (${t.caughtAgainst}x) - druk zetten loont.`)
  if (t.out >= 5) weak.push(`Gooit vaak buiten (${t.out}x) - laat hen forceren.`)
  if (t.goalAttempts >= 6 && t.conversion <= 0.4) weak.push(`Lage conversie (${Math.round(t.conversion * 100)}%) - onder druk haperen ze.`)

  // Vul aan met de automatische tendensen zodat niets verborgen blijft.
  for (const s of r.insights) if (weak.length + strong.length < 14 && !/verdedigend/i.test(s)) strong.push(s)
  return { strong: strong.slice(0, 7), weak: weak.slice(0, 7) }
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
  const gen = `Gegenereerd ${new Date(r.generatedAt).toLocaleDateString('nl-BE')}`
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

  // ── Sterktes & Zwaktes ──
  const { strong, weak } = strengthsWeaknesses(r, danger, conceded)
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
    rect(x, fy, w, h, GRASS)
    // zone-strips (breedte = verticale as, 3 stroken)
    const zTot = zoneShare.links + zoneShare.midden + zoneShare.rechts || 1
    const zs: [string, number][] = [
      ['links', zoneShare.links],
      ['midden', zoneShare.midden],
      ['rechts', zoneShare.rechts],
    ]
    zs.forEach(([name, v], i) => {
      const stripH = h / 3
      const sy = fy + i * stripH
      rect(x, sy, w, stripH, ACCENT, 0.1 + (v / zTot) * 0.4)
      if (highlight === name) rect(x, sy, w, stripH, GOLD, 0.18)
      if (i > 0) page.drawLine({ start: { x, y: sy }, end: { x: x + w, y: sy }, thickness: 0.4, color: rgb(0.8, 0.9, 0.85), opacity: 0.4 })
    })
    // veldlijnen
    page.drawRectangle({ x, y: fy, width: w, height: h, borderColor: rgb(0.85, 0.95, 0.9), borderWidth: 1, opacity: 0 })
    vline(x + 0.5 * w, fy, fy + h, rgb(0.85, 0.95, 0.9), 1, 0.7) // middellijn
    const g = d / total
    const ft = (d + 4) / total
    vline(x + (1 - g) * w, fy, fy + h, rgb(0.85, 0.95, 0.9), 1, 0.7) // aangevallen doellijn (rechts)
    vline(x + (1 - ft) * w, fy, fy + h, rgb(0.8, 0.9, 0.85), 0.6, 0.5) // vrijworplijn
    // doelpijl rechts
    txt('doel', x + w - 22, fy + h / 2 - 3, 7, bold, rgb(0.85, 0.95, 0.9))
    // shots: doelpunten in kleur, rest grijs/klein
    for (const s of shots) {
      const px = x + Math.max(0, Math.min(1, s.landY)) * w
      const py = fy + Math.max(0, Math.min(1, s.landX)) * h
      if (s.goal) dot(px, py, 2.4, goalColor, 0.9)
      else dot(px, py, 1.5, rgb(0.75, 0.8, 0.8), 0.5)
    }
    return h
  }

  const domZoneShare = (z: { links: number; midden: number; rechts: number }): 'links' | 'midden' | 'rechts' | null => {
    const tot = z.links + z.midden + z.rechts
    if (!tot) return null
    return (['links', 'midden', 'rechts'] as const).reduce((a, b) => (z[b] > z[a] ? b : a), 'links')
  }

  if (danger && danger.attempts > 0) {
    sectionTitle('Aanvalskaart - waar zij scoren')
    paragraph('Elke stip is een afgewerkte aanval; gekleurd = doelpunt. De donkere strook toont hun voorkeurszone. Sluit die ruimte.', 8.5, DIM)
    ensure(120)
    y -= 8
    const used = drawFieldMap(MARGIN, y, CW, danger.shots, ACCENT, r.zones, domZoneShare(r.zones))
    y -= used + 6
    txt(`Doelpunt`, MARGIN + 8, y, 8, font, INK)
    dot(MARGIN + 4, y + 3, 2.4, ACCENT)
    txt(`Gemiste poging`, MARGIN + 70, y, 8, font, DIM)
    dot(MARGIN + 66, y + 3, 1.5, rgb(0.75, 0.8, 0.8))
    txt('Goudstrook = voorkeurszone', MARGIN + 170, y, 8, font, DIM)
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
    txt('Tegendoelpunt', MARGIN + 8, y, 8, font, INK)
    dot(MARGIN + 4, y + 3, 2.4, BAD)
    txt('Goudstrook = hun zwakste zone', MARGIN + 110, y, 8, font, DIM)
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
