import { PDFDocument, type PDFFont, type PDFPage, StandardFonts, rgb } from 'pdf-lib'
import { formatDateTimeBE } from '../datetime'

// Genereert het officiële wedstrijdblad als professionele PDF (reglement Deel III).
// Bevat alles wat de aantekenaar volgens het reglement noteert (§5): de doelpunten mét nummer en
// naam van de scorende speler en het worptype, de time-outs per ploeg per helft, de kruisjes
// (laatste worpen rechtstreeks buiten), plus de vervangingen (§9), opstellingen met deelname,
// officials, materiële keuring, uitsluitingen/voorbehoud en de handtekeningen (Item 37).

export type PdfLineupRow = { rugnummer?: number; name: string; deelgenomen?: boolean; kapitein?: boolean }
export type PdfSignature = { naam?: string; akkoord?: boolean; tijdstip?: string; handtekening?: string; /** Niet van toepassing (bv. afwezige ploeg bij forfait), met de reden. */ nvt?: string }
export type PdfGoal = {
  half: number
  gameClock: number
  side: 'home' | 'away'
  shirtNumber: number
  playerName: string
  points: number
  /** Worptype: rugworp telt dubbel (reglement §6.6). */
  type?: 'nek' | 'rug'
}
export type PdfSubstitution = { half: number; gameClock: number; side: 'home' | 'away'; wissel: string }

export type MatchSheetPdfData = {
  titel: string
  datum: string
  categorie: string
  reeks?: string
  scheidsrechter?: string
  /** Terrein (accommodatie van de thuisclub). */
  terrein?: string
  /** Wedstrijdnummer (id), voor het archief. */
  wedstrijdNr?: string
  /** Status van het blad, bv. { label: 'Ingediend', op: '20/10/2026 16:05' }. */
  status?: { label: string; op?: string }
  score?: { home: number; away: number }
  /** Forfait: wie niet opdaagde, in woorden (bv. "Opwijk Heren niet opgedaagd"). Dan geen scorebord. */
  forfait?: string
  /** Scheidsrechterlijke bekrachtiging van de eindstand (officieel record, los van het start-akkoord). */
  eindscoreBevestiging?: { akkoord: boolean; naam?: string; tijdstip?: string }
  halfScores?: { home: [number, number]; away: [number, number] }
  /** Kruisjes: laatste worpen die rechtstreeks buitenspel veroorzaakten (reglement §6.7). */
  crosses?: { home: number; away: number }
  /** Time-outs per ploeg per helft (max. 2 p/ploeg p/helft, reglement §8.1). */
  timeouts?: { home: [number, number]; away: [number, number] }
  goals?: PdfGoal[]
  substitutions?: PdfSubstitution[]
  homeTeam: string
  awayTeam: string
  homeLineup: PdfLineupRow[]
  awayLineup: PdfLineupRow[]
  officials: { label: string; naam: string }[]
  keuring: { label: string; waarde: string }[]
  uitsluitingen: string[]
  voorbehoud: string[]
  opmerkingen?: string
  handtekeningen: { label: string; sig: PdfSignature }[]
}

/** Doelpunten per speler (meeste eerst), voor het blok "Doelpuntenmakers". */
export function scorersVan(goals: PdfGoal[], side: 'home' | 'away'): { nr: number; naam: string; punten: number; rug: number }[] {
  const per = new Map<string, { nr: number; naam: string; punten: number; rug: number }>()
  for (const g of goals) {
    if (g.side !== side) continue
    const k = `${g.shirtNumber}|${g.playerName}`
    const r = per.get(k) ?? { nr: g.shirtNumber, naam: g.playerName || 'Onbekend', punten: 0, rug: 0 }
    r.punten += g.points
    if (g.type === 'rug' || g.points >= 2) r.rug += 1
    per.set(k, r)
  }
  return [...per.values()].sort((a, b) => b.punten - a.punten || a.nr - b.nr)
}

