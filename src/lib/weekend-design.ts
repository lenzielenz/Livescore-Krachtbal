import { normalizeLogoFit, type LogoFit } from './logo-fit'
import type { WeekendMatch } from './instagram-weekend'

const esc = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
// Boven dit aantal wedstrijden schakelt de kaart over op een compacte tweekolommenweergave
// (zie COLUMN_THRESHOLD hieronder) — zo past een drukke speeldag op één Story i.p.v. te
// moeten bladeren. WEEKEND_PAGE_SIZE is de uiterste grens: ruim boven wat één club in de
// praktijk op één speeldag heeft, maar nog steeds leesbaar in twee kolommen van elk de helft.
export const WEEKEND_PAGE_SIZE = 24
export function weekendPages(rows: WeekendMatch[]): WeekendMatch[][] {
  const pages: WeekendMatch[][] = []
  for (let i = 0; i < rows.length; i += WEEKEND_PAGE_SIZE) pages.push(rows.slice(i, i + WEEKEND_PAGE_SIZE))
  return pages.length ? pages : [[]]
}
/** Within every day, home fixtures come first, followed by away fixtures. */
export function orderWeekendRows(rows: WeekendMatch[]): WeekendMatch[] {
  const dayOrder = new Map<string, number>()
  for (const row of [...rows].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())) {
    if (!dayOrder.has(row.day)) dayOrder.set(row.day, dayOrder.size)
  }
  return rows.map((row, index) => ({ row, index })).sort((a, b) => {
    const day = (dayOrder.get(a.row.day) ?? 0) - (dayOrder.get(b.row.day) ?? 0)
    if (day) return day
    if (a.row.side !== b.row.side) return a.row.side === 'home' ? -1 : 1
    const date = new Date(a.row.date).getTime() - new Date(b.row.date).getTime()
    if (date) return date
    return a.index - b.index
  }).map(({ row }) => row)
}
function label(value: string, x: number, y: number, size: number, width: number, fill = '#f5f7fb') {
  // Conservative width estimate keeps long names inside their own column, without truncation.
  const fitted = Math.min(size, width / Math.max(1, Array.from(value).length * .66))
  return `<text x="${x}" y="${y}" fill="${fill}" font-size="${fitted}" font-weight="700">${esc(value)}</text>`
}
/** Kleine statistiekpil ("● 6 wedstrijden") — dezelfde beknopte taal als de weekrecap-Story,
 * zodat de clubkleuren en cijfers meteen opvallen in het overzicht van de eigen speeldag. */
function statChip(x: number, y: number, value: number, text: string, color: string) {
  return `<circle cx="${x}" cy="${y - 7}" r="7" fill="${color}"/><text x="${x + 20}" y="${y}" fill="#f5f7fb" font-size="24" font-weight="800">${value}</text><text x="${x + 20 + String(value).length * 15 + 10}" y="${y}" fill="#aab7cb" font-size="20">${esc(text)}</text>`
}

const ROWS_TOP = 520

/** Ruime kaarten (één kolom) — leesbaar en fotogeniek voor een rustige speeldag. Boven
 * COLUMN_THRESHOLD wedstrijden past dit niet meer binnen de Story; zie renderCompactColumns. */
