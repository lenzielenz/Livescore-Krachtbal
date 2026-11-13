import jsQR, { type QRCode } from 'jsqr'
import { PDFArray, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'
import sharp from 'sharp'

import { leesKaartCode } from './medische-kaart-code'
import { type AttestLezing, leesAttest } from './medische-kaart-lezen'

// De QR van de medische kaart lezen uit wat iemand oplaadt: een foto met de gsm (scheef, met schaduw,
// een stuk tafel errond) of een scan als PDF. Lukt het, dan weet het systeem bij welk lid de kaart hoort
// (lib/medische-kaart-code.ts). Lukt het niet, dan is dat geen fout: het attest wordt gewoon bewaard bij
// het lid dat de gebruiker koos — enkel een kaart van een ANDER lid wordt geweigerd.
//
// Foto's: EXIF-draaiing toepassen, dan op een paar formaten proberen (een QR die klein in beeld staat
// heeft de volle resolutie nodig; een grote, wazige leest beter verkleind), telkens ook met versterkt
// contrast. PDF's: de ingebedde beelden (een scan is meestal één JPEG per blad) zo uithalen.

/**
 * `playerId`: het lid uit de QR van een persoonlijk attest. `blanco`: de QR van het blanco attest (geen lid; de
 * vakjes worden wel gelezen, want het blad is hetzelfde). Null: geen QR van ons gevonden.
 */
export type ScanUitkomst = { playerId: number | null; blanco: boolean; tekst: string; lezing: AttestLezing | null } | null

/** De QR van het blanco attest wijst naar de publieke oplaadpagina: `${basis}/attest`. */
export const isBlancoQr = (tekst: string): boolean => /^https?:\/\/[^\s]+\/attest(?:[/?#]|$)/i.test(tekst.trim())

const BREEDTES = [1400, 2200, 900]
/** Op dit formaat lezen we de aankruisvakjes (een vakje van 8 mm is dan ±60 px breed). */
const LEES_BREEDTE = 2000
const MAX_PIXELS = 50_000_000

/**
 * De vakjes lezen op een vast, ruim formaat — los van het formaat waarop de QR gevonden werd. De hoeken van de
 * QR schalen mee (hetzelfde beeld, enkel groter of kleiner).
 */
async function leesVakjes(basis: sharp.Sharp, qrBreedte: number, loc: QRCode['location'], versie: number): Promise<AttestLezing | null> {
  try {
    const { data, info } = await basis
      .clone()
      .resize({ width: LEES_BREEDTE, height: LEES_BREEDTE, fit: 'inside', withoutEnlargement: true })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const f = info.width / qrBreedte
    const s = (p: { x: number; y: number }) => ({ x: p.x * f, y: p.y * f })
    return leesAttest(
      { data: new Uint8Array(data.buffer, data.byteOffset, data.length), b: info.width, h: info.height },
      { linksboven: s(loc.topLeftCorner), rechtsboven: s(loc.topRightCorner), linksonder: s(loc.bottomLeftCorner), rechtsonder: s(loc.bottomRightCorner), versie },
    )
  } catch {
    return null
  }
}

async function leesBeeld(invoer: Buffer): Promise<ScanUitkomst> {
  let basis: sharp.Sharp
  try {
    basis = sharp(invoer, { limitInputPixels: MAX_PIXELS, failOn: 'none' }).rotate()
    const meta = await basis.metadata()
    if (!meta.width || !meta.height) return null
  } catch {
    return null // geen beeld dat sharp kan lezen (bv. HEIC zonder ondersteuning)
  }
  for (const breedte of BREEDTES) {
    for (const versterk of [false, true]) {
      try {
        let p = basis.clone().resize({ width: breedte, height: breedte, fit: 'inside', withoutEnlargement: true })
        if (versterk) p = p.greyscale().normalise()
        const { data, info } = await p.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
        const qr = jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), info.width, info.height, { inversionAttempts: 'attemptBoth' })
        if (qr?.data) {
          const playerId = leesKaartCode(qr.data)
          const blanco = playerId == null && isBlancoQr(qr.data)
          if (playerId != null || blanco) return { playerId, blanco, tekst: qr.data, lezing: await leesVakjes(basis, info.width, qr.location, qr.version) }
        }
      } catch {
        /* volgende poging */
      }
    }
  }
  return null
}

/** De ingebedde JPEG-beelden van een PDF (een scan); hooguit de eerste `max`. */
async function pdfBeelden(invoer: Buffer, max = 6): Promise<Buffer[]> {
  try {
    const pdf = await PDFDocument.load(invoer, { ignoreEncryption: true, updateMetadata: false })
    const uit: Buffer[] = []
    for (const [, obj] of pdf.context.enumerateIndirectObjects()) {
      if (!(obj instanceof PDFRawStream)) continue
      const d = obj.dict
      if (d.get(PDFName.of('Subtype')) !== PDFName.of('Image')) continue
      // Enkel JPEG (DCTDecode), ook als enige filter in een lijst: dat leest sharp rechtstreeks.
      const filter = d.get(PDFName.of('Filter'))
      const jpeg = filter === PDFName.of('DCTDecode') || (filter instanceof PDFArray && filter.size() === 1 && filter.get(0) === PDFName.of('DCTDecode'))
      if (!jpeg) continue
      uit.push(Buffer.from(obj.contents))
      if (uit.length >= max) break
    }
    return uit
  } catch {
    return []
  }
}

/** Zoekt de kaart-QR in een foto (JPG/PNG/WebP) of een gescande PDF. */
export async function scanKaart(invoer: Buffer, mimetype: string): Promise<ScanUitkomst> {
  if (mimetype === 'application/pdf') {
    for (const beeld of await pdfBeelden(invoer)) {
      const r = await leesBeeld(beeld)
      if (r) return r
    }
    return null
  }
  return leesBeeld(invoer)
}
