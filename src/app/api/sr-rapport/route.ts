import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { type Bijlage, MAX_BIJLAGE_BYTES, rapportIndienen } from '@/lib/sr-rapport'

// Scheidsrechtersrapport indienen (RCVK item 27, lib/sr-rapport.ts). Multipart: matchId, aanleidingen
// (meermaals), relaas, naam (de handtekening) en tot 5 bijlagen. Enkel de toegewezen scheidsrechter
// van die wedstrijd of de federatie.
export async function POST(req: Request) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return Response.json({ error: 'Ongeldig formulier.' }, { status: 400 })
  }
  const matchId = Number(form.get('matchId'))
  if (!Number.isInteger(matchId) || matchId <= 0) return Response.json({ error: 'Ongeldige wedstrijd.' }, { status: 400 })
  const bijlagen: Bijlage[] = []
  for (const b of form.getAll('bijlagen')) {
    if (typeof b === 'string' || b.size === 0) continue
    // Te groot: niet eerst helemaal inlezen, lib/sr-rapport.ts weigert het op de grootte.
    bijlagen.push({ data: b.size > MAX_BIJLAGE_BYTES ? Buffer.alloc(0) : Buffer.from(await b.arrayBuffer()), type: b.type, naam: b.name, grootte: b.size })
  }
  try {
    const r = await rapportIndienen(payload, user, matchId, {
      aanleidingen: form.getAll('aanleidingen').map(String),
      relaas: form.get('relaas'),
      naam: form.get('naam'),
      bijlagen,
    })
    return r.ok ? Response.json(r) : Response.json({ error: r.error }, { status: r.status })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
