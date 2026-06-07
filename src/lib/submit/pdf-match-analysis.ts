import { PDFDocument, type PDFFont, type PDFPage, StandardFonts, rgb } from 'pdf-lib'

import { reeksNaam } from '../reeksen'

// Leuke, deelbare WEDSTRIJD-SAMENVATTING als PDF: eindstand, scoreverloop, man van de match én
// de sfeer uit de live tribune (emoji-reacties, raketten/specials en supporter-shoutouts). Geen
// "geheime" scouting-data — gewoon een uniek kaartje dat mensen graag delen.

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
const MARGIN = 40
const CW = A4[0] - 2 * MARGIN

const INK = rgb(0.11, 0.13, 0.15)
const DIM = rgb(0.45, 0.48, 0.5)
const ACCENT = rgb(0.02, 0.55, 0.42)
const ACCENT_DK = rgb(0.03, 0.28, 0.21)
const GOLD = rgb(0.85, 0.62, 0.13)
const PANEL = rgb(0.96, 0.97, 0.97)
const WHITE = rgb(1, 1, 1)
const HOME = rgb(0.06, 0.5, 0.38)
const AWAY = rgb(0.18, 0.45, 0.72)

type Goal = { side: 'home' | 'away'; points: number; half: number; gameClock: number; shirtNumber?: number; playerName?: string }

export interface MatchAnalysisPdfInput {
  teams: { home: string; away: string }
  score: { home: number; away: number }
  reeks: string
  datum: string | null
  goals: Goal[]
  reactions: Record<string, number>
  shoutouts: { name: string; text: string }[]
}

// Emoji-reacties → leesbaar label + kleur (pdf-lib kan geen emoji-glyphs tonen, dus we gebruiken
// kleurrijke chips met woord + teller). 'rocket' = de rugworp-specials.
const REACTIONS: { key: string; label: string; color: ReturnType<typeof rgb> }[] = [
  { key: 'rocket', label: 'Raketten', color: GOLD },
  { key: 'fire', label: 'Vuur', color: rgb(0.95, 0.45, 0.12) },
  { key: 'heart', label: 'Hartjes', color: rgb(0.9, 0.2, 0.32) },
  { key: 'clap', label: 'Applaus', color: rgb(0.9, 0.72, 0.18) },
  { key: 'goal', label: 'Ballen', color: rgb(0.28, 0.6, 0.85) },
  { key: 'wow', label: 'Wauw', color: rgb(0.55, 0.4, 0.8) },
]

