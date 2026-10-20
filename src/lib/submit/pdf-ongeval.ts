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

const safe = (t: string) =>
  String(t)
    .replace(/[–—]/g, '-')
    .replace(/[‘’′]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/✓/g, 'OK')
    .replace(/[•·]/g, '-')
    .replace(/ /g, ' ')
    .replace(/[^\x20-\x7E\xA1-\xFF]/g, '')

/** Gemeenschappelijke opmaak: A4, tekst met omloop, invulregels. */
async function nieuwFormulier() {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const dark = rgb(0.1, 0.1, 0.12)
  const grey = rgb(0.4, 0.4, 0.45)
  const left = 40
  const maxW = 515
  const top = 842 - 40
  const bottom = 50
  let page = doc.addPage([595, 842])
  let y = top

  const ruimte = (gap: number) => {
    if (y - gap < bottom) {
      page = doc.addPage([595, 842])
      y = top
    }
  }
  // Breekt lange tekst af op woordgrenzen zodat niets van het blad loopt.
  const line = (text: string, opts: { size?: number; b?: boolean; color?: typeof dark; gap?: number; inspring?: number } = {}) => {
    const size = opts.size ?? 10
    const gap = opts.gap ?? size + 6
    const f = opts.b ? bold : font
    const x = left + (opts.inspring ?? 0)
    const breedte = maxW - (opts.inspring ?? 0)
    const woorden = safe(text).split(' ')
    let regel = ''
    const regels: string[] = []
    for (const w of woorden) {
      const probeer = regel ? `${regel} ${w}` : w
      if (f.widthOfTextAtSize(probeer, size) > breedte && regel) {
        regels.push(regel)
        regel = w
      } else regel = probeer
    }
    regels.push(regel)
    for (const r of regels) {
      ruimte(gap)
      page.drawText(r, { x, y, size, font: f, color: opts.color ?? dark })
      y -= gap
    }
  }
  // Een veld om met de hand in te vullen: label en een lijn (of de gekende waarde).
  const veld = (label: string, waarde?: string) => {
    ruimte(22)
    page.drawText(safe(label), { x: left, y, size: 9, font, color: grey })
    if (waarde) page.drawText(safe(waarde), { x: left + 170, y, size: 10, font, color: dark })
    else page.drawLine({ start: { x: left + 170, y: y - 2 }, end: { x: left + maxW, y: y - 2 }, thickness: 0.5, color: grey })
    y -= 22
  }
  const kader = (hoogte: number, label: string) => {
    ruimte(hoogte + 16)
    page.drawText(safe(label), { x: left, y, size: 9, font, color: grey })
    y -= 6
    page.drawRectangle({ x: left, y: y - hoogte, width: maxW, height: hoogte, borderColor: grey, borderWidth: 0.5 })
    y -= hoogte + 14
  }
  const witregel = (n = 8) => {
    y -= n
  }
  return { doc, line, veld, kader, witregel, grey }
}

export async function generateAccidentPdf(data: AccidentPdfData): Promise<Uint8Array> {
  const { doc, line, veld, kader, witregel, grey } = await nieuwFormulier()

  line('AANGIFTE LICHAMELIJK ONGEVAL', { size: 14, b: true })
  line('Krachtbal - verzekeringsaangifte (formulier 14)', { color: grey, size: 9, gap: 20 })
  line('Vul de lege vakken in, onderteken en laad dit blad samen met het geneeskundig getuigschrift op via "Mijn profiel".', { size: 9, color: grey, gap: 18 })

  line('Slachtoffer', { b: true, size: 11 })
  veld('Naam + voornaam', data.slachtoffer.naam)
  veld('Geboortedatum', data.slachtoffer.geboortedatum)
  veld('Adres', data.slachtoffer.adres)
  veld('Telefoon / e-mail')
  veld('Beroep (of school)', data.slachtoffer.beroep)
  veld('Ziekenfonds (mutualiteit)')
  veld('Rekeningnummer (IBAN)')
  witregel()

  line('Ongeval', { b: true, size: 11 })
  if (data.wedstrijd) veld('Wedstrijd', data.wedstrijd)
  veld('Plaats', data.ongeval.plaats)
  veld('Datum en uur', data.ongeval.datum)
  if (data.ongeval.omstandigheden) {
    line('Omstandigheden (zoals doorgegeven):', { size: 9, color: grey })
    line(data.ongeval.omstandigheden, { size: 9, inspring: 10 })
  }
  kader(60, 'Aanvulling door het slachtoffer (wat gebeurde er precies, welk lichaamsdeel):')

  const getuigen = data.getuigen.filter((g) => g.naam || g.adres)
  line('Getuigen', { b: true, size: 11 })
  if (getuigen.length) getuigen.forEach((g) => line(`${g.naam ?? '-'}${g.adres ? `, ${g.adres}` : ''}`, { size: 9, inspring: 10 }))
  else {
    veld('Naam + adres getuige 1')
    veld('Naam + adres getuige 2')
  }
  witregel()

  if (data.opmerkingen) {
    line('Opmerkingen', { b: true, size: 11 })
    line(data.opmerkingen, { size: 9, inspring: 10 })
    witregel()
  }

  line('Bij deze aangifte hoort het geneeskundig getuigschrift, ingevuld door de dokter.', { color: grey, size: 9, gap: 24 })
  veld('Datum')
  veld('Handtekening slachtoffer (of ouder)')
  veld('Handtekening clubsecretaris')

  return doc.save()
}

export type GetuigschriftData = { naam: string; geboortedatum?: string; datum?: string; wedstrijd?: string; omstandigheden?: string }

/** Geneeskundig getuigschrift: het blad dat de dokter invult bij een sportongeval. */
export async function generateGetuigschriftPdf(data: GetuigschriftData): Promise<Uint8Array> {
  const { doc, line, veld, kader, witregel, grey } = await nieuwFormulier()

  line('GENEESKUNDIG GETUIGSCHRIFT', { size: 14, b: true })
  line('Sportongeval krachtbal - in te vullen door de behandelende arts', { color: grey, size: 9, gap: 20 })

  line('Patiënt', { b: true, size: 11 })
  veld('Naam + voornaam', data.naam)
  veld('Geboortedatum', data.geboortedatum)
  veld('Datum van het ongeval', data.datum)
  if (data.wedstrijd) veld('Wedstrijd', data.wedstrijd)
  if (data.omstandigheden) {
    line('Omstandigheden volgens de aangifte:', { size: 9, color: grey })
    line(data.omstandigheden, { size: 9, inspring: 10 })
  }
  witregel()

  line('Vaststellingen van de arts', { b: true, size: 11 })
  veld('Datum eerste verzorging')
  kader(70, 'Aard en plaats van de letsels:')
  kader(50, 'Voorgeschreven behandeling (kinesitherapie, gips, operatie, ...):')
  veld('Vermoedelijke duur arbeids-/schoolongeschiktheid')
  veld('Sport hervatten vanaf (vermoedelijk)')
  veld('Blijvende letsels te verwachten?  ja / nee')
  witregel()

  line('Arts', { b: true, size: 11 })
  veld('Naam + RIZIV-nummer')
  veld('Datum')
  kader(60, 'Stempel en handtekening:')

  return doc.save()
}
