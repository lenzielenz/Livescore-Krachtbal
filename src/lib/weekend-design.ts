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
/** ÉÉN gedeelde lettergrootte voor een hele kolom tekst (bv. alle tegenstander-namen op een
 * pagina), afgeleid van de LANGSTE waarde — zo blijven de meeste rijen op volle grootte en volledig
 * leesbaar. Nooit kleiner dan 60% van de max: staat er één uitzonderlijk lange naam tussen, dan kapt
 * ENKEL DIE ene naam af (zie alignedText hieronder) i.p.v. de hele kolom onleesbaar te verkleinen. */
function fitSize(values: string[], maxSize: number, width: number): number {
  const longest = values.reduce((m, v) => Math.max(m, Array.from(v).length), 1)
  const raw = width / (longest * .66)
  return Math.max(maxSize * .6, Math.min(maxSize, raw))
}
/** Kapt een string af tot ze op lettergrootte `size` binnen `width` past (dezelfde brede schatting
 * als elders hier: ±0,66 × size breed per teken), met een "…" erachter. */
function truncateToWidth(value: string, size: number, width: number): string {
  const chars = Array.from(value)
  const maxChars = Math.max(1, Math.floor(width / (size * .66)))
  if (chars.length <= maxChars) return value
  if (maxChars === 1) return '…'
  return `${chars.slice(0, maxChars - 1).join('')}…`
}
/** Tekst op de gedeelde kolomgrootte (zie fitSize) — een naam die er ondanks de royale marge nog
 * niet in past (de uitzonderlijke uitschieter) wordt afgekapt met "…" i.p.v. verkleind. Dat — en
 * niet een eigen kleinere pasgrootte per rij — is wat een kolom mooi gelijk aan elkaar houdt: elke
 * rij oogt even groot, ook al lopen de tekstlengtes uiteen. */
function alignedText(value: string, x: number, y: number, size: number, width: number, fill = '#f5f7fb') {
  return `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" font-weight="700">${esc(truncateToWidth(value, size, width))}</text>`
}
/** Kleine statistiekpil ("● 6 wedstrijden") — dezelfde beknopte taal als de weekrecap-Story,
 * zodat de clubkleuren en cijfers meteen opvallen in het overzicht van de eigen speeldag. */
function statChip(x: number, y: number, value: number, text: string, color: string) {
  return `<circle cx="${x}" cy="${y - 7}" r="7" fill="${color}"/><text x="${x + 20}" y="${y}" fill="#f5f7fb" font-size="24" font-weight="800">${value}</text><text x="${x + 20 + String(value).length * 15 + 10}" y="${y}" fill="#aab7cb" font-size="20">${esc(text)}</text>`
}

// ── Krachtbal-beeldtaal ─────────────────────────────────────────────────────────────────────
// Dezelfde bal als in het virtueel stadion (virtueel/[slug]/krachtbal.ts): acht lederen stroken
// die aan beide kanten samenkomen in een klein rond kapje, met KRACHTBAL op de strook die naar
// je kijkt. Hier van opzij gezien: de polen links en rechts, de naden zijn de meridianen.

/** Hoe groot het kapje is (hoek vanaf de pool) — zelfde waarde als het 3D-model. */
const KAP = 0.3
/** cos/sin van de kaprand: waar de naden van de stroken eindigen. */
const KAP_X = Math.cos(KAP)
const KAP_Y = Math.sin(KAP)
/** De zichtbare naden: stroken van 45°, de tekststrook gecentreerd naar voren (±22,5°). */
const NADEN = [Math.cos((67.5 * Math.PI) / 180), Math.cos((22.5 * Math.PI) / 180)]

const r1 = (n: number) => Math.round(n * 10) / 10

/** Eén naad (meridiaan) van kaprand tot kaprand, boven (`dir` -1) of onder (+1) de as. */
function naad(R: number, c: number, dir: 1 | -1): string {
  const y = r1(dir * KAP_Y * R * c)
  return `M${r1(-KAP_X * R)} ${y} A${r1(R)} ${r1(R * c)} 0 0 ${dir === -1 ? 1 : 0} ${r1(KAP_X * R)} ${y}`
}