// pdf-lib's StandardFonts (Helvetica) gebruiken WinAnsi-encoding en CRASHEN op glyphs die daar
// niet in zitten (bv. ✓ U+2713). Flemish namen (é, ë, ï, à …) zitten wél in WinAnsi (Latin-1).
// We mappen de bekende "mooie" Unicode-tekens en strippen al de rest, zodat genereren nooit faalt.
export function safe(text: string): string {
  return String(text)
    .replace(/[–—]/g, '-') // – —
    .replace(/[‘’′]/g, "'") // ' ' ′
    .replace(/[“”]/g, '"') // " "
    .replace(/✓/g, 'OK') // ✓
    .replace(/→/g, '->') // →
    .replace(/⇄/g, '<->') // ⇄
    .replace(/[•·]/g, '-') // • ·
    .replace(/ /g, ' ')
    .replace(/[^\x20-\x7E\xA1-\xFF]/g, '') // enkel ASCII + Latin-1 Supplement behouden
}

const A4: [number, number] = [595, 842]
const LEFT = 40
const RIGHT = A4[0] - 40
const WIDTH = RIGHT - LEFT
const TOP = A4[1] - 40
const BOTTOM = 60

const INK = rgb(0.08, 0.09, 0.12)
const DIM = rgb(0.42, 0.44, 0.5)
const RULE = rgb(0.8, 0.82, 0.86)
const SOFT = rgb(0.95, 0.96, 0.97)
const ACCENT = rgb(0.05, 0.42, 0.3)
const ACCENT_DARK = rgb(0.03, 0.22, 0.16)
const WHITE = rgb(1, 1, 1)
const GOOD = rgb(0.1, 0.55, 0.32)
const BAD = rgb(0.75, 0.2, 0.18)

