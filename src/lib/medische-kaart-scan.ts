import jsQR from 'jsqr'
import { PDFArray, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'
import sharp from 'sharp'

import { leesKaartCode } from './medische-kaart-code'

// De QR van de medische kaart lezen uit wat iemand oplaadt: een foto met de gsm (scheef, met schaduw,
// een stuk tafel errond) of een scan als PDF. Lukt het, dan weet het systeem bij welk lid de kaart hoort
// (lib/medische-kaart-code.ts). Lukt het niet, dan is dat geen fout: het attest wordt gewoon bewaard bij
// het lid dat de gebruiker koos — enkel een kaart van een ANDER lid wordt geweigerd.
//
// Foto's: EXIF-draaiing toepassen, dan op een paar formaten proberen (een QR die klein in beeld staat
// heeft de volle resolutie nodig; een grote, wazige leest beter verkleind), telkens ook met versterkt
// contrast. PDF's: de ingebedde beelden (een scan is meestal één JPEG per blad) zo uithalen.

export type ScanUitkomst = { playerId: number; tekst: string } | null

const BREEDTES = [1400, 2200, 900]
const MAX_PIXELS = 50_000_000

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
          if (playerId != null) return { playerId, tekst: qr.data }
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
