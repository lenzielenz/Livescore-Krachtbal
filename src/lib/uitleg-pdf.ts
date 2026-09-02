import fs from 'fs/promises'
import path from 'path'

import { PDFDocument, type PDFFont, type PDFImage, type PDFPage, StandardFonts, rgb } from 'pdf-lib'

import { AANTEKEN_STAPPEN, naarWinAnsi, type UitlegStap } from './aantekenen-uitleg'
import beeldenJson from './uitleg-beelden.json'

// De afdrukbare handleiding: per stap een nummer, één zin, en een foto van het échte scherm met
// een pijl naar de knop.
//
// Waarom foto's en niet een beschrijving: aan een tornooitafel staat iemand die de app nog nooit
// gezien heeft. "Druk op Aantekenen" helpt pas als je weet hoe die rij eruitziet. De foto's komen
// uit de draaiende app (`scripts/uitleg-screenshots.ts`) op vier keer de schermdichtheid — op
// papier ongeveer 290 dpi, want een handleiding die uit de printer komt als een blokkendoos
// leest niemand.
//
// De pijl zit NIET in de foto maar wordt hier getekend, uit de plek die het fotoscript per stap
// opschreef. Zo blijft een foto een foto, en kan de opmaak veranderen zonder alles opnieuw te
// moeten fotograferen.
//
// Alle tekst gaat door `naarWinAnsi`: de standaardletters van pdf-lib kennen geen emoji, en één
// zo'n teken laat het hele document klappen (dat is hier al eens gebeurd met een vinkje).

const BREEDTE = 595 // A4 staand, in punten
const HOOGTE = 842
const MARGE = 46
const KOLOM = BREEDTE - 2 * MARGE
/** Twee stappen per bladzijde: groot genoeg om de knop op de foto te herkennen. */
const PER_BLAD = 2

// Eén palet, zodat het geheel bij elkaar hoort in plaats van per blok iets anders te doen.
const INKT = rgb(0.09, 0.10, 0.13)
const GRIJS = rgb(0.45, 0.48, 0.53)
const LICHT = rgb(0.88, 0.90, 0.93)
const PAPIER = rgb(0.97, 0.975, 0.98)
const ROOD = rgb(0.85, 0.13, 0.26)
const ROOD_LICHT = rgb(0.99, 0.93, 0.94)

type BeeldInfo = {
  nr: number
  bestand: string
  breedte: number
  hoogte: number
  doel: { x: number; y: number; b: number; h: number } | null
}
const BEELDEN = beeldenJson as { scherm: { width: number; height: number }; beelden: BeeldInfo[] }

/** Tekst afbreken op de beschikbare breedte, woord per woord. */
export function breekAf(tekst: string, font: PDFFont, grootte: number, maxBreedte: number): string[] {
  const woorden = naarWinAnsi(tekst).split(/\s+/).filter(Boolean)
  const regels: string[] = []
  let regel = ''
  for (const woord of woorden) {
    const kandidaat = regel ? `${regel} ${woord}` : woord
    if (font.widthOfTextAtSize(kandidaat, grootte) <= maxBreedte) {
      regel = kandidaat
      continue
    }
    if (regel) regels.push(regel)
    regel = woord
  }
  if (regel) regels.push(regel)
  return regels
}

/**
 * Waar de pijl vandaan komt en waar hij naartoe wijst, in PDF-punten.
 *
 * De pijl komt van de kant waar de knop het dichtst tegen de rand ligt. Dat klinkt als een
 * detail, maar het is het hele punt van een pijl: komt hij van de verkeerde kant, dan loopt hij
 * dwars over de knoppen ernaast en wijst hij onderweg alles aan behalve wat je bedoelt. Ligt de
 * knop pal tegen de linkerrand, dan komt hij toch van rechts — anders eindigt hij op de rand van
 * het beeld in plaats van op de knop. Puur, zodat die keuze te testen valt zonder een PDF.
 */
export function pijlPad(
  doel: { x: number; y: number; b: number; h: number },
  beeld: { x: number; y: number; breedte: number; hoogte: number },
  schaal: number,
): { vanX: number; vanY: number; naarX: number; naarY: number } {
  // Beeldpixels → punten. De y-as van een PDF loopt omgekeerd aan die van een scherm.
  const midY = beeld.y + beeld.hoogte - (doel.y + doel.h / 2) * schaal
  const linksX = beeld.x + doel.x * schaal
  const rechtsX = beeld.x + (doel.x + doel.b) * schaal
  const ruimteLinks = linksX - beeld.x
  const ruimteRechts = beeld.x + beeld.breedte - rechtsX
  const vanLinks = ruimteLinks >= 6 && ruimteLinks <= ruimteRechts
  return vanLinks
    ? { vanX: Math.max(MARGE + 2, beeld.x - 30), vanY: midY, naarX: linksX - 4, naarY: midY }
    : { vanX: Math.min(BREEDTE - MARGE - 2, beeld.x + beeld.breedte + 30), vanY: midY, naarX: rechtsX + 4, naarY: midY }
}