function renderSpaciousRows(rows: WeekendMatch[], primary: string, secondary: string): string {
  const spacious = rows.length > 0 && rows.length <= 4
  const cardHeight = spacious ? 260 : 120
  let y = ROWS_TOP
  let group = ''
  return rows.map(m => {
    let heading = ''
    const nextGroup = `${m.day}:${m.side}`
    if (group !== nextGroup) {
      group = nextGroup
      const side = m.side === 'home' ? 'THUIS' : 'UIT'
      const sideColor = m.side === 'home' ? primary : secondary
      heading = `<rect x="64" y="${y}" width="5" height="23" rx="2" fill="${sideColor}"/>${label(`${m.day.toUpperCase()} · ${side}`, 84, y + 20, 22, 870, '#c6d4e8')}`
      y += 44
    }
    const top = y
    y += cardHeight + 12
    const sideColor = m.side === 'home' ? primary : secondary
    const sideLabel = m.side === 'home' ? 'THUIS' : 'UIT'
    const pillW = sideLabel.length * 15 + 32
    return `${heading}<g data-match="${m.id}">
      <rect x="64" y="${top + 5}" width="952" height="${cardHeight}" rx="22" fill="#000" opacity=".22"/>
      <rect x="64" y="${top}" width="952" height="${cardHeight}" rx="22" fill="url(#card)" stroke="#fff" stroke-opacity=".16"/>
      <rect x="64" y="${top + 26}" width="5" height="${cardHeight - 52}" rx="2" fill="${sideColor}"/>
      <rect x="${984 - pillW}" y="${top + 18}" width="${pillW}" height="30" rx="15" fill="${sideColor}" fill-opacity=".18" stroke="${sideColor}" stroke-opacity=".6"/>
      <text x="${984 - pillW / 2}" y="${top + 39}" text-anchor="middle" fill="${sideColor}" font-size="15" font-weight="800" letter-spacing="1">${sideLabel}</text>
      ${label(m.time, 92, top + (spacious ? 143 : 70), spacious ? 38 : 32, 125)}
      <line x1="238" y1="${top + 24}" x2="238" y2="${top + cardHeight - 24}" stroke="#fff" stroke-opacity=".12"/>
      ${label(m.opponent, 266, top + (spacious ? 117 : 52), spacious ? 38 : 29, spacious ? 710 : 590)}
      ${label(m.series, 266, top + (spacious ? 177 : 91), spacious ? 25 : 19, 710, '#b2bfd2')}
    </g>`
  }).join('')
}

/** Vanaf hoeveel wedstrijden de kaart overschakelt op de compacte tweekolommenweergave — boven
 * dit aantal past de ruime éénkolomskaart niet meer binnen de beschikbare hoogte (bewezen bij de
 * oude vaste paginagrootte van 8). */
export const COLUMN_THRESHOLD = 8
const COL_GAP = 24
const COL_WIDTH = (952 - COL_GAP) / 2
// Basismaten voor een drukke speeldag (tot WEEKEND_PAGE_SIZE wedstrijden). Bij minder
// wedstrijden groeien rijhoogte/kop/tussenruimte evenredig mee (zie rowScale hieronder) zodat de
// kolommen de beschikbare hoogte vullen i.p.v. bovenaan een half lege kaart achter te laten.
const COMPACT_ROW_H = 56
const COMPACT_ROW_GAP = 10
const COMPACT_HEAD_H = 34
const COMPACT_MAX_SCALE = 1.7
const ROWS_BOTTOM = 1740

/** Eén compacte rij: tijd, THUIS/UIT als kleurletter i.p.v. het volle woord, tegenstander, en de
 * reekscode (bv. "1NAH") i.p.v. de volle reeksnaam — zo blijft een rij één regel, ook op drukke
 * speeldagen met veel ploegen. `scale` rekt de rij (en haar lettergrootte naar rato) op wanneer
 * er ruimte over is, zodat een rustige speeldag niet bovenaan verdwaald oogt. */
function compactRow(m: WeekendMatch, colX: number, top: number, rowH: number, scale: number, primary: string, secondary: string): string {
  const sideColor = m.side === 'home' ? primary : secondary
  const symbol = m.side === 'home' ? 'T' : 'U'
  const midY = top + rowH / 2
  const badgeR = 15 * scale
  const badgeX = colX + 34 * scale
  return `<g data-match="${m.id}">
      <rect x="${colX}" y="${top}" width="${COL_WIDTH}" height="${rowH}" rx="14" fill="url(#card)" stroke="#fff" stroke-opacity=".14"/>
      <rect x="${colX}" y="${top + 8}" width="4" height="${rowH - 16}" rx="2" fill="${sideColor}"/>
      <circle cx="${badgeX}" cy="${midY}" r="${badgeR}" fill="${sideColor}" fill-opacity=".2" stroke="${sideColor}" stroke-width="1.5"/>
      <text x="${badgeX}" y="${midY + 5 * scale}" text-anchor="middle" fill="${sideColor}" font-size="${15 * scale}" font-weight="800">${symbol}</text>
      ${label(m.time, colX + 60 * scale, midY + 6 * scale, 17 * scale, 56 * scale, '#aab7cb')}
      ${label(m.opponent, colX + 120 * scale, midY + 6 * scale, 21 * scale, COL_WIDTH - 120 * scale - 66 * scale)}
      <rect x="${colX + COL_WIDTH - 62}" y="${midY - 12 * scale}" width="58" height="${24 * scale}" rx="8" fill="#000" fill-opacity=".3" stroke="#fff" stroke-opacity=".14"/>
      <text x="${colX + COL_WIDTH - 33}" y="${midY + 5 * scale}" text-anchor="middle" fill="#c6d4e8" font-size="${12 * scale}" font-weight="700">${esc(m.seriesCode)}</text>
    </g>`
}

