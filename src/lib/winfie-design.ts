import { normalizeLogoFit, type LogoFit } from './logo-fit'

const esc = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
export type WinfieDesign = {
  home: string; away: string; score: { home: number; away: number }
  winner: 'home' | 'away' | 'draw'; primary: string; secondary: string
  homeColor: string; awayColor: string; headline: string; date: string; reeks: string
  progress: { home: number; away: number; half?: number }[]; variant: number
  homeLogoHref?: string; awayLogoHref?: string
  homeLogoFit?: LogoFit | null; awayLogoFit?: LogoFit | null; photoHref?: string
  /** De aanmaker van deze Winfie duidde zelf "ik was erbij" aan voor deze wedstrijd —
   * dan krijgt haar/zijn eigen Story een kleine, persoonlijke stempel. */
  iWasThere?: boolean
  /** matches.liveReactions — de emoji-tellers die tijdens de wedstrijd verzameld werden. Dit is
   * het sociale bewijs ("er gebeurde hier iets") dat mensen prikkelt om zelf ook te delen. */
  reactions?: Record<string, number>
  /** Overige activiteit (tribuneberichten + -foto's) die niet als losse reactie meetelt. */
  momentsExtra?: number
}

const REACTION_GLYPHS: Record<string, string> = { clap: '👏', fire: '🔥', heart: '❤️', goal: '⚽', wow: '😮', rocket: '🚀' }
const REACTION_ORDER = ['clap', 'fire', 'heart', 'goal', 'wow', 'rocket'] as const

/** Tot vier chips: de reactietypes met de meeste tikken, aangevuld met een "en meer"-chip voor
 * overige activiteit (berichten/foto's) als er nog plaats is. Leeg als er niets te vieren viel. */