/** Een pijl met een gevulde punt. */
function tekenPijl(pagina: PDFPage, p: ReturnType<typeof pijlPad>) {
  const richting = p.naarX >= p.vanX ? 1 : -1
  // De lijn stopt vóór de punt, anders steekt hij erdoorheen.
  pagina.drawLine({
    start: { x: p.vanX, y: p.vanY },
    end: { x: p.naarX - richting * 6, y: p.naarY },
    thickness: 2.6,
    color: ROOD,
  })
  // Een driehoekje, opgebouwd uit dikke lijnen: pdf-lib kent geen veelhoek.
  for (let i = 0; i <= 6; i += 1) {
    const t = i / 6
    pagina.drawLine({
      start: { x: p.naarX - richting * 7 * t, y: p.naarY - 4.5 * (1 - t) },
      end: { x: p.naarX - richting * 7 * t, y: p.naarY + 4.5 * (1 - t) },
      thickness: 1.6,
      color: ROOD,
    })
  }
}

/** Een pilletje met tekst — voor de knopnaam, zodat die eruitziet als een knop. */
function tekenChip(pagina: PDFPage, x: number, y: number, tekst: string, font: PDFFont): number {
  const grootte = 9.5
  const label = naarWinAnsi(tekst)
  const breedte = font.widthOfTextAtSize(label, grootte) + 18
  pagina.drawRectangle({
    x, y: y - 4, width: breedte, height: 17, color: ROOD_LICHT, borderColor: ROOD, borderWidth: 0.7,
  })
  pagina.drawText(label, { x: x + 9, y: y + 0.5, size: grootte, font, color: ROOD })
  return breedte
}

async function leesBeeld(bestand: string): Promise<Uint8Array | null> {
  const pad = path.join(process.cwd(), 'public', 'uitleg', bestand)
  const ruw = await fs.readFile(pad).catch(() => null)
  // Als échte Uint8Array doorgeven, niet als Node-Buffer: onder de testomgeving komt die uit een
  // andere realm en herkent pdf-lib hem niet ("must be of type Uint8Array, but was NaN").
  return ruw ? Uint8Array.from(ruw) : null
}

export async function bouwAantekenHandleiding(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle('Krachtbal Live - een wedstrijd aantekenen')
  doc.setSubject('Stap voor stap aantekenen aan de tornooitafel')
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  const perNr = new Map(BEELDEN.beelden.map((b) => [b.nr, b]))
  // De foto's één keer inbedden en hergebruiken; twee keer dezelfde bytes in één document is
  // zonde van de bestandsgrootte (en dit wordt gemaild).
  const plaatjes = new Map<number, PDFImage>()
  for (const b of BEELDEN.beelden) {
    const bytes = await leesBeeld(b.bestand)
    if (bytes) plaatjes.set(b.nr, await doc.embedPng(bytes))
  }

  const paginas: PDFPage[] = []
  let pagina = doc.addPage([BREEDTE, HOOGTE])
  paginas.push(pagina)

  // ── De kop van bladzijde 1 ──
  pagina.drawRectangle({ x: 0, y: HOOGTE - 92, width: BREEDTE, height: 92, color: INKT })
  pagina.drawText(naarWinAnsi('Een wedstrijd aantekenen'), {
    x: MARGE, y: HOOGTE - 52, size: 23, font: bold, color: rgb(1, 1, 1),
  })
  pagina.drawText(naarWinAnsi('Aan de tornooitafel, stap voor stap'), {
    x: MARGE, y: HOOGTE - 72, size: 11, font, color: rgb(0.75, 0.78, 0.82),
  })
  pagina.drawRectangle({ x: 0, y: HOOGTE - 96, width: BREEDTE, height: 4, color: ROOD })

  let opBlad = 0
  let bovenkant = HOOGTE - 96 - 26

  for (const stap of AANTEKEN_STAPPEN) {
    if (opBlad === PER_BLAD) {
      pagina = doc.addPage([BREEDTE, HOOGTE])
      paginas.push(pagina)
      opBlad = 0
      bovenkant = HOOGTE - MARGE
    }
    const vakHoogte = (bovenkant - MARGE - 24) / (PER_BLAD - opBlad)
    const onderkant = bovenkant - vakHoogte

    tekenStap(pagina, stap, perNr.get(stap.nr) ?? null, plaatjes.get(stap.nr) ?? null, {
      boven: bovenkant, onder: onderkant, font, bold,
    })

    bovenkant = onderkant
    opBlad += 1
  }

  // ── Voettekst op elke bladzijde ──
  paginas.forEach((p, i) => {
    p.drawLine({
      start: { x: MARGE, y: MARGE - 6 }, end: { x: BREEDTE - MARGE, y: MARGE - 6 },
      thickness: 0.6, color: LICHT,
    })
    p.drawText(naarWinAnsi('Krachtbal Live - vergissing gemaakt? Niets is definitief: Ondoen, of de wedstrijd heropenen.'), {
      x: MARGE, y: MARGE - 18, size: 8, font, color: GRIJS,
    })
    const nr = `${i + 1} / ${paginas.length}`
    p.drawText(nr, {
      x: BREEDTE - MARGE - font.widthOfTextAtSize(nr, 8), y: MARGE - 18, size: 8, font, color: GRIJS,
    })
  })

  return doc.save()
}