/** Aantal dag/thuis-uit-groepen (koppen) in een kolom — bepaalt hoeveel kopruimte die kolom nodig
 * heeft, naast haar rijen. */
function groupCount(rows: WeekendMatch[]): number {
  let count = 0
  let group = ''
  for (const m of rows) {
    const g = `${m.day}:${m.side}`
    if (g !== group) {
      group = g
      count++
    }
  }
  return count
}

/** Compacte tweekolommenweergave voor een drukke speeldag: de gesorteerde lijst wordt gewoon in
 * twee gelijke helften geknipt (nooit op basis van dag, want bij een zeer ongelijke verdeling —
 * bv. bijna alles op zaterdag — zou één kolom dan alsnog overlopen). Rij/kop/tussenruimte rekken
 * evenredig op tot de drukste kolom de beschikbare hoogte vult (tot COMPACT_MAX_SCALE) — zo blijft
 * een rustige speeldag met bv. 10 wedstrijden niet bovenaan hangen boven een lege kaart. */
function renderCompactColumns(rows: WeekendMatch[], primary: string, secondary: string): string {
  const mid = Math.ceil(rows.length / 2)
  const columns = [rows.slice(0, mid), rows.slice(mid)]
  const colXs = [64, 64 + COL_WIDTH + COL_GAP]

  const available = ROWS_BOTTOM - ROWS_TOP
  const busiestRows = Math.max(...columns.map(c => c.length), 1)
  const busiestGroups = Math.max(...columns.map(groupCount), 1)
  const baseline = busiestGroups * COMPACT_HEAD_H + busiestRows * (COMPACT_ROW_H + COMPACT_ROW_GAP)
  const scale = Math.min(COMPACT_MAX_SCALE, Math.max(1, available / baseline))
  const rowH = COMPACT_ROW_H * scale
  const rowGap = COMPACT_ROW_GAP * scale
  const headH = COMPACT_HEAD_H * scale

  return columns.map((colRows, ci) => {
    let y = ROWS_TOP
    let group = ''
    const colX = colXs[ci]
    return colRows.map(m => {
      let heading = ''
      const nextGroup = `${m.day}:${m.side}`
      if (group !== nextGroup) {
        group = nextGroup
        const side = m.side === 'home' ? 'THUIS' : 'UIT'
        const sideColor = m.side === 'home' ? primary : secondary
        heading = `<rect x="${colX}" y="${y}" width="4" height="${16 * scale}" rx="2" fill="${sideColor}"/>${label(`${m.day.toUpperCase()} · ${side}`, colX + 14, y + 14 * scale, 15 * scale, COL_WIDTH - 14, '#aab7cb')}`
        y += headH
      }
      const top = y
      y += rowH + rowGap
      return heading + compactRow(m, colX, top, rowH, scale, primary, secondary)
    }).join('')
  }).join('')
}

