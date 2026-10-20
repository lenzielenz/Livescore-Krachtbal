import { PDFDocument, type PDFFont, type PDFPage, StandardFonts, rgb } from 'pdf-lib'

import { formatDateTimeBE } from '../datetime'
import { safe, type MatchSheetPdfData } from './pdf'

// Het NOODBLAD: verder op papier als het aantekentoestel uitvalt (batterij leeg, geen internet,
// niemand die kan overnemen). Vooraf ingevuld met wat de server al weet — ploegen, selectie met
// rugnummers, de stand en de doelpunten tot nu — en daaronder lege regels om verder te noteren.
// Achteraf geeft de federatie de eindstand van dit blad in (zie papierenUitslag).
// Enkel WinAnsi-tekens (zie safe in pdf.ts): pdf-lib's Helvetica crasht op andere glyphs.

const A4: [number, number] = [595, 842]
const L = 40
const R = A4[0] - 40
const INK = rgb(0.08, 0.09, 0.12)
const DIM = rgb(0.42, 0.44, 0.5)
const RULE = rgb(0.7, 0.72, 0.76)

const mmss = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`

export async function generateNoodbladPdf(
  data: MatchSheetPdfData,
  stand: { half: number; status: string },
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  let page: PDFPage = doc.addPage(A4)
  let y = A4[1] - 46

  const tekst = (s: string, x: number, size = 10, f: PDFFont = font, color = INK) =>
    page.drawText(safe(s), { x, y, size, font: f, color })
  const lijn = (x1: number, x2: number, yy = y) => page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: 0.6, color: RULE })
  const nieuweBladzijde = (nodig: number) => {
    if (y - nodig > 56) return
    page = doc.addPage(A4)
    y = A4[1] - 46
  }

  tekst('NOODBLAD - wedstrijdblad op papier', L, 18, bold)
  y -= 18
  tekst('Gebruik dit blad als het aantekentoestel uitvalt. Noteer verder vanaf de stand hieronder; de federatie geeft', L, 9, font, DIM)
  y -= 12
  tekst('achteraf de eindstand in. Laat het blad aftekenen door beide kapiteins en de scheidsrechter.', L, 9, font, DIM)
  y -= 24

  tekst(`${data.homeTeam}  -  ${data.awayTeam}`, L, 14, bold)
  y -= 16
  tekst(`${data.datum}  |  ${data.categorie}${data.reeks ? `  |  ${data.reeks}` : ''}${data.scheidsrechter ? `  |  Scheidsrechter: ${data.scheidsrechter}` : ''}`, L, 9.5, font, DIM)
  y -= 22

  // Stand op het moment van afdrukken.
  const score = data.score ?? { home: 0, away: 0 }
  page.drawRectangle({ x: L, y: y - 30, width: R - L, height: 40, borderColor: INK, borderWidth: 1 })
  y -= 6
  tekst(`Stand bij afdruk: ${score.home} - ${score.away}`, L + 10, 13, bold)
  tekst(
    `${stand.status === 'live' ? `${stand.half}e helft bezig` : stand.status === 'finished' ? 'afgelopen' : 'nog niet gestart'}  |  afgedrukt ${formatDateTimeBE(new Date())}`,
    L + 250,
    9.5,
    font,
    DIM,
  )
  y -= 16
  if (data.crosses || data.timeouts) {
    const c = data.crosses ?? { home: 0, away: 0 }
    const t = data.timeouts ?? { home: [0, 0], away: [0, 0] }
    tekst(`Kruisjes ${c.home} - ${c.away}   |   Time-outs thuis ${t.home[0]}/${t.home[1]}, uit ${t.away[0]}/${t.away[1]} (helft 1/2)`, L + 10, 9, font, DIM)
  }
  y -= 30

  // Selectie per ploeg.
  const kol = (R - L) / 2
  tekst(`Thuis: ${data.homeTeam}`, L, 10.5, bold)
  tekst(`Uit: ${data.awayTeam}`, L + kol, 10.5, bold)
  y -= 14
  const rijen = Math.max(data.homeLineup.length, data.awayLineup.length, 8)
  for (let i = 0; i < rijen; i++) {
    const h = data.homeLineup[i]
    const a = data.awayLineup[i]
    tekst(h ? `${h.rugnummer ?? '__'}   ${h.name}` : '__   ____________________', L, 9.5)
    tekst(a ? `${a.rugnummer ?? '__'}   ${a.name}` : '__   ____________________', L + kol, 9.5)
    y -= 13
  }
  y -= 10

  // Wat er al genoteerd was.
  const goals = data.goals ?? []
  if (goals.length) {
    tekst(`Al genoteerd (${goals.length} doelpunten)`, L, 10.5, bold)
    y -= 13
    const regel = goals
      .map((g) => `${g.half}e ${mmss(g.gameClock)} ${g.side === 'home' ? 'T' : 'U'}${g.shirtNumber ? ` #${g.shirtNumber}` : ''} +${g.points}`)
      .join('   ')
    // Simpel afbreken op ~110 tekens.
    for (let i = 0; i < regel.length; i += 110) {
      nieuweBladzijde(14)
      tekst(regel.slice(i, i + 110), L, 8.5, font, DIM)
      y -= 11
    }
    y -= 8
  }

  // Lege regels om verder te noteren.
  nieuweBladzijde(60)
  tekst('Verder op papier - doelpunten', L, 10.5, bold)
  y -= 14
  const cols = [
    { t: 'Helft', x: L },
    { t: 'Min', x: L + 50 },
    { t: 'Ploeg (T/U)', x: L + 100 },
    { t: 'Rugnr', x: L + 185 },
    { t: '+1 / +2', x: L + 240 },
    { t: 'Stand na', x: L + 310 },
    { t: 'Opmerking', x: L + 390 },
  ]
  for (const c of cols) tekst(c.t, c.x, 8.5, bold, DIM)
  y -= 6
  for (let i = 0; i < 24; i++) {
    nieuweBladzijde(18)
    y -= 16
    lijn(L, R)
  }
  y -= 22

  nieuweBladzijde(140)
  tekst('Wissels (wie eruit -> wie erin, minuut)', L, 10.5, bold)
  tekst('Time-outs / kruisjes', L + kol, 10.5, bold)
  y -= 6
  for (let i = 0; i < 6; i++) {
    y -= 16
    lijn(L, L + kol - 20)
    lijn(L + kol, R)
  }
  y -= 28

  nieuweBladzijde(110)
  tekst('Eindstand:   ______  -  ______', L, 13, bold)
  y -= 34
  const breedte = (R - L - 40) / 3
  const handtekeningen = ['Kapitein thuis', 'Kapitein uit', 'Scheidsrechter']
  handtekeningen.forEach((label, i) => {
    const x = L + i * (breedte + 20)
    lijn(x, x + breedte)
    page.drawText(safe(label), { x, y: y - 12, size: 8.5, font, color: DIM })
  })

  return doc.save()
}
