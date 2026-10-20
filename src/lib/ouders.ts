import type { Payload } from 'payload'

import { randomBytes } from 'node:crypto'

import { ouderUitnodigingHtml, stuurMail } from './mail'
import { relId } from './meldingen'
import { geldigEmail } from './registratie'
import { herstelLink } from './wachtwoord-reset'

// Ouders van jeugdspelers. De club vult bij de speler het e-mailadres van een ouder in (Players.ouderEmail);
// het account met dat adres krijgt het kind in `kinderen` (Users.kinderen) en ziet zo het dossier op
// "Mijn profiel": de medische kaart aanvragen en de keuring invoeren, net als een lid met een eigen login.
// Bestaat er nog geen account, dan maken we er een (supporter) en nodigen we de ouder uit.

/** De spelers-id's waarvan deze gebruiker de ouder is. */
export function kinderIds(user: unknown): number[] {
  const k = (user as { kinderen?: unknown[] } | null)?.kinderen
  return Array.isArray(k) ? k.map(relId).filter((id): id is number => id != null) : []
}

export const isOuderVan = (user: unknown, playerId: number): boolean => kinderIds(user).includes(playerId)

export type OuderStatus = { status: 'aangemaakt' | 'gekoppeld' | 'bestond' | 'geen-email'; userId?: number; gemaild?: boolean }

/** Een uitnodiging blijft 7 dagen geldig, zoals die van een lid. */
const UITNODIGING_GELDIG_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Zorgt dat de ouder met het opgegeven adres het kind in zijn account heeft — en dat een vroegere ouder
 * (de club veranderde het adres) het dossier niet langer ziet. Rollen en club van een bestaand account
 * blijven ongemoeid: ouder zijn geeft enkel inzage in en zorg voor het dossier van het kind.
 */
export async function zorgVoorOuderLogin(payload: Payload, playerId: number): Promise<OuderStatus> {
  const p = await payload.findByID({ collection: 'players', id: playerId, depth: 1, overrideAccess: true })
  const email = String(p.ouderEmail ?? '').trim().toLowerCase()

  // Wie het kind nog heeft maar niet (meer) het opgegeven adres draagt, verliest de koppeling.
  const huidige = await payload.find({ collection: 'users', where: { kinderen: { in: [playerId] } }, depth: 0, limit: 10, overrideAccess: true })
  for (const u of huidige.docs) {
    if (String(u.email ?? '').toLowerCase() === email) continue
    await payload.update({
      collection: 'users',
      id: u.id,
      data: { kinderen: kinderIds(u).filter((k) => k !== playerId) },
      overrideAccess: true,
    })
  }
  if (!geldigEmail(email)) return { status: 'geen-email' }

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
