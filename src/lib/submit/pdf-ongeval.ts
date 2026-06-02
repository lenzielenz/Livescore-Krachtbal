import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

// PDF-aangifte lichamelijk ongeval (formulier_14 — DVV/OKRA-SPORT). Het geneeskundig
// getuigschrift is een apart blad en zit niet in deze export.

export type AccidentPdfData = {
  titel: string
  wedstrijd?: string
  slachtoffer: { naam: string; geboortedatum?: string; adres?: string; beroep?: string }
  ongeval: { plaats?: string; datum?: string; omstandigheden?: string }
  getuigen: { naam?: string; adres?: string }[]
  opmerkingen?: string
}

export async function generateAccidentPdf(data: AccidentPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([595, 842]) // A4
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const { height } = page.getSize()
  const dark = rgb(0.1, 0.1, 0.12)
  const grey = rgb(0.4, 0.4, 0.45)
  const left = 40
  let y = height - 40

  const line = (text: string, opts: { size?: number; b?: boolean; color?: typeof dark; gap?: number } = {}) => {
    const size = opts.size ?? 10
    page.drawText(text, { x: left, y, size, font: opts.b ? bold : font, color: opts.color ?? dark })
    y -= opts.gap ?? size + 6
  }

  line('AANGIFTE LICHAMELIJK ONGEVAL', { size: 14, b: true })
  line('KRACHTBAL-SPORT+ / DVV — verzekeringsaangifte', { color: grey, size: 9, gap: 20 })

  line('Slachtoffer', { b: true, size: 11 })
  line(`  Naam + voornaam: ${data.slachtoffer.naam}`)
  if (data.slachtoffer.geboortedatum) line(`  Geboortedatum: ${data.slachtoffer.geboortedatum}`)
  if (data.slachtoffer.adres) line(`  Adres: ${data.slachtoffer.adres}`)
  if (data.slachtoffer.beroep) line(`  Beroep: ${data.slachtoffer.beroep}`)
  y -= 8

  line('Ongeval', { b: true, size: 11 })
  if (data.wedstrijd) line(`  Wedstrijd: ${data.wedstrijd}`)
  if (data.ongeval.plaats) line(`  Plaats: ${data.ongeval.plaats}`)
  if (data.ongeval.datum) line(`  Datum en uur: ${data.ongeval.datum}`)
  if (data.ongeval.omstandigheden) line(`  Omstandigheden: ${data.ongeval.omstandigheden}`, { size: 9 })
  y -= 8

  const getuigen = data.getuigen.filter((g) => g.naam || g.adres)
  if (getuigen.length) {
    line('Getuigen', { b: true, size: 11 })
    getuigen.forEach((g) => line(`  ${g.naam ?? '—'}${g.adres ? `, ${g.adres}` : ''}`, { size: 9 }))
    y -= 8
  }

  if (data.opmerkingen) {
    line('Opmerkingen', { b: true, size: 11 })
    line(`  ${data.opmerkingen}`, { size: 9 })
    y -= 8
  }

  y -= 10
  line('Een geneeskundig getuigschrift (apart blad) moet bij deze aangifte worden gevoegd.', { color: grey, size: 9, gap: 30 })
  line('Datum + handtekening:', { size: 9, color: grey })
  line('_______________________________________', { size: 10 })

  return doc.save()
}
