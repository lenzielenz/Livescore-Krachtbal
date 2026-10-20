import { demoWachtwoord } from '@/lib/demoruimte/klaarzetten'
import { demoEmail, demoRol } from '@/lib/demoruimte/rollen'
import { cookieRegel, cookieUitVerzoek, demoToegang, TOEGANG_COOKIE } from '@/lib/demoruimte/toegang'
import { getPayloadClient } from '@/lib/payload-client'

// Rol wisselen in de demoruimte: { rol } → ingelogd als dat demo-account (gewone Payload-sessie),
// { rol: 'publiek' } → uitgelogd. Enkel in de demo-omgeving (zie lib/demoruimte/toegang.ts): op
// live of de testomgeving bestaat deze route niet.
export async function POST(req: Request) {
  if (!demoToegang(cookieUitVerzoek(req, TOEGANG_COOKIE))) return Response.json({ error: 'Geen toegang tot de demoruimte.' }, { status: 404 })
  const body = (await req.json().catch(() => ({}))) as { rol?: unknown }
  const sleutel = String(body.rol ?? '')
  if (sleutel === 'publiek') {
    const res = Response.json({ ok: true, start: '/' })
    res.headers.append('Set-Cookie', cookieRegel('payload-token', '', 0))
    return res
  }
  const rol = demoRol(sleutel)
  if (!rol) return Response.json({ error: 'Onbekende rol.' }, { status: 400 })
  try {
    const payload = await getPayloadClient()
    const email = demoEmail(rol.sleutel)
    const inloggen = () => payload.login({ collection: 'users', data: { email, password: demoWachtwoord() } })
    // Wijzigde iemand tijdens een demo het wachtwoord van een demo-account (of werd het vergrendeld
    // na foute pogingen)? Dan zetten we het stil terug: rol wisselen moet altijd werken.
    const r = await inloggen().catch(async () => {
      const u = (await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1, overrideAccess: true })).docs[0]
      if (!u) throw new Error('geen account')
      await payload.update({ collection: 'users', id: u.id, data: { password: demoWachtwoord(), loginAttempts: 0, lockUntil: null } as never, overrideAccess: true })
      return inloggen()
    })
    const res = Response.json({ ok: true, start: rol.start, naam: rol.naam })
    res.headers.append('Set-Cookie', cookieRegel('payload-token', String(r.token), 7 * 86_400))
    return res
  } catch {
    return Response.json({ error: 'Deze rol bestaat nog niet — zet de demo eerst klaar.' }, { status: 409 })
  }
}