/** Een volle krachtbal (leder, naden, kapjes, opdruk) rond (cx, cy), gedraaid over `rot` graden. */
function krachtbal(cx: number, cy: number, R: number, rot: number): string {
  const naden = NADEN.flatMap(c => [naad(R, c, -1), naad(R, c, 1)])
  const strook = `${naad(R, NADEN[0], -1)} A${r1(R)} ${r1(R)} 0 0 1 ${r1(KAP_X * R)} ${r1(KAP_Y * R * NADEN[0])} A${r1(R)} ${r1(R * NADEN[0])} 0 0 1 ${r1(-KAP_X * R)} ${r1(KAP_Y * R * NADEN[0])} Z`
  const kapjes = [-1, 1].map(k => `<ellipse cx="${r1(k * KAP_X * R)}" cy="0" rx="${r1(R * .07)}" ry="${r1(KAP_Y * R)}" fill="#7a5a10" fill-opacity=".25" stroke="#5a3d06" stroke-width="${r1(R * .028)}"/>`).join('')
  return `<g transform="translate(${cx} ${cy}) rotate(${rot})">
      <ellipse cx="${r1(R * .1)}" cy="${r1(R * 1.06)}" rx="${r1(R * .9)}" ry="${r1(R * .16)}" fill="#000" opacity=".35" filter="url(#zacht)"/>
      <circle r="${r1(R * 1.45)}" fill="url(#goudgloed)"/>
      <circle r="${R}" fill="url(#leer)"/>
      <circle r="${R}" fill="url(#nerf)" opacity=".25"/>
      <path d="${strook}" fill="#fff" fill-opacity=".07"/>
      ${naden.map(d => `<path d="${d}" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="${r1(R * .02)}" transform="translate(0 ${r1(R * .012)})"/><path d="${d}" fill="none" stroke="#5a3d06" stroke-width="${r1(R * .032)}" stroke-linecap="round"/>`).join('')}
      ${kapjes}
      <text x="0" y="${r1(R * .085)}" text-anchor="middle" fill="#3b2606" fill-opacity=".9" font-family="DejaVu Sans, Arial, sans-serif" font-size="${r1(R * .2)}" font-weight="900" letter-spacing="${r1(R * .01)}">KRACHTBAL</text>
      <circle r="${R}" fill="url(#bolschaduw)"/>
      <circle r="${R}" fill="url(#metaal)"/>
      <ellipse cx="${r1(-R * .38)}" cy="${r1(-R * .46)}" rx="${r1(R * .34)}" ry="${r1(R * .17)}" fill="url(#glans)" transform="rotate(-28 ${r1(-R * .38)} ${r1(-R * .46)})"/>
      ${[[-.78, -.86, .09], [.92, -.5, .06], [.62, .94, .07]].map(([x, y, k]) => `<path d="M${r1(x * R)} ${r1(y * R - k * R)} L${r1(x * R + k * R * .28)} ${r1(y * R - k * R * .28)} L${r1(x * R + k * R)} ${r1(y * R)} L${r1(x * R + k * R * .28)} ${r1(y * R + k * R * .28)} L${r1(x * R)} ${r1(y * R + k * R)} L${r1(x * R - k * R * .28)} ${r1(y * R + k * R * .28)} L${r1(x * R - k * R)} ${r1(y * R)} L${r1(x * R - k * R * .28)} ${r1(y * R - k * R * .28)} Z" fill="#fff6c8"/>`).join('')}
    </g>`
}

/** Klein balletje als icoon (de pil bovenaan, de T/U-badge, de voettekst): bol + de twee
 * naden rond de tekststrook + de kapjes, in een eigen kleur. */
function balIcoon(cx: number, cy: number, r: number, kleur: string, opacity = 1): string {
  const c = NADEN[0]
  return `<g transform="translate(${r1(cx)} ${r1(cy)}) rotate(-20)" opacity="${opacity}">
      <circle r="${r1(r)}" fill="${kleur}"/>
      <circle r="${r1(r)}" fill="url(#bolschaduw)"/>
      <path d="${naad(r, c, -1)} ${naad(r, c, 1)}" fill="none" stroke="#000" stroke-opacity=".45" stroke-width="${r1(Math.max(1, r * .09))}"/>
      <line x1="${r1(-KAP_X * r)}" y1="${r1(-KAP_Y * r)}" x2="${r1(-KAP_X * r)}" y2="${r1(KAP_Y * r)}" stroke="#000" stroke-opacity=".45" stroke-width="${r1(Math.max(1, r * .09))}"/>
      <line x1="${r1(KAP_X * r)}" y1="${r1(-KAP_Y * r)}" x2="${r1(KAP_X * r)}" y2="${r1(KAP_Y * r)}" stroke="#000" stroke-opacity=".45" stroke-width="${r1(Math.max(1, r * .09))}"/>
    </g>`
}

