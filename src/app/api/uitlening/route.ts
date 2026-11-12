import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { uitleningIntrekken, uitleningOpstellen, uitleningTekenen } from '@/lib/uitlening'

// Uitlenen van jeugdspelers (RCVK item 45, lib/uitlening.ts). POST { actie, … }:
//   opstellen  { spelerId, naarPloegId, adres, naam }  — de uitlenende club, tekent meteen
//   tekenen    { id, naam }                           — de ontvangende club
//   intrekken  { id, reden }                          — een club (vóór bevestiging) of de federatie
// Bevestigen/weigeren doet de federatie op het bord (/api/federatie/aanvragen).
export async function POST(req: Request) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  try {
    const r =
      body.actie === 'opstellen'
        ? await uitleningOpstellen(payload, user, body)
        : body.actie === 'tekenen'
          ? await uitleningTekenen(payload, user, Number(body.id), body.naam)
          : body.actie === 'intrekken'
            ? await uitleningIntrekken(payload, user, Number(body.id), String(body.reden ?? ''))
            : { ok: false as const, status: 400, error: 'Onbekende actie.' }
    return r.ok ? Response.json(r) : Response.json({ error: r.error }, { status: r.status })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