export function renderWeekendDesign(o: {
  club: string; primary: string; secondary: string; title: string
  rows: WeekendMatch[]; total: number; page: number; pages: number
  homeCount: number; awayCount: number
  logoHref?: string; logoFit?: Partial<LogoFit>
}) {
  const fit = normalizeLogoFit(o.logoFit)
  const logoSize = 148 * fit.zoom
  const rows = o.rows.length > COLUMN_THRESHOLD
    ? renderCompactColumns(o.rows, o.primary, o.secondary)
    : renderSpaciousRows(o.rows, o.primary, o.secondary)
  const initials = o.club.split(/\s+/).map(w => w[0]).join('').slice(0, 3)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
    <defs>
      <linearGradient id="base" x2="1" y2="1"><stop stop-color="#1c2534"/><stop offset="1" stop-color="#090c12"/></linearGradient>
      <radialGradient id="glow"><stop stop-color="${o.primary}" stop-opacity=".5"/><stop offset="1" stop-color="${o.primary}" stop-opacity="0"/></radialGradient>
      <linearGradient id="card" x2="1" y2="1"><stop stop-color="#2b3546"/><stop offset="1" stop-color="#141922"/></linearGradient>
      <linearGradient id="hero" x2="1" y2="0"><stop stop-color="${o.primary}" stop-opacity=".22"/><stop offset="1" stop-color="${o.secondary}" stop-opacity=".22"/></linearGradient>
      <clipPath id="badge"><circle cx="902" cy="272" r="78"/></clipPath>
    </defs>
    <rect width="1080" height="1920" fill="url(#base)"/>
    <ellipse cx="950" cy="320" rx="750" ry="700" fill="url(#glow)"/>
    <path d="M760 0 L360 1920" stroke="#fff" stroke-opacity=".025" stroke-width="180"/>
    <g font-family="DejaVu Sans, Arial, sans-serif">
      <rect x="64" y="70" width="230" height="46" rx="23" fill="#050912" fill-opacity=".72" stroke="#fff" stroke-opacity=".16"/>
      <circle cx="90" cy="93" r="9" fill="${o.primary}"/>
      <text x="110" y="99" fill="#f5f7fb" font-size="20" font-weight="700">Krachtbal <tspan fill="#80baff">Live</tspan></text>
      <text x="1016" y="99" text-anchor="end" fill="#b2bfd2" font-size="18" font-weight="700" letter-spacing="3">WEEKENDPLAN</text>
      <rect x="64" y="166" width="952" height="258" rx="32" fill="url(#hero)" stroke="#fff" stroke-opacity=".16"/>
      <text x="96" y="215" fill="#80baff" font-size="19" font-weight="700" letter-spacing="3">ALLE PLOEGEN. ÉÉN CLUB.</text>
      ${label(o.club, 96, 277, 38, 660)}
      ${label(o.title, 96, 320, 25, 660, '#c6d4e8')}
      <line x1="96" y1="352" x2="892" y2="352" stroke="#fff" stroke-opacity=".14"/>
      ${statChip(96, 396, o.total, o.total === 1 ? 'wedstrijd' : 'wedstrijden', '#f5f7fb')}
      ${statChip(320, 396, o.homeCount, 'thuis', o.primary)}
      ${statChip(500, 396, o.awayCount, 'uit', o.secondary)}
      <circle cx="902" cy="280" r="85" fill="#000" opacity=".3"/>
      <circle cx="902" cy="272" r="84" fill="#fff" stroke="${o.primary}" stroke-width="5"/>
      <g clip-path="url(#badge)">${o.logoHref ? `<image href="${esc(o.logoHref)}" x="${902 - logoSize / 2 + fit.offsetX * 1.48}" y="${272 - logoSize / 2 + fit.offsetY * 1.48}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet"/>` : `<text x="902" y="286" text-anchor="middle" fill="#1c2534" font-size="34" font-weight="700">${esc(initials)}</text>`}</g>
      <text x="64" y="470" fill="#fff" font-size="48" font-weight="700" letter-spacing="-1">Het weekend van ons.</text>
      ${rows || `<rect x="64" y="${ROWS_TOP + 34}" width="952" height="260" rx="28" fill="url(#card)"/>${label('Even geen wedstrijden.', 104, ROWS_TOP + 140, 38, 860)}${label('Tot langs de zijlijn bij de volgende speeldag!', 104, ROWS_TOP + 204, 25, 860, '#b2bfd2')}`}
      <line x1="64" y1="1764" x2="1016" y2="1764" stroke="#fff" stroke-opacity=".16"/>
      <text x="64" y="1812" fill="#f5f7fb" font-size="23" font-weight="700">KOM MEE SUPPORTEREN.</text>
      <text x="1016" y="1812" text-anchor="end" fill="#b2bfd2" font-size="21">${o.total} wedstrijden · ${o.page + 1} / ${o.pages}</text>
      <text x="64" y="1856" fill="#80baff" font-size="21">Volg alle scores op livescore.roodgries.be</text>
    </g>
  </svg>`
}
