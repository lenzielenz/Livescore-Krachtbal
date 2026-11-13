import type { Payload } from 'payload'

import { randomBytes } from 'node:crypto'

import { ouderUitnodigingHtml, stuurMail } from './mail'
import { relId } from './meldingen'
import { geldigEmail } from './registratie'
import { herstelLink } from './wachtwoord-reset'

// Ouders van jeugdspelers. De club vult bij de speler het e-mailadres van één of twee ouders in
// (Players.ouderEmail, Players.ouder2Email); elk account met zo'n adres krijgt het kind in `kinderen`
// (Users.kinderen) en ziet zo het dossier op "Mijn profiel": het medisch attest afdrukken en opladen, net als
// een lid met een eigen login. Beide ouders hebben dezelfde toegang. Bestaat er nog geen account, dan maken we
// er een (supporter) en nodigen we de ouder uit.

/** De spelers-id's waarvan deze gebruiker de ouder is. */
export function kinderIds(user: unknown): number[] {
  const k = (user as { kinderen?: unknown[] } | null)?.kinderen
  return Array.isArray(k) ? k.map(relId).filter((id): id is number => id != null) : []
}

export const isOuderVan = (user: unknown, playerId: number): boolean => kinderIds(user).includes(playerId)

export type OuderStatus = { status: 'aangemaakt' | 'gekoppeld' | 'bestond' | 'geen-email'; userId?: number; gemaild?: boolean }

/** Een uitnodiging blijft 7 dagen geldig, zoals die van een lid. */
const UITNODIGING_GELDIG_MS = 7 * 24 * 60 * 60 * 1000

/** De (geldige, verschillende) e-mailadressen van de ouders van dit lid. */
export function ouderAdressen(p: { ouderEmail?: unknown; ouder2Email?: unknown }): string[] {
  const lijst = [p.ouderEmail, p.ouder2Email].map((e) => String(e ?? '').trim().toLowerCase()).filter((e) => geldigEmail(e))
  return [...new Set(lijst)]
}

/**
 * Zorgt dat elke ouder met een opgegeven adres het kind in zijn account heeft — en dat een vroegere ouder
 * (de club veranderde het adres) het dossier niet langer ziet. Rollen en club van een bestaand account
 * blijven ongemoeid: ouder zijn geeft enkel inzage in en zorg voor het dossier van het kind. Geeft per ouder
 * wat er gebeurde (in de volgorde ouder, tweede ouder).
 */
export async function zorgVoorOuderLogin(payload: Payload, playerId: number): Promise<OuderStatus[]> {
  const p = await payload.findByID({ collection: 'players', id: playerId, depth: 1, overrideAccess: true })
  const adressen = ouderAdressen(p as { ouderEmail?: unknown; ouder2Email?: unknown })

  // Wie het kind nog heeft maar geen van de opgegeven adressen (meer) draagt, verliest de koppeling.
  const huidige = await payload.find({ collection: 'users', where: { kinderen: { in: [playerId] } }, depth: 0, limit: 10, overrideAccess: true })
  for (const u of huidige.docs) {
    if (adressen.includes(String(u.email ?? '').toLowerCase())) continue
    await payload.update({
      collection: 'users',
      id: u.id,
      data: { kinderen: kinderIds(u).filter((k) => k !== playerId) },
      overrideAccess: true,
    })
  }
  if (!adressen.length) return [{ status: 'geen-email' }]
  const uit: OuderStatus[] = []
  for (const email of adressen) uit.push(await koppelOuder(payload, p as never, playerId, email))
  return uit
}

async function koppelOuder(
  payload: Payload,
  p: { name?: unknown; voornaam?: unknown; club?: unknown },
  playerId: number,
  email: string,
): Promise<OuderStatus> {
  const bestaand = (await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1, depth: 0, overrideAccess: true })).docs[0]
  if (bestaand) {
    const al = kinderIds(bestaand)
    if (al.includes(playerId)) return { status: 'bestond', userId: Number(bestaand.id) }
    await payload.update({ collection: 'users', id: bestaand.id, data: { kinderen: [...al, playerId] }, overrideAccess: true })
    return { status: 'gekoppeld', userId: Number(bestaand.id) }
  }

  const club = relId(p.club)
  const user = await payload.create({
    collection: 'users',
    data: {
      email,
      name: `Ouder van ${String(p.voornaam || p.name || '')}`.trim(),
      password: randomBytes(24).toString('base64url'),
      roles: ['viewer'] as never,
      functie: 'supporter',
      club,
      kinderen: [playerId],
    },
    overrideAccess: true,
  })
  let gemaild = false
  const token = await payload.forgotPassword({ collection: 'users', data: { email }, disableEmail: true, expiration: UITNODIGING_GELDIG_MS }).catch(() => null)
  if (token) {
    const basis = process.env.PUBLIC_SERVER_URL || process.env.NEXT_PUBLIC_SERVER_URL || ''
    const clubNaam = p.club && typeof p.club === 'object' ? String((p.club as { name?: unknown }).name ?? 'De club') : 'De club'
    gemaild = (
      await stuurMail({ aan: email, onderwerp: 'Je login voor Krachtbal Live (ouder)', html: ouderUitnodigingHtml(String(p.name ?? ''), clubNaam, herstelLink(token, basis)) })
    ).verstuurd
  }
  return { status: 'aangemaakt', userId: Number(user.id), gemaild }
}
