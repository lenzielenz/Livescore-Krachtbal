import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

import { formatEuro, type VergoedingBerekening } from '../vergoeding'

// PDF-generatie voor de scheidsrechtersvergoedingen:
// - Kwitantie scheidsrechter (formulier_2): meerdere wedstrijden per blad.
// - Onkostenblad forfait (formulier_3): per wedstrijd, enkel bij FF.

const dark = rgb(0.1, 0.1, 0.12)
const grey = rgb(0.4, 0.4, 0.45)

type Writer = {
  line: (text: string, opts?: { size?: number; b?: boolean; color?: typeof dark; gap?: number; x?: number }) => void
  setY: (v: number) => void
  getY: () => number
}

async function startDoc(): Promise<{ doc: PDFDocument; page: ReturnType<PDFDocument['addPage']>; w: Writer; left: number; width: number }> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([595, 842]) // A4
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const { height, width } = page.getSize()
  const left = 40
  let y = height - 40
  const w: Writer = {
    line: (text, opts = {}) => {
      const size = opts.size ?? 10
      page.drawText(text, { x: opts.x ?? left, y, size, font: opts.b ? bold : font, color: opts.color ?? dark })
      if (opts.x === undefined) y -= opts.gap ?? size + 6
    },
    setY: (v) => {
      y = v
    },
    getY: () => y,
  }
  return { doc, page, w, left, width }
}

export type KwitantieRegel = {
  wedstrijdnr: string
  datum: string
  uur: string
  reeks: string
  thuis: string
  uit: string
  km: number
}

export type KwitantieData = {
  scheidsrechter: string
  federationNumber?: string
  periode: string
  regels: KwitantieRegel[]
  berekening: VergoedingBerekening
}

export async function generateRefereeReceiptPdf(data: KwitantieData): Promise<Uint8Array> {
  const { doc, w } = await startDoc()

  w.line('KWITANTIE SCHEIDSRECHTER — KVKBF', { size: 14, b: true })
  w.line(`${data.scheidsrechter}${data.federationNumber ? `  ·  lidnr. ${data.federationNumber}` : ''}`, { size: 11, b: true })
  w.line(`Periode: ${data.periode}`, { color: grey, gap: 20 })

  // Tabelkop.
  const cols = [40, 95, 150, 230, 280, 400, 520] // x-posities
  const headers = ['Wedstrijd', 'Datum', 'Uur', 'Reeks', 'Thuis — Bezoekers', '', 'km']
  headers.forEach((h, i) => w.line(h, { x: cols[i], b: true, size: 8, color: grey }))
  w.setY(w.getY() - 14)

  for (const r of data.regels) {
    const yRow = w.getY()
    w.line(r.wedstrijdnr, { x: cols[0], size: 8 })
    w.line(r.datum, { x: cols[1], size: 8 })
    w.line(r.uur, { x: cols[2], size: 8 })
    w.line(r.reeks, { x: cols[3], size: 8 })
    w.line(`${r.thuis} — ${r.uit}`.slice(0, 38), { x: cols[4], size: 8 })
    w.line(String(r.km), { x: cols[6], size: 8 })
    w.setY(yRow - 13)
  }

  w.setY(w.getY() - 12)
  w.line(
    `${data.berekening.aantalWedstrijden} wedstrijden × €13 = ${formatEuro(data.berekening.wedstrijdvergoeding)}`,
    { size: 10 },
  )
  w.line(`${data.berekening.km} km × €0,4327 = ${formatEuro(data.berekening.kmVergoeding)}`, { size: 10 })
  w.line(`TOTAAL: ${formatEuro(data.berekening.totaal)}`, { size: 12, b: true, gap: 40 })

  w.line('Naam + handtekening scheidsrechter:', { size: 9, color: grey })
  w.line('_______________________________________', { size: 10 })

  return doc.save()
}

export type ForfaitData = {
  titel: string
  wedstrijdnr: string
  datum: string
  uur: string
  reeks: string
  thuis: string
  uit: string
  gemeldThuis: boolean
  gemeldUit: boolean
  aantalAutos: number
  km: number
  berekening: VergoedingBerekening
}

export async function generateForfaitPdf(data: ForfaitData): Promise<Uint8Array> {
  const { doc, w } = await startDoc()
  const ja = (b: boolean) => (b ? 'JA' : 'neen')

  w.line('ONKOSTENBLAD FORFAIT (FF) — KVKBF', { size: 14, b: true })
  w.line(data.titel, { size: 11, b: true })
  w.line('Enkel in te vullen bij FF wanneer de scheidsrechter betaald/verplaatst is.', { color: grey, size: 9, gap: 20 })

  w.line(`Wedstrijdnr: ${data.wedstrijdnr}`, { size: 10 })
  w.line(`Datum / uur: ${data.datum}  ${data.uur}`, { size: 10 })
  w.line(`Reeks: ${data.reeks}`, { size: 10 })
  w.line(`Ploegen: ${data.thuis} — ${data.uit}`, { size: 10, gap: 18 })

  w.line(`Forfait gemeld thuis: ${ja(data.gemeldThuis)}`, { size: 10 })
  w.line(`Forfait gemeld bezoekers: ${ja(data.gemeldUit)}`, { size: 10 })
  w.line(`Aantal auto's (max 2): ${data.aantalAutos}`, { size: 10 })
  w.line(`Afgelegde km: ${data.km}`, { size: 10, gap: 20 })

  w.line(`Wedstrijdvergoeding: ${data.berekening.aantalWedstrijden} × €13 = ${formatEuro(data.berekening.wedstrijdvergoeding)}`, { size: 10 })
  w.line(`Verplaatsingskosten: ${data.berekening.km} km × €0,4259 = ${formatEuro(data.berekening.kmVergoeding)}`, { size: 10 })
  w.line(`TOTAAL: ${formatEuro(data.berekening.totaal)}`, { size: 12, b: true, gap: 40 })

  w.line('Naam + handtekening scheidsrechter:', { size: 9, color: grey })
  w.line('_______________________________________', { size: 10 })

  return doc.save()
}
