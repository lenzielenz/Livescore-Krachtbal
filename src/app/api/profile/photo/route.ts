import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

import { getPayloadClient } from '@/lib/payload-client'

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB

// Profielfoto uploaden: maakt een media-document aan en koppelt het aan de ingelogde gebruiker.
// Bij een nieuwe foto zetten we de bijsnijding terug op standaard (de oude zoom paste op de oude foto).
export async function POST(req: Request) {
  const payload = await getPayloadClient()
  const { user } = await payload.auth({ headers: await headers() }).catch(() => ({ user: null }))
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Ongeldige aanvraag.' }, { status: 400 })
  }
  const file = form.get('file')
  if (!(file instanceof Blob)) return NextResponse.json({ error: 'Geen bestand ontvangen.' }, { status: 400 })
  if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: 'Enkel JPG, PNG of WEBP.' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'De foto is te groot (max. 5 MB).' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const name = (file instanceof File && file.name) || `profielfoto.${file.type.split('/')[1] ?? 'jpg'}`

  const media = await payload
    .create({
      collection: 'media',
      data: { alt: `Profielfoto ${(user as { name?: string; email?: string }).name ?? (user as { email?: string }).email ?? ''}`.trim() },
      file: { data: buffer, mimetype: file.type, name, size: file.size },
      overrideAccess: true,
    })
    .catch(() => null)
  if (!media) return NextResponse.json({ error: 'Uploaden mislukt.' }, { status: 500 })

  await payload.update({
    collection: 'users',
    id: (user as { id: number }).id,
    data: { photo: (media as { id: number }).id, photoZoom: 1, photoOffsetX: 0, photoOffsetY: 0 },
    overrideAccess: true,
  })

  const url = (media as { url?: string }).url ?? null
  return NextResponse.json({ ok: true, url, mediaId: (media as { id: number }).id })
}
