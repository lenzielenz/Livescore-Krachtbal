import { hasRole } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { HERSTEL_GELDIG_MS, herstelLink, vervaltOp } from '@/lib/wachtwoord-reset'

// Een eenmalige herstellink aanmaken voor iemand die zijn wachtwoord vergeten is.
//
// Admin-only, en bewust GEEN mail: de beheerder krijgt de link op het scherm en geeft ze zelf
// door. Wat hij níét kan, is een wachtwoord voor die persoon kiezen — de gebruiker zet het zelf
// via de link, en de beheerder ziet het nooit.
//
// De token komt van Payload's eigen machinerie (forgotPassword met disableEmail): dezelfde
// resetPasswordToken/-Expiration die /wachtwoord-herstellen straks controleert. Zo bestaat er
// maar één soort herstel-token in het systeem.
//
// Contract: POST { userId } → 200 { link, vervalt, email } | 400/401/403/404/500 { error }
export async function POST(req: Request) {
  const payload = await getPayloadClient()
  const beheerder = await authUser(payload, req)
  if (!hasRole(beheerder, 'admin')) {
    return Response.json(
      { error: 'Enkel een admin kan een herstellink aanmaken.' },
      { status: beheerder ? 403 : 401 },
    )
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige aanvraag.' }, { status: 400 })
  }

  const userId = Number(body.userId)
  if (!Number.isFinite(userId)) {
    return Response.json({ error: 'Ongeldig account.' }, { status: 400 })
  }

  const doel = await payload
    .findByID({ collection: 'users', id: userId, depth: 0, overrideAccess: true })
    .catch(() => null)
  if (!doel) return Response.json({ error: 'Account niet gevonden.' }, { status: 404 })
  const email = String((doel as { email?: unknown }).email ?? '')
  if (!email) return Response.json({ error: 'Dit account heeft geen e-mailadres.' }, { status: 400 })

  // disableEmail: wij versturen niets. Zonder die vlag zou Payload de console-adapter gebruiken
  // en de link in de serverlogs schrijven — precies waar een herstel-token niet hoort.
  let token: string | null = null
  try {
    token = await payload.forgotPassword({
      collection: 'users',
      data: { email },
      disableEmail: true,
      expiration: HERSTEL_GELDIG_MS,
    })
  } catch {
    return Response.json({ error: 'De herstellink kon niet aangemaakt worden.' }, { status: 500 })
  }
  // forgotPassword zwijgt bij een onbekend adres (het geeft dan null terug) — hier kan dat enkel
  // als het account tussen opzoeken en aanmaken verdween.
  if (!token) return Response.json({ error: 'Account niet gevonden.' }, { status: 404 })

  const basis = process.env.PUBLIC_SERVER_URL || process.env.NEXT_PUBLIC_SERVER_URL || ''
  // De token staat in het antwoord (de beheerder moet de link kunnen doorgeven) maar gaat
  // nooit naar de logs.
  return Response.json({
    ok: true,
    email,
    link: herstelLink(token, basis),
    vervalt: vervaltOp(Date.now()).toISOString(),
  })
}
