import { deflateSync } from 'node:zlib'

// Een handtekening voor de demowereld: een vloeiende krabbel (afgeleid van de naam, dus elke keer
// dezelfde) als PNG-data-URL, zoals het tekenvak in de app ze opslaat. Zo staan er in de demo echte
// handtekeningen op het blad en in de PDF, in plaats van een leeg vak. Enkel voor de demo.

const W = 360
const H = 110

function crc32(buf: Buffer): number {
  let c = ~0
  for (const b of buf) {
    c ^= b
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1
  }
  return ~c >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

export function demoHandtekening(naam: string): string {
  // Grijswaarde + alfa (kleurtype 4): transparante achtergrond, donkerblauwe inkt via de alfa.
  const alfa = new Uint8Array(W * H)
  let seed = 7
  for (const ch of naam) seed = (seed * 31 + ch.charCodeAt(0)) % 9973
  const r = (i: number) => ((Math.sin(seed * (i + 1) * 12.9898) * 43758.5453) % 1 + 1) % 1
  const stip = (x: number, y: number, dik: number) => {
    for (let dy = -dik; dy <= dik; dy++)
      for (let dx = -dik; dx <= dik; dx++) {
        const px = Math.round(x + dx)
        const py = Math.round(y + dy)
        if (px < 0 || py < 0 || px >= W || py >= H || dx * dx + dy * dy > dik * dik + 0.5) continue
        alfa[py * W + px] = 255
      }
  }
  // Hoofdlijn: lussen die van links naar rechts lopen (zoals een geschreven naam), dan een haal eronder.
  const lussen = 5 + Math.floor(r(1) * 4)
  const stappen = 1400
  for (let i = 0; i <= stappen; i++) {
    const t = i / stappen
    // Schuin (cursief), met lussen die in hoogte variëren zoals letters.
    const hoogte = (16 + r(3) * 10) * (0.45 + 0.55 * Math.abs(Math.sin(t * Math.PI * (2.3 + r(5)))))
    const yy = H * 0.5 - Math.cos(t * Math.PI * 2 * lussen) * hoogte + Math.sin(t * 5 + r(4) * 6) * 5
    const x = 24 + t * (W - 70) + Math.sin(t * Math.PI * 2 * lussen) * (4 + r(2) * 4) + (H * 0.5 - yy) * 0.35
    const y = yy
    stip(x, y, 1.4)
  }
  for (let i = 0; i <= 400; i++) {
    const t = i / 400
    stip(40 + t * (W - 110), H * 0.78 + Math.sin(t * Math.PI) * -6 + t * 4, 1.1)
  }
  // Rijen: filterbyte 0 + per pixel [grijs, alfa].
  const raw = Buffer.alloc(H * (1 + W * 2))
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 2)] = 0
    for (let x = 0; x < W; x++) {
      const o = y * (1 + W * 2) + 1 + x * 2
      raw[o] = 30
      raw[o + 1] = alfa[y * W + x]
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(W, 0)
  ihdr.writeUInt32BE(H, 4)
  ihdr[8] = 8
  ihdr[9] = 4
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
  return `data:image/png;base64,${png.toString('base64')}`
}
