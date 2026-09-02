import fs from 'fs/promises'
import path from 'path'

import { uploadDirFor } from '@/collections/Media'
import { authUser, isFederationLevel } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { maakZip, veiligeNaam, type ZipBestand } from '@/lib/zip'

export const dynamic = 'force-dynamic'

// Alle foto's van één tornooidag in één bundel, om te bewaren of door te sturen naar de clubs.
//
// Enkel de federatie: dit archief is bewust niet publiek (zie collections/TornooiFotos.ts). Wie
// uploadt ziet zijn eigen foto nergens terug, en dat blijft zo — deze route geeft de foto's aan
// wie ze mag beheren, niet aan iedereen met de link.

/** Waar de foto's van deze bundel vandaan komen, met de naam waaronder ze in de zip komen. */
async function verzamel(
  fotos: { filename?: string | null; uploaderName?: string | null; createdAt: string }[],
): Promise<ZipBestand[]> {
  const map = uploadDirFor('tornooi-fotos')
  const uit: ZipBestand[] = []
  for (const f of fotos) {
    if (!f.filename) continue
    // path.basename beschermt tegen path traversal via een gemanipuleerde bestandsnaam.
    const data = await fs.readFile(path.join(map, path.basename(f.filename))).catch(() => null)
    if (!data) continue // bestand weg van schijf: de rest van de bundel niet laten sneuvelen
    // Een naam waar je iets aan hebt: wie stuurde het in, en wanneer.
    const stempel = new Date(f.createdAt).toISOString().slice(0, 16).replace('T', '_').replace(':', 'u')
    const inzender = veiligeNaam(f.uploaderName || 'supporter', 'supporter')
    const ext = path.extname(f.filename) || '.jpg'
    uit.push({ naam: `${stempel}-${inzender}${ext}`, data: Uint8Array.from(data) })
  }
  return uit
}

export async function GET(req: Request) {
  const naam = new URL(req.url).searchParams.get('naam')?.trim() ?? ''
  if (!naam) return new Response('Geen tornooidag opgegeven.', { status: 400 })

  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return new Response('Niet ingelogd.', { status: 401 })
  if (!isFederationLevel(user)) return new Response('Enkel de federatie.', { status: 403 })

  const res = await payload
    .find({
      collection: 'tornooi-fotos',
      where: { groep: { equals: naam } },
      sort: 'createdAt',
      depth: 0,
      limit: 1000,
      overrideAccess: true,
    })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))

  const bestanden = await verzamel(
    res.docs as { filename?: string | null; uploaderName?: string | null; createdAt: string }[],
  )
  if (bestanden.length === 0) return new Response('Geen foto’s om te bundelen.', { status: 404 })

  const zip = maakZip(bestanden)
  const bundelnaam = `${veiligeNaam(naam, 'tornooi')}-fotos.zip`
  return new Response(zip as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${bundelnaam}"`,
      'Content-Length': String(zip.byteLength),
      'Cache-Control': 'private, no-store',
    },
  })
}
