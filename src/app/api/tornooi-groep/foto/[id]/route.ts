import fs from 'fs/promises'
import path from 'path'

import { uploadDirFor } from '@/collections/Media'
import { getPayloadClient } from '@/lib/payload-client'

// Toont één verse supportersfoto op het kantinescherm van de tornooidag. Bewust strak
// afgebakend: enkel foto's van de opgegeven tornooidag én maximaal 15 minuten oud — de
// feestelijke onthulling op het scherm. Het archief zelf blijft federatie-only (de gewone
// Payload-file-route weigert publiek).
const TOON_VENSTER_MS = 15 * 60000

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const fotoId = Number(id)
  const naam = new URL(req.url).searchParams.get('naam')?.trim() ?? ''
  if (!Number.isFinite(fotoId) || !naam) return new Response('Niet gevonden', { status: 404 })

  try {
    const payload = await getPayloadClient()
    const doc = (await payload.findByID({ collection: 'tornooi-fotos', id: fotoId, depth: 0, overrideAccess: true })) as {
      groep?: string
      filename?: string | null
      mimeType?: string | null
      createdAt: string
    }
    const vers = Date.now() - new Date(doc.createdAt).getTime() <= TOON_VENSTER_MS
    if (!doc.filename || doc.groep !== naam || !vers) return new Response('Niet gevonden', { status: 404 })

    // path.basename beschermt tegen path traversal via een gemanipuleerde bestandsnaam.
    const bestand = path.join(uploadDirFor('tornooi-fotos'), path.basename(doc.filename))
    const data = await fs.readFile(bestand)
    return new Response(new Uint8Array(data), {
      headers: {
        'Content-Type': doc.mimeType || 'image/jpeg',
        'Cache-Control': 'private, no-store',
      },
    })
  } catch {
    return new Response('Niet gevonden', { status: 404 })
  }
}
