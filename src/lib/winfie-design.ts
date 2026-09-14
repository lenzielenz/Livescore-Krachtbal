import { normalizeLogoFit, type LogoFit } from './logo-fit'

const esc = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
export type WinfieDesign = {
  home: string; away: string; score: { home: number; away: number }
  winner: 'home' | 'away' | 'draw'; primary: string; secondary: string
  homeColor: string; awayColor: string; headline: string; date: string; reeks: string
  progress: { home: number; away: number }[]; variant: number
  homeLogoHref?: string; awayLogoHref?: string
  homeLogoFit?: LogoFit | null; awayLogoFit?: LogoFit | null; photoHref?: string
}
function lines(value: string, max = 24): string[] {
  const words = value.split(/\s+/)
  const out: string[] = []
  for (const word of words) {
    if (!out.length || out[out.length - 1].length + word.length + 1 > max) out.push(word)
    else out[out.length - 1] += ' ' + word
  }
  return out
}
function textLines(value: string, x: number, y: number, max: number, size: number, anchor = 'middle') {
  const rows = lines(value, max)
  const fontSize = Math.min(size, 780 / Math.max(...rows.map(row => row.length), 1))
  return rows.map((row, i) => `<text x="${x}" y="${y + i * (size + 8)}" text-anchor="${anchor}" font-size="${fontSize}" font-weight="700" fill="#f5f7fb">${esc(row)}</text>`).join('')
}
function badge(name: string, href: string | undefined, fit: LogoFit | null | undefined, x: number, color: string, id: string) {
  const f = normalizeLogoFit(fit)
  const size = 188 * f.zoom
  return `<defs><clipPath id="${id}"><circle cx="${x}" cy="590" r="100"/></clipPath></defs>
    <circle cx="${x}" cy="600" r="109" fill="#000" opacity=".3"/>
    <circle cx="${x}" cy="590" r="106" fill="#fff" stroke="${color}" stroke-width="5"/>
    <g clip-path="url(#${id})">
    ${href ? `<image href="${esc(href)}" x="${x - size / 2 + f.offsetX * 2}" y="${590 - size / 2 + f.offsetY * 2}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/>` : `<text x="${x}" y="608" text-anchor="middle" font-size="48" font-weight="700" fill="#15352a">${esc(name.split(/\s+/).map(s => s[0]).join('').slice(0, 3))}</text>`}
    </g>`
}
/** Shared composition for preview and PNG: no remote SVG images or browser-only CSS. */
export function renderWinfieDesign(o: WinfieDesign): string {
  const max = Math.max(1, o.score.home, o.score.away, ...o.progress.flatMap(p => [p.home, p.away]))
  const points = (side: 'home' | 'away') => o.progress.map((p, i) => `${120 + i / Math.max(1, o.progress.length - 1) * 840},${1580 - p[side] / max * 195}`).join(' ')
  const winner = o.winner === 'draw' ? 'GELIJKSPEL' : 'DE OVERWINNING IS BINNEN'
  const headlineRows = lines(o.headline, 28)
  const sameColors = o.homeColor.toLowerCase() === o.awayColor.toLowerCase()
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <defs>
    <linearGradient id="base" x2="1" y2="1"><stop stop-color="#151f30"/><stop offset=".55" stop-color="#0a0f18"/><stop offset="1" stop-color="#05070c"/></linearGradient>
    <linearGradient id="win" x2="1"><stop stop-color="${o.primary}"/><stop offset="1" stop-color="${o.secondary}"/></linearGradient>
    <radialGradient id="glow"><stop stop-color="${o.primary}" stop-opacity=".6"/><stop offset="1" stop-color="${o.primary}" stop-opacity="0"/></radialGradient>
    <linearGradient id="teams"><stop stop-color="${o.homeColor}" stop-opacity=".64"/><stop offset=".48" stop-color="#18202d"/><stop offset="1" stop-color="${o.awayColor}" stop-opacity=".64"/></linearGradient>
    <linearGradient id="glass" x2="0" y2="1"><stop stop-color="#fff" stop-opacity=".14"/><stop offset=".5" stop-color="#fff" stop-opacity=".02"/><stop offset="1" stop-color="#050910" stop-opacity=".7"/></linearGradient>
    <clipPath id="photo"><rect x="64" y="948" width="952" height="296" rx="28"/></clipPath>
  </defs>
  <rect width="1080" height="1920" fill="url(#base)"/>
  <ellipse cx="${[120, 900, 300, 780][o.variant % 4]}" cy="460" rx="820" ry="850" fill="url(#glow)"/>
  <path d="M-120 1260 L1120 120 M250 1940 L1140 1050" stroke="#fff" stroke-opacity=".035" stroke-width="180"/>
  <circle cx="930" cy="210" r="250" fill="none" stroke="#fff" stroke-opacity=".035" stroke-width="40"/>
  <circle cx="930" cy="210" r="118" fill="none" stroke="#fff" stroke-opacity=".035" stroke-width="22"/>
  <g font-family="DejaVu Sans, Arial, sans-serif">
  <rect x="64" y="70" width="310" height="68" rx="34" fill="#050912" fill-opacity=".72" stroke="#fff" stroke-opacity=".16"/>
  <circle cx="103" cy="104" r="13" fill="url(#win)"/>
  <text x="132" y="116" fill="#f5f7fb" font-size="27" font-weight="700">Krachtbal <tspan fill="#80baff">Live</tspan></text>
  <text x="1016" y="111" text-anchor="end" fill="#d7e2f2" font-size="20" font-weight="700" letter-spacing="4">WINFIE · FINALE</text>
  <rect x="64" y="160" width="54" height="5" rx="2" fill="#80baff"/>
  <text x="136" y="170" fill="#aab7cb" font-size="23">${esc(o.date)}</text>
  <text x="64" y="256" fill="url(#win)" font-size="22" font-weight="700" letter-spacing="3">${winner}</text>
  ${textLines(o.headline, 64, 324, 28, headlineRows.length > 2 ? 32 : 44, 'start')}
  <rect x="64" y="450" width="952" height="458" rx="38" fill="#000" opacity=".26" transform="translate(0 12)"/>
  <rect x="64" y="438" width="952" height="470" rx="38" fill="url(#teams)" stroke="#fff" stroke-opacity=".23"/>
  <rect x="64" y="438" width="952" height="470" rx="38" fill="url(#glass)"/>
  <rect x="100" y="438" width="880" height="7" rx="4" fill="url(#win)"/>
  ${badge(o.home, o.homeLogoHref, o.homeLogoFit, 226, o.homeColor, 'home')}
  ${badge(o.away, o.awayLogoHref, o.awayLogoFit, 854, o.awayColor, 'away')}
  <text x="540" y="517" text-anchor="middle" fill="#d2dbea" font-size="19" font-weight="700" letter-spacing="3">EINDSTAND</text>
  <text x="448" y="638" text-anchor="middle" fill="#fff" font-size="112" font-weight="800">${o.score.home}</text>
  <rect x="506" y="566" width="68" height="50" rx="25" fill="#050912" fill-opacity=".64" stroke="#fff" stroke-opacity=".18"/>
  <text x="540" y="602" text-anchor="middle" fill="#dbe5f3" font-size="23" font-weight="700">VS</text>
  <text x="632" y="638" text-anchor="middle" fill="#fff" font-size="112" font-weight="800">${o.score.away}</text>
  ${textLines(o.home, 294, 764, 25, 27)}
  ${textLines(o.away, 786, 764, 25, 27)}
  <text x="540" y="874" text-anchor="middle" fill="#b8c6da" font-size="21">${esc(o.reeks)}</text>
  ${o.photoHref ? `<image href="${esc(o.photoHref)}" x="64" y="948" width="952" height="296" clip-path="url(#photo)" preserveAspectRatio="xMidYMid slice"/>
  <rect x="64" y="1135" width="952" height="109" fill="#050912" fill-opacity=".72" clip-path="url(#photo)"/>
  <text x="104" y="1204" fill="#fff" font-size="22" font-weight="700" letter-spacing="3">MOMENT VAN DE WEDSTRIJD</text>` : `<rect x="64" y="948" width="952" height="296" rx="28" fill="#151d29" stroke="#ffffff" stroke-opacity=".12"/>
  <text x="108" y="1010" fill="#80baff" font-size="21" letter-spacing="3">DE WEDSTRIJD IN CIJFERS</text>
  <text x="108" y="1110" fill="#fff" font-size="72" font-weight="700">${o.score.home + o.score.away}</text>
  <text x="108" y="1160" fill="#aab7cb" font-size="24">punten op het bord</text>
  <line x1="540" y1="1040" x2="540" y2="1176" stroke="#fff" stroke-opacity=".14"/>
  <text x="596" y="1110" fill="#fff" font-size="72" font-weight="700">${Math.abs(o.score.home - o.score.away)}</text>
  <text x="596" y="1160" fill="#aab7cb" font-size="24">punten verschil</text>`}
  <rect x="64" y="1284" width="952" height="442" rx="28" fill="#111722" stroke="#fff" stroke-opacity=".16"/>
  <rect x="104" y="1320" width="5" height="28" rx="2" fill="#80baff"/>
  <text x="128" y="1344" fill="#f5f7fb" font-size="25" font-weight="700">Scoreverloop</text>
  ${[0, .5, 1].map(v => `<line x1="120" y1="${1580-v*195}" x2="960" y2="${1580-v*195}" stroke="#fff" stroke-opacity=".09"/>`).join('')}
  <polyline points="${points('home')}" fill="none" stroke="${o.homeColor}" stroke-width="8" stroke-linejoin="round" stroke-linecap="round"/>
  <polyline points="${points('away')}" fill="none" stroke="${o.awayColor}" stroke-width="8" stroke-linejoin="round" stroke-linecap="round" ${sameColors ? 'stroke-dasharray="16 12"' : ''}/>
  <circle cx="110" cy="1640" r="6" fill="${o.homeColor}"/><text x="128" y="1648" fill="#b8c6da" font-size="19">Thuis${sameColors ? ' · volle lijn' : ''}</text>
  <circle cx="594" cy="1640" r="6" fill="${o.awayColor}"/><text x="612" y="1648" fill="#b8c6da" font-size="19">Uit${sameColors ? ' · stippellijn' : ''}</text>
  <line x1="64" y1="1792" x2="1016" y2="1792" stroke="#fff" stroke-opacity=".16"/>
  <rect x="64" y="1812" width="12" height="38" rx="6" fill="url(#win)"/>
  <text x="94" y="1840" fill="#f5f7fb" font-size="23" font-weight="700">${o.winner === 'draw' ? 'SAMEN BELEEFD.' : 'DIT MOMENT IS VAN ONS.'}</text>
  <text x="1016" y="1840" text-anchor="end" fill="#80baff" font-size="20">livescore.roodgries.be</text>
  </g></svg>`
}
