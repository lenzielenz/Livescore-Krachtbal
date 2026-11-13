import { PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from 'pdf-lib'
import QRCode from 'qrcode'

import { DATUM_HOKJE, DATUM_Y, HANDTEKENING, MERKEN, ONTVANGEN, PAGINA, QR, QR_MARGE, type Rect, STEMPEL, VAKJES } from '../medische-kaart-layout'

// Het medisch attest voor de competitie, zoals het formulier van de federatie (krachtbal.be → formulieren →
// medisch attest), maar leesbaar voor het systeem. Eén A4 per lid, met:
//   • de gegevens van het lid al ingevuld (naam, geboortedatum, club, vergunning, categorie, seizoen);
//   • een QR-code: van wie de kaart is (een ondertekende code, geen persoonsgegevens);
//   • vier zwarte hoekmerken: bij het importeren rekent het systeem een scheve foto daarmee recht;
//   • aankruisvakjes in plaats van schrappen: "geschikt" en "mag NIET 1 categorie hoger spelen" (zonder kruisje
//     mag een speler volgens de spelregels 1 categorie hoger spelen — net als op het papieren attest).
// Alle posities komen uit lib/medische-kaart-layout.ts, dezelfde maten die de lezer gebruikt.
//
// WinAnsi-fonts: enkel Latijnse tekens (CLAUDE.md) — `veilig()` haalt de rest weg.

export type MedischeKaartData = {
  /** null = het blanco attest: geen lid, de QR wijst naar de publieke oplaadpagina (lid in te vullen met de hand). */
  playerId: number | null
  naam: string
  geboortedatum: string | null
  club: string | null
  vergunningsnummer: string | null
  categorie: string | null
  seizoen: string
  code: string
  link: string
}

const veilig = (t: string) =>
  String(t ?? '')
    .replace(/[–—]/g, '-')
    .replace(/[‘’′]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[•·]/g, '-')
    .replace(/ /g, ' ')
    .replace(/[^\x20-\x7E\xA1-\xFF]/g, '')

const MM = 72 / 25.4
const ROOD = rgb(0.75, 0.12, 0.12)
const GRIJS = rgb(0.42, 0.42, 0.42)
const LIJN = rgb(0.62, 0.62, 0.62)
const ZWART = rgb(0, 0, 0)

async function kaartBlad(doc: PDFDocument, d: MedischeKaartData, f: { r: PDFFont; b: PDFFont }) {
  const p: PDFPage = doc.addPage([PAGINA.b * MM, PAGINA.h * MM])
  // Alles in mm vanaf linksboven (zoals de layout); pdf-lib rekent van linksonder in punten.
  const X = (mm: number) => mm * MM
  const Y = (mm: number) => (PAGINA.h - mm) * MM
  const tekst = (t: string, x: number, y: number, o: { size?: number; b?: boolean; kleur?: ReturnType<typeof rgb> } = {}) =>
    p.drawText(veilig(t), { x: X(x), y: Y(y), size: o.size ?? 10, font: o.b ? f.b : f.r, color: o.kleur ?? ZWART })
  const breedte = (t: string, size: number, b = false) => (b ? f.b : f.r).widthOfTextAtSize(veilig(t), size) / MM
  const lijn = (x1: number, y: number, x2: number, dik = 0.7, kleur = LIJN) => p.drawLine({ start: { x: X(x1), y: Y(y) }, end: { x: X(x2), y: Y(y) }, thickness: dik, color: kleur })
  const kader = (r: Rect, o: { kleur?: ReturnType<typeof rgb>; dik?: number; vol?: boolean } = {}) =>
    p.drawRectangle({
      x: X(r.x),
      y: Y(r.y + r.h),
      width: X(r.b),
      height: X(r.h),
      ...(o.vol ? { color: o.kleur ?? ZWART } : { borderColor: o.kleur ?? ZWART, borderWidth: o.dik ?? 1 }),
    })

  // ── Hoekmerken: vol zwart, met lege ruimte errond ──
  for (const m of MERKEN) kader(m, { vol: true })

  // ── Kop (links) en QR (rechts) ──
  tekst('KRACHTBAL-SPORT+  -  KVKBF vzw', 20, 24, { size: 9, b: true, kleur: ROOD })
  tekst('MEDISCH ATTEST', 20, 36, { size: 24, b: true })
  tekst(`voor de competitie ${d.seizoen}`, 20, 45, { size: 13, b: true })
  tekst('In te vullen door de (huis)arts om deel te nemen aan de competitie krachtbal.', 20, 54, { size: 9, kleur: GRIJS })
  tekst('Met stempel van de arts terugbezorgen aan de club, of zelf opladen (zie onderaan).', 20, 59, { size: 9, kleur: GRIJS })

  const qrPng = await QRCode.toBuffer(d.link, { errorCorrectionLevel: 'M', margin: QR_MARGE, width: 640 })
  p.drawImage(await doc.embedPng(qrPng), { x: X(QR.x), y: Y(QR.y + QR.h), width: X(QR.b), height: X(QR.h) })
  const onder = d.playerId == null ? 'BLANCO ATTEST' : d.code
  tekst(onder, QR.x + (QR.b - breedte(onder, 10, true)) / 2, QR.y + QR.h + 4, { size: 10, b: true })
  const hint = 'QR niet beschrijven of afdekken'
  tekst(hint, QR.x + (QR.b - breedte(hint, 6.5)) / 2, QR.y + QR.h + 8, { size: 6.5, kleur: GRIJS })

  // ── 1. Het lid ──
  tekst(d.playerId == null ? '1. HET LID (in drukletters)' : '1. HET LID', 20, 80, { size: 10.5, b: true, kleur: ROOD })
  lijn(20, 82, 190, 1, ROOD)
  const veld = (label: string, waarde: string | null, x: number, y: number, b: number) => {
    tekst(label, x, y - 6, { size: 7.5, kleur: GRIJS })
    tekst(waarde || '', x, y - 1.2, { size: 11.5, b: true })
    lijn(x, y, x + b, 0.7)
  }
  veld('Naam - voornaam', d.naam, 20, 95, 170)
  veld('Geboortedatum', d.geboortedatum, 20, 108, 80)
  veld('Club', d.club, 110, 108, 80)
  veld('Vergunningsnummer', d.vergunningsnummer, 20, 121, 80)
  veld('Categorie', d.categorie, 110, 121, 80)

  // ── 2. De arts ──
  tekst('2. IN TE VULLEN DOOR DE ARTS', 20, 135, { size: 10.5, b: true, kleur: ROOD })
  lijn(20, 137, 190, 1, ROOD)
  tekst('Kruis aan met een duidelijk kruisje (X) in het vakje.', 20, 142.5, { size: 8, kleur: GRIJS })
  const g = VAKJES.geschikt
  kader(g, { dik: 1.4 })
  tekst('GESCHIKT VOOR DE KRACHTBALSPORT', g.x + g.b + 4, g.y + 6, { size: 11.5, b: true })
  const h = VAKJES.nietHoger
  kader(h, { dik: 1.4 })
  tekst('MAG NIET 1 CATEGORIE HOGER SPELEN', h.x + h.b + 4, h.y + 4.6, { size: 11.5, b: true })
  tekst('Enkel aankruisen als dat zo is. Zonder kruisje mag de speler volgens de spelregels 1 categorie hoger spelen.', h.x + h.b + 4, h.y + 9, { size: 7.5, kleur: GRIJS })

  tekst('Datum van het onderzoek (dag / maand / jaar)', 20, DATUM_Y - 3, { size: 7.5, kleur: GRIJS })
  let x = 20
  for (const [i, n] of [2, 2, 4].entries()) {
    for (let k = 0; k < n; k++) {
      kader({ x, y: DATUM_Y, b: DATUM_HOKJE, h: DATUM_HOKJE + 1 }, { kleur: LIJN, dik: 0.8 })
      x += DATUM_HOKJE + 0.8
    }
    if (i < 2) {
      tekst('/', x + 0.6, DATUM_Y + 6.2, { size: 14, kleur: GRIJS })
      x += 4.5
    }
  }

  tekst('Naam en stempel van de arts (met RIZIV-nummer)', STEMPEL.x, STEMPEL.y - 2, { size: 7.5, kleur: GRIJS })
  tekst('Handtekening van de arts', HANDTEKENING.x, HANDTEKENING.y - 2, { size: 7.5, kleur: GRIJS })
  kader(STEMPEL, { kleur: LIJN })
  kader(HANDTEKENING, { kleur: LIJN })

  // ── 3. En dan? + vak van de federatie ──
  tekst('3. EN DAN?', 20, 243, { size: 10.5, b: true, kleur: ROOD })
  const stappen = [
    'Neem een foto van het HELE blad: de vier zwarte hoeken en de',
    'QR-code moeten in beeld staan. Of scan het.',
    'Scan de QR-code met je gsm en kies "Foto nemen met kader". Of laad',
    'de foto op via "Mijn profiel" of de club. Het systeem leest de vakjes.',
    'Geldig voor het hele seizoen, tot 30 juni. Bewaar het origineel.',
  ]
  stappen.forEach((s, i) => tekst(s, 20, 249 + i * 4.6, { size: 8.5 }))
  kader(ONTVANGEN, { kleur: LIJN })
  tekst('Ontvangen (in te vullen door de federatie)', ONTVANGEN.x + 2, ONTVANGEN.y + 4.5, { size: 7, kleur: GRIJS })

  // ── Voet, tussen de onderste hoekmerken ──
  tekst('Medisch document - vertrouwelijk. Enkel de federatie, de club en het lid (of de ouder) zien het opgeladen attest.', 22, 287, { size: 6.5, kleur: GRIJS })
}

/** Het blanco attest: hetzelfde blad, zonder lid. De QR wijst naar `${basis}/attest`, zo herkent het systeem het blad. */
export function blancoAttest(basis: string, seizoen: string): MedischeKaartData {
  return { playerId: null, naam: '', geboortedatum: null, club: null, vergunningsnummer: null, categorie: null, seizoen, code: '', link: `${basis.replace(/\/+$/, '')}/attest` }
}

/** Eén PDF met een attest per lid (de federatie of de club drukt er meerdere tegelijk af). */
export async function generateMedischeKaartPdf(kaarten: MedischeKaartData[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(kaarten.length === 1 ? `Medisch attest ${veilig(kaarten[0]!.naam || 'blanco')}` : `Medische attesten (${kaarten.length})`)
  doc.setAuthor('KVKBF')
  const f = { r: await doc.embedFont(StandardFonts.Helvetica), b: await doc.embedFont(StandardFonts.HelveticaBold) }
  for (const k of kaarten) await kaartBlad(doc, k, f)
  return doc.save()
}
