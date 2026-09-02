import { PDFDocument, type PDFFont, type PDFPage, StandardFonts, rgb } from 'pdf-lib'

import { AANTEKEN_STAPPEN, naarWinAnsi } from './aantekenen-uitleg'

// De afdrukbare handleiding: dezelfde stappen als op het scherm, maar dan om op de tornooitafel
// te leggen. Bewust zwart-wit en zonder logo's: dit wordt uitgeprint op de club-printer, vaak
// in grijstinten, en het moet leesbaar zijn voor iemand die het scherm níét bij de hand heeft.
//
// Alle tekst gaat door `naarWinAnsi`: de standaardletters van pdf-lib kennen geen emoji, en één
// zo'n teken laat het hele document klappen (zie AUDIT — dat is hier al eens gebeurd met een
// vinkje). Liever een streepje minder dan geen handleiding.

const MARGE = 50
const BREEDTE = 595 // A4 staand, in punten
const HOOGTE = 842

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

export async function bouwAantekenHandleiding(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle('Krachtbal Live - een wedstrijd aantekenen')
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const inkt = rgb(0.1, 0.1, 0.12)
  const grijs = rgb(0.42, 0.45, 0.5)
  const lijn = rgb(0.82, 0.84, 0.88)

  let pagina: PDFPage = doc.addPage([BREEDTE, HOOGTE])
  let y = HOOGTE - MARGE
  const nuttigeBreedte = BREEDTE - 2 * MARGE

  const nieuwePagina = () => {
    pagina = doc.addPage([BREEDTE, HOOGTE])
    y = HOOGTE - MARGE
  }
  /** Genoeg plaats over voor een blok van deze hoogte? Zo niet: nieuwe bladzijde. */
  const ruimte = (nodig: number) => {
    if (y - nodig < MARGE) nieuwePagina()
  }

  pagina.drawText(naarWinAnsi('Een wedstrijd aantekenen'), { x: MARGE, y: y - 24, size: 24, font: bold, color: inkt })
  y -= 46
  for (const regel of breekAf(
    'Stap voor stap, voor aan de tornooitafel. Dezelfde stappen staan in de app onder '
    + 'Uitleg aantekenen, met een oefenversie waarin je alles eens kan doortikken zonder dat er '
    + 'iets echt gebeurt.',
    font, 11, nuttigeBreedte,
  )) {
    pagina.drawText(regel, { x: MARGE, y, size: 11, font, color: grijs })
    y -= 15
  }
  y -= 12

  for (const stap of AANTEKEN_STAPPEN) {
    const tekstRegels = breekAf(stap.tekst, font, 11, nuttigeBreedte - 30)
    const letOpRegels = stap.letOp ? breekAf(`Let op: ${stap.letOp}`, font, 10, nuttigeBreedte - 30) : []
    // De hele stap in één keer plaatsen: een titel onderaan een bladzijde met de uitleg op de
    // volgende is precies wat een handleiding onbruikbaar maakt.
    ruimte(30 + tekstRegels.length * 15 + letOpRegels.length * 13 + 22)

    pagina.drawCircle({ x: MARGE + 9, y: y - 6, size: 11, color: rgb(0.90, 0.24, 0.35) })
    pagina.drawText(String(stap.nr), {
      x: MARGE + (stap.nr < 10 ? 6 : 3), y: y - 10, size: 11, font: bold, color: rgb(1, 1, 1),
    })
    pagina.drawText(naarWinAnsi(stap.titel), { x: MARGE + 30, y: y - 10, size: 13, font: bold, color: inkt })
    y -= 28

    for (const regel of tekstRegels) {
      pagina.drawText(regel, { x: MARGE + 30, y, size: 11, font, color: inkt })
      y -= 15
    }
    if (stap.knop) {
      const label = naarWinAnsi(`Knop: ${stap.knop}`)
      pagina.drawText(label, { x: MARGE + 30, y, size: 10, font: bold, color: rgb(0.75, 0.15, 0.25) })
      y -= 15
    }
    for (const regel of letOpRegels) {
      pagina.drawText(regel, { x: MARGE + 30, y, size: 10, font, color: grijs })
      y -= 13
    }
    y -= 8
    pagina.drawLine({
      start: { x: MARGE, y }, end: { x: BREEDTE - MARGE, y }, thickness: 0.5, color: lijn,
    })
    y -= 14
  }

  ruimte(40)
  pagina.drawText(naarWinAnsi('Vergissing gemaakt? Niets is definitief: een doelpunt gaat weg met Ondoen, '), {
    x: MARGE, y, size: 10, font, color: grijs,
  })
  y -= 13
  pagina.drawText(naarWinAnsi('en een te vroeg beëindigde wedstrijd kan heropend worden.'), {
    x: MARGE, y, size: 10, font, color: grijs,
  })

  return doc.save()
}
