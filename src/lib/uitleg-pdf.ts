import fs from 'fs/promises'
import path from 'path'

import { PDFDocument, type PDFFont, type PDFPage, StandardFonts, rgb } from 'pdf-lib'

import { AANTEKEN_STAPPEN, naarWinAnsi, type UitlegStap } from './aantekenen-uitleg'
import beeldenJson from './uitleg-beelden.json'

// De afdrukbare handleiding: per stap een groot nummer, één zin, en een foto van het échte
// scherm met een pijl naar de knop.
//
// Waarom foto's en niet een beschrijving: aan een tornooitafel staat iemand die de app nog nooit
// gezien heeft. "Druk op Aantekenen" helpt pas als je weet hoe die rij eruitziet. De foto's komen
// uit de draaiende app (`scripts/uitleg-screenshots.ts`), dus ze tonen de knoppen zoals ze écht
// zijn — geen tekening die na de volgende uitrol niet meer klopt.
//
// De pijl zit NIET in de foto maar wordt hier getekend, uit de plek die het fotoscript per stap
// opschreef. Zo blijft een foto een foto, en kan de opmaak veranderen zonder alles opnieuw te
// moeten fotograferen.
//
// Alle tekst gaat door `naarWinAnsi`: de standaardletters van pdf-lib kennen geen emoji, en één
// zo'n teken laat het hele document klappen (dat is hier al eens gebeurd met een vinkje).

const MARGE = 40
const BREEDTE = 595 // A4 staand, in punten
const HOOGTE = 842
/** Twee stappen per bladzijde: groot genoeg om de knop op de foto te herkennen. */
const PER_BLAD = 2

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
 * De pijl komt van links naast de foto en gaat naar het midden van de linkerrand van de knop —
 * behalve wanneer die knop zelf al tegen de linkerrand ligt; dan zou de pijl dwars over het
 * beeld lopen en wijst hij van rechts. Puur, zodat de keuze te testen valt zonder PDF.
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
  // Bijna altijd van links: de marge naast de foto is daar vrij. Enkel wanneer de knop tegen de
  // linkerrand plakt, komt de pijl van rechts — dan zou hij anders op de rand zelf eindigen.
  // (Van rechts vertrekken terwijl de knop links staat, laat de pijl dwars over de andere ploeg
  // lopen; dat wees precies de verkeerde knop aan.)
  const vanLinks = linksX - beeld.x >= 6
  return vanLinks
    ? { vanX: Math.max(MARGE, beeld.x - 34), vanY: midY, naarX: linksX - 3, naarY: midY }
    : { vanX: Math.min(BREEDTE - MARGE, beeld.x + beeld.breedte + 34), vanY: midY, naarX: rechtsX + 3, naarY: midY }
}

/** Een pijl met punt, van (vanX,vanY) naar (naarX,naarY). */
function tekenPijl(
  pagina: PDFPage,
  p: { vanX: number; vanY: number; naarX: number; naarY: number },
  kleur: ReturnType<typeof rgb>,
) {
  pagina.drawLine({ start: { x: p.vanX, y: p.vanY }, end: { x: p.naarX, y: p.naarY }, thickness: 2.4, color: kleur })
  const richting = p.naarX >= p.vanX ? 1 : -1
  const punt = 7
  pagina.drawLine({
    start: { x: p.naarX, y: p.naarY },
    end: { x: p.naarX - richting * punt, y: p.naarY + punt * 0.7 },
    thickness: 2.4,
    color: kleur,
  })
  pagina.drawLine({
    start: { x: p.naarX, y: p.naarY },
    end: { x: p.naarX - richting * punt, y: p.naarY - punt * 0.7 },
    thickness: 2.4,
    color: kleur,
  })
}

async function leesBeeld(bestand: string): Promise<Uint8Array | null> {
  const pad = path.join(process.cwd(), 'public', 'uitleg', bestand)
  const ruw = await fs.readFile(pad).catch(() => null)
  // Als échte Uint8Array doorgeven, niet als Node-Buffer: onder de testomgeving komt die uit een
  // andere realm en herkent pdf-lib hem niet ("must be of type Uint8Array, but was NaN"). Het
  // kost niets en maakt het bouwen van de handleiding overal hetzelfde.
  return ruw ? Uint8Array.from(ruw) : null
}

