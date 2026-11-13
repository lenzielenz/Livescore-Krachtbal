import { PDFDocument, type PDFFont, rgb, StandardFonts } from 'pdf-lib'
import QRCode from 'qrcode'

import type { Lijn } from '../facturatie'
import { lijnBedrag } from '../facturatie'

// De factuur van de federatie aan een club (lib/facturatie-server.ts), als A4. Met een betaal-QR volgens de
// EPC-norm ("SEPA-QR"): de bank-apps van KBC, Belfius, BNP Paribas Fortis, ING… vullen dan rekening, bedrag en
// gestructureerde mededeling zelf in. WinAnsi-fonts: enkel Latijnse tekens en € (zie CLAUDE.md).

export type FactuurPdfData = {
  afzender: { naam: string; adres: string; ondernemingsnummer: string; iban: string; bic: string; btwVermelding: string }
  club: { naam: string; adres: string }
  nummer: string
  datum: string
  vervaldatum: string
  seizoen: string | null
  ogm: string
  lijnen: Lijn[]
  totaal: number
  open: number
  opmerking: string | null
  geannuleerd: boolean
}

const veilig = (t: string) =>
  String(t ?? '')
    .replace(/[–—]/g, '-')
    .replace(/[‘’′]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[•·]/g, '-')
    .replace(/ /g, ' ')
    .replace(/[^\x20-\x7E\xA1-\xFF€]/g, '')

const euro = (n: number) => `€ ${n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`

/**
 * De tekst van de EPC-QR (versie 002): BCD, tekenset UTF-8, SCT, BIC, naam, IBAN, bedrag, doel, gestructureerde
 * referentie (leeg: dat veld is voor ISO 11649) en de vrije mededeling — daar zetten Belgische bank-apps de
 * +++…+++ mededeling. Null zonder IBAN of als het bedrag niet past (0,01 tot 999 999 999,99).
 */
export function epcQrTekst(o: { naam: string; iban: string; bic: string; bedrag: number; ogm: string }): string | null {
  const iban = o.iban.replace(/\s/g, '').toUpperCase()
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(iban) || !(o.bedrag >= 0.01 && o.bedrag <= 999_999_999.99)) return null
  return ['BCD', '002', '1', 'SCT', o.bic.replace(/\s/g, '').toUpperCase(), o.naam.slice(0, 70), iban, `EUR${o.bedrag.toFixed(2)}`, '', '', o.ogm.slice(0, 140)].join('\n')
}

