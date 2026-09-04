import { getPayloadClient } from '@/lib/payload-client'
import { clientIp, rateLimit } from '@/lib/sse-hub'
import { geldigeToken, wachtwoordFout } from '@/lib/wachtwoord-reset'

// Een nieuw wachtwoord zetten met de eenmalige herstellink van de beheerder.
//
// Publiek — dat moet ook: wie zijn wachtwoord vergeten is, kan per definitie niet inloggen. De
// token ís het bewijs (40 hex-tekens uit Payload's forgotPassword, met vervaldatum), en dat is
// het enige dat telt.
//
// Twee dingen die deze route bewust doet bovenop Payload's eigen reset:
//
//  1. RATE LIMITING per IP. Zonder dat staat er een eindeloze token-raadmachine open. Raden is
//     met 40 hex-tekens niet realistisch, maar een open lus die per poging de database bevraagt
//     is dat wél.
//  2. ALLE SESSIES INTREKKEN. payload.resetPassword laat bestaande sessies gewoon doorlopen én
//     maakt er zelf een nieuwe bij. Iemand die zijn wachtwoord kwijt is, kan het kwijt zijn
//     omdat een ander erbij kon — dan moet die ander eruit. Na het herstellen is iedereen uit
//     dit account uitgelogd en logt de eigenaar opnieuw in met zijn nieuwe wachtwoord.
//
// Contract: POST { token, password } → 200 { ok } | 400/403/429 { error }
export async function POST(req: Request) {
  const ip = clientIp(req)
  if (!rateLimit(`wachtwoordherstel:${ip}`, 10, 60_000)) {
    return Response.json({ error: 'Te veel pogingen. Probeer straks opnieuw.' }, { status: 429 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige aanvraag.' }, { status: 400 })
  }

  const token = geldigeToken(body.token)
  if (!token) {
    return Response.json({ error: 'Deze herstellink is niet geldig.' }, { status: 400 })
  }
  const fout = wachtwoordFout(body.password)
  if (fout) return Response.json({ error: fout }, { status: 400 })

  const payload = await getPayloadClient()
  let userId: number | null = null
  try {
    const uit = await payload.resetPassword({
      collection: 'users',
      data: { token, password: String(body.password) },
      overrideAccess: true,
    })
    const id = (uit as { user?: { id?: unknown } })?.user?.id
    userId = Number.isFinite(Number(id)) ? Number(id) : null
  } catch {
    // Payload geeft één melding voor "onbekend" en "verlopen"; dat onderscheid hoort de
    // buitenwereld ook niet te kennen.
    return Response.json(
      { error: 'Deze herstellink is verlopen of al gebruikt. Vraag een nieuwe aan bij je beheerder.' },
      { status: 403 },
    )
  }

  // Sessies intrekken, inclusief de sessie die resetPassword zonet zelf aanmaakte: na een
  // herstel logt iedereen opnieuw in, ook de persoon die net zijn wachtwoord koos. Lukt dit
  // niet, dan is het wachtwoord toch al gewijzigd — dat melden we niet als mislukking.
  if (userId != null) {
    await payload
      .update({ collection: 'users', id: userId, data: { sessions: [] }, overrideAccess: true })
      .catch(() => undefined)
  }

  return Response.json({ ok: true })
}
