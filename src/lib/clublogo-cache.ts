import { createHash } from 'crypto'
import { promises as fs } from 'fs'
import path from 'path'

import { isBewaardLogo } from './logo-bron'
import { resolveMediaDir } from './media-dir'

// Bewaarde kopieën van externe clublogo's (zie lib/logo-bron.ts).
//
// Volgorde: 1) kopie op het volume, 2) de bron zelf, 3) het webarchief (archive.org). Wat gevonden
// wordt, bewaren we meteen, zodat een logo maar één keer opgehaald hoeft te worden en blijft werken
// als de bron later (opnieuw) verdwijnt. Niets gevonden → null; de badge toont dan de initialen.

export type Logo = { data: Buffer; type: string; bron: 'kopie' | 'origineel' | 'archief' }

const MAX_BYTES = 3_000_000
const MISLUKT_MS = 30 * 60_000
const MAX_MISLUKT = 500

/** Recent mislukte URL's, zodat een verdwenen logo de bron en het archief niet blijft bestoken. */
const mislukt = new Map<string, number>()
/** Lopende ophaalacties: tien gelijktijdige verzoeken voor hetzelfde logo = één ophaling. */
const bezig = new Map<string, Promise<Logo | null>>()

function map(): string {
  return path.join(resolveMediaDir(), 'clublogo-cache')
}

function sleutel(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 32)
}

/**
 * Raw-adressen in het webarchief (id_ = de bytes zelf, zonder archiefomlijsting). Het archief kiest de
 * momentopname die het dichtst bij het jaartal ligt; een recente kan al de 404 zijn, dus eerst 2025
 * en daarna nog een oudere.
 */
export function archiefUrls(url: string): string[] {
  return ['2025', '2023'].map((jaar) => `https://web.archive.org/web/${jaar}id_/${url}`)
}

/** Het type uit de bytes zelf: een server die HTML met een 200 terugstuurt, is geen logo. */
export function beeldType(data: Buffer, opgegeven: string | null): string | null {
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg'
  if (data.length >= 6 && /^GIF8[79]a$/.test(data.subarray(0, 6).toString('latin1'))) return 'image/gif'
  if (data.length >= 12 && data.subarray(0, 4).toString('latin1') === 'RIFF' && data.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp'
  const begin = data.subarray(0, 512).toString('utf8').trimStart().toLowerCase()
  if ((opgegeven ?? '').includes('svg') && (begin.startsWith('<svg') || begin.startsWith('<?xml'))) return 'image/svg+xml'
  return null
}

async function haal(url: string, ms: number): Promise<{ data: Buffer; type: string } | null> {
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(ms), headers: { 'user-agent': 'KrachtbalLive/1.0 (clublogo-cache)' } })
    if (!res.ok) return null
    const lengte = Number(res.headers.get('content-length') ?? 0)
    if (lengte > MAX_BYTES) return null
    const data = Buffer.from(await res.arrayBuffer())
    if (data.length === 0 || data.length > MAX_BYTES) return null
    const type = beeldType(data, res.headers.get('content-type'))
    return type ? { data, type } : null
  } catch {
    return null
  }
}

async function leesKopie(k: string): Promise<Logo | null> {
  try {
    const [data, type] = await Promise.all([fs.readFile(path.join(map(), `${k}.bin`)), fs.readFile(path.join(map(), `${k}.type`), 'utf8')])
    return { data, type: type.trim(), bron: 'kopie' }
  } catch {
    return null
  }
}

async function bewaar(k: string, logo: { data: Buffer; type: string }): Promise<void> {
  try {
    await fs.mkdir(map(), { recursive: true })
    // Eerst het type, dan de bytes: een half geschreven kopie wordt zo nooit als geldig gelezen.
    await fs.writeFile(path.join(map(), `${k}.type`), logo.type)
    const tmp = path.join(map(), `${k}.bin.tmp`)
    await fs.writeFile(tmp, logo.data)
    await fs.rename(tmp, path.join(map(), `${k}.bin`))
  } catch {
    // Geen schrijfbare schijf: dan serveren we het logo gewoon zonder kopie.
  }
}

/** Het logo voor een toegestane externe URL, of null als het nergens (meer) te vinden is. */
export async function clubLogo(url: string, nu = Date.now()): Promise<Logo | null> {
  if (!isBewaardLogo(url)) return null
  const k = sleutel(url)
  const kopie = await leesKopie(k)
  if (kopie) return kopie
  const sinds = mislukt.get(url)
  if (sinds && nu - sinds < MISLUKT_MS) return null

  const lopend = bezig.get(url)
  if (lopend) return lopend
  const actie = (async (): Promise<Logo | null> => {
    const origineel = await haal(url, 6000)
    let gevonden: Logo | null = origineel ? { ...origineel, bron: 'origineel' } : null
    for (const archief of gevonden ? [] : archiefUrls(url)) {
      const a = await haal(archief, 12000)
      if (a) {
        gevonden = { ...a, bron: 'archief' }
        break
      }
    }
    if (!gevonden) {
      if (mislukt.size >= MAX_MISLUKT) mislukt.delete(mislukt.keys().next().value as string)
      mislukt.set(url, nu)
      return null
    }
    mislukt.delete(url)
    await bewaar(k, gevonden)
    return gevonden
  })()
  bezig.set(url, actie)
  try {
    return await actie
  } finally {
    bezig.delete(url)
  }
}

/** Enkel voor tests. */
export function _wisGeheugen(): void {
  mislukt.clear()
  bezig.clear()
}