/**
 * Het krachtbalveld op ware verhouding, over de volle hoogte van de Story: 14 m breed, 26 m
 * speelveld + twee doelgebieden van 10 m (reglementair, zie field.ts / FieldSchema.tsx). Met de
 * doellijnen (die 1,2 m buiten de zijlijn steken), de vrijeworplijnen op 4 m, de middellijn, de
 * zone-derden en de koraalrode buitenzone.
 */
const VELD_LENGTE_M = 26 + 2 * 10
const PX_M = 1920 / VELD_LENGTE_M
const VELD_B = 14 * PX_M
const VELD_X = (1080 - VELD_B) / 2
function veld(primary: string, secondary: string): string {
  const y = (m: number) => r1(m * PX_M)
  const x0 = r1(VELD_X)
  const x1 = r1(VELD_X + VELD_B)
  const buiten = 1.2 * PX_M
  const lijn = (yy: number, w = 3) => `<line x1="${r1(x0 - buiten)}" y1="${yy}" x2="${r1(x1 + buiten)}" y2="${yy}" stroke="#f3f9f5" stroke-opacity=".5" stroke-width="${w}"/>`
  const binnen = (yy: number, w = 2) => `<line x1="${x0}" y1="${yy}" x2="${x1}" y2="${yy}" stroke="#f3f9f5" stroke-opacity=".38" stroke-width="${w}"/>`
  const derde = (xx: number) => `<line x1="${r1(xx)}" y1="${y(10)}" x2="${r1(xx)}" y2="${y(36)}" stroke="#f3f9f5" stroke-opacity=".2" stroke-width="1.5" stroke-dasharray="4 12"/>`
  return `<rect x="${r1(x0 - buiten)}" y="0" width="${r1(VELD_B + 2 * buiten)}" height="1920" fill="#ff5d6c" opacity=".16"/>
    <rect x="${x0}" y="0" width="${r1(VELD_B)}" height="1920" fill="url(#turf)"/>
    <rect x="${x0}" y="0" width="${r1(VELD_B)}" height="1920" fill="url(#mow)"/>
    <rect x="${x0}" y="0" width="${r1(VELD_B)}" height="${y(10)}" fill="${primary}" opacity=".16"/>
    <rect x="${x0}" y="${y(36)}" width="${r1(VELD_B)}" height="${r1(1920 - 36 * PX_M)}" fill="${secondary}" opacity=".14"/>
    <line x1="${x0}" y1="0" x2="${x0}" y2="1920" stroke="#f3f9f5" stroke-opacity=".42" stroke-width="3"/>
    <line x1="${x1}" y1="0" x2="${x1}" y2="1920" stroke="#f3f9f5" stroke-opacity=".42" stroke-width="3"/>
    ${lijn(y(10), 4)}${lijn(y(36), 4)}${binnen(y(14))}${binnen(y(32))}${binnen(y(23), 3)}
    ${derde(VELD_X + VELD_B / 3)}${derde(VELD_X + (2 * VELD_B) / 3)}`
}

const ROWS_TOP = 520

/** Ruime kaarten (één kolom) — leesbaar en fotogeniek voor een rustige speeldag. Boven
 * COLUMN_THRESHOLD wedstrijden past dit niet meer binnen de Story; zie renderCompactColumns. */
