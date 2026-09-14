import { normalizeLogoFit, type LogoFit } from './logo-fit'
import type { WeekendMatch } from './instagram-weekend'

const esc = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
export const WEEKEND_PAGE_SIZE = 8
export function weekendPages(rows: WeekendMatch[]): WeekendMatch[][] {
  const pages: WeekendMatch[][] = []
  for (let i = 0; i < rows.length; i += WEEKEND_PAGE_SIZE) pages.push(rows.slice(i, i + WEEKEND_PAGE_SIZE))
  return pages.length ? pages : [[]]
}
function label(value: string, x: number, y: number, size: number, width: number, fill = '#f5f7fb') {
  // Conservative width estimate keeps long names inside their own column, without truncation.
  const fitted = Math.min(size, width / Math.max(1, Array.from(value).length * .66))
  return `<text x="${x}" y="${y}" fill="${fill}" font-size="${fitted}" font-weight="700">${esc(value)}</text>`
}
export function renderWeekendDesign(o: {
  club: string; primary: string; secondary: string; title: string
  rows: WeekendMatch[]; total: number; page: number; pages: number
  logoHref?: string; logoFit?: Partial<LogoFit>
}) {
  const fit = normalizeLogoFit(o.logoFit)
  const logoSize = 148 * fit.zoom
  let y = 510
  let day = ''
  const rows = o.rows.map(m => {
    let heading = ''
    if (day !== m.day) {
      day = m.day
      heading = `<rect x="64" y="${y}" width="5" height="23" rx="2" fill="#80baff"/>${label(day.toUpperCase(), 84, y + 20, 22, 870, '#c6d4e8')}`
      y += 44
    }
    const top = y
    y += 132
    return `${heading}<g data-match="${m.id}">
      <rect x="64" y="${top + 5}" width="952" height="120" rx="22" fill="#000" opacity=".22"/>
      <rect x="64" y="${top}" width="952" height="120" rx="22" fill="url(#card)" stroke="#fff" stroke-opacity=".16"/>
      <rect x="64" y="${top + 26}" width="5" height="68" rx="2" fill="${m.side === 'home' ? o.primary : o.secondary}"/>
      ${label(m.time, 92, top + 49, 32, 125)}
      ${label(m.side === 'home' ? 'THUIS' : 'UIT', 94, top + 85, 16, 120, '#a9c9f5')}
      <line x1="238" y1="${top + 24}" x2="238" y2="${top + 96}" stroke="#fff" stroke-opacity=".12"/>
      ${label(m.team, 266, top + 33, 23, 710, '#9ecaff')}
      ${label(`tegen ${m.opponent}`, 266, top + 67, 26, 710)}
      ${label(m.series, 266, top + 98, 19, 710, '#b2bfd2')}
    </g>`
  }).join('')
  const initials = o.club.split(/\s+/).map(w => w[0]).join('').slice(0, 3)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
    <defs>
      <linearGradient id="base" x2="1" y2="1"><stop stop-color="#1c2534"/><stop offset="1" stop-color="#090c12"/></linearGradient>
      <radialGradient id="glow"><stop stop-color="${o.primary}" stop-opacity=".5"/><stop offset="1" stop-color="${o.primary}" stop-opacity="0"/></radialGradient>
      <linearGradient id="card" x2="1" y2="1"><stop stop-color="#2b3546"/><stop offset="1" stop-color="#141922"/></linearGradient>
      <clipPath id="badge"><circle cx="902" cy="272" r="78"/></clipPath>
    </defs>
    <rect width="1080" height="1920" fill="url(#base)"/>
    <ellipse cx="950" cy="320" rx="750" ry="700" fill="url(#glow)"/>
    <path d="M760 0 L360 1920" stroke="#fff" stroke-opacity=".025" stroke-width="180"/>
    <g font-family="DejaVu Sans, Arial, sans-serif">
      <text x="64" y="108" fill="#f5f7fb" font-size="32" font-weight="700">Krachtbal <tspan fill="#80baff">Live</tspan></text>
      <text x="1016" y="104" text-anchor="end" fill="#b2bfd2" font-size="18" letter-spacing="3">CLUBAGENDA</text>
      <rect x="64" y="166" width="952" height="208" rx="32" fill="#ffffff" fill-opacity=".045" stroke="#fff" stroke-opacity=".16"/>
      <text x="96" y="215" fill="#80baff" font-size="19" font-weight="700" letter-spacing="3">ALLE PLOEGEN. ÉÉN CLUB.</text>
      ${label(o.club, 96, 277, 38, 660)}
      ${label(o.title, 96, 327, 27, 660, '#c6d4e8')}
      <circle cx="902" cy="280" r="85" fill="#000" opacity=".3"/>
      <circle cx="902" cy="272" r="84" fill="#fff" stroke="${o.primary}" stroke-width="5"/>
      <g clip-path="url(#badge)">${o.logoHref ? `<image href="${esc(o.logoHref)}" x="${902 - logoSize / 2 + fit.offsetX * 1.48}" y="${272 - logoSize / 2 + fit.offsetY * 1.48}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet"/>` : `<text x="902" y="286" text-anchor="middle" fill="#1c2534" font-size="34" font-weight="700">${esc(initials)}</text>`}</g>
      <text x="64" y="454" fill="#fff" font-size="48" font-weight="700" letter-spacing="-1">Het weekend van ons.</text>
      ${rows || `<rect x="64" y="554" width="952" height="260" rx="28" fill="url(#card)"/>${label('Even geen wedstrijden.', 104, 660, 38, 860)}${label('Tot langs de zijlijn bij de volgende speeldag!', 104, 724, 25, 860, '#b2bfd2')}`}
      <line x1="64" y1="1764" x2="1016" y2="1764" stroke="#fff" stroke-opacity=".16"/>
      <text x="64" y="1812" fill="#f5f7fb" font-size="23" font-weight="700">KOM MEE SUPPORTEREN.</text>
      <text x="1016" y="1812" text-anchor="end" fill="#b2bfd2" font-size="21">${o.total} wedstrijden · ${o.page + 1} / ${o.pages}</text>
      <text x="64" y="1856" fill="#80baff" font-size="21">Volg alle scores op livescore.roodgries.be</text>
    </g>
  </svg>`
}
