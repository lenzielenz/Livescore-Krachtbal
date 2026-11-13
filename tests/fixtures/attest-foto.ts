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
export async function attestFoto(o: { geschikt: boolean; nietHoger: boolean; hoek: number; blur?: number; schaduw?: boolean; playerId?: number }): Promise<Buffer> {
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
  const qr = await QRCode.toBuffer(kaartLink('https://livescore.roodgries.be', o.playerId ?? 4242), { margin: QR_MARGE, width: QR.b * PX })
  const blad = await sharp({ create: { width: W, height: H, channels: 3, background: '#fbfaf6' } })
    .composite([...MERKEN.map(zwart), ...balken.map((b) => ({ ...zwart(b), input: { create: { width: r(b).width, height: r(b).height, channels: 3 as const, background: '#555' } } })), { input: qr, left: r(QR).left, top: r(QR).top }, { input: Buffer.from(svg), left: 0, top: 0 }])
    .png()
    .toBuffer()
  let p = sharp(blad).rotate(o.hoek, { background: '#6b5640' })
  if (o.schaduw) {
    const m = await p.png().toBuffer()
    const meta = await sharp(m).metadata()
    const verloop = Buffer.from(`<svg width="${meta.width}" height="${meta.height}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity="0.35"/><stop offset="0.6" stop-color="#000" stop-opacity="0"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`)
    p = sharp(m).composite([{ input: verloop, left: 0, top: 0 }])
  }
  p = sharp(await p.png().toBuffer()).resize({ width: 2600 })
  if (o.blur) p = p.blur(o.blur)
  return p.jpeg({ quality: 78 }).toBuffer()
}
