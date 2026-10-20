import { isFederationLevel } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { hasFunctionGrant } from '@/lib/function-grants'
import { herinneringVersturen } from '@/lib/leden-overzicht-server'
import { getPayloadClient } from '@/lib/payload-client'

// De federatie herinnert een club aan leden die niet in orde zijn: POST { clubId } of
// { clubIds: [...] }. De tekst wordt hier opnieuw opgebouwd uit de leden zoals ze nu zijn (dezelfde
// regels als het voorbeeld op /beheer/leden) en gaat naar de staf van de club (🔔 + push).
export async function POST(req: Request) {
  const me = await getAuthUser()
  const payload = await getPayloadClient()
  const mag = isFederationLevel(me) || (await hasFunctionGrant(payload, (me as { id?: number } | null)?.id, 'beheer/leden'))
  if (!mag) return Response.json({ error: 'Enkel de federatie stuurt herinneringen.' }, { status: 403 })
  const body = (await req.json().catch(() => ({}))) as { clubId?: unknown; clubIds?: unknown }
  const ids = (Array.isArray(body.clubIds) ? body.clubIds : [body.clubId]).map(Number).filter((n) => Number.isInteger(n) && n > 0)
  if (!ids.length || ids.length > 100) return Response.json({ error: 'Kies een club.' }, { status: 400 })
  const verstuurd: { club: string; aan: string[] }[] = []
  const zonder: string[] = []
  for (const id of [...new Set(ids)]) {
    const r = await herinneringVersturen(payload, id)
    if (r.herinnering && r.aan.length) verstuurd.push({ club: r.club?.clubNaam ?? String(id), aan: r.aan.map((o) => o.naam) })
    else if (r.club) zonder.push(`${r.club.clubNaam} (${r.herinnering ? 'geen clubbeheerder met een account' : 'alles in orde'})`)
  }
  return Response.json({ ok: true, verstuurd, zonder })
}
