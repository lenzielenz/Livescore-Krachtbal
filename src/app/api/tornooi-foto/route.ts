import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'

const MAX_FOTOS = 10
const MAX_BYTES = 15 * 1024 * 1024 // 15 MB per foto (gsm-foto's zijn groot)

// Supporters sturen foto's van een tornooidag in. Bewust géén publieke galerij: de foto is na
// het insturen "weg" voor de inzender — alles verzamelt federatie-only in de tornooi-fotos-
// collectie. Inloggen is vereist (spam-rem + je weet van wie de foto komt).
export async function POST(req: Request) {
  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Log in om foto’s te delen.' }, { status: 401 })

    const form = await req.formData().catch(() => null)
    if (!form) return Response.json({ error: 'Ongeldige upload.' }, { status: 400 })
    const groep = String(form.get('groep') ?? '').trim()
    if (!groep) return Response.json({ error: 'Tornooidag ontbreekt.' }, { status: 400 })
    // De actieve foto-opdracht (optioneel) — puur informatief voor de organisatie.
    const opdracht = String(form.get('opdracht') ?? '').trim().slice(0, 120)

    // Enkel voor échte tornooidagen — geen vrije opslagbak.
    const bestaat = await payload.find({ collection: 'tournaments', where: { groep: { equals: groep } }, limit: 1, depth: 0 })
    if (bestaat.docs.length === 0) return Response.json({ error: 'Onbekende tornooidag.' }, { status: 404 })

    const files = form.getAll('fotos').filter((f): f is File => f instanceof File)
    if (files.length === 0) return Response.json({ error: 'Geen foto’s gevonden.' }, { status: 400 })
    if (files.length > MAX_FOTOS) return Response.json({ error: `Maximaal ${MAX_FOTOS} foto’s per keer.` }, { status: 400 })

    let aantal = 0
    for (const f of files) {
      if (!f.type.startsWith('image/')) return Response.json({ error: `"${f.name}" is geen afbeelding.` }, { status: 400 })
      if (f.size > MAX_BYTES) return Response.json({ error: `"${f.name}" is groter dan 15 MB.` }, { status: 400 })
      await payload.create({
        collection: 'tornooi-fotos',
        data: {
          groep,
          ...(opdracht ? { opdracht } : {}),
          uploader: (user as { id: number }).id,
          uploaderName: String((user as { name?: string; email?: string }).name ?? (user as { email?: string }).email ?? ''),
        },
        file: {
          data: Buffer.from(await f.arrayBuffer()),
          mimetype: f.type,
          name: f.name,
          size: f.size,
        },
        overrideAccess: true,
      })
      aantal += 1
    }
    return Response.json({ ok: true, aantal })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
