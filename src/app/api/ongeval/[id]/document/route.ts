import { authUser } from '@/lib/api-auth'
import { documentOpladen, type DocSoort } from '@/lib/ongeval-dossier'
import { getPayloadClient } from '@/lib/payload-client'
import { attestFout } from '@/lib/registratie-server'

// Een ingevuld document bij een ongevalsaangifte opladen (multipart: soort + bestand). De speler
// (of ouder), de club van de speler of de federatie (lib/ongeval-dossier.ts).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id)
  if (!Number.isFinite(id)) return Response.json({ error: 'Ongeldige aangifte.' }, { status: 400 })
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
  const form = await req.formData().catch(() => null)
  if (!form) return Response.json({ error: 'Ongeldige upload.' }, { status: 400 })
  const bestand = form.get('bestand')
  // Zelfde regels als een doktersattest: PDF of foto, max. 8 MB.
  const fout = attestFout(bestand)
  if (fout) return Response.json({ error: fout }, { status: 400 })
  try {
    const r = await documentOpladen(payload, user, id, String(form.get('soort') ?? '') as DocSoort, bestand as File)
    return r.ok ? Response.json({ ok: true }) : Response.json({ error: r.error }, { status: r.status })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