export async function generateMatchAnalysisPdf(input: MatchAnalysisPdfInput): Promise<Uint8Array> {
  const { teams, score, reeks, datum, goals, reactions, shoutouts } = input
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  let page: PDFPage = doc.addPage(A4)

  const txt = (s: string, x: number, yy: number, size: number, f: PDFFont = font, color = INK) =>
    page.drawText(safe(s), { x, y: yy, size, font: f, color })
  const txtW = (s: string, size: number, f: PDFFont = font) => f.widthOfTextAtSize(safe(s), size)
  const ctr = (s: string, cx: number, yy: number, size: number, f: PDFFont = font, color = INK) => txt(s, cx - txtW(s, size, f) / 2, yy, size, f, color)
  const rect = (x: number, yy: number, w: number, h: number, color: ReturnType<typeof rgb>, opacity = 1) =>
    page.drawRectangle({ x, y: yy, width: w, height: h, color, opacity })

  let y = A4[1]

  // ── Feestelijke kop ──
  const headH = 92
  rect(0, A4[1] - headH, A4[0], headH, ACCENT_DK)
  rect(0, A4[1] - headH, A4[0], 6, GOLD)
  ctr('WEDSTRIJD-SAMENVATTING', A4[0] / 2, A4[1] - 34, 12, bold, GOLD)
  ctr(`${reeksNaam(reeks)}${datum ? `  ·  ${datum}` : ''}`, A4[0] / 2, A4[1] - 70, 11, font, rgb(0.82, 0.9, 0.86))
  y = A4[1] - headH - 26

  // ── Score-blok ──
  const winner = score.home === score.away ? null : score.home > score.away ? 'home' : 'away'
  ctr(`${teams.home}   -   ${teams.away}`, A4[0] / 2, y, 13, bold, INK)
  y -= 44
  ctr(`${score.home} - ${score.away}`, A4[0] / 2, y, 40, bold, ACCENT_DK)
  y -= 24
  const badge = winner ? `${winner === 'home' ? teams.home : teams.away} wint!` : 'Gelijkspel!'
  const bw = txtW(badge, 11, bold) + 24
  rect(A4[0] / 2 - bw / 2, y - 4, bw, 22, winner ? ACCENT : GOLD)
  ctr(badge, A4[0] / 2, y + 3, 11, bold, WHITE)
  y -= 30

  // Fun headline.
  const totalGoals = goals.length
  const diff = Math.abs(score.home - score.away)
  const headline = !winner
    ? 'Punten gedeeld na een spektakelstuk!'
    : diff <= 2
      ? 'Een thriller tot de allerlaatste worp!'
      : diff >= 8
        ? `Galavoorstelling van ${winner === 'home' ? teams.home : teams.away}!`
        : `${winner === 'home' ? teams.home : teams.away} pakt verdiend de winst.`
  ctr(headline, A4[0] / 2, y, 12, bold, ACCENT)
  y -= 22

  // ── Scoreverloop (sparkline van het puntverschil) ──
  const sorted = [...goals].sort((a, b) => a.half - b.half || a.gameClock - b.gameClock)
  let run = 0
  const seq = [0, ...sorted.map((g) => (run += g.side === 'home' ? g.points : -g.points))]
  let maxGap = 0
  for (const v of seq) maxGap = Math.max(maxGap, Math.abs(v))
  if (seq.length > 1) {
    const chTop = y
    const chH = 70
    const chY = chTop - chH
    rect(MARGIN, chY, CW, chH, PANEL)
    const midY = chY + chH / 2
    page.drawLine({ start: { x: MARGIN, y: midY }, end: { x: MARGIN + CW, y: midY }, thickness: 0.6, color: rgb(0.8, 0.82, 0.82) })
    const span = Math.max(2, maxGap)
    const px = (i: number) => MARGIN + 8 + (i / (seq.length - 1)) * (CW - 16)
    const py = (v: number) => midY + (v / span) * (chH / 2 - 8)
    for (let i = 1; i < seq.length; i++) {
      page.drawLine({ start: { x: px(i - 1), y: py(seq[i - 1]) }, end: { x: px(i), y: py(seq[i]) }, thickness: 2, color: seq[i] >= 0 ? HOME : AWAY })
    }
    for (let i = 0; i < seq.length; i++) page.drawCircle({ x: px(i), y: py(seq[i]), size: 2, color: seq[i] >= 0 ? HOME : AWAY })
    txt(teams.home, MARGIN + 4, chTop - 12, 7.5, bold, HOME)
    txt(teams.away, MARGIN + CW - txtW(teams.away, 7.5, bold) - 4, chY + 5, 7.5, bold, AWAY)
    y = chY - 6
    ctr(`${totalGoals} doelpunten · grootste kloof ${maxGap}`, A4[0] / 2, y, 8.5, font, DIM)
    y -= 18
  }

  // ── Man van de match ──
  const tally = new Map<string, { points: number; name: string; nr?: number; side: 'home' | 'away' }>()
  for (const g of sorted) {
    if (!g.playerName) continue
    const key = `${g.side}-${g.shirtNumber ?? ''}-${g.playerName}`
    const cur = tally.get(key) ?? { points: 0, name: g.playerName, nr: g.shirtNumber, side: g.side }
    cur.points += g.points
    tally.set(key, cur)
  }
  const mvp = [...tally.values()].sort((a, b) => b.points - a.points)[0]
  if (mvp) {
    rect(MARGIN, y - 30, CW, 30, rgb(1, 0.97, 0.86))
    rect(MARGIN, y - 30, 4, 30, GOLD)
    txt('STER VAN DE MATCH', MARGIN + 12, y - 11, 8, bold, rgb(0.6, 0.44, 0.05))
    txt(`#${mvp.nr ?? '?'} ${mvp.name} - ${mvp.points} punten (${mvp.side === 'home' ? teams.home : teams.away})`, MARGIN + 12, y - 24, 11, bold, INK)
    y -= 40
  }

  // ── Sfeer in de tribune (emoji-reacties) ──
  const total = REACTIONS.reduce((a, r) => a + (Number(reactions[r.key]) || 0), 0)
  rect(MARGIN, y - 4, 4, 16, ACCENT)
  txt('Sfeer in de tribune', MARGIN + 10, y, 13, bold, ACCENT_DK)
  txt(`${total} reacties`, MARGIN + CW - txtW(`${total} reacties`, 9), y, 9, font, DIM)
  y -= 14

  if (total > 0) {
    const active = REACTIONS.filter((r) => (Number(reactions[r.key]) || 0) > 0)
    const perRow = 3
    const gap = 10
    const chipW = (CW - (perRow - 1) * gap) / perRow
    const chipH = 50
    active.forEach((r, i) => {
      const col = i % perRow
      if (col === 0) y -= chipH + 10
      const x = MARGIN + col * (chipW + gap)
      rect(x, y, chipW, chipH, PANEL)
      rect(x, y, 5, chipH, r.color)
      txt(String(reactions[r.key]), x + 14, y + chipH - 26, 20, bold, r.color)
      txt(r.label, x + 14, y + 9, 9, font, DIM)
    })
    y -= 6
    // Raketten-special uitlichten.
    const rockets = Number(reactions.rocket) || 0
    if (rockets > 0) {
      y -= 26
      rect(MARGIN, y, CW, 24, ACCENT_DK)
      ctr(`${rockets} RAKETTEN AFGEVUURD - de rugworp-specials gingen erin!`, A4[0] / 2, y + 7, 11, bold, GOLD)
      y -= 6
    }
  } else {
    y -= 18
    txt('Volgende keer met meer supporters in de tribune!', MARGIN, y, 9.5, font, DIM)
    y -= 4
  }

  // ── Supporter-shoutouts ──
  if (shoutouts.length) {
    y -= 22
    rect(MARGIN, y - 4, 4, 16, ACCENT)
    txt('Wat de supporters riepen', MARGIN + 10, y, 13, bold, ACCENT_DK)
    y -= 8
    for (const s of shoutouts.slice(0, 7)) {
      const lines: string[] = []
      let cur = ''
      for (const w of safe(`"${s.text}"`).split(' ')) {
        const test = cur ? `${cur} ${w}` : w
        if (txtW(test, 9.5) > CW - 60 && cur) {
          lines.push(cur)
          cur = w
        } else cur = test
      }
      if (cur) lines.push(cur)
      const boxH = 14 + lines.length * 12
      if (y - boxH < 50) {
        page = doc.addPage(A4)
        y = A4[1] - MARGIN
      }
      y -= boxH
      rect(MARGIN, y, CW, boxH, PANEL)
      rect(MARGIN, y, 3, boxH, ACCENT)
      let ly = y + boxH - 13
      for (const ln of lines) {
        txt(ln, MARGIN + 12, ly, 9.5, font, INK)
        ly -= 12
      }
      txt(`- ${s.name || 'supporter'}`, MARGIN + CW - txtW(`- ${s.name || 'supporter'}`, 8, bold) - 8, y + 4, 8, bold, DIM)
      y -= 8
    }
  }

  // ── Voettekst ──
  ctr('Gemaakt met Krachtbal Live - deel jouw match!', A4[0] / 2, 30, 9, bold, ACCENT)

  return doc.save()
}
