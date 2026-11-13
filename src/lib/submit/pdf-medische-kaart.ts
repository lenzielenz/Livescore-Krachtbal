import { PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from 'pdf-lib'
import QRCode from 'qrcode'

// De medische kaart: het formulier dat de arts invult bij de sportmedische keuring. Eén A4 per lid.
// Bovenaan de gegevens van het lid, in het midden het deel van de arts (geschikt of niet, datum,
// stempel en handtekening), rechtsboven een grote QR met de code ook leesbaar eronder. Wie een foto of
// scan van de ingevulde kaart oplaadt, hoeft niet te zeggen van wie ze is: de QR zegt het
// (lib/medische-kaart-scan.ts). De QR bevat enkel een ondertekende code, geen persoonsgegevens.
//
// WinAnsi-fonts: enkel Latijnse tekens (zie CLAUDE.md) — `veilig()` haalt de rest weg. Vinkjes zijn
// getekende vakjes, geen ✓.

export type MedischeKaartData = {
  playerId: number
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
const LIJN = rgb(0.7, 0.7, 0.7)
const ZWART = rgb(0, 0, 0)

async function kaartBlad(doc: PDFDocument, d: MedischeKaartData, f: { r: PDFFont; b: PDFFont }) {
  const p: PDFPage = doc.addPage([595.28, 841.89])
  const { width: B, height: H } = p.getSize()
  const marge = 18 * MM
  const tekst = (t: string, x: number, y: number, o: { size?: number; b?: boolean; kleur?: ReturnType<typeof rgb> } = {}) =>
    p.drawText(veilig(t), { x, y, size: o.size ?? 10, font: o.b ? f.b : f.r, color: o.kleur ?? ZWART })
  const lijn = (x1: number, y: number, x2: number, dik = 0.7, kleur = LIJN) => p.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: dik, color: kleur })
  const vakje = (x: number, y: number, z = 4 * MM) => p.drawRectangle({ x, y, width: z, height: z, borderColor: ZWART, borderWidth: 1 })

  // ── Kop ──
  p.drawRectangle({ x: 0, y: H - 9 * MM, width: B, height: 9 * MM, color: ROOD })
  tekst('KVKBF  -  KRACHTBAL', marge, H - 6.2 * MM, { size: 9, b: true, kleur: rgb(1, 1, 1) })
  tekst(`Seizoen ${d.seizoen}`, B - marge - f.b.widthOfTextAtSize(veilig(`Seizoen ${d.seizoen}`), 9), H - 6.2 * MM, { size: 9, b: true, kleur: rgb(1, 1, 1) })

  let y = H - 24 * MM
  tekst('MEDISCHE KAART', marge, y, { size: 22, b: true })
  y -= 8 * MM
  tekst('Sportmedische keuring om krachtbal te spelen in competitie', marge, y, { size: 11, kleur: GRIJS })

  // ── QR rechtsboven ──
  const qrMaat = 42 * MM
  const qrPng = await QRCode.toBuffer(d.link, { errorCorrectionLevel: 'M', margin: 2, width: 600 })
  const qr = await doc.embedPng(qrPng)
  const qrX = B - marge - qrMaat
  const qrY = H - 14 * MM - qrMaat
  p.drawImage(qr, { x: qrX, y: qrY, width: qrMaat, height: qrMaat })
  const codeB = f.b.widthOfTextAtSize(d.code, 11)
  tekst(d.code, qrX + (qrMaat - codeB) / 2, qrY - 5 * MM, { size: 11, b: true })
  const hint = 'niet beschrijven of afdekken'
  tekst(hint, qrX + (qrMaat - f.r.widthOfTextAtSize(hint, 7)) / 2, qrY - 9 * MM, { size: 7, kleur: GRIJS })

  // ── Het lid ──
  y = qrY - 18 * MM
  tekst('1. HET LID', marge, y, { size: 11, b: true, kleur: ROOD })
  y -= 3 * MM
  lijn(marge, y, B - marge, 1, ROOD)
  const rij = (label: string, waarde: string | null, x: number, yy: number, breedte: number) => {
    tekst(label, x, yy + 7 * MM, { size: 8, kleur: GRIJS })
    tekst(waarde || '', x, yy + 1.2 * MM, { size: 12, b: true })
    lijn(x, yy, x + breedte, 0.7)
  }
  const half = (B - 2 * marge - 8 * MM) / 2
  y -= 12 * MM
  rij('Naam en voornaam', d.naam, marge, y, B - 2 * marge)
  y -= 13 * MM
  rij('Geboortedatum', d.geboortedatum, marge, y, half)
  rij('Club', d.club, marge + half + 8 * MM, y, half)
  y -= 13 * MM
  rij('Vergunningsnummer', d.vergunningsnummer, marge, y, half)
  rij('Categorie', d.categorie, marge + half + 8 * MM, y, half)

  // ── De arts ──
  y -= 16 * MM
  tekst('2. IN TE VULLEN DOOR DE ARTS', marge, y, { size: 11, b: true, kleur: ROOD })
  y -= 3 * MM
  lijn(marge, y, B - marge, 1, ROOD)
  y -= 9 * MM
  tekst('Ondergetekende, arts, verklaart het hierboven vermelde lid onderzocht te hebben en verklaart dat het lid:', marge, y, { size: 10 })
  y -= 11 * MM
  vakje(marge, y - 0.5 * MM)
  tekst('GESCHIKT is om krachtbal te spelen in competitie', marge + 8 * MM, y, { size: 11, b: true })
  y -= 9 * MM
  vakje(marge, y - 0.5 * MM)
  tekst('NIET GESCHIKT is om krachtbal te spelen in competitie', marge + 8 * MM, y, { size: 11, b: true })
  y -= 9 * MM
  vakje(marge, y - 0.5 * MM)
  tekst('geschikt onder voorwaarde:', marge + 8 * MM, y, { size: 11, b: true })
  lijn(marge + 60 * MM, y - 1 * MM, B - marge)
  y -= 9 * MM
  lijn(marge + 8 * MM, y - 1 * MM, B - marge)

  y -= 14 * MM
  tekst('Datum van het onderzoek', marge, y + 7 * MM, { size: 8, kleur: GRIJS })
  tekst('____ / ____ / ________', marge, y, { size: 14 })
  tekst('(dag / maand / jaar)', marge + 62 * MM, y + 0.5 * MM, { size: 8, kleur: GRIJS })

  // Stempel en handtekening: twee kaders naast elkaar.
  y -= 12 * MM
  const kaderH = 30 * MM
  tekst('Naam en stempel van de arts (met RIZIV-nummer)', marge, y, { size: 8, kleur: GRIJS })
  tekst('Handtekening van de arts', marge + half + 8 * MM, y, { size: 8, kleur: GRIJS })
  y -= 2 * MM
  p.drawRectangle({ x: marge, y: y - kaderH, width: half, height: kaderH, borderColor: LIJN, borderWidth: 1 })
  p.drawRectangle({ x: marge + half + 8 * MM, y: y - kaderH, width: half, height: kaderH, borderColor: LIJN, borderWidth: 1 })
  y -= kaderH

  // ── Wat nu ──
  y -= 10 * MM
  tekst('3. EN DAN?', marge, y, { size: 11, b: true, kleur: ROOD })
  y -= 3 * MM
  lijn(marge, y, B - marge, 1, ROOD)
  const stappen = [
    'Neem een foto van de VOLLEDIGE ingevulde kaart (de QR-code moet scherp in beeld staan), of scan ze.',
    'Laad de foto op: scan de QR-code met je gsm, of via "Mijn profiel" of je club. Het systeem leest de',
    'QR-code en weet zo bij welk lid de kaart hoort. Vul daarbij de datum van het onderzoek in.',
    'De keuring is 365 dagen geldig. Bewaar het origineel; de club of de federatie kan erom vragen.',
  ]
  y -= 7 * MM
  for (const s of stappen) {
    tekst(s, marge, y, { size: 9.5 })
    y -= 5.2 * MM
  }

  // ── Voet ──
  tekst('Medisch document - vertrouwelijk. Enkel de federatie, de club van het lid en het lid (of de ouder) zien het opgeladen attest.', marge, 9 * MM, { size: 7, kleur: GRIJS })
  tekst(d.code, B - marge - f.r.widthOfTextAtSize(d.code, 7), 9 * MM, { size: 7, kleur: GRIJS })
}

/** Eén PDF met een kaart per lid (de federatie of de club drukt er meerdere tegelijk af). */
export async function generateMedischeKaartPdf(kaarten: MedischeKaartData[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(kaarten.length === 1 ? `Medische kaart ${veilig(kaarten[0]!.naam)}` : `Medische kaarten (${kaarten.length})`)
  doc.setAuthor('KVKBF')
  const f = { r: await doc.embedFont(StandardFonts.Helvetica), b: await doc.embedFont(StandardFonts.HelveticaBold) }
  for (const k of kaarten) await kaartBlad(doc, k, f)
  return doc.save()
}
