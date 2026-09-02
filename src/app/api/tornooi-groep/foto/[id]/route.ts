import fs from 'fs/promises'
import path from 'path'

import { uploadDirFor } from '@/collections/Media'
import { authUser, isFederationLevel } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { veiligeNaam } from '@/lib/zip'

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
      uploaderName?: string | null
      createdAt: string
    }
    // Twee soorten kijkers op dezelfde route. Het kantinescherm mag enkel een vérse foto van
    // déze tornooidag tonen (de onthulling); de federatie beheert het archief en mag alles van
    // die dag, ook maanden later. Zonder dat onderscheid kan het beheer zijn eigen foto's niet
    // bekijken of downloaden.
    const vers = Date.now() - new Date(doc.createdAt).getTime() <= TOON_VENSTER_MS
    const beheerder = isFederationLevel(await authUser(payload, req))
    if (!doc.filename || doc.groep !== naam || (!vers && !beheerder)) {
      return new Response('Niet gevonden', { status: 404 })
    }

    // path.basename beschermt tegen path traversal via een gemanipuleerde bestandsnaam.
    const bestand = path.join(uploadDirFor('tornooi-fotos'), path.basename(doc.filename))
    const data = await fs.readFile(bestand)
    // ?download=1 → bewaren in plaats van tonen. De naam draagt de inzender en het uur, zodat
    // een map met losse foto's achteraf nog te begrijpen valt.
    const wilDownload = new URL(req.url).searchParams.get('download') === '1'
    const stempel = new Date(doc.createdAt).toISOString().slice(0, 16).replace('T', '_').replace(':', 'u')
    const naamUit = veiligeNaam(`${stempel}-${doc.uploaderName || 'supporter'}${path.extname(doc.filename)}`)
    return new Response(new Uint8Array(data), {
      headers: {
        'Content-Type': doc.mimeType || 'image/jpeg',
        'Cache-Control': 'private, no-store',
        ...(wilDownload ? { 'Content-Disposition': `attachment; filename="${naamUit}"` } : {}),
      },
    })
  } catch {
    return new Response('Niet gevonden', { status: 404 })
  }
}

/**
 * Een foto verwijderen. Enkel de federatie, en enkel binnen de opgegeven tornooidag.
 *
 * Die tweede voorwaarde is geen overbodige luxe: zonder de dag mee te controleren, wist een
 * verkeerd id stilletjes een foto van een ánder tornooi. Payload ruimt het bestand op schijf
 * mee op.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const fotoId = Number(id)
  const naam = new URL(req.url).searchParams.get('naam')?.trim() ?? ''
  if (!Number.isFinite(fotoId) || !naam) {
    return Response.json({ error: 'Ongeldige aanvraag.' }, { status: 400 })
  }

  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    if (!isFederationLevel(user)) return Response.json({ error: 'Enkel de federatie.' }, { status: 403 })

    const doc = (await payload
      .findByID({ collection: 'tornooi-fotos', id: fotoId, depth: 0, overrideAccess: true })
      .catch(() => null)) as { groep?: string } | null
    if (!doc || doc.groep !== naam) return Response.json({ error: 'Foto niet gevonden.' }, { status: 404 })

    await payload.delete({ collection: 'tornooi-fotos', id: fotoId, overrideAccess: true })
    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 })
  }
}
