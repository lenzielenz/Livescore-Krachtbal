import { PDFDocument, type PDFFont, type PDFPage, StandardFonts, rgb } from 'pdf-lib'

import { buildMatchAnalysis, type TeamAgg } from '../match-analysis'
import { reeksNaam } from '../reeksen'
import type { MatchStats } from '../stats'

// Visuele wedstrijd-analyse als PDF: kop met eindstand, automatische analyse, ploeg-vergelijking,
// zoneverdeling per ploeg en een spelerstabel. Deelbaar met de technische staf.

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
const HOME = rgb(0.06, 0.5, 0.38)
const AWAY = rgb(0.18, 0.45, 0.72)
const GOLD = rgb(0.85, 0.62, 0.13)
const LINE = rgb(0.86, 0.88, 0.88)
const PANEL = rgb(0.96, 0.97, 0.97)
const WHITE = rgb(1, 1, 1)

export interface MatchAnalysisPdfInput {
  teams: { home: string; away: string }
  score: { home: number; away: number }
  reeks: string
  datum: string | null
  stats: MatchStats
}

export async function generateMatchAnalysisPdf(input: MatchAnalysisPdfInput): Promise<Uint8Array> {
  const { teams, score, reeks, datum, stats } = input
  const analysis = buildMatchAnalysis(stats, teams, score)

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

  // ── Kop met eindstand ──
  const headH = 96
  rect(0, A4[1] - headH, A4[0], headH, ACCENT_DK)
  rect(0, A4[1] - headH, 6, headH, GOLD)
  txt('WEDSTRIJD-ANALYSE', MARGIN, A4[1] - 26, 9, bold, rgb(0.7, 0.9, 0.82))
  // teams + score
  txt(teams.home, MARGIN, A4[1] - 52, 15, bold, WHITE)
  const scoreStr = `${score.home} - ${score.away}`
  txt(scoreStr, A4[0] / 2 - txtW(scoreStr, 26, bold) / 2, A4[1] - 58, 26, bold, WHITE)
  const awayW = txtW(teams.away, 15, bold)
  txt(teams.away, A4[0] - MARGIN - awayW, A4[1] - 52, 15, bold, WHITE)
  const sub = `${reeksNaam(reeks)}${datum ? `  ·  ${datum}` : ''}`
  txt(sub, MARGIN, A4[1] - 78, 9.5, font, rgb(0.78, 0.88, 0.83))
  y = A4[1] - headH - 6

  // ── Automatische analyse ──
  sectionTitle('Analyse')
  for (const s of analysis.insights) paragraph(`-  ${s}`, 9.5, INK)

  // ── Ploegvergelijking (gespiegelde balken: thuis links, uit rechts) ──
  sectionTitle('Ploegvergelijking')
  const rows: { label: string; h: number; a: number; fmt?: (n: number) => string }[] = [
    { label: 'Worpen', h: stats.teams.home.throws, a: stats.teams.away.throws },
    { label: 'Doelpunten', h: analysis.home.goals, a: analysis.away.goals },
    { label: 'Punten', h: analysis.home.points, a: analysis.away.points },
    { label: 'Conversie', h: Math.round(analysis.home.conversion * 100), a: Math.round(analysis.away.conversion * 100), fmt: (n) => `${n}%` },
    { label: 'Gem. afstand', h: stats.teams.home.avgDistance, a: stats.teams.away.avgDistance, fmt: (n) => `${n}m` },
    { label: 'Balverlies', h: analysis.home.lost, a: analysis.away.lost },
  ]
  ensure(rows.length * 18 + 8)
  const midX = MARGIN + CW / 2
  const halfTrack = CW / 2 - 40
  rows.forEach((r) => {
    y -= 18
    const max = Math.max(1, r.h, r.a)
    const fmt = r.fmt ?? ((n: number) => String(n))
    // label centraal
    txt(r.label, midX - txtW(r.label, 8, bold) / 2, y + 10, 8, bold, DIM)
    // thuis-balk (groeit naar links vanaf het midden)
    const hw = (r.h / max) * halfTrack
    rect(midX - 20 - hw, y, hw, 9, HOME)
    txt(fmt(r.h), midX - 20 - hw - txtW(fmt(r.h), 8) - 3, y + 1, 8, font, INK)
    // uit-balk (groeit naar rechts)
    const aw = (r.a / max) * halfTrack
    rect(midX + 20, y, aw, 9, AWAY)
    txt(fmt(r.a), midX + 20 + aw + 3, y + 1, 8, font, INK)
  })
  y -= 6
  txt(`${teams.home}`, MARGIN, y, 7.5, bold, HOME)
  txt(`${teams.away}`, A4[0] - MARGIN - txtW(teams.away, 7.5, bold), y, 7.5, bold, AWAY)
  y -= 6

  // ── Zoneverdeling per ploeg (mini-velden naast elkaar) ──
  sectionTitle('Zoneverdeling')
  const colGap = 16
  const colW = (CW - colGap) / 2
  ensure(120)
  const miniField = (x: number, topY: number, w: number, agg: TeamAgg, name: string, accent: ReturnType<typeof rgb>) => {
    txt(name, x, topY, 8.5, bold, accent)
    const h = 90
    const fy = topY - 8 - h
    rect(x, fy, w, h, rgb(0.06, 0.24, 0.16))
    const zTot = agg.zones.links + agg.zones.midden + agg.zones.rechts || 1
    const zs: [string, number][] = [
      ['L', agg.zones.links],
      ['M', agg.zones.midden],
      ['R', agg.zones.rechts],
    ]
    const cw3 = w / 3
    zs.forEach(([lbl, v], i) => {
      const frac = v / zTot
      rect(x + i * cw3, fy, cw3, h, accent, 0.15 + frac * 0.6)
      txt(`${Math.round(frac * 100)}%`, x + i * cw3 + cw3 / 2 - txtW(`${Math.round(frac * 100)}%`, 11, bold) / 2, fy + h / 2, 11, bold, WHITE)
      txt(lbl, x + i * cw3 + cw3 / 2 - txtW(lbl, 7) / 2, fy + 6, 7, font, rgb(0.85, 0.95, 0.9))
    })
  }
  y -= 14
  miniField(MARGIN, y, colW, analysis.home, teams.home, HOME)
  miniField(MARGIN + colW + colGap, y, colW, analysis.away, teams.away, AWAY)
  y -= 8 + 90 + 8

  // ── Spelerstabel (beide ploegen, op punten) ──
  sectionTitle('Spelers')
  const cols: { label: string; x: number }[] = [
    { label: '#', x: MARGIN + 4 },
    { label: 'Speler', x: MARGIN + 22 },
    { label: 'Ploeg', x: MARGIN + 200 },
    { label: 'W', x: MARGIN + 330 },
    { label: 'D', x: MARGIN + 360 },
    { label: 'Ptn', x: MARGIN + 390 },
    { label: 'Conv', x: MARGIN + 428 },
    { label: 'Afst', x: MARGIN + 472 },
  ]
  const drawHeader = () => {
    ensure(20)
    y -= 16
    rect(MARGIN, y - 4, CW, 18, ACCENT_DK)
    for (const c of cols) txt(c.label, c.x, y, 8, bold, WHITE)
    y -= 6
  }
  drawHeader()
  const ranked = [...stats.players].sort((a, b) => b.goals.points - a.goals.points || b.goals.total - a.goals.total)
  let zebra = false
  for (const p of ranked) {
    if (y - 15 < 44) {
      page = doc.addPage(A4)
      y = A4[1] - MARGIN
      drawHeader()
    }
    y -= 15
    if (zebra) rect(MARGIN, y - 4, CW, 15, PANEL)
    zebra = !zebra
    const name = p.playerName.length > 28 ? p.playerName.slice(0, 27) + '.' : p.playerName
    txt(String(p.shirtNumber), cols[0].x, y, 8.5, font, DIM)
    txt(name, cols[1].x, y, 8.5)
    txt(p.teamSide === 'home' ? teams.home : teams.away, cols[2].x, y, 7.5, font, p.teamSide === 'home' ? HOME : AWAY)
    txt(String(p.throws), cols[3].x, y, 8.5)
    txt(String(p.goals.total), cols[4].x, y, 8.5)
    txt(String(p.goals.points), cols[5].x, y, 8.5, bold)
    txt(p.goalAttempts ? `${Math.round(p.conversion * 100)}%` : '-', cols[6].x, y, 8.5)
    txt(`${p.distance.avg}m`, cols[7].x, y, 8.5)
  }

  y -= 14
  txt(`Gegenereerd ${new Date().toLocaleDateString('nl-BE')} · Krachtbal Live`, MARGIN, Math.max(y, 30), 7, font, DIM)

  return doc.save()
}