function renderSpaciousRows(rows: WeekendMatch[], primary: string, secondary: string): string {
  const spacious = rows.length > 0 && rows.length <= 4
  const cardHeight = spacious ? 260 : 120
  // Gedeelde grootte voor de hele pagina — elke tegenstander en elke reeksnaam oogt daardoor even
  // groot, ook al lopen de tekstlengtes uiteen (een te lange naam kapt af, ze krimpt niet).
  const opponentSize = fitSize(rows.map(m => m.place), spacious ? 44 : 32, spacious ? 710 : 590)
  const seriesSize = fitSize(rows.map(m => m.series), spacious ? 25 : 19, 710)
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
      ${balIcoon(930, top + cardHeight - (spacious ? 64 : 40), spacious ? 34 : 22, sideColor, .55)}
      <rect x="${984 - pillW}" y="${top + 18}" width="${pillW}" height="30" rx="15" fill="${sideColor}" fill-opacity=".18" stroke="${sideColor}" stroke-opacity=".6"/>
      <text x="${984 - pillW / 2}" y="${top + 39}" text-anchor="middle" fill="${sideColor}" font-size="15" font-weight="800" letter-spacing="1">${sideLabel}</text>
      ${label(m.time, 92, top + (spacious ? 143 : 70), spacious ? 38 : 32, 125)}
      <line x1="238" y1="${top + 24}" x2="238" y2="${top + cardHeight - 24}" stroke="#fff" stroke-opacity=".12"/>
      ${alignedText(m.place, 266, top + (spacious ? 117 : 52), opponentSize, spacious ? 600 : 560)}
      ${alignedText(m.series, 266, top + (spacious ? 177 : 91), seriesSize, 600, '#b2bfd2')}
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
/** Horizontaal rekt een compacte rij minder op dan verticaal: anders eten de badge en het uur de
 * breedte op en kapt een gewone plaatsnaam ("Buggenhout") af. */
const hScale = (scale: number) => Math.min(scale, 1.2)
/** Breedte die in een compacte rij overblijft voor de plaatsnaam. */
const placeWidth = (scale: number) => COL_WIDTH - 126 * hScale(scale) - 80 * hScale(scale)

function compactRow(m: WeekendMatch, colX: number, top: number, rowH: number, scale: number, opponentSize: number, primary: string, secondary: string): string {
  const sideColor = m.side === 'home' ? primary : secondary
  const symbol = m.side === 'home' ? 'T' : 'U'
  const midY = top + rowH / 2
  const hs = hScale(scale)
  scale = hs
  const badgeR = 15 * scale
  const badgeX = colX + 34 * scale
  return `<g data-match="${m.id}">
      <rect x="${colX}" y="${top}" width="${COL_WIDTH}" height="${rowH}" rx="14" fill="url(#card)" stroke="#fff" stroke-opacity=".14"/>
      <rect x="${colX}" y="${top + 8}" width="4" height="${rowH - 16}" rx="2" fill="${sideColor}"/>
      ${balIcoon(badgeX, midY, badgeR, sideColor)}
      <text x="${badgeX}" y="${midY + 5 * scale}" text-anchor="middle" fill="#fff" stroke="#000" stroke-opacity=".55" stroke-width="${2.5 * scale}" paint-order="stroke" font-size="${15 * scale}" font-weight="800">${symbol}</text>
      ${label(m.time, colX + 60 * scale, midY + 6 * scale, 18 * scale, 60 * scale, '#e7edf6')}
      ${alignedText(m.place, colX + 126 * scale, midY + 7 * scale, opponentSize, placeWidth(scale))}
      <rect x="${colX + COL_WIDTH - 74 * scale}" y="${midY - 14 * scale}" width="${68 * scale}" height="${28 * scale}" rx="8" fill="${sideColor}" fill-opacity=".16" stroke="${sideColor}" stroke-opacity=".55"/>
      <text x="${colX + COL_WIDTH - 40 * scale}" y="${midY + 5 * scale}" text-anchor="middle" fill="${sideColor}" font-size="${Math.min(14, 58 / Math.max(3, m.seriesCode.length) / .66) * scale}" font-weight="800">${esc(m.seriesCode)}</text>
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
  // Gedeelde grootte voor de tegenstander-naam over BEIDE kolommen heen — anders oogt de ene kolom
  // net iets anders dan de andere zodra de namen daar gemiddeld langer/korter zijn. Een naam die
  // niet past, kapt af (zie alignedText) i.p.v. individueel te krimpen.
  const opponentSize = fitSize(rows.map(m => m.place), 24 * hScale(scale), placeWidth(scale))

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
      return heading + compactRow(m, colX, top, rowH, scale, opponentSize, primary, secondary)
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
  // Clublogo links in de kop; rechtsboven breekt een grote krachtbal uit het beeld.
  const LX = 186
  const LY = 300
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
    <defs>
      <linearGradient id="base" x2="1" y2="1"><stop stop-color="#141b27"/><stop offset="1" stop-color="#06080d"/></linearGradient>
      <radialGradient id="glow"><stop stop-color="${o.primary}" stop-opacity=".55"/><stop offset="1" stop-color="${o.primary}" stop-opacity="0"/></radialGradient>
      <!-- Kaarten als donker glas: het veld eronder blijft zichtbaar. -->
      <linearGradient id="card" x2="1" y2="1"><stop stop-color="#1d2533" stop-opacity=".9"/><stop offset="1" stop-color="#080b11" stop-opacity=".86"/></linearGradient>
      <linearGradient id="hero" x2="1" y2="1"><stop stop-color="#0a0e15" stop-opacity=".82"/><stop offset="1" stop-color="${o.primary}" stop-opacity=".3"/></linearGradient>
      <clipPath id="badge"><circle cx="${LX}" cy="${LY}" r="78"/></clipPath>
      <filter id="badgeGlow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="16"/></filter>
      <filter id="zacht" x="-30%" y="-200%" width="160%" height="500%"><feGaussianBlur stdDeviation="10"/></filter>
      <radialGradient id="shine" cx=".32" cy=".26" r=".95">
        <stop offset="0" stop-color="#000" stop-opacity="0"/>
        <stop offset=".4" stop-color="#000" stop-opacity="0"/>
        <stop offset="1" stop-color="#000" stop-opacity=".32"/>
      </radialGradient>
      <radialGradient id="shineSpot" cx=".5" cy=".5" r=".5">
        <stop offset="0" stop-color="#fff" stop-opacity=".9"/>
        <stop offset="1" stop-color="#fff" stop-opacity="0"/>
      </radialGradient>
      <!-- De GOUDEN krachtbal uit de goudjacht van het virtueel stadion (goudjacht.ts: basis
           #f2c230, opdruk #3b2606, metaalglans): licht linksboven, diep amber in de hoek. -->
      <radialGradient id="leer" cx=".36" cy=".3" r=".82">
        <stop offset="0" stop-color="#fff4b8"/>
        <stop offset=".28" stop-color="#ffd84d"/>
        <stop offset=".62" stop-color="#f2c230"/>
        <stop offset=".86" stop-color="#b8860b"/>
        <stop offset="1" stop-color="#6b4a06"/>
      </radialGradient>
      <radialGradient id="goudgloed"><stop stop-color="#ffd84d" stop-opacity=".55"/><stop offset="1" stop-color="#ffd84d" stop-opacity="0"/></radialGradient>
      <linearGradient id="metaal" x1="0" y1="0" x2="1" y2="1">
        <stop offset=".3" stop-color="#fff" stop-opacity="0"/>
        <stop offset=".45" stop-color="#fff" stop-opacity=".35"/>
        <stop offset=".52" stop-color="#fff" stop-opacity="0"/>
      </linearGradient>
      <pattern id="nerf" patternUnits="userSpaceOnUse" width="9" height="9">
        <circle cx="2" cy="3" r="1" fill="#3a1c06" opacity=".35"/><circle cx="7" cy="7" r=".8" fill="#fff" opacity=".18"/>
      </pattern>
      <radialGradient id="bolschaduw" cx=".38" cy=".32" r=".75">
        <stop offset=".55" stop-color="#000" stop-opacity="0"/>
        <stop offset="1" stop-color="#000" stop-opacity=".45"/>
      </radialGradient>
      <radialGradient id="glans"><stop stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
      <!-- Grasmat in de CLUBKLEUR + maaibanen van 2 m, zoals op het echte terrein. -->
      <linearGradient id="turf" x1="0" y1="0" x2="0.2" y2="1">
        <stop offset="0" stop-color="${o.primary}" stop-opacity=".5"/>
        <stop offset=".55" stop-color="${o.primary}" stop-opacity=".3"/>
        <stop offset="1" stop-color="${o.secondary}" stop-opacity=".18"/>
      </linearGradient>
      <pattern id="mow" patternUnits="userSpaceOnUse" width="1080" height="${r1(4 * PX_M)}"><rect width="1080" height="${r1(2 * PX_M)}" fill="#ffffff" opacity=".05"/></pattern>
      <radialGradient id="turfvig" cx=".5" cy=".3" r=".9"><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".6"/></radialGradient>
    </defs>
    <rect width="1080" height="1920" fill="url(#base)"/>
    ${veld(o.primary, o.secondary)}
    <rect width="1080" height="1920" fill="url(#turfvig)"/>
    <ellipse cx="900" cy="260" rx="620" ry="560" fill="url(#glow)"/>
    <g font-family="DejaVu Sans, Arial, sans-serif">
      <rect x="64" y="70" width="252" height="50" rx="25" fill="#050912" fill-opacity=".78" stroke="#fff" stroke-opacity=".16"/>
      ${balIcoon(94, 95, 14, '#f2c230')}
      <text x="120" y="102" fill="#f5f7fb" font-size="21" font-weight="700">Krachtbal <tspan fill="#80baff">Live</tspan></text>
      <rect x="64" y="176" width="952" height="248" rx="32" fill="url(#hero)" stroke="#fff" stroke-opacity=".18"/>
      ${krachtbal(952, 168, 150, -22)}
      <circle cx="${LX}" cy="${LY}" r="104" fill="${o.primary}" opacity=".45" filter="url(#badgeGlow)"/>
      <circle cx="${LX}" cy="${LY + 8}" r="85" fill="#000" opacity=".3"/>
      <circle cx="${LX}" cy="${LY}" r="84" fill="#fff" stroke="${o.primary}" stroke-width="5"/>
      <g clip-path="url(#badge)">${o.logoHref ? `<image href="${esc(o.logoHref)}" x="${LX - logoSize / 2 + fit.offsetX * 1.48}" y="${LY - logoSize / 2 + fit.offsetY * 1.48}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet"/>` : `<text x="${LX}" y="${LY + 14}" text-anchor="middle" fill="#1c2534" font-size="34" font-weight="700">${esc(initials)}</text>`}
      <circle cx="${LX}" cy="${LY}" r="84" fill="url(#shine)"/>
      <ellipse cx="${LX - 28}" cy="${LY - 40}" rx="30" ry="16" fill="url(#shineSpot)" transform="rotate(-30 ${LX - 28} ${LY - 40})"/></g>
      <circle cx="${LX}" cy="${LY}" r="88" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="2"/>
      <text x="306" y="232" fill="#80baff" font-size="18" font-weight="700" letter-spacing="3">WEEKENDPLAN · ALLE PLOEGEN</text>
      ${label(o.club, 306, 290, 40, 480)}
      ${label(o.title, 306, 332, 25, 480, '#c6d4e8')}
      ${statChip(306, 392, o.total, o.total === 1 ? 'wedstrijd' : 'wedstrijden', '#f5f7fb')}
      ${statChip(540, 392, o.homeCount, 'thuis', o.primary)}
      ${statChip(700, 392, o.awayCount, 'uit', o.secondary)}
      <text x="64" y="478" fill="#fff" font-size="50" font-weight="800" letter-spacing="-1">Het weekend van ons.</text>
      ${rows || `<rect x="64" y="${ROWS_TOP + 34}" width="952" height="260" rx="28" fill="url(#card)"/>${label('Even geen wedstrijden.', 104, ROWS_TOP + 140, 38, 860)}${label('Tot langs de zijlijn bij de volgende speeldag!', 104, ROWS_TOP + 204, 25, 860, '#b2bfd2')}`}
      <rect x="40" y="1770" width="1000" height="124" rx="28" fill="#05080d" fill-opacity=".8" stroke="#fff" stroke-opacity=".12"/>
      ${balIcoon(96, 1814, 18, '#f2c230')}
      <text x="128" y="1822" fill="#f5f7fb" font-size="25" font-weight="800">KOM MEE SUPPORTEREN.</text>
      <text x="1000" y="1822" text-anchor="end" fill="#b2bfd2" font-size="21">${o.total} wedstrijden · ${o.page + 1} / ${o.pages}</text>
      <text x="128" y="1864" fill="#80baff" font-size="21">Volg alle scores op livescore.roodgries.be</text>
    </g>
  </svg>`
}
