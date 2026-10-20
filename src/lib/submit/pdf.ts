import { PDFDocument, type PDFFont, type PDFPage, StandardFonts, rgb } from 'pdf-lib'
import { formatDateTimeBE } from '../datetime'

// Genereert het officiële wedstrijdblad als professionele PDF (reglement Deel III).
// Bevat alles wat de aantekenaar volgens het reglement noteert (§5): de doelpunten mét nummer en
// naam van de scorende speler en het worptype, de time-outs per ploeg per helft, de kruisjes
// (laatste worpen rechtstreeks buiten), plus de vervangingen (§9), opstellingen met deelname,
// officials, materiële keuring, uitsluitingen/voorbehoud en de handtekeningen (Item 37).

export type PdfLineupRow = { rugnummer?: number; name: string; deelgenomen?: boolean }
export type PdfSignature = { naam?: string; akkoord?: boolean; tijdstip?: string; handtekening?: string }
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
  score?: { home: number; away: number }
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
const TOP = A4[1] - 46
const BOTTOM = 56

const INK = rgb(0.08, 0.09, 0.12)
const DIM = rgb(0.42, 0.44, 0.5)
const RULE = rgb(0.78, 0.8, 0.84)
const ACCENT = rgb(0.05, 0.45, 0.32)

const mmss = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`

export async function generateMatchSheetPdf(data: MatchSheetPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
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

  const text = (
    str: string,
    x: number,
    opts: { size?: number; b?: boolean; color?: ReturnType<typeof rgb>; f?: PDFFont } = {},
  ) => {
    page.drawText(safe(str), { x, y, size: opts.size ?? 9.5, font: opts.f ?? (opts.b ? bold : font), color: opts.color ?? INK })
  }
  const line = (str: string, opts: { size?: number; b?: boolean; color?: ReturnType<typeof rgb>; gap?: number; x?: number } = {}) => {
    const size = opts.size ?? 9.5
    const gap = opts.gap ?? size + 5
    ensure(gap)
    text(str, opts.x ?? LEFT, opts)
    y -= gap
  }
  const rule = (color = RULE) => {
    page.drawLine({ start: { x: LEFT, y: y + 3 }, end: { x: RIGHT, y: y + 3 }, thickness: 0.7, color })
    y -= 6
  }
  // Sectietitel met lijn eronder — houdt titel en eerste regel samen op één pagina.
  const section = (title: string) => {
    ensure(34)
    y -= 6
    text(title.toUpperCase(), LEFT, { size: 10, b: true, color: ACCENT })
    y -= 6
    rule()
    y -= 6
  }
  const clip = (str: string, max: number) => (str.length > max ? `${str.slice(0, max - 1)}…` : str)

  // ── Kop ───────────────────────────────────────────────────────────────────
  text('OFFICIEEL WEDSTRIJDBLAD', LEFT, { size: 9, b: true, color: DIM })
  text('KVKBF — Krachtbal', RIGHT - bold.widthOfTextAtSize('KVKBF — Krachtbal', 9), { size: 9, b: true, color: DIM })
  y -= 16
  line(data.titel, { size: 15, b: true, gap: 19 })
  line(
    [data.datum, data.categorie, data.reeks ? `reeks ${data.reeks}` : null, data.scheidsrechter ? `SR: ${data.scheidsrechter}` : null]
      .filter(Boolean)
      .join('   ·   '),
    { color: DIM, gap: 14 },
  )
  rule(RULE)
  y -= 4

  // ── Uitslag ───────────────────────────────────────────────────────────────
  if (data.score) {
    ensure(60)
    const scoreTxt = `${data.score.home} – ${data.score.away}`
    const w = bold.widthOfTextAtSize(safe(scoreTxt), 22)
    const mid = (LEFT + RIGHT) / 2
    text(scoreTxt, mid - w / 2, { size: 22, b: true })
    text(clip(data.homeTeam, 30), LEFT, { size: 11, b: true })
    const awayName = clip(data.awayTeam, 30)
    text(awayName, RIGHT - bold.widthOfTextAtSize(safe(awayName), 11), { size: 11, b: true })
    y -= 20
    // Per helft (Item 19: de scheidsrechter stelt de score per helft vast) + reglementtellers.
    const sub: string[] = []
    if (data.halfScores) {
      sub.push(`Per helft: ${data.halfScores.home[0]}–${data.halfScores.away[0]} / ${data.halfScores.home[1]}–${data.halfScores.away[1]}`)
    }
    if (data.crosses) sub.push(`Kruisjes (laatste worp rechtstreeks buiten): thuis ${data.crosses.home} · uit ${data.crosses.away}`)
    if (data.timeouts) {
      sub.push(
        `Time-outs (H1/H2): thuis ${data.timeouts.home[0]}/${data.timeouts.home[1]} · uit ${data.timeouts.away[0]}/${data.timeouts.away[1]}`,
      )
    }
    for (const s of sub) line(s, { size: 8.5, color: DIM, gap: 11, x: LEFT })
  }

  // ── Scheidsrechterlijke bekrachtiging van de eindstand (officieel record) ──
  // Los van het start-akkoord (§12/§19): pas hiermee is de uitslag officieel bekrachtigd.
  if (data.eindscoreBevestiging) {
    const e = data.eindscoreBevestiging
    if (e.akkoord) {
      const wie = [e.naam ? `door ${e.naam}` : null, e.tijdstip ? `op ${e.tijdstip}` : null].filter(Boolean).join(' ')
      line(`Eindstand scheidsrechterlijk bevestigd${wie ? ` ${wie}` : ''}.`, { size: 9, b: true, color: ACCENT, gap: 13 })
    } else {
      line('Eindstand nog niet scheidsrechterlijk bevestigd.', { size: 9, color: DIM, gap: 13 })
    }
  }

  // ── Opstellingen (twee kolommen naast elkaar) ────────────────────────────
  section('Opstellingen')
  const colAwayX = (LEFT + RIGHT) / 2 + 10
  ensure(14)
  text(clip(`Thuis — ${data.homeTeam}`, 42), LEFT, { size: 9.5, b: true })
  text(clip(`Uit — ${data.awayTeam}`, 42), colAwayX, { size: 9.5, b: true })
  y -= 13
  const rows = Math.max(data.homeLineup.length, data.awayLineup.length, 1)
  const lineupCell = (r: PdfLineupRow | undefined) =>
    r ? `${String(r.rugnummer ?? '–').padStart(2)}  ${clip(r.name, 30)}${r.deelgenomen ? '  (O)' : ''}` : ''
  for (let i = 0; i < rows; i++) {
    ensure(12)
    if (data.homeLineup.length === 0 && i === 0) text('(geen opstelling)', LEFT, { color: DIM })
    else text(lineupCell(data.homeLineup[i]), LEFT, {})
    if (data.awayLineup.length === 0 && i === 0) text('(geen opstelling)', colAwayX, { color: DIM })
    else text(lineupCell(data.awayLineup[i]), colAwayX, {})
    y -= 12
  }
  line('(O) = effectief deelgenomen', { size: 7.5, color: DIM, gap: 10 })

  // ── Scorebord (zoals het papieren blad): vier vakjesbalken + totaal ──────
  // Per helft en per ploeg een balk met voorgedrukte scorecijfers (1, 2, 3 …) die gevuld raken
  // tot de stand. Het RUGNUMMER van de scorer staat ONDER het vak dat hij scoorde; bij een
  // rugworp (+2) verbindt een akolade de twee vakken, met het rugnummer eronder — precies zoals
  // vroeger op papier. De balk groeit per rij van 25, dus ook 50–50 blijft compact.
  section('Scorebord')
  const PER_ROW = 25
  const BOX_W = (RIGHT - LEFT) / PER_ROW
  const BOX_H = 13
  const UNDER_H = 18
  const REACHED_FILL = rgb(0.9, 0.96, 0.93)
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
    const rows = Math.max(1, Math.ceil(score / PER_ROW))
    ensure(13 + rows * (BOX_H + UNDER_H + 2) + 4)
    text(label, LEFT, { size: 9, b: true })
    const scoreTxt = String(score)
    text(scoreTxt, RIGHT - bold.widthOfTextAtSize(scoreTxt, 10), { size: 10, b: true })
    y -= 12
    for (let r = 0; r < rows; r++) {
      const rowTop = y
      // Vakkenrij: voorgedrukte scorecijfers; gevuld (groen + zwart cijfer) tot de stand.
      for (let c = 0; c < PER_ROW; c++) {
        const idx = r * PER_ROW + c + 1
        const x = LEFT + c * BOX_W
        const reached = idx <= score
        page.drawRectangle({
          x,
          y: rowTop - BOX_H,
          width: BOX_W,
          height: BOX_H,
          borderColor: RULE,
          borderWidth: 0.6,
          ...(reached ? { color: REACHED_FILL } : {}),
        })
        const t = String(idx)
        const f = reached ? bold : font
        page.drawText(t, {
          x: x + BOX_W / 2 - f.widthOfTextAtSize(t, 7) / 2,
          y: rowTop - BOX_H + 3.5,
          size: 7,
          font: f,
          color: reached ? INK : RULE,
        })
      }
      // Onder-rij: rugnummer van de scorer onder zijn vak; akolade onder de 2 vakken van een rugworp.
      const underTop = rowTop - BOX_H
      const rowFirst = r * PER_ROW + 1
      const rowLast = (r + 1) * PER_ROW
      for (const m of marks) {
        const a = Math.max(m.pos, rowFirst)
        const b = Math.min(m.pos + m.span - 1, rowLast)
        if (a > b) continue // valt niet in deze rij
        const x1 = LEFT + ((a - rowFirst) % PER_ROW) * BOX_W + 1.5
        const x2 = LEFT + ((b - rowFirst) % PER_ROW + 1) * BOX_W - 1.5
        const mid = (x1 + x2) / 2
        if (m.span >= 2) {
          // Akolade-beugel: twee pootjes + dwarslijn + middentik richting het rugnummer.
          const by = underTop - 4
          page.drawLine({ start: { x: x1, y: underTop - 1.5 }, end: { x: x1, y: by }, thickness: 0.8, color: INK })
          page.drawLine({ start: { x: x1, y: by }, end: { x: x2, y: by }, thickness: 0.8, color: INK })
          page.drawLine({ start: { x: x2, y: underTop - 1.5 }, end: { x: x2, y: by }, thickness: 0.8, color: INK })
          page.drawLine({ start: { x: mid, y: by }, end: { x: mid, y: by - 2.5 }, thickness: 0.8, color: INK })
        }
        const t = safe(m.nr)
        page.drawText(t, {
          x: mid - bold.widthOfTextAtSize(t, 8) / 2,
          y: underTop - 13,
          size: 8,
          font: bold,
          color: INK,
        })
      }
      y = rowTop - BOX_H - UNDER_H
    }
    y -= 5
  }
  const goalsOf = (side: 'home' | 'away', half: 1 | 2) =>
    (data.goals ?? []).filter((g) => g.side === side && (half === 1 ? g.half <= 1 : g.half >= 2))
  drawTrack(`1e helft — ${clip(data.homeTeam, 34)}`, goalsOf('home', 1))
  drawTrack(`1e helft — ${clip(data.awayTeam, 34)}`, goalsOf('away', 1))
  drawTrack(`2e helft — ${clip(data.homeTeam, 34)}`, goalsOf('home', 2))
  drawTrack(`2e helft — ${clip(data.awayTeam, 34)}`, goalsOf('away', 2))
  const totHome = (data.goals ?? []).filter((g) => g.side === 'home').reduce((s, g) => s + g.points, 0)
  const totAway = (data.goals ?? []).filter((g) => g.side === 'away').reduce((s, g) => s + g.points, 0)
  ensure(16)
  text('Totaal', LEFT, { size: 10, b: true })
  const totTxt = `${data.score?.home ?? totHome} – ${data.score?.away ?? totAway}`
  text(totTxt, RIGHT - bold.widthOfTextAtSize(safe(totTxt), 11), { size: 11, b: true })
  y -= 15
  line('Vakjes = lopende score (gevuld tot de stand) · rugnummer van de scorer staat onder zijn vak · akolade onder 2 vakken = rugworp (+2)', {
    size: 7.5,
    color: DIM,
    gap: 12,
  })

  // ── Vervangingen (reglement §9) ──────────────────────────────────────────
  section('Vervangingen')
  if (!data.substitutions || data.substitutions.length === 0) {
    line('Geen vervangingen genoteerd.', { color: DIM })
  } else {
    for (const s of data.substitutions) {
      ensure(12)
      text(`${s.half}e`, LEFT, { size: 9 })
      text(mmss(s.gameClock), LEFT + 34, { size: 9 })
      text(clip(s.side === 'home' ? data.homeTeam : data.awayTeam, 28), LEFT + 70, { size: 9 })
      text(clip(s.wissel, 52), LEFT + 215, { size: 9 })
      y -= 12
    }
  }

  // ── Officials ────────────────────────────────────────────────────────────
  const ingevuldeOfficials = data.officials.filter((o) => o.naam.trim())
  section('Officials')
  if (ingevuldeOfficials.length === 0) {
    line('Geen officials genoteerd.', { color: DIM })
  } else {
    // Twee kolommen om plaats te sparen.
    for (let i = 0; i < ingevuldeOfficials.length; i += 2) {
      ensure(12)
      const a = ingevuldeOfficials[i]
      const b = ingevuldeOfficials[i + 1]
      // +3pt: pdf-lib telt een afsluitende spatie niet altijd mee in de tekstbreedte.
      text(`${a.label}: `, LEFT, { size: 9, color: DIM })
      text(a.naam, LEFT + 3 + font.widthOfTextAtSize(safe(`${a.label}: `), 9), { size: 9, b: true })
      if (b) {
        text(`${b.label}: `, colAwayX, { size: 9, color: DIM })
        text(b.naam, colAwayX + 3 + font.widthOfTextAtSize(safe(`${b.label}: `), 9), { size: 9, b: true })
      }
      y -= 12
    }
  }

  // ── Materiële keuring ────────────────────────────────────────────────────
  section('Materiële keuring')
  const keuringTxt = data.keuring.map((k) => `${k.label}: ${k.waarde === 'ok' ? 'OK' : k.waarde === 'niet_ok' ? 'NIET OK' : k.waarde}`)
  for (let i = 0; i < keuringTxt.length; i += 3) {
    ensure(12)
    text(keuringTxt[i] ?? '', LEFT, { size: 8.5 })
    if (keuringTxt[i + 1]) text(keuringTxt[i + 1], LEFT + 175, { size: 8.5 })
    if (keuringTxt[i + 2]) text(keuringTxt[i + 2], LEFT + 350, { size: 8.5 })
    y -= 12
  }

  // ── Uitsluitingen / voorbehoud / opmerkingen ─────────────────────────────
  if (data.uitsluitingen.length) {
    section('Uitsluitingen')
    data.uitsluitingen.forEach((u) => line(u, { size: 9 }))
  }
  if (data.voorbehoud.length) {
    section('Voorbehoud')
    data.voorbehoud.forEach((v) => line(v, { size: 9 }))
  }
  if (data.opmerkingen) {
    section('Opmerkingen / kwetsuren')
    line(data.opmerkingen, { size: 9 })
  }

  // ── Handtekeningen ───────────────────────────────────────────────────────
  section('Handtekeningen')
  for (const h of data.handtekeningen) {
    const s = h.sig
    line(`${h.label}: ${s.naam ?? '—'}  ${s.akkoord ? '— akkoord' : '— niet getekend'}${s.tijdstip ? `  (${s.tijdstip})` : ''}`, {
      size: 9,
      b: Boolean(s.akkoord),
    })
    await drawSignatureImage(doc, () => page, () => y, (v) => (y = v), newPage, LEFT, BOTTOM, s.handtekening)
  }

  // ── Voettekst met paginanummers (na-bewerking over alle pagina's) ────────
  const pages = doc.getPages()
  const stamp = `Digitaal wedstrijdblad — gegenereerd ${formatDateTimeBE(new Date())}`
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: LEFT, y: BOTTOM - 14 }, end: { x: RIGHT, y: BOTTOM - 14 }, thickness: 0.5, color: RULE })
    p.drawText(safe(stamp), { x: LEFT, y: BOTTOM - 26, size: 7.5, font, color: DIM })
    const pn = `Pagina ${i + 1}/${pages.length}`
    p.drawText(pn, { x: RIGHT - font.widthOfTextAtSize(pn, 7.5), y: BOTTOM - 26, size: 7.5, font, color: DIM })
  })

  return doc.save()
}

// Bedt de getekende handtekening (canvas data-URL) in onder het label. Faalt stil terug op
// enkel de tekstregel als de data-URL ontbreekt of ongeldig is (nooit de PDF laten crashen).
async function drawSignatureImage(
  doc: PDFDocument,
  getPage: () => PDFPage,
  getY: () => number,
  setY: (v: number) => void,
  newPage: () => void,
  left: number,
  bottom: number,
  dataUrl?: string,
): Promise<void> {
  if (!dataUrl || !dataUrl.startsWith('data:image/')) return
  try {
    const isPng = dataUrl.includes('image/png')
    const b64 = dataUrl.split(',')[1]
    if (!b64) return
    const bytes = Buffer.from(b64, 'base64')
    const img = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes)
    const w = 120
    const h = (img.height / img.width) * w
    if (getY() - h < bottom) newPage()
    getPage().drawImage(img, { x: left + 10, y: getY() - h, width: w, height: h })
    setY(getY() - h - 8)
  } catch {
    /* ongeldige handtekening-data → tekstregel volstaat */
  }
}