function tekenStap(
  pagina: PDFPage,
  stap: UitlegStap,
  beeld: BeeldInfo | null,
  plaatje: PDFImage | null,
  o: { boven: number; onder: number; font: PDFFont; bold: PDFFont },
) {
  const { font, bold } = o
  // Een rustige kaart onder elke stap: dat bindt de tekst en de foto samen, en zonder die
  // omlijning zweven negen blokken los op de bladzijde.
  const kaartHoogte = o.boven - o.onder - 10
  pagina.drawRectangle({
    x: MARGE - 10, y: o.onder + 4, width: KOLOM + 20, height: kaartHoogte,
    color: PAPIER, borderColor: LICHT, borderWidth: 0.8,
  })

  let y = o.boven - 20
  const tekstX = MARGE + 26

  // Het nummer in een bol: van een afstand zie je meteen bij welke stap je zit.
  pagina.drawCircle({ x: MARGE + 5, y: y + 4, size: 12.5, color: ROOD })
  const nrTekst = String(stap.nr)
  pagina.drawText(nrTekst, {
    x: MARGE + 5 - bold.widthOfTextAtSize(nrTekst, 13) / 2, y: y - 0.5, size: 13, font: bold, color: rgb(1, 1, 1),
  })
  pagina.drawText(naarWinAnsi(stap.titel), { x: tekstX, y, size: 13.5, font: bold, color: INKT })
  y -= 17

  // Eén zin — kort en krachtig; de lange uitleg staat in de app.
  for (const regel of breekAf(stap.kort, font, 10.5, KOLOM - 26)) {
    pagina.drawText(regel, { x: tekstX, y, size: 10.5, font, color: INKT })
    y -= 13
  }
  if (stap.knop) {
    y -= 3
    tekenChip(pagina, tekstX, y, stap.knop, bold)
    y -= 16
  }
  y -= 6

  if (!beeld || !plaatje) return

  // De foto: zo groot als er onder de tekst nog past, met plaats voor de "let op" eronder.
  const letOpRegels = stap.letOp ? breekAf(`Let op: ${stap.letOp}`, font, 8.5, KOLOM - 26) : []
  const letOpHoogte = letOpRegels.length ? letOpRegels.length * 10 + 10 : 0
  const beschikbaar = y - (o.onder + 12) - letOpHoogte
  const schaal = Math.min(beschikbaar / beeld.hoogte, (KOLOM - 60) / beeld.breedte)
  if (schaal <= 0) return
  const b = beeld.breedte * schaal
  const h = beeld.hoogte * schaal
  // Met een pijl: ruimte vrijhouden links. Zonder pijl: gewoon centreren, anders hangt het
  // beeld scheef op de bladzijde.
  const x = beeld.doel ? MARGE + 44 : MARGE + (KOLOM - b) / 2
  const beeldOnder = y - h

  // Een zachte schaduw onder de foto: geeft het beeld diepte in plaats van het als een blok op
  // het papier te plakken.
  pagina.drawRectangle({ x: x + 2, y: beeldOnder - 2, width: b, height: h, color: rgb(0.86, 0.88, 0.9) })
  pagina.drawImage(plaatje, { x, y: beeldOnder, width: b, height: h })
  pagina.drawRectangle({ x, y: beeldOnder, width: b, height: h, borderColor: rgb(0.72, 0.75, 0.79), borderWidth: 0.8 })

  if (beeld.doel) {
    pagina.drawRectangle({
      x: x + beeld.doel.x * schaal - 2,
      y: beeldOnder + h - (beeld.doel.y + beeld.doel.h) * schaal - 2,
      width: beeld.doel.b * schaal + 4,
      height: beeld.doel.h * schaal + 4,
      borderColor: ROOD,
      borderWidth: 1.6,
    })
    tekenPijl(pagina, pijlPad(beeld.doel, { x, y: beeldOnder, breedte: b, hoogte: h }, schaal))
  }

  let ly = beeldOnder - 12
  for (const regel of letOpRegels) {
    if (ly < o.onder + 6) break
    pagina.drawText(regel, { x: tekstX, y: ly, size: 8.5, font, color: GRIJS })
    ly -= 10
  }
}
