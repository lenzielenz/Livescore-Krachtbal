import { authUser } from '@/lib/api-auth'
import { opdrachtVoor, zaadVoor } from '@/lib/foto-opdrachten'
import { getPayloadClient } from '@/lib/payload-client'
import { volbrachtVoor } from '@/lib/foto-voortgang'

const MAX_FOTOS = 10
const MAX_BYTES = 15 * 1024 * 1024 // 15 MB per foto (gsm-foto's zijn groot)

// Supporters sturen foto's van een tornooidag in. Bewust géén publieke galerij: de foto is na
// het insturen "weg" voor de inzender — alles verzamelt federatie-only in de tornooi-fotos-
// collectie. Inloggen is vereist (spam-rem + je weet van wie de foto komt).
//
// Welke opdracht de foto beantwoordt, rekent de SERVER uit — niet de browser. Zolang het maar
// een tekstje naast de foto was, kon dat de client zijn; nu elke deelnemer zijn eigen geschudde
// reeks van vijftig heeft, is het een regel, en een regel die de inzender zelf mag invullen is
// geen regel. Meegestuurde opdrachtteksten worden genegeerd.
export async function POST(req: Request) {
  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Log in om foto’s te delen.' }, { status: 401 })

    const form = await req.formData().catch(() => null)
    if (!form) return Response.json({ error: 'Ongeldige upload.' }, { status: 400 })
    const groep = String(form.get('groep') ?? '').trim()
    if (!groep) return Response.json({ error: 'Tornooidag ontbreekt.' }, { status: 400 })

    // Enkel voor échte tornooidagen — geen vrije opslagbak.
    const bestaat = await payload.find({ collection: 'tournaments', where: { groep: { equals: groep } }, limit: 1, depth: 0 })
    if (bestaat.docs.length === 0) return Response.json({ error: 'Onbekende tornooidag.' }, { status: 404 })

    const files = form.getAll('fotos').filter((f): f is File => f instanceof File)
    if (files.length === 0) return Response.json({ error: 'Geen foto’s gevonden.' }, { status: 400 })
    if (files.length > MAX_FOTOS) return Response.json({ error: `Maximaal ${MAX_FOTOS} foto’s per keer.` }, { status: 400 })

    // Welke opdracht is deze inzending? Die van de deelnemer op dit moment, uit zijn eigen
    // geschudde reeks. Meerdere foto's in één keer horen bij DEZELFDE opdracht — je hebt er één
    // volbracht, niet drie — dus ze krijgen allemaal hetzelfde nummer.
    const deelnemerId = (user as { id: number }).id
    const volbracht = await volbrachtVoor(payload, groep, deelnemerId)
    const opdracht = opdrachtVoor(zaadVoor(deelnemerId, groep), volbracht)

    let aantal = 0
    for (const f of files) {
      if (!f.type.startsWith('image/')) return Response.json({ error: `"${f.name}" is geen afbeelding.` }, { status: 400 })
      if (f.size > MAX_BYTES) return Response.json({ error: `"${f.name}" is groter dan 15 MB.` }, { status: 400 })
      await payload.create({
        collection: 'tornooi-fotos',
        data: {
          groep,
          opdracht: opdracht.tekst,
          opdrachtNr: volbracht,
          uploader: deelnemerId,
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
    // De volgende opdracht meteen meegeven: dan schuift de kaart aan zonder de pagina te
    // herladen, en zonder dat de browser zelf hoeft te raden wat er nu aan de beurt is.
    const volgende = opdrachtVoor(zaadVoor(deelnemerId, groep), volbracht + 1)
    return Response.json({ ok: true, aantal, opdracht: opdracht.tekst, volgende })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