function activityChips(reactions: Record<string, number> | undefined, momentsExtra: number | undefined) {
  const chips = REACTION_ORDER
    .map((key) => ({ glyph: REACTION_GLYPHS[key], count: Math.max(0, Math.round(Number(reactions?.[key]) || 0)) }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 4)
  const extra = Math.max(0, Math.round(momentsExtra ?? 0))
  if (chips.length < 4 && extra > 0) chips.push({ glyph: '✨', count: extra })
  return chips
}

// Kleine, deterministische PRNG (mulberry32) — dezelfde wedstrijd geeft altijd dezelfde
// confetti-spreiding (geen flikkering tussen server-renders, en reproduceerbaar in tests).
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function seedFrom(o: WinfieDesign): number {
  let h = (o.variant * 7919 + o.score.home * 131 + o.score.away * 197) | 0
  const text = o.home + o.away
  for (let i = 0; i < text.length; i++) h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0
  return Math.abs(h) || 1
}

/** Confetti in de zijmarges (x < 64 en x > 1016) — daar staat nooit tekst of de kaart, dus geen
 * risico op overlap, en het geeft de volle canvashoogte een gevoel van beweging/feest. */
function confetti(o: WinfieDesign): string {
  const rand = mulberry32(seedFrom(o))
  const colors = [o.primary, o.secondary, o.homeColor, o.awayColor, '#ffd166', '#ffffff']
  const bands = [30, 1050]
  const out: string[] = []
  for (let i = 0; i < 22; i++) {
    const x = bands[i % 2] + (rand() - 0.5) * 44
    const y = 40 + rand() * 1800
    const color = colors[Math.floor(rand() * colors.length)]
    const kind = Math.floor(rand() * 3)
    const delay = (rand() * 3).toFixed(2)
    const op = (0.4 + rand() * 0.45).toFixed(2)
    if (kind === 0) {
      const r = 4 + rand() * 5
      out.push(`<circle class="wf-confetti" style="animation-delay:${delay}s" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${color}" opacity="${op}"/>`)
    } else if (kind === 1) {
      // De CSS-animatie zet .wf-confetti's eigen `transform` (scale); die staat daarom op de
      // buitenste <g>, anders overschrijft ze de rotate()-plaatsing van het rechthoekje zelf.
      const s = 9 + rand() * 8
      const rot = Math.floor(rand() * 360)
      out.push(`<g class="wf-confetti" style="animation-delay:${delay}s"><rect x="${(x - s / 2).toFixed(1)}" y="${(y - s * 0.28).toFixed(1)}" width="${s.toFixed(1)}" height="${(s * 0.56).toFixed(1)}" rx="2" fill="${color}" opacity="${op}" transform="rotate(${rot} ${x.toFixed(1)} ${y.toFixed(1)})"/></g>`)
    } else {
      const r = 6 + rand() * 4
      out.push(`<polygon class="wf-confetti" style="animation-delay:${delay}s" points="${starPoints(x, y, r)}" fill="${color}" opacity="${op}"/>`)
    }
  }
  return out.join('')
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
type MomentumStep = { side: 'home' | 'away'; value: number; half: number; diff: number }

/** Elke stap = het puntenverschil (thuis − uit) na één doelpunt — dezelfde opbouw als het
 * "Momentum"-scoreverloop op de analysepagina, zodat de Winfie er visueel bij aansluit. */
function momentumSteps(progress: WinfieDesign['progress']): MomentumStep[] {
  const steps: MomentumStep[] = []
  let diff = 0
  for (let i = 1; i < progress.length; i++) {
    const prev = progress[i - 1]
    const cur = progress[i]
    // Normaal wijzigt maar één kant per stap (één doelpunt). Een geïmporteerde eindstand zonder
    // volledige tijdlijn kan in één sprong komen: dan tellen we het netto-effect op het verschil.
    const net = (cur.home - prev.home) - (cur.away - prev.away)
    if (net === 0) continue
    diff += net
    steps.push({ side: net > 0 ? 'home' : 'away', value: Math.abs(net), half: cur.half ?? 1, diff })
  }
  return steps
}

/** Vijfpuntige ster voor de rugworp-markering (zelfde vorm als het analyse-scoreverloop). */
function starPoints(cx: number, cy: number, outer: number): string {
  const inner = outer * 0.44
  const pts: string[] = []
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner
    const a = (-90 + i * 36) * (Math.PI / 180)
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`)
  }
  return pts.join(' ')
}

function badge(name: string, href: string | undefined, fit: LogoFit | null | undefined, x: number, color: string, id: string, isWinner: boolean) {
  const f = normalizeLogoFit(fit)
  const size = 188 * f.zoom
  return `<defs><clipPath id="${id}"><circle cx="${x}" cy="590" r="100"/></clipPath></defs>
    ${isWinner ? `<circle class="wf-glow" cx="${x}" cy="590" r="152" fill="${color}" opacity=".4" filter="url(#softBlur)"/>` : ''}
    <circle cx="${x}" cy="600" r="109" fill="#000" opacity=".3"/>
    <circle cx="${x}" cy="590" r="106" fill="#fff" stroke="${color}" stroke-width="${isWinner ? 8 : 5}"/>
    ${isWinner ? `<circle cx="${x}" cy="590" r="113" fill="none" stroke="${color}" stroke-opacity=".55" stroke-width="3"/>` : ''}
    <g clip-path="url(#${id})">
    ${href ? `<image href="${esc(href)}" x="${x - size / 2 + f.offsetX * 2}" y="${590 - size / 2 + f.offsetY * 2}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/>` : `<text x="${x}" y="608" text-anchor="middle" font-size="48" font-weight="700" fill="#15352a">${esc(name.split(/\s+/).map(s => s[0]).join('').slice(0, 3))}</text>`}
    </g>`
}
/** Shared composition for preview and PNG: no remote SVG images or browser-only CSS. */
export function renderWinfieDesign(o: WinfieDesign): string {
  const winner = o.winner === 'draw' ? '🤝 GELIJKSPEL' : '🏆 DE OVERWINNING IS BINNEN'
  const headlineRows = lines(o.headline, 28)
  const sameColors = o.homeColor.toLowerCase() === o.awayColor.toLowerCase()

  // Momentum-scoreverloop: cumulatief puntenverschil na elk doelpunt, zelfde taal als de
  // "Momentum"-grafiek op de analysepagina (gradiëntvlak + rugworp-sterren + helft-lijn).
  const PX0 = 120, PX1 = 960, PY0 = 1372, PY1 = 1580
  const MIDY = (PY0 + PY1) / 2
  const steps = momentumSteps(o.progress)
  const n = steps.length
  const maxAbs = Math.max(1, ...steps.map((s) => Math.abs(s.diff)))
  const stepX = (i: number) => (n <= 0 ? (PX0 + PX1) / 2 : PX0 + ((i + 1) / n) * (PX1 - PX0))
  const stepY = (d: number) => MIDY - (d / maxAbs) * ((PY1 - PY0) / 2 - 12)
  const linePts = [`${PX0},${MIDY}`, ...steps.map((s, i) => `${stepX(i).toFixed(1)},${stepY(s.diff).toFixed(1)}`)]
  const areaPath = n > 0 ? `M ${linePts.join(' L ')} L ${stepX(n - 1).toFixed(1)},${MIDY} L ${PX0},${MIDY} Z` : ''
  const halfMarks: { x: number; half: number }[] = []
  for (let i = 1; i < steps.length; i++) {
    if (steps[i].half > steps[i - 1].half) halfMarks.push({ x: (stepX(i - 1) + stepX(i)) / 2, half: steps[i].half })
  }
  const finalDiff = steps.at(-1)?.diff ?? 0
  const leiderTekst = finalDiff === 0 ? 'gelijk' : finalDiff > 0 ? o.home : o.away
  // Extra verhaal-cijfers voor het geen-foto-vak: hoe groot werd het gat ooit, en hoe stond het
  // bij de rust? Enkel tonen als er écht helft-per-helft data is (niet de synthetische
  // eindstand-zonder-tijdlijn-sprong uit buildWinfieDesign, die alles op "helft 2" plakt).
  const grootsteVoorsprong = n > 0 ? Math.max(...steps.map((s) => Math.abs(s.diff))) : 0
  const heeftEchteHelften = steps.some((s) => s.half === 1) && steps.some((s) => s.half === 2)
  const ruststand = heeftEchteHelften ? [...o.progress].reverse().find((p) => (p.half ?? 1) === 1) : undefined
  const chips = activityChips(o.reactions, o.momentsExtra)
  const homeScoreFill = o.winner === 'home' ? 'url(#win)' : '#fff'
  const awayScoreFill = o.winner === 'away' ? 'url(#win)' : '#fff'
  const homeScoreOp = o.winner === 'away' ? '.55' : '1'
  const awayScoreOp = o.winner === 'home' ? '.55' : '1'
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <defs>
    <linearGradient id="base" x2="1" y2="1"><stop stop-color="#151f30"/><stop offset=".55" stop-color="#0a0f18"/><stop offset="1" stop-color="#05070c"/></linearGradient>
    <linearGradient id="win" x2="1"><stop stop-color="${o.primary}"/><stop offset="1" stop-color="${o.secondary}"/></linearGradient>
    <radialGradient id="glow"><stop stop-color="${o.primary}" stop-opacity=".72"/><stop offset="1" stop-color="${o.primary}" stop-opacity="0"/></radialGradient>
    <radialGradient id="glow2"><stop stop-color="${o.secondary}" stop-opacity=".5"/><stop offset="1" stop-color="${o.secondary}" stop-opacity="0"/></radialGradient>
    <linearGradient id="teams"><stop stop-color="${o.homeColor}" stop-opacity=".64"/><stop offset=".48" stop-color="#18202d"/><stop offset="1" stop-color="${o.awayColor}" stop-opacity=".64"/></linearGradient>
    <linearGradient id="glass" x2="0" y2="1"><stop stop-color="#fff" stop-opacity=".14"/><stop offset=".5" stop-color="#fff" stop-opacity=".02"/><stop offset="1" stop-color="#050910" stop-opacity=".7"/></linearGradient>
    <linearGradient id="momFill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${o.homeColor}" stop-opacity=".55"/>
      <stop offset="50%" stop-color="${o.homeColor}" stop-opacity=".06"/>
      <stop offset="50%" stop-color="${o.awayColor}" stop-opacity=".06"/>
      <stop offset="100%" stop-color="${o.awayColor}" stop-opacity=".55"/>
    </linearGradient>
    <linearGradient id="sheenGrad" x2="1" y2="0"><stop stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <clipPath id="photo"><rect x="64" y="948" width="952" height="296" rx="28"/></clipPath>
    <clipPath id="cardClip"><rect x="64" y="438" width="952" height="470" rx="38"/></clipPath>
    <filter id="softBlur" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="20"/></filter>
    <filter id="scoreGlow" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="0" stdDeviation="11" flood-color="${o.primary}" flood-opacity=".85"/></filter>
  </defs>
  <style>
    .wf-glow { animation: wfPulse 3.4s ease-in-out infinite; transform-origin: center; }
    .wf-confetti { animation: wfTwinkle 2.6s ease-in-out infinite; transform-origin: center; }
    .wf-chip { animation: wfRise .5s ease-out both; }
    .wf-sheen { animation: wfSheen 6s ease-in-out 1s infinite; }
    @keyframes wfPulse { 0%, 100% { opacity: .3; } 50% { opacity: .55; } }
    @keyframes wfTwinkle { 0%, 100% { opacity: .4; transform: scale(.85); } 50% { opacity: 1; transform: scale(1.1); } }
    @keyframes wfRise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
    @keyframes wfSheen { 0%, 55% { transform: translateX(0); } 100% { transform: translateX(1500px); } }
    @media (prefers-reduced-motion: reduce) {
      .wf-glow, .wf-confetti, .wf-chip, .wf-sheen { animation: none; }
    }
  </style>
  <rect width="1080" height="1920" fill="url(#base)"/>
  <ellipse cx="${[120, 900, 300, 780][o.variant % 4]}" cy="460" rx="820" ry="850" fill="url(#glow)"/>
  <ellipse class="wf-glow" cx="540" cy="680" rx="560" ry="420" fill="url(#glow2)"/>
  <path d="M-120 1260 L1120 120 M250 1940 L1140 1050" stroke="#fff" stroke-opacity=".05" stroke-width="180"/>
  <path d="M-60 1720 L900 60" stroke="${o.primary}" stroke-opacity=".07" stroke-width="90"/>
  <path d="M180 1920 L1180 700" stroke="${o.secondary}" stroke-opacity=".06" stroke-width="70"/>
  <circle cx="930" cy="210" r="250" fill="none" stroke="#fff" stroke-opacity=".05" stroke-width="40"/>
  <circle cx="930" cy="210" r="118" fill="none" stroke="#fff" stroke-opacity=".05" stroke-width="22"/>
  ${confetti(o)}
  <g font-family="DejaVu Sans, Arial, sans-serif">
  <rect x="64" y="70" width="310" height="68" rx="34" fill="#050912" fill-opacity=".72" stroke="#fff" stroke-opacity=".16"/>
  <circle cx="103" cy="104" r="13" fill="url(#win)"/>
  <text x="132" y="116" fill="#f5f7fb" font-size="27" font-weight="700">Krachtbal <tspan fill="#80baff">Live</tspan></text>
  <text x="1016" y="111" text-anchor="end" fill="#d7e2f2" font-size="20" font-weight="700" letter-spacing="4">WINFIE · FINALE</text>
  <rect x="64" y="160" width="54" height="5" rx="2" fill="#80baff"/>
  <text x="136" y="170" fill="#aab7cb" font-size="23">${esc(o.date)}</text>
  ${o.iWasThere ? `<g transform="rotate(-4 890 161)">
    <rect x="742" y="140" width="296" height="42" rx="21" fill="#0fe0a6" fill-opacity=".2" stroke="#0fe0a6" stroke-width="2"/>
    <text x="890" y="167" text-anchor="middle" fill="#0fe0a6" font-size="19" font-weight="800" letter-spacing="1">🎟️ JIJ WAS ERBIJ</text>
  </g>` : ''}
  ${chips.length > 0 ? chips.map((c, i) => {
    // Positie zit op de buitenste <g> en blijft dus ongemoeid door de animatie: de inro-animatie
    // (CSS transform) zit op de BINNENSTE <g>, anders overschrijft de eind-keyframe ("transform:
    // none") de plaatsingstransform en springt de chip naar (0,0).
    const w = 220, gap = 14, x = 64 + i * (w + gap)
    return `<g transform="translate(${x} 188)"><g class="wf-chip" style="animation-delay:${(i * 0.12).toFixed(2)}s">
    <rect width="${w}" height="46" rx="23" fill="#050912" fill-opacity=".64" stroke="#fff" stroke-opacity=".18"/>
    <text x="24" y="31" font-size="24">${c.glyph}</text>
    <text x="62" y="31" fill="#f5f7fb" font-size="22" font-weight="800">${c.count}</text>
  </g></g>`
  }).join('') : ''}
  <text x="64" y="${chips.length > 0 ? 272 : 256}" fill="url(#win)" font-size="22" font-weight="700" letter-spacing="3">${winner}</text>
  ${textLines(o.headline, 64, 324, 28, headlineRows.length > 2 ? 34 : 48, 'start')}
  <rect x="64" y="450" width="952" height="458" rx="38" fill="#000" opacity=".26" transform="translate(0 12)"/>
  <rect x="64" y="438" width="952" height="470" rx="38" fill="url(#teams)" stroke="#fff" stroke-opacity=".23"/>
  <rect x="64" y="438" width="952" height="470" rx="38" fill="url(#glass)"/>
  <rect x="100" y="438" width="880" height="7" rx="4" fill="url(#win)"/>
  <g clip-path="url(#cardClip)"><g class="wf-sheen"><rect x="-320" y="428" width="260" height="490" fill="url(#sheenGrad)" transform="skewX(-18)"/></g></g>
  ${badge(o.home, o.homeLogoHref, o.homeLogoFit, 226, o.homeColor, 'home', o.winner === 'home')}
  ${badge(o.away, o.awayLogoHref, o.awayLogoFit, 854, o.awayColor, 'away', o.winner === 'away')}
  <text x="540" y="517" text-anchor="middle" fill="#d2dbea" font-size="20" font-weight="700" letter-spacing="3">🏆 EINDSTAND</text>
  <text x="448" y="638" text-anchor="middle" fill="${homeScoreFill}" fill-opacity="${homeScoreOp}" font-size="112" font-weight="800" ${o.winner === 'home' ? 'filter="url(#scoreGlow)"' : ''}>${o.score.home}</text>
  <rect x="506" y="566" width="68" height="50" rx="25" fill="#050912" fill-opacity=".64" stroke="#fff" stroke-opacity=".18"/>
  <text x="540" y="602" text-anchor="middle" fill="#dbe5f3" font-size="23" font-weight="700">VS</text>
  <text x="632" y="638" text-anchor="middle" fill="${awayScoreFill}" fill-opacity="${awayScoreOp}" font-size="112" font-weight="800" ${o.winner === 'away' ? 'filter="url(#scoreGlow)"' : ''}>${o.score.away}</text>
  ${textLines(o.home, 226, 764, 25, 27)}
  ${textLines(o.away, 854, 764, 25, 27)}
  <text x="540" y="874" text-anchor="middle" fill="#b8c6da" font-size="21">${esc(o.reeks)}</text>
  ${o.photoHref ? `<image href="${esc(o.photoHref)}" x="64" y="948" width="952" height="296" clip-path="url(#photo)" preserveAspectRatio="xMidYMid slice"/>
  <rect x="64" y="1135" width="952" height="109" fill="#050912" fill-opacity=".72" clip-path="url(#photo)"/>
  <text x="104" y="1204" fill="#fff" font-size="22" font-weight="700" letter-spacing="3">MOMENT VAN DE WEDSTRIJD</text>` : `<rect x="64" y="948" width="952" height="296" rx="28" fill="#151d29" stroke="#ffffff" stroke-opacity=".12"/>
  <text x="108" y="998" fill="#80baff" font-size="21" letter-spacing="3">📊 DE WEDSTRIJD IN CIJFERS</text>
  <text x="108" y="1094" fill="#fff" font-size="72" font-weight="700">${o.score.home + o.score.away}</text>
  <text x="108" y="1132" fill="#aab7cb" font-size="24">⚽ punten op het bord</text>
  <line x1="540" y1="1012" x2="540" y2="1146" stroke="#fff" stroke-opacity=".14"/>
  <text x="596" y="1094" fill="#fff" font-size="72" font-weight="700">${Math.abs(o.score.home - o.score.away)}</text>
  <text x="596" y="1132" fill="#aab7cb" font-size="24">↔ punten verschil</text>
  <line x1="108" y1="1164" x2="972" y2="1164" stroke="#fff" stroke-opacity=".1"/>
  <text x="108" y="1212" fill="#fff" font-size="28" font-weight="700">📈 ${grootsteVoorsprong}<tspan fill="#aab7cb" font-size="19" font-weight="400" dx="6">grootste voorsprong</tspan></text>
  ${ruststand ? `<text x="596" y="1212" fill="#fff" font-size="28" font-weight="700">⏱ ${ruststand.home}-${ruststand.away}<tspan fill="#aab7cb" font-size="19" font-weight="400" dx="6">bij de rust</tspan></text>`
    : `<text x="596" y="1212" fill="#fff" font-size="28" font-weight="700">🎯 ${n}<tspan fill="#aab7cb" font-size="19" font-weight="400" dx="6">doelpunten totaal</tspan></text>`}`}
  <rect x="64" y="1284" width="952" height="442" rx="28" fill="#111722" stroke="#fff" stroke-opacity=".16"/>
  <rect x="104" y="1320" width="5" height="28" rx="2" fill="#80baff"/>
  <text x="128" y="1344" fill="#f5f7fb" font-size="26" font-weight="700">📈 Momentum · scoreverloop</text>
  ${n > 1 ? `<text x="960" y="1344" text-anchor="end" fill="#8ea0bd" font-size="19">${n} doelpunten</text>` : ''}
  <line x1="${PX0}" y1="${MIDY}" x2="${PX1}" y2="${MIDY}" stroke="#fff" stroke-opacity=".16"/>
  ${halfMarks.map((h) => `<line x1="${h.x.toFixed(1)}" y1="${PY0}" x2="${h.x.toFixed(1)}" y2="${PY1}" stroke="#fff" stroke-opacity=".16" stroke-dasharray="4 5"/><text x="${h.x.toFixed(1)}" y="${PY1 + 22}" text-anchor="middle" fill="#8ea0bd" font-size="17">${h.half}e helft</text>`).join('')}
  ${areaPath ? `<path d="${areaPath}" fill="url(#momFill)"/>` : ''}
  <polyline points="${linePts.join(' ')}" fill="none" stroke="#f5f7fb" stroke-opacity=".85" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
  ${steps.map((s, i) => s.value === 2 ? '' : `<circle cx="${stepX(i).toFixed(1)}" cy="${stepY(s.diff).toFixed(1)}" r="7" fill="${s.side === 'home' ? o.homeColor : o.awayColor}" ${sameColors && s.side === 'away' ? 'stroke="#fff" stroke-width="2.5"' : ''}/>`).join('')}
  ${steps.map((s, i) => s.value === 2 ? `<polygon points="${starPoints(stepX(i), stepY(s.diff), 15)}" fill="${s.side === 'home' ? o.homeColor : o.awayColor}" stroke="#f4c430" stroke-width="2.5" stroke-linejoin="round" paint-order="stroke"/>` : '').join('')}
  <circle cx="110" cy="1640" r="6" fill="${o.homeColor}"/><text x="128" y="1648" fill="#b8c6da" font-size="20">${o.home} leidt</text>
  <circle cx="594" cy="1640" r="6" fill="${o.awayColor}" ${sameColors ? 'stroke="#fff" stroke-width="2"' : ''}/><text x="612" y="1648" fill="#b8c6da" font-size="20">${o.away} leidt</text>
  <polygon points="${starPoints(866, 1640, 9)}" fill="#f4c430"/><text x="884" y="1648" fill="#b8c6da" font-size="20">Rugworp</text>
  <text x="120" y="1680" fill="#8ea0bd" font-size="18">Eindstand in het voordeel van ${esc(leiderTekst)}</text>
  <line x1="64" y1="1792" x2="1016" y2="1792" stroke="#fff" stroke-opacity=".16"/>
  <rect x="64" y="1812" width="12" height="38" rx="6" fill="url(#win)"/>
  <text x="94" y="1840" fill="#f5f7fb" font-size="23" font-weight="700">${o.winner === 'draw' ? 'SAMEN BELEEFD.' : 'DIT MOMENT IS VAN ONS.'}</text>
  <text x="1016" y="1840" text-anchor="end" fill="#80baff" font-size="20">livescore.roodgries.be</text>
  </g></svg>`
}
