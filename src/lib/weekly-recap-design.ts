import type { WeeklyRecap, RecapHighlight } from './weekly-recap'

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!)
const fmtDate = (iso: string) => new Intl.DateTimeFormat('nl-BE', { day: 'numeric', month: 'long' }).format(new Date(iso))
const lines = (text: string, max = 30) => {
  const words = text.split(/\s+/)
  const out: string[] = []
  let line = ''
  for (const word of words) {
    if ((line + ' ' + word).trim().length > max && line) { out.push(line); line = word } else line = (line + ' ' + word).trim()
  }
  if (line) out.push(line)
  return out
}
const text = (value: string, x: number, y: number, size: number, weight = 500, fill = '#f8fafc', anchor = 'start') => `<text x="${x}" y="${y}" fill="${fill}" font-family="Inter,Arial,sans-serif" font-size="${size}px" font-weight="${weight}" text-anchor="${anchor}">${esc(value)}</text>`
const card = (x: number, y: number, w: number, h: number, accent: string) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="28" fill="#111827" stroke="${accent}" stroke-opacity=".48" stroke-width="2"/><path d="M ${x + w - 110} ${y + h} A 115 115 0 0 0 ${x + w} ${y + h - 110}" fill="none" stroke="${accent}" stroke-opacity=".14" stroke-width="26"/>`
const icon = (x: number, y: number, label: string, accent: string) => `<rect x="${x}" y="${y}" width="52" height="52" rx="16" fill="${accent}" fill-opacity=".16" stroke="${accent}" stroke-opacity=".65"/><text x="${x + 26}" y="${y + 34}" fill="${accent}" font-family="Inter,Arial,sans-serif" font-size="22px" font-weight="800" text-anchor="middle">${esc(label)}</text>`

export function renderWeeklyRecapDesign(recap: WeeklyRecap): string {
  const period = `${fmtDate(recap.startIso)} — ${fmtDate(recap.endIso)}`
  const titleLines = lines(recap.headline, 25).slice(0, 3)
  const colors = ['#63a9ff', '#36d8ba', '#a78bfa', '#ff6b78', '#f5b94c', '#5ed0ff']
  const stats = [
    ['MATCHES', recap.matches, 'W'], ['BEZOEKERS', recap.stats.visitors, 'V'], ['CLUBS', recap.stats.clubs, 'C'],
    ['DOELWORPEN', recap.stats.goalThrows, 'D'], ['RUGWORPEN', recap.stats.backThrows, 'R'], ['PUNTEN', recap.goals, 'Σ'],
  ]
  let body = ''
  body += `<rect width="1080" height="1920" fill="url(#bg)"/><circle cx="940" cy="220" r="300" fill="#2687ff" opacity=".1"/><circle cx="90" cy="1750" r="280" fill="#d51b3d" opacity=".08"/>`
  body += text('KRACHTBAL LIVE', 72, 94, 26, 800, '#79b6ff') + text('WEEKEND RECAP', 72, 138, 17, 800, '#b9c4d6') + text(period.toUpperCase(), 1008, 138, 17, 700, '#b9c4d6', 'end')
  body += `<line x1="72" y1="176" x2="1008" y2="176" stroke="#5d8ec8" stroke-opacity=".45"/>`
  titleLines.forEach((line, i) => { body += text(line, 72, 258 + i * 74, 59, 850, '#f8fafc') })
  body += text('DE WEEK IN CIJFERS', 72, 510, 18, 850, '#79b6ff') + `<line x1="286" y1="504" x2="1008" y2="504" stroke="#5d8ec8" stroke-opacity=".45"/>`
  stats.forEach(([label, value, glyph], i) => {
    const x = 72 + (i % 2) * 478, y = 560 + Math.floor(i / 2) * 150
    body += card(x, y, 430, 124, colors[i]) + icon(x + 24, y + 36, glyph, colors[i]) + text(String(value), x + 98, y + 70, 42, 850) + text(label, x + 100, y + 99, 16, 750, '#aab6c8')
  })
  let y = 1060
  body += text('TOPPRESTATIES', 72, y, 18, 850, '#79b6ff') + text('Dit viel op', 72, y + 52, 34, 800)
  y += 92
  recap.highlights.slice(0, 3).forEach((h: RecapHighlight, i) => {
    const accent = colors[(i + 2) % colors.length]
    body += `<rect x="72" y="${y}" width="936" height="154" rx="26" fill="#0b111b" stroke="${accent}" stroke-opacity=".25"/>` + icon(98, y + 48, i === 0 ? '1' : i === 1 ? '2' : '3', accent) + text(h.title.toUpperCase(), 176, y + 49, 15, 800, '#aab6c8')
    lines(h.text, 48).slice(0, 2).forEach((l, j) => { body += text(l, 176, y + 84 + j * 30, 22, 700) })
    y += 174
  })
  if (recap.team) {
    body += `<rect x="72" y="${y + 10}" width="936" height="150" rx="26" fill="#111827" stroke="#63a9ff" stroke-opacity=".38"/>` + text('PLOEG VAN HET WEEKEND', 104, y + 52, 15, 850, '#79b6ff') + text(recap.team.teamName, 104, y + 97, 30, 800) + text(`Doelsaldo ${recap.team.goalDifference >= 0 ? '+' : ''}${recap.team.goalDifference}`, 104, y + 128, 17, 600, '#b9c4d6')
  }
  body += `<line x1="72" y1="1784" x2="1008" y2="1784" stroke="#5d8ec8" stroke-opacity=".35"/>` + text('DEEL HET WEEKEND', 72, 1842, 17, 850, '#79b6ff') + text('krachbal.live', 1008, 1842, 17, 700, '#b9c4d6', 'end') + text('Eén verticale Story · 1080 × 1920', 72, 1880, 17, 550, '#8e9bb0')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0b1722"/><stop offset=".52" stop-color="#121927"/><stop offset="1" stop-color="#1b0d17"/></linearGradient></defs>${body}</svg>`
}