export async function bouwAantekenHandleiding(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle('Krachtbal Live - een wedstrijd aantekenen')
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const inkt = rgb(0.1, 0.1, 0.12)
  const grijs = rgb(0.42, 0.45, 0.5)
  const rood = rgb(0.9, 0.16, 0.28)

  const perNr = new Map(BEELDEN.beelden.map((b) => [b.nr, b]))

  // ── Bladzijde 1: de titel, daarna telkens PER_BLAD stappen ──
  let pagina: PDFPage = doc.addPage([BREEDTE, HOOGTE])
  pagina.drawText(naarWinAnsi('Een wedstrijd aantekenen'), {
    x: MARGE, y: HOOGTE - MARGE - 20, size: 22, font: bold, color: inkt,
  })
  pagina.drawText(naarWinAnsi('Aan de tornooitafel - stap voor stap'), {
    x: MARGE, y: HOOGTE - MARGE - 38, size: 11, font, color: grijs,
  })

  let opBlad = 0
  let bovenkant = HOOGTE - MARGE - 58

  for (const stap of AANTEKEN_STAPPEN) {
    if (opBlad === PER_BLAD) {
      pagina = doc.addPage([BREEDTE, HOOGTE])
      opBlad = 0
      bovenkant = HOOGTE - MARGE
    }
    const vakHoogte = (bovenkant - MARGE) / (PER_BLAD - opBlad)
    const onderkant = bovenkant - vakHoogte

    await tekenStap(doc, pagina, stap, perNr.get(stap.nr) ?? null, {
      boven: bovenkant, onder: onderkant, font, bold, inkt, grijs, rood,
    })

    bovenkant = onderkant
    opBlad += 1
  }

  return doc.save()
}

async function tekenStap(
  doc: PDFDocument,
  pagina: PDFPage,
  stap: UitlegStap,
  beeld: BeeldInfo | null,
  o: {
    boven: number
    onder: number
    font: PDFFont
    bold: PDFFont
    inkt: ReturnType<typeof rgb>
    grijs: ReturnType<typeof rgb>
    rood: ReturnType<typeof rgb>
  },
) {
  const { font, bold, inkt, grijs, rood } = o
  let y = o.boven - 6

  // Het nummer in een bol, groot genoeg om van een afstand te zien welke stap je zoekt.
  pagina.drawCircle({ x: MARGE + 13, y: y - 12, size: 13, color: rood })
  pagina.drawText(String(stap.nr), {
    x: MARGE + (stap.nr < 10 ? 9 : 5.5), y: y - 17, size: 14, font: bold, color: rgb(1, 1, 1),
  })
  pagina.drawText(naarWinAnsi(stap.titel), { x: MARGE + 34, y: y - 17, size: 14, font: bold, color: inkt })
  y -= 34

  // Eén zin — kort en krachtig; de lange uitleg staat in de app.
  for (const regel of breekAf(stap.kort, font, 11, BREEDTE - 2 * MARGE - 34)) {
    pagina.drawText(regel, { x: MARGE + 34, y, size: 11, font, color: inkt })
    y -= 14
  }
  if (stap.knop) {
    pagina.drawText(naarWinAnsi(`Knop: ${stap.knop}`), { x: MARGE + 34, y, size: 10, font: bold, color: rood })
    y -= 14
  }
  y -= 4

  // De foto, zo groot als er onder de tekst nog plek is.
  const bytes = beeld ? await leesBeeld(beeld.bestand) : null
  if (!bytes || !beeld) return

  const png = await doc.embedPng(bytes)
  const beschikbaar = y - o.onder - 6
  const schaal = Math.min(beschikbaar / beeld.hoogte, (BREEDTE - 2 * MARGE - 90) / beeld.breedte)
  if (schaal <= 0) return
  const b = beeld.breedte * schaal
  const h = beeld.hoogte * schaal
  // Iets naar rechts, zodat er links plaats is voor de pijl.
  const x = MARGE + 52
  const beeldOnder = y - h

  pagina.drawImage(png, { x, y: beeldOnder, width: b, height: h })
  pagina.drawRectangle({
    x, y: beeldOnder, width: b, height: h, borderColor: rgb(0.8, 0.82, 0.86), borderWidth: 0.7,
  })

  if (beeld.doel) {
    // Een kader rond de knop én een pijl ernaartoe: het kader zegt "deze", de pijl zegt "kijk hier".
    pagina.drawRectangle({
      x: x + beeld.doel.x * schaal - 2,
      y: beeldOnder + h - (beeld.doel.y + beeld.doel.h) * schaal - 2,
      width: beeld.doel.b * schaal + 4,
      height: beeld.doel.h * schaal + 4,
      borderColor: rood,
      borderWidth: 1.8,
    })
    tekenPijl(pagina, pijlPad(beeld.doel, { x, y: beeldOnder, breedte: b, hoogte: h }, schaal), rood)
  }

  if (stap.letOp) {
    // Onder de foto, als er nog plek is: de waarschuwing mag de foto niet verdringen.
    const regels = breekAf(`Let op: ${stap.letOp}`, font, 9, BREEDTE - 2 * MARGE - 34)
    let ly = beeldOnder - 11
    for (const regel of regels) {
      if (ly < o.onder) break
      pagina.drawText(regel, { x: MARGE + 34, y: ly, size: 9, font, color: grijs })
      ly -= 11
    }
  }
}