const mmss = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`

export async function generateMatchSheetPdf(data: MatchSheetPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(safe(`Wedstrijdblad ${data.titel}`))
  doc.setAuthor('KVKBF - Krachtbal Live')
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  let page: PDFPage = doc.addPage(A4)
  let y = TOP

  const newPage = () => {
    page = doc.addPage(A4)
    y = TOP
  }
  // Zorg dat een blok van `h` punten nog op deze pagina past (anders nieuwe pagina).
  const ensure = (h: number) => {
    if (y - h < BOTTOM) newPage()
  }
  type Opts = { size?: number; b?: boolean; color?: ReturnType<typeof rgb>; f?: PDFFont }
  const width = (str: string, o: Opts = {}) => (o.f ?? (o.b ? bold : font)).widthOfTextAtSize(safe(str), o.size ?? 9.5)
  const text = (str: string, x: number, o: Opts = {}, atY = y) => {
    page.drawText(safe(str), { x, y: atY, size: o.size ?? 9.5, font: o.f ?? (o.b ? bold : font), color: o.color ?? INK })
  }
  const textR = (str: string, xRight: number, o: Opts = {}, atY = y) => text(str, xRight - width(str, o), o, atY)
  const textC = (str: string, xMid: number, o: Opts = {}, atY = y) => text(str, xMid - width(str, o) / 2, o, atY)
  const clip = (str: string, max: number) => (str.length > max ? `${str.slice(0, max - 1)}...` : str)
  // Tekst inkorten tot hij in `w` punten past.
  const fit = (str: string, w: number, o: Opts = {}) => {
    let s2 = safe(str)
    while (s2.length > 1 && width(s2, o) > w) s2 = s2.slice(0, -1)
    return s2.length < safe(str).length ? `${s2.slice(0, -2)}...` : s2
  }
  const line = (str: string, o: Opts & { gap?: number; x?: number } = {}) => {
    const gap = o.gap ?? (o.size ?? 9.5) + 5
    ensure(gap)
    text(str, o.x ?? LEFT, o)
    y -= gap
  }
  const box = (x: number, top: number, w: number, h: number, o: { fill?: ReturnType<typeof rgb>; border?: ReturnType<typeof rgb> } = {}) => {
    page.drawRectangle({ x, y: top - h, width: w, height: h, ...(o.fill ? { color: o.fill } : {}), ...(o.border ? { borderColor: o.border, borderWidth: 0.7 } : {}) })
  }
  // Sectietitel: groene balk links + titel — houdt titel en eerste regel samen op één pagina.
  const section = (title: string, minBody = 30) => {
    ensure(22 + minBody)
    y -= 8
    page.drawRectangle({ x: LEFT, y: y - 3, width: 3, height: 13, color: ACCENT })
    text(title.toUpperCase(), LEFT + 9, { size: 10, b: true, color: ACCENT_DARK })
    y -= 8
    page.drawLine({ start: { x: LEFT, y }, end: { x: RIGHT, y }, thickness: 0.6, color: RULE })
    y -= 14
  }

  // ── Kopband ───────────────────────────────────────────────────────────────
  const bandH = 58
  page.drawRectangle({ x: 0, y: A4[1] - bandH, width: A4[0], height: bandH, color: ACCENT_DARK })
  text('KVKBF  -  KRACHTBAL', LEFT, { size: 8, b: true, color: rgb(0.7, 0.85, 0.78) }, A4[1] - 22)
  text('OFFICIEEL WEDSTRIJDBLAD', LEFT, { size: 17, b: true, color: WHITE }, A4[1] - 43)
  if (data.wedstrijdNr) textR(`Wedstrijd nr. ${data.wedstrijdNr}`, RIGHT, { size: 8.5, color: rgb(0.7, 0.85, 0.78) }, A4[1] - 22)
  if (data.status) {
    const st = data.status.label.toUpperCase()
    const sw = width(st, { size: 9, b: true }) + 16
    page.drawRectangle({ x: RIGHT - sw, y: A4[1] - 47, width: sw, height: 17, color: WHITE })
    textR(st, RIGHT - 8, { size: 9, b: true, color: ACCENT_DARK }, A4[1] - 42)
  }
  y = A4[1] - bandH - 22

  // ── Wedstrijd en gegevens ────────────────────────────────────────────────
  line(`${data.homeTeam}  -  ${data.awayTeam}`, { size: 14, b: true, gap: 16 })
  const info: [string, string][] = [
    ['Datum en aftrap', data.datum],
    ['Terrein', data.terrein || '-'],
    ['Reeks', [data.reeks, data.categorie].filter(Boolean).join(' - ') || '-'],
    ['Scheidsrechter', data.scheidsrechter || '-'],
  ]
  const infoH = 34
  box(LEFT, y, WIDTH, infoH, { fill: SOFT })
  const gewicht = [1.5, 1.1, 0.9, 1]
  const totaalGewicht = gewicht.reduce((a, b) => a + b, 0)
  let cx = LEFT + 10
  info.forEach(([k, v], i) => {
    const colW = (WIDTH * gewicht[i]) / totaalGewicht
    text(k.toUpperCase(), cx, { size: 6.5, b: true, color: DIM }, y - 12)
    text(fit(v, colW - 14, { size: 9, b: true }), cx, { size: 9, b: true }, y - 25)
    cx += colW
  })
  y -= infoH + 14

  // ── Uitslag ───────────────────────────────────────────────────────────────
  if (data.score) {
    ensure(86)
    const panelH = 70
    box(LEFT, y, WIDTH, panelH, { border: RULE })
    const mid = (LEFT + RIGHT) / 2
    const scoreTxt = `${data.score.home}  -  ${data.score.away}`
    const sw = width(scoreTxt, { size: 26, b: true }) + 28
    page.drawRectangle({ x: mid - sw / 2, y: y - 46, width: sw, height: 34, color: ACCENT_DARK })
    textC(scoreTxt, mid, { size: 26, b: true, color: WHITE }, y - 38)
    const naamW = mid - sw / 2 - LEFT - 20
    text('THUIS', LEFT + 12, { size: 6.5, b: true, color: DIM }, y - 18)
    text(fit(data.homeTeam, naamW, { size: 12, b: true }), LEFT + 12, { size: 12, b: true }, y - 33)
    textR('UIT', RIGHT - 12, { size: 6.5, b: true, color: DIM }, y - 18)
    const away = fit(data.awayTeam, naamW, { size: 12, b: true })
    textR(away, RIGHT - 12, { size: 12, b: true }, y - 33)
    const sub: string[] = []
    if (data.forfait) sub.push(`Forfait: ${data.forfait}`)
    else if (data.halfScores) sub.push(`Rust ${data.halfScores.home[0]}-${data.halfScores.away[0]}   -   2e helft ${data.halfScores.home[1]}-${data.halfScores.away[1]}`)
    if (data.crosses && !data.forfait) sub.push(`Kruisjes ${data.crosses.home}-${data.crosses.away}`)
    if (data.timeouts && !data.forfait) sub.push(`Time-outs ${data.timeouts.home[0] + data.timeouts.home[1]}-${data.timeouts.away[0] + data.timeouts.away[1]}`)
    if (sub.length) textC(sub.join('     |     '), mid, { size: 8, color: DIM }, y - 60)
    y -= panelH + 10
    // Kruisjes en time-outs per helft, zoals het reglement ze vraagt (§6.7, §8.1).
    if (data.timeouts && !data.forfait) {
      line(`Time-outs per helft (H1/H2): thuis ${data.timeouts.home[0]}/${data.timeouts.home[1]}  -  uit ${data.timeouts.away[0]}/${data.timeouts.away[1]}.  Kruisjes = laatste worp rechtstreeks buiten.`, { size: 7.5, color: DIM, gap: 11 })
    }
  }

  // ── Scheidsrechterlijke bekrachtiging van de eindstand (officieel record) ──
  if (data.eindscoreBevestiging) {
    const e = data.eindscoreBevestiging
    if (e.akkoord) {
      const wie = [e.naam ? `door ${e.naam}` : null, e.tijdstip ? `op ${e.tijdstip}` : null].filter(Boolean).join(' ')
      line(`Eindstand scheidsrechterlijk bevestigd${wie ? ` ${wie}` : ''}.`, { size: 9, b: true, color: ACCENT, gap: 13 })
    } else {
      line('Eindstand nog niet scheidsrechterlijk bevestigd.', { size: 9, color: DIM, gap: 13 })
    }
  }

  // ── Opstellingen: twee tabellen naast elkaar ─────────────────────────────
  section('Opstellingen', 40)
  const half = (WIDTH - 16) / 2
  const colAwayX = LEFT + half + 16
  const rowH = 14
  const tabelKop = (x: number, titel: string) => {
    box(x, y, half, 16, { fill: ACCENT_DARK })
    text(fit(titel, half - 70, { size: 8.5, b: true }), x + 6, { size: 8.5, b: true, color: WHITE }, y - 11)
    textR('GESPEELD', x + half - 6, { size: 6.5, b: true, color: rgb(0.7, 0.85, 0.78) }, y - 11)
  }
  ensure(16 + rowH * 2)
  tabelKop(LEFT, `Thuis - ${data.homeTeam}`)
  tabelKop(colAwayX, `Uit - ${data.awayTeam}`)
  y -= 16
  const rows = Math.max(data.homeLineup.length, data.awayLineup.length, 1)
  const cel = (x: number, r: PdfLineupRow | undefined, i: number, leeg: boolean) => {
    if (i % 2 === 1) box(x, y, half, rowH, { fill: SOFT })
    if (leeg && i === 0) {
      text('(geen opstelling)', x + 6, { size: 8.5, color: DIM }, y - 10)
      return
    }
    if (!r) return
    textR(String(r.rugnummer ?? '-'), x + 22, { size: 8.5, b: true }, y - 10)
    const naam = `${r.name}${r.kapitein ? '  (K)' : ''}`
    text(fit(naam, half - 80, { size: 8.5 }), x + 30, { size: 8.5, b: Boolean(r.kapitein) }, y - 10)
    textR(r.deelgenomen ? 'ja' : '-', x + half - 6, { size: 8.5, b: Boolean(r.deelgenomen), color: r.deelgenomen ? GOOD : DIM }, y - 10)
  }
  for (let i = 0; i < rows; i++) {
    ensure(rowH)
    cel(LEFT, data.homeLineup[i], i, data.homeLineup.length === 0)
    cel(colAwayX, data.awayLineup[i], i, data.awayLineup.length === 0)
    y -= rowH
  }
  y -= 12
  line('(K) = kapitein  -  gespeeld = effectief deelgenomen, bevestigd door de scheidsrechter', { size: 7.5, color: DIM, gap: 10 })

  // ── Doelpuntenmakers ─────────────────────────────────────────────────────
  const goals = data.goals ?? []
  if (goals.length && !data.forfait) {
    section('Doelpuntenmakers', 30)
    const thuis = scorersVan(goals, 'home')
    const uit = scorersVan(goals, 'away')
    const n = Math.max(thuis.length, uit.length)
    const scorer = (x: number, r: (typeof thuis)[number] | undefined) => {
      if (!r) return
      textR(r.nr > 0 ? String(r.nr) : '?', x + 22, { size: 8.5, b: true })
      text(fit(r.naam, half - 110, { size: 8.5 }), x + 30, { size: 8.5 })
      textR(`${r.punten} ${r.punten === 1 ? 'punt' : 'ptn'}${r.rug ? `  (${r.rug}x rug)` : ''}`, x + half - 6, { size: 8.5, b: true })
    }
    for (let i = 0; i < n; i++) {
      ensure(12)
      scorer(LEFT, thuis[i])
      scorer(colAwayX, uit[i])
      y -= 12
    }
  }

  // ── Scorebord (zoals het papieren blad): vier vakjesbalken + totaal ──────
  // Per helft en per ploeg een balk met voorgedrukte scorecijfers (1, 2, 3 …) die gevuld raken
  // tot de stand. Het RUGNUMMER van de scorer staat ONDER het vak dat hij scoorde; bij een
  // rugworp (+2) verbindt een akolade de twee vakken, met het rugnummer eronder — precies zoals
  // vroeger op papier. De balk groeit per rij van 25, dus ook 50–50 blijft compact.
  if (data.forfait) {
    section('Uitslag bij forfait', 14)
    line(`${data.forfait}. Uitslag volgens het reglement: ${data.score?.home ?? 0} - ${data.score?.away ?? 0}.`, { size: 9.5, b: true })
  } else {
    section('Scorebord', 40)
    const PER_ROW = 25
    const BOX_W = WIDTH / PER_ROW
    const BOX_H = 13
    const UNDER_H = 18
    const REACHED_FILL = rgb(0.86, 0.94, 0.9)
    const drawTrack = (label: string, goalsFor: PdfGoal[]) => {
      // Elke goal markeert zijn vak(ken): positie = lopende score, span = punten (rugworp: 2).
      const marks: { pos: number; span: number; nr: string }[] = []
      let p = 0
      for (const g of goalsFor) {
        const span = Math.max(1, g.points)
        marks.push({ pos: p + 1, span, nr: g.shirtNumber > 0 ? String(g.shirtNumber) : '?' })
        p += span
      }
      const score = p
      const rows2 = Math.max(1, Math.ceil(score / PER_ROW))
      ensure(13 + rows2 * (BOX_H + UNDER_H + 2) + 4)
      text(label, LEFT, { size: 8.5, b: true })
      textR(String(score), RIGHT, { size: 10, b: true })
      y -= 12
      for (let r = 0; r < rows2; r++) {
        const rowTop = y
        for (let c = 0; c < PER_ROW; c++) {
          const idx = r * PER_ROW + c + 1
          const x = LEFT + c * BOX_W
          const reached = idx <= score
          page.drawRectangle({ x, y: rowTop - BOX_H, width: BOX_W, height: BOX_H, borderColor: RULE, borderWidth: 0.6, ...(reached ? { color: REACHED_FILL } : {}) })
          const t = String(idx)
          const f = reached ? bold : font
          page.drawText(t, { x: x + BOX_W / 2 - f.widthOfTextAtSize(t, 7) / 2, y: rowTop - BOX_H + 3.5, size: 7, font: f, color: reached ? INK : RULE })
        }
        const underTop = rowTop - BOX_H
        const rowFirst = r * PER_ROW + 1
        const rowLast = (r + 1) * PER_ROW
        for (const m of marks) {
          const a = Math.max(m.pos, rowFirst)
          const b = Math.min(m.pos + m.span - 1, rowLast)
          if (a > b) continue
          const x1 = LEFT + ((a - rowFirst) % PER_ROW) * BOX_W + 1.5
          const x2 = LEFT + ((b - rowFirst) % PER_ROW + 1) * BOX_W - 1.5
          const mid = (x1 + x2) / 2
          if (m.span >= 2) {
            const by = underTop - 4
            page.drawLine({ start: { x: x1, y: underTop - 1.5 }, end: { x: x1, y: by }, thickness: 0.8, color: INK })
            page.drawLine({ start: { x: x1, y: by }, end: { x: x2, y: by }, thickness: 0.8, color: INK })
            page.drawLine({ start: { x: x2, y: underTop - 1.5 }, end: { x: x2, y: by }, thickness: 0.8, color: INK })
            page.drawLine({ start: { x: mid, y: by }, end: { x: mid, y: by - 2.5 }, thickness: 0.8, color: INK })
          }
          const t = safe(m.nr)
          page.drawText(t, { x: mid - bold.widthOfTextAtSize(t, 8) / 2, y: underTop - 13, size: 8, font: bold, color: INK })
        }
        y = rowTop - BOX_H - UNDER_H
      }
      y -= 10
    }
    const goalsOf = (side: 'home' | 'away', h: 1 | 2) => goals.filter((g) => g.side === side && (h === 1 ? g.half <= 1 : g.half >= 2))
    drawTrack(`1e helft - ${clip(data.homeTeam, 34)}`, goalsOf('home', 1))
    drawTrack(`1e helft - ${clip(data.awayTeam, 34)}`, goalsOf('away', 1))
    drawTrack(`2e helft - ${clip(data.homeTeam, 34)}`, goalsOf('home', 2))
    drawTrack(`2e helft - ${clip(data.awayTeam, 34)}`, goalsOf('away', 2))
    const totHome = goals.filter((g) => g.side === 'home').reduce((s2, g) => s2 + g.points, 0)
    const totAway = goals.filter((g) => g.side === 'away').reduce((s2, g) => s2 + g.points, 0)
    ensure(16)
    text('Totaal', LEFT, { size: 10, b: true })
    textR(`${data.score?.home ?? totHome} - ${data.score?.away ?? totAway}`, RIGHT, { size: 11, b: true })
    y -= 15
    line('Vakjes = lopende score (gevuld tot de stand)  -  rugnummer van de scorer onder zijn vak  -  akolade onder 2 vakken = rugworp (+2)', { size: 7.5, color: DIM, gap: 12 })
  }

  // ── Vervangingen (reglement §9) ──────────────────────────────────────────
  section('Vervangingen', 14)
  if (!data.substitutions || data.substitutions.length === 0) {
    line('Geen vervangingen genoteerd.', { color: DIM, size: 9 })
  } else {
    for (const sb of data.substitutions) {
      ensure(12)
      text(`${sb.half}e helft`, LEFT, { size: 9 })
      text(mmss(sb.gameClock), LEFT + 52, { size: 9 })
      text(clip(sb.side === 'home' ? data.homeTeam : data.awayTeam, 28), LEFT + 92, { size: 9 })
      text(clip(sb.wissel, 52), LEFT + 235, { size: 9 })
      y -= 12
    }
  }

  // ── Officials ────────────────────────────────────────────────────────────
  const ingevuldeOfficials = data.officials.filter((o) => o.naam.trim())
  section('Officials', 14)
  if (ingevuldeOfficials.length === 0) {
    line('Geen officials genoteerd.', { color: DIM, size: 9 })
  } else {
    for (let i = 0; i < ingevuldeOfficials.length; i += 2) {
      ensure(12)
      for (const [o, x] of [[ingevuldeOfficials[i], LEFT], [ingevuldeOfficials[i + 1], colAwayX]] as const) {
        if (!o) continue
        text(`${o.label}:`, x, { size: 9, color: DIM })
        text(o.naam, x + 4 + width(`${o.label}:`, { size: 9 }), { size: 9, b: true })
      }
      y -= 12
    }
  }

  // ── Materiële keuring ────────────────────────────────────────────────────
  section('Materiële keuring', 14)
  for (let i = 0; i < data.keuring.length; i += 3) {
    ensure(12)
    for (let j = 0; j < 3; j++) {
      const k = data.keuring[i + j]
      if (!k) continue
      const x = LEFT + j * (WIDTH / 3)
      const ok = k.waarde === 'ok'
      text(`${k.label}:`, x, { size: 8.5, color: DIM })
      text(ok ? 'OK' : k.waarde === 'niet_ok' ? 'NIET OK' : k.waarde, x + 4 + width(`${k.label}:`, { size: 8.5 }), { size: 8.5, b: true, color: ok ? GOOD : BAD })
    }
    y -= 12
  }

  // ── Uitsluitingen / voorbehoud / opmerkingen ─────────────────────────────
  if (data.uitsluitingen.length) {
    section('Uitsluitingen', 14)
    data.uitsluitingen.forEach((u) => line(u, { size: 9 }))
  }
  if (data.voorbehoud.length) {
    section('Voorbehoud', 14)
    data.voorbehoud.forEach((v) => line(v, { size: 9 }))
  }
  if (data.opmerkingen) {
    section('Opmerkingen en kwetsuren', 14)
    for (const regel of data.opmerkingen.split(/\r?\n/)) {
      for (let k = 0; k < regel.length || k === 0; k += 110) line(regel.slice(k, k + 110), { size: 9, gap: 12 })
    }
  }

  // ── Handtekeningen: drie vakken naast elkaar ─────────────────────────────
  const sigH = 104
  section('Handtekeningen', sigH)
  const n = Math.max(1, data.handtekeningen.length)
  const gap = 10
  const sigW = (WIDTH - gap * (n - 1)) / n
  for (const [i, h] of data.handtekeningen.entries()) {
    const x = LEFT + i * (sigW + gap)
    const s2 = h.sig
    box(x, y, sigW, sigH, { border: s2.akkoord ? GOOD : RULE, ...(s2.nvt ? { fill: SOFT } : {}) })
    text(h.label.toUpperCase(), x + 8, { size: 6.5, b: true, color: DIM }, y - 12)
    // Handtekening in het vak, of een lege lijn om op papier te tekenen.
    const imgTop = y - 18
    const imgH = 44
    const getekend = await drawSignatureInBox(doc, page, s2.handtekening, x + 8, imgTop - imgH, sigW - 16, imgH)
    page.drawLine({ start: { x: x + 8, y: imgTop - imgH - 3 }, end: { x: x + sigW - 8, y: imgTop - imgH - 3 }, thickness: 0.6, color: RULE })
    if (!getekend && !s2.akkoord && !s2.nvt) text('handtekening', x + 8, { size: 6.5, color: RULE }, imgTop - imgH + 2)
    text(fit(s2.naam || (s2.nvt ? '-' : '...........................'), sigW - 16, { size: 9.5, b: true }), x + 8, { size: 9.5, b: true }, y - 80)
    if (s2.nvt) {
      text(fit(s2.nvt, sigW - 16, { size: 7.5, b: true }), x + 8, { size: 7.5, b: true, color: DIM }, y - 94)
    } else if (s2.akkoord) {
      text(fit(`Akkoord${s2.tijdstip ? `  -  ${s2.tijdstip}` : ''}`, sigW - 16, { size: 7.5, b: true }), x + 8, { size: 7.5, b: true, color: GOOD }, y - 94)
    } else {
      text('Nog niet getekend', x + 8, { size: 7.5, b: true, color: BAD }, y - 94)
    }
  }
  y -= sigH + 10

  // ── Voettekst met paginanummers (na-bewerking over alle pagina's) ────────
  const pages = doc.getPages()
  const links = ['Digitaal wedstrijdblad KVKBF', data.wedstrijdNr ? `wedstrijd ${data.wedstrijdNr}` : null, data.status ? `${data.status.label.toLowerCase()}${data.status.op ? ` op ${data.status.op}` : ''}` : null]
    .filter(Boolean)
    .join('  -  ')
  const stamp = `Gegenereerd op ${formatDateTimeBE(new Date())}`
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: LEFT, y: BOTTOM - 16 }, end: { x: RIGHT, y: BOTTOM - 16 }, thickness: 0.5, color: RULE })
    p.drawText(safe(links), { x: LEFT, y: BOTTOM - 28, size: 7.5, font: bold, color: DIM })
    p.drawText(safe(stamp), { x: LEFT, y: BOTTOM - 38, size: 7, font, color: DIM })
    const pn = `Pagina ${i + 1}/${pages.length}`
    p.drawText(pn, { x: RIGHT - font.widthOfTextAtSize(pn, 7.5), y: BOTTOM - 28, size: 7.5, font, color: DIM })
  })

  return doc.save()
}

// Bedt de getekende handtekening (canvas data-URL) in het vak in, met behoud van verhouding. Geeft
// false terug (en tekent niets) als de data-URL ontbreekt of ongeldig is: de PDF crasht nooit.
async function drawSignatureInBox(doc: PDFDocument, page: PDFPage, dataUrl: string | undefined, x: number, yBottom: number, w: number, h: number): Promise<boolean> {
  if (!dataUrl || !dataUrl.startsWith('data:image/')) return false
  try {
    const b64 = dataUrl.split(',')[1]
    if (!b64) return false
    const bytes = Buffer.from(b64, 'base64')
    const img = dataUrl.includes('image/png') ? await doc.embedPng(bytes) : await doc.embedJpg(bytes)
    const schaal = Math.min(w / img.width, h / img.height)
    const iw = img.width * schaal
    const ih = img.height * schaal
    page.drawImage(img, { x: x + (w - iw) / 2, y: yBottom + (h - ih) / 2, width: iw, height: ih })
    return true
  } catch {
    return false
  }
}