export async function generateFactuurPdf(d: FactuurPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(`Factuur ${d.nummer}`)
  doc.setAuthor(veilig(d.afzender.naam))
  const f: { r: PDFFont; b: PDFFont } = { r: await doc.embedFont(StandardFonts.Helvetica), b: await doc.embedFont(StandardFonts.HelveticaBold) }
  const MM = 72 / 25.4
  // De bladzijde waarop we tekenen: bij veel lijnen loopt de factuur door op een volgende.
  let p = doc.addPage([210 * MM, 297 * MM])
  const X = (mm: number) => mm * MM
  const Y = (mm: number) => (297 - mm) * MM
  const ZWART = rgb(0, 0, 0)
  const GRIJS = rgb(0.42, 0.42, 0.42)
  const ROOD = rgb(0.75, 0.12, 0.12)
  const LIJN = rgb(0.75, 0.75, 0.75)
  const tekst = (t: string, x: number, y: number, o: { size?: number; b?: boolean; kleur?: ReturnType<typeof rgb>; rechts?: boolean } = {}) => {
    const s = veilig(t)
    const size = o.size ?? 10
    const font = o.b ? f.b : f.r
    const w = font.widthOfTextAtSize(s, size) / MM
    p.drawText(s, { x: X(o.rechts ? x - w : x), y: Y(y), size, font, color: o.kleur ?? ZWART })
  }
  const lijn = (y: number, x1 = 20, x2 = 190) => p.drawLine({ start: { x: X(x1), y: Y(y) }, end: { x: X(x2), y: Y(y) }, thickness: 0.6, color: LIJN })
  /** Een tekst afbreken op een breedte (mm). */
  const breek = (t: string, size: number, breedte: number): string[] => {
    const woorden = veilig(t).split(/\s+/)
    const uit: string[] = []
    let r = ''
    for (const w of woorden) {
      const proef = r ? `${r} ${w}` : w
      if (f.r.widthOfTextAtSize(proef, size) / MM > breedte && r) {
        uit.push(r)
        r = w
      } else r = proef
    }
    if (r) uit.push(r)
    return uit
  }

  // ── Kop: afzender links, FACTUUR rechts ──
  tekst(d.afzender.naam, 20, 24, { size: 13, b: true, kleur: ROOD })
  let y = 30
  for (const r of d.afzender.adres.split(/\r?\n/).filter(Boolean)) {
    tekst(r, 20, y, { size: 9, kleur: GRIJS })
    y += 4.5
  }
  if (d.afzender.ondernemingsnummer) tekst(`Ondernemingsnummer ${d.afzender.ondernemingsnummer}`, 20, y, { size: 9, kleur: GRIJS })
  tekst(d.geannuleerd ? 'FACTUUR (GEANNULEERD)' : 'FACTUUR', 190, 26, { size: 20, b: true, rechts: true, kleur: d.geannuleerd ? ROOD : ZWART })
  tekst(`Nummer ${d.nummer}`, 190, 33, { size: 10, b: true, rechts: true })
  tekst(`Datum ${d.datum}`, 190, 38, { size: 9.5, rechts: true })
  tekst(`Te betalen vóór ${d.vervaldatum}`, 190, 43, { size: 9.5, rechts: true })
  if (d.seizoen) tekst(`Seizoen ${d.seizoen}`, 190, 48, { size: 9.5, rechts: true, kleur: GRIJS })

  // ── Aan ──
  tekst('Aan', 20, 62, { size: 8, kleur: GRIJS })
  tekst(d.club.naam, 20, 68, { size: 12, b: true })
  y = 73
  for (const r of d.club.adres.split(/\r?\n/).filter(Boolean)) {
    tekst(r, 20, y, { size: 9.5 })
    y += 4.5
  }

  // ── Lijnen ──
  y = 92
  tekst('Omschrijving', 20, y, { size: 8.5, b: true, kleur: GRIJS })
  tekst('Aantal', 132, y, { size: 8.5, b: true, kleur: GRIJS, rechts: true })
  tekst('Prijs', 158, y, { size: 8.5, b: true, kleur: GRIJS, rechts: true })
  tekst('Bedrag', 190, y, { size: 8.5, b: true, kleur: GRIJS, rechts: true })
  lijn(y + 2)
  y += 8
  for (const l of d.lijnen) {
    const regels = breek(l.omschrijving, 9.5, 100)
    if (y + regels.length * 4.6 > 270) {
      // Te veel lijnen: verder op een volgende bladzijde.
      p = doc.addPage([210 * MM, 297 * MM])
      tekst(`Factuur ${d.nummer} (vervolg)`, 20, 20, { size: 9, kleur: GRIJS })
      y = 30
    }
    regels.forEach((r, i) => tekst(r, 20, y + i * 4.6, { size: 9.5 }))
    tekst(String(l.aantal), 132, y, { size: 9.5, rechts: true })
    tekst(euro(l.eenheidsprijs), 158, y, { size: 9.5, rechts: true })
    tekst(euro(lijnBedrag(l)), 190, y, { size: 9.5, rechts: true })
    y += regels.length * 4.6 + 2.4
  }
  lijn(y)
  y += 7
  tekst('Totaal', 158, y, { size: 11, b: true, rechts: true })
  tekst(euro(d.totaal), 190, y, { size: 11, b: true, rechts: true })
  if (d.open !== d.totaal && !d.geannuleerd) {
    y += 6
    tekst('Nog te betalen', 158, y, { size: 9.5, rechts: true, kleur: GRIJS })
    tekst(euro(d.open), 190, y, { size: 9.5, rechts: true })
  }
  if (d.afzender.btwVermelding) {
    y += 7
    tekst(d.afzender.btwVermelding, 20, y, { size: 8.5, kleur: GRIJS })
  }
  if (d.opmerking) {
    y += 7
    for (const r of breek(d.opmerking, 9, 170)) {
      tekst(r, 20, y, { size: 9 })
      y += 4.4
    }
  }

  // ── Betalen: onderaan, met QR (op een nieuwe bladzijde als de lijnen te ver lopen) ──
  if (!d.geannuleerd) {
    if (y > 230) p = doc.addPage([210 * MM, 297 * MM])
    const top = 238
    p.drawRectangle({ x: X(20), y: Y(top + 40), width: X(170), height: X(40), borderColor: LIJN, borderWidth: 0.8 })
    tekst('Betalen', 25, top + 7, { size: 11, b: true, kleur: ROOD })
    tekst(`Bedrag: ${euro(d.open)}`, 25, top + 14, { size: 10, b: true })
    tekst(`Rekening: ${d.afzender.iban || '(nog niet ingesteld)'}${d.afzender.bic ? `  BIC ${d.afzender.bic}` : ''}`, 25, top + 20, { size: 10 })
    tekst(`Mededeling: ${d.ogm}`, 25, top + 26, { size: 11, b: true })
    tekst('Gebruik altijd deze mededeling: zo wordt je betaling vanzelf gekoppeld.', 25, top + 32, { size: 8, kleur: GRIJS })
    const epc = epcQrTekst({ naam: d.afzender.naam, iban: d.afzender.iban, bic: d.afzender.bic, bedrag: d.open, ogm: d.ogm })
    if (epc) {
      const png = await QRCode.toBuffer(epc, { errorCorrectionLevel: 'M', margin: 1, width: 400 })
      p.drawImage(await doc.embedPng(png), { x: X(152), y: Y(top + 37), width: X(34), height: X(34) })
      tekst('Scan met je bank-app', 186, top + 38.6, { size: 6.5, kleur: GRIJS, rechts: true })
    }
  }
  return doc.save()
}
