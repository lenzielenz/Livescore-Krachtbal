import { authUser } from '@/lib/api-auth'
import { keuringInvoeren } from '@/lib/medische-kaart'
import { relId } from '@/lib/meldingen'
import { getPayloadClient } from '@/lib/payload-client'
import { attestFout } from '@/lib/registratie-server'

// De medische keuring invoeren vanuit "Mijn profiel" (multipart): datum + ingevuld attest.
//   playerId leeg → voor jezelf (je account is gekoppeld aan je dossier)
//   playerId      → als ouder voor je kind (lib/ouders.ts)
export async function POST(req: Request) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return Response.json({ error: 'Log in om de keuring in te voeren.' }, { status: 401 })
  const form = await req.formData().catch(() => null)
  if (!form) return Response.json({ error: 'Ongeldige upload.' }, { status: 400 })
  const raw = form.get('playerId')
  const playerId = raw ? Number(raw) : relId((user as { player?: unknown }).player)
  if (playerId == null || !Number.isFinite(playerId)) return Response.json({ error: 'Geen spelersdossier gekoppeld.' }, { status: 400 })
  const bestand = form.get('bestand')
  const heeftBestand = bestand instanceof File && bestand.size > 0
  if (heeftBestand) {
    const fout = attestFout(bestand)
    if (fout) return Response.json({ error: fout }, { status: 400 })
  }
  try {
    const r = await keuringInvoeren(payload, user, playerId, { datum: String(form.get('datum') ?? ''), bestand: heeftBestand ? (bestand as File) : null })
    return r.ok ? Response.json({ ok: true }) : Response.json({ error: r.error }, { status: r.status })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
