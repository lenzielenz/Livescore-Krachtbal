import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

// Attest van lidmaatschap: dat iemand voor een seizoen bij een club aangesloten is bij de federatie. Leden
// gebruiken het bij de mutualiteit (terugbetaling van het lidgeld) of de werkgever. Het lidgeld zelf ontvangt de
// club, niet de federatie: dat vak vult de club in, met stempel en handtekening. WinAnsi: enkel Latijnse tekens.

export type AttestLidmaatschapData = {
  federatie: { naam: string; adres: string; ondernemingsnummer: string }
  lid: { naam: string; geboortedatum: string | null; adres: string | null }
  club: string
  seizoen: string
  vanaf: string
  tot: string | null
  soort: 'speler' | 'lid'
  datum: string
}

const veilig = (t: string) =>
  String(t ?? '')
    .replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E\xA1-\xFF€]/g, '')

export async function generateAttestLidmaatschapPdf(d: AttestLidmaatschapData): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(`Attest van lidmaatschap ${veilig(d.lid.naam)} ${d.seizoen}`)
  const r = await doc.embedFont(StandardFonts.Helvetica)
  const b = await doc.embedFont(StandardFonts.HelveticaBold)
  const MM = 72 / 25.4
  const p = doc.addPage([210 * MM, 297 * MM])
  const ROOD = rgb(0.75, 0.12, 0.12)
  const GRIJS = rgb(0.42, 0.42, 0.42)
  const LIJN = rgb(0.7, 0.7, 0.7)
  const tekst = (t: string, x: number, y: number, o: { size?: number; vet?: boolean; kleur?: ReturnType<typeof rgb> } = {}) =>
    p.drawText(veilig(t), { x: x * MM, y: (297 - y) * MM, size: o.size ?? 11, font: o.vet ? b : r, color: o.kleur ?? rgb(0, 0, 0) })
  const breek = (t: string, size: number, breedte: number): string[] => {
    const uit: string[] = []
    let regel = ''
    for (const w of veilig(t).split(/\s+/)) {
      const proef = regel ? `${regel} ${w}` : w
      if (r.widthOfTextAtSize(proef, size) / MM > breedte && regel) {
        uit.push(regel)
        regel = w
      } else regel = proef
    }
    if (regel) uit.push(regel)
    return uit
  }

  tekst(d.federatie.naam, 20, 25, { size: 13, vet: true, kleur: ROOD })
  let y = 31
  for (const regel of [...d.federatie.adres.split(/\r?\n/), d.federatie.ondernemingsnummer ? `Ondernemingsnummer ${d.federatie.ondernemingsnummer}` : ''].filter(Boolean)) {
    tekst(regel, 20, y, { size: 9, kleur: GRIJS })
    y += 4.5
  }
  tekst('ATTEST VAN LIDMAATSCHAP', 20, 62, { size: 20, vet: true })
  tekst(`Sportseizoen ${d.seizoen}`, 20, 70, { size: 12, vet: true })

  const zin =
    `De federatie verklaart dat ${d.lid.naam}` +
    (d.lid.geboortedatum ? `, geboren op ${d.lid.geboortedatum}` : '') +
    (d.lid.adres ? `, wonende ${d.lid.adres}` : '') +
    `, ${d.soort === 'speler' ? 'als speler met vergunning' : 'als lid'} aangesloten is bij ${d.club} en via de federatie verzekerd is voor het sportseizoen ${d.seizoen}` +
    ` (aangesloten sinds ${d.vanaf}${d.tot ? `, tot ${d.tot}` : ''}).`
  y = 88
  for (const regel of breek(zin, 11.5, 170)) {
    tekst(regel, 20, y, { size: 11.5 })
    y += 6.5
  }

  // ── Het deel van de club (lidgeld) ──
  y += 12
  tekst('IN TE VULLEN DOOR DE CLUB', 20, y, { size: 10, vet: true, kleur: ROOD })
  p.drawLine({ start: { x: 20 * MM, y: (297 - y - 2) * MM }, end: { x: 190 * MM, y: (297 - y - 2) * MM }, thickness: 0.8, color: ROOD })
  y += 12
  tekst('Ontvangen lidgeld voor dit seizoen:  €  ____________', 20, y, { size: 11 })
  y += 10
  tekst('Betaald op:  ____ / ____ / ________', 20, y, { size: 11 })
  y += 16
  tekst('Naam, functie, handtekening en stempel van de club', 20, y, { size: 8.5, kleur: GRIJS })
  p.drawRectangle({ x: 20 * MM, y: (297 - y - 42) * MM, width: 120 * MM, height: 38 * MM, borderColor: LIJN, borderWidth: 0.8 })

  tekst(`Opgemaakt op ${d.datum} via Krachtbal Live.`, 20, 275, { size: 8, kleur: GRIJS })
  tekst('Voor de mutualiteit: kleef hier je klevertje of voeg het formulier van je ziekenfonds toe.', 20, 280, { size: 8, kleur: GRIJS })
  return doc.save()
}
