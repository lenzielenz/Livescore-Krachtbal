import { getFieldsToSign, jwtSign, type Payload } from 'payload'
import { addSessionToUser, generatePayloadCookie } from 'payload/shared'

import type { Identiteit } from './oauth'

// Na een geslaagde aanmelding bij Google, Microsoft of Apple (lib/oauth.ts): wie is dit bij ons, en
// dezelfde sessie als bij het gewone inloggen (Payload: sessie in de databank + JWT-cookie). Zo werkt
// uitloggen, verlopen en "overal uitloggen" exact hetzelfde.
//
// Wie is het?
//   1. Deze externe identiteit (dienst + vast id) is al gekoppeld → dat account.
//   2. Anders: een account met hetzelfde e-mailadres, maar enkel als de dienst dat adres als
//      geverifieerd meldt → koppelen en inloggen.
//   3. Anders, met een geverifieerd adres: een nieuw account met de gewone rol (zoals /registreren).
//   Zonder geverifieerd adres koppelen of maken we niets: dan kon iemand een account overnemen.

export type Uitkomst = { ok: true; userId: number; cookie: string; nieuw: boolean } | { ok: false; status: number; error: string }

const sleutelVan = (i: Identiteit) => `${i.dienst}:${i.sub}`

export async function vindOfMaakGebruiker(
  payload: Payload,
  i: Identiteit,
  nu: Date = new Date(),
): Promise<{ ok: true; userId: number; nieuw: boolean } | { ok: false; status: number; error: string }> {
  if (!i.sub) return { ok: false, status: 400, error: 'De dienst gaf geen geldige identiteit terug.' }
  const sleutel = sleutelVan(i)
  const gekoppeld = await payload.find({ collection: 'users', where: { 'oauthIdentiteiten.sleutel': { equals: sleutel } }, depth: 0, limit: 1, overrideAccess: true })
  if (gekoppeld.docs[0]) return { ok: true, userId: Number(gekoppeld.docs[0].id), nieuw: false }

  if (!i.email || !i.emailGeverifieerd) {
    return {
      ok: false,
      status: 403,
      error:
        'Deze dienst bevestigde je e-mailadres niet. Log in met je e-mailadres en wachtwoord, of gebruik een ander account.',
    }
  }
  const rij = { sleutel, dienst: i.dienst, email: i.email, gekoppeldOp: nu.toISOString() }
  const bestaand = await payload.find({ collection: 'users', where: { email: { equals: i.email } }, depth: 0, limit: 1, overrideAccess: true })
  const u = bestaand.docs[0]
  if (u) {
    const rijen = (Array.isArray(u.oauthIdentiteiten) ? u.oauthIdentiteiten : []).map((r) => ({ sleutel: r.sleutel, dienst: r.dienst, email: r.email, gekoppeldOp: r.gekoppeldOp }))
    await payload.update({ collection: 'users', id: u.id, data: { oauthIdentiteiten: [...rijen, rij] } as never, overrideAccess: true })
    return { ok: true, userId: Number(u.id), nieuw: false }
  }
  // Nieuw account: zelfde rol als zelf registreren; een willekeurig wachtwoord dat niemand kent (wie
  // later met e-mail wil inloggen, kiest er een via "Wachtwoord vergeten").
  const wachtwoord = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url')
  const doc = await payload.create({
    collection: 'users',
    data: { email: i.email, name: i.naam ?? undefined, password: wachtwoord, roles: ['viewer'], oauthIdentiteiten: [rij] } as never,
    overrideAccess: true,
  })
  return { ok: true, userId: Number(doc.id), nieuw: true }
}

/** Een sessie zoals Payloads eigen login: sessie in de databank, ondertekende token, cookie. */
export async function sessieVoor(payload: Payload, userId: number): Promise<string> {
  const collectionConfig = payload.collections.users.config
  const user = (await payload.findByID({ collection: 'users', id: userId, depth: 0, overrideAccess: true, showHiddenFields: true })) as unknown as Parameters<typeof addSessionToUser>[0]['user']
  const req = { payload, context: {} } as unknown as Parameters<typeof addSessionToUser>[0]['req']
  const { sid } = await addSessionToUser({ collectionConfig, payload, req, user })
  const fieldsToSign = getFieldsToSign({ collectionConfig, email: String((user as { email?: unknown }).email ?? ''), user, ...(sid ? { sid } : {}) } as never)
  const { token } = await jwtSign({ fieldsToSign, secret: payload.secret, tokenExpiration: collectionConfig.auth.tokenExpiration })
  return generatePayloadCookie({ collectionAuthConfig: collectionConfig.auth, cookiePrefix: payload.config.cookiePrefix, token })
}

export async function aanmelden(payload: Payload, i: Identiteit, nu: Date = new Date()): Promise<Uitkomst> {
  const r = await vindOfMaakGebruiker(payload, i, nu)
  if (!r.ok) return r
  return { ok: true, userId: r.userId, nieuw: r.nieuw, cookie: await sessieVoor(payload, r.userId) }
}
