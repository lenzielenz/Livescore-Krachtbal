// @vitest-environment node

import { PDFDocument } from 'pdf-lib'
import QRCode from 'qrcode'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { kaartCode, kaartLink, leesKaartCode } from '@/lib/medische-kaart-code'
import { scanKaart } from '@/lib/medische-kaart-scan'
import { generateMedischeKaartPdf } from '@/lib/submit/pdf-medische-kaart'

process.env.PAYLOAD_SECRET ||= 'test-geheim-medische-kaart'

/** Een "gsm-foto" van een kaart: wit blad met de QR, een stuk tafel errond, scheef, wazig, JPEG. */
async function fotoVan(link: string, o: { hoek?: number; qrPx?: number; blur?: number } = {}): Promise<Buffer> {
  const qr = await QRCode.toBuffer(link, { errorCorrectionLevel: 'M', margin: 2, width: o.qrPx ?? 420 })
  const blad = await sharp({ create: { width: 2100, height: 2970, channels: 3, background: '#f4f1ea' } })
    .composite([
      { input: qr, left: 1500, top: 180 },
      { input: Buffer.from('<svg width="1200" height="120"><text x="0" y="80" font-size="80">MEDISCHE KAART</text></svg>'), left: 150, top: 200 },
    ])
    .png()
    .toBuffer()
  let p = sharp(blad).rotate(o.hoek ?? 6, { background: '#5a4632' }).resize({ width: 3000 })
  if (o.blur) p = p.blur(o.blur)
  return p.jpeg({ quality: 72 }).toBuffer()
}

describe('medische kaart: code', () => {
  it('ondertekend, terug te lezen uit code, link en overgetikte varianten', () => {
    const c = kaartCode(4711)
    expect(c).toMatch(/^K[0-9A-Z]+-[0-9A-HJKMNP-TV-Z]{8}$/)
    expect(leesKaartCode(c)).toBe(4711)
    expect(leesKaartCode(kaartLink('https://livescore.roodgries.be/', 4711))).toBe(4711)
    expect(leesKaartCode(`  ${c.toLowerCase().replace('-', ' ')} `)).toBe(4711)
    expect(leesKaartCode(c.replace(/0/g, 'O').replace(/1/g, 'I'))).toBe(4711)
  })

  it('een vervalste of andere code wijst niemand aan', () => {
    const c = kaartCode(4711)
    // Ander dossiernummer met de handtekening van 4711: geweigerd.
    expect(leesKaartCode(`K${(4712).toString(36).toUpperCase()}-${c.split('-')[1]}`)).toBeNull()
    expect(leesKaartCode(c, 'ander-geheim')).toBeNull()
    expect(leesKaartCode('https://example.com/k/KABC')).toBeNull()
    expect(leesKaartCode('')).toBeNull()
  })
})

describe('medische kaart: QR lezen uit wat iemand oplaadt', () => {
  const link = kaartLink('https://livescore.roodgries.be', 1234)

  it('een scheve, wazige gsm-foto', async () => {
    expect(await scanKaart(await fotoVan(link, { hoek: 8, blur: 1.2 }), 'image/jpeg')).toMatchObject({ playerId: 1234 })
  }, 30_000)

  it('een kleine QR in een grote foto', async () => {
    expect(await scanKaart(await fotoVan(link, { qrPx: 260, hoek: -4 }), 'image/jpeg')).toMatchObject({ playerId: 1234 })
  }, 30_000)

  it('een scan als PDF (JPEG per blad)', async () => {
    const pdf = await PDFDocument.create()
    const jpg = await pdf.embedJpg(await fotoVan(link, { hoek: 1 }))
    pdf.addPage([595, 842]).drawImage(jpg, { x: 0, y: 0, width: 595, height: 842 })
    expect(await scanKaart(Buffer.from(await pdf.save()), 'application/pdf')).toMatchObject({ playerId: 1234 })
  }, 30_000)

  it('geen kaart, of iets dat geen beeld is: null, geen fout', async () => {
    const leeg = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#ffffff' } }).jpeg().toBuffer()
    expect(await scanKaart(leeg, 'image/jpeg')).toBeNull()
    expect(await scanKaart(Buffer.from('geen beeld'), 'image/png')).toBeNull()
    expect(await scanKaart(Buffer.from('%PDF-kapot'), 'application/pdf')).toBeNull()
    // Een andere QR (bv. een reclame) wijst niemand aan.
    expect(await scanKaart(await fotoVan('https://example.com/promo'), 'image/jpeg')).toBeNull()
  }, 30_000)
})

describe('medische kaart: PDF', () => {
  it('één blad per lid, met tekens buiten WinAnsi zonder crash', async () => {
    const k = (id: number, naam: string) => ({
      playerId: id,
      naam,
      geboortedatum: '12/03/2011',
      club: 'KBC Ŝtad – “Test”',
      vergunningsnummer: 'V-2026-0042',
      categorie: 'Miniemen',
      seizoen: '2026-2027',
      code: kaartCode(id),
      link: kaartLink('https://livescore.roodgries.be', id),
    })
    const bytes = await generateMedischeKaartPdf([k(1, 'Zoë Ğül ✓'), k(2, 'Jan Peeters')])
    const pdf = await PDFDocument.load(bytes)
    expect(pdf.getPageCount()).toBe(2)
  })
})
