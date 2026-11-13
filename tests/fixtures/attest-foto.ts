// Testhulp: een ingevuld medisch attest zoals een gsm het fotografeert (geen echte PDF-rendering nodig: dezelfde
// maten uit lib/medische-kaart-layout.ts). Gebruikt door de unit- en integratietests van de medische kaart.
import QRCode from 'qrcode'
import sharp from 'sharp'

import { kaartLink } from '@/lib/medische-kaart-code'
import { MERKEN, PAGINA, QR, QR_MARGE, type Rect, VAKJES } from '@/lib/medische-kaart-layout'

const PX = 8 // pixels per mm op het "geprinte" blad

/**
 * Een ingevuld attest zoals een gsm het fotografeert, opgebouwd uit dezelfde maten als de PDF
 * (lib/medische-kaart-layout.ts): hoekmerken, QR, vakjes (met of zonder kruisje), wat "tekst"-blokken,
 * dan scheef, met tafel errond, een schaduw, wazig en als JPEG.
 */
export async function attestFoto(o: {
  geschikt: boolean
  nietHoger: boolean
  hoek: number
  blur?: number
  schaduw?: boolean
  playerId?: number
  /** Het blanco attest: de QR wijst naar /attest, geen lid. */
  blanco?: boolean
  /** Het blad ligt niet plat: kolommen golven op en neer (zoveel mm op het midden). */
  bol?: number
  /** De gsm hangt niet recht boven het blad: scheefgetrokken (affiene schering, fractie). */
  schuin?: number
  /** Zwak licht: donker, minder contrast, ruis. */
  donker?: boolean
  /** Via WhatsApp doorgestuurd: verkleind tot 1600 px en twee keer zwaar gecomprimeerd. */
  whatsapp?: boolean
}): Promise<Buffer> {
  const W = PAGINA.b * PX
  const H = PAGINA.h * PX
  const r = (q: Rect) => ({ left: Math.round(q.x * PX), top: Math.round(q.y * PX), width: Math.round(q.b * PX), height: Math.round(q.h * PX) })
  const zwart = (q: Rect) => ({ input: { create: { width: r(q).width, height: r(q).height, channels: 3 as const, background: '#111' } }, left: r(q).left, top: r(q).top })
  const kruis = (q: Rect) => `<line x1="${q.x * PX + 10}" y1="${q.y * PX + 10}" x2="${(q.x + q.b) * PX - 10}" y2="${(q.y + q.h) * PX - 10}" stroke="#1a2a6c" stroke-width="5"/><line x1="${(q.x + q.b) * PX - 12}" y1="${q.y * PX + 9}" x2="${q.x * PX + 9}" y2="${(q.y + q.h) * PX - 11}" stroke="#1a2a6c" stroke-width="5"/>`
  const vak = (q: Rect) => `<rect x="${q.x * PX}" y="${q.y * PX}" width="${q.b * PX}" height="${q.h * PX}" fill="none" stroke="#000" stroke-width="3"/>`
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${vak(VAKJES.geschikt)}${vak(VAKJES.nietHoger)}${o.geschikt ? kruis(VAKJES.geschikt) : ''}${o.nietHoger ? kruis(VAKJES.nietHoger) : ''}</svg>`
  // "Tekst": donkere balken op de plaatsen van titel, velden en de tekst naast de vakjes.
  const balken: Rect[] = [
    { x: 20, y: 28, b: 90, h: 9 },
    { x: 20, y: 40, b: 70, h: 5 },
    { x: 20, y: 90, b: 80, h: 4 },
    { x: 32, y: 148, b: 95, h: 4 },
    { x: 32, y: 161, b: 100, h: 4 },
    { x: 20, y: 250, b: 100, h: 3 },
  ]
  const link = o.blanco ? 'https://livescore.roodgries.be/attest' : kaartLink('https://livescore.roodgries.be', o.playerId ?? 4242)
  const qr = await QRCode.toBuffer(link, { margin: QR_MARGE, width: QR.b * PX })
  const blad = await sharp({ create: { width: W, height: H, channels: 3, background: '#fbfaf6' } })
    .composite([...MERKEN.map(zwart), ...balken.map((b) => ({ ...zwart(b), input: { create: { width: r(b).width, height: r(b).height, channels: 3 as const, background: '#555' } } })), { input: qr, left: r(QR).left, top: r(QR).top }, { input: Buffer.from(svg), left: 0, top: 0 }])
    .png()
    .toBuffer()
  let vlak = blad
  if (o.bol) {
    // Een golvend blad: elke kolom schuift verticaal (sinus over de breedte), zoals papier dat niet plat ligt.
    const { data, info } = await sharp(blad).raw().toBuffer({ resolveWithObject: true })
    const k = info.channels
    const uit = Buffer.alloc(data.length, 0xfb)
    const A = o.bol * PX
    for (let x = 0; x < info.width; x++) {
      const dy = Math.round(A * Math.sin((Math.PI * x) / info.width))
      for (let y = 0; y < info.height; y++) {
        const bron = y - dy
        if (bron < 0 || bron >= info.height) continue
        data.copy(uit, (y * info.width + x) * k, (bron * info.width + x) * k, (bron * info.width + x) * k + k)
      }
    }
    vlak = await sharp(uit, { raw: { width: info.width, height: info.height, channels: k } }).png().toBuffer()
  }
  if (o.schuin) vlak = await sharp(vlak).affine([[1, o.schuin], [o.schuin / 2, 1 - o.schuin / 3]], { background: '#6b5640' }).png().toBuffer()
  let p = sharp(vlak).rotate(o.hoek, { background: '#6b5640' })
  if (o.schaduw) {
    const m = await p.png().toBuffer()
    const meta = await sharp(m).metadata()
    const verloop = Buffer.from(`<svg width="${meta.width}" height="${meta.height}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity="0.35"/><stop offset="0.6" stop-color="#000" stop-opacity="0"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`)
    p = sharp(m).composite([{ input: verloop, left: 0, top: 0 }])
  }
  p = sharp(await p.png().toBuffer()).resize({ width: 2600 })
  if (o.blur) p = p.blur(o.blur)
  if (o.donker) {
    // Zwak licht: donkerder en vlakker, met ruis (een hoge ISO op de gsm).
    const m = await p.linear(0.5, 18).png().toBuffer()
    const meta = await sharp(m).metadata()
    const ruis = Buffer.alloc(meta.width! * meta.height!)
    let z = 12345
    for (let i = 0; i < ruis.length; i++) {
      z = (z * 1103515245 + 12345) & 0x7fffffff
      ruis[i] = z % 40
    }
    const ruisPng = await sharp(ruis, { raw: { width: meta.width!, height: meta.height!, channels: 1 } }).png().toBuffer()
    p = sharp(m).composite([{ input: ruisPng, blend: 'add' }])
  }
  const jpg = await p.jpeg({ quality: 78 }).toBuffer()
  if (!o.whatsapp) return jpg
  // WhatsApp: hooguit 1600 px aan de lange kant, zware JPEG — en nog eens bij het doorsturen.
  const een = await sharp(jpg).resize({ width: 1600, height: 1600, fit: 'inside' }).jpeg({ quality: 55 }).toBuffer()
  return sharp(een).jpeg({ quality: 60 }).toBuffer()
}
