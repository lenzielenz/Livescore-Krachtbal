import type { Payload } from 'payload'

import { hasRole, isFederationLevel, userClubId } from './access'
import { relId } from './meldingen'
import { isOuderVan } from './ouders'

// De ledenfiche: adres, telefoon, nationaliteit, noodcontact en toestemmingen (foto's, nieuwsbrief). Wat de
// federatie en de verzekeraar nodig hebben (verzekerdenlijst, lib/lidmaatschap.ts) en wat het lid zelf bijhoudt.
// Wie mag wijzigen: de federatie, de staf van de club van het lid, het lid zelf en elke ouder.
// Bewust geen rijksregisternummer: dat mag in België enkel verwerkt worden met een wettelijke machtiging.

export type Fiche = {
  straat: string | null
  postcode: string | null
  gemeente: string | null
  land: string | null
  telefoon: string | null
  nationaliteit: string | null
  noodcontactNaam: string | null
  noodcontactTelefoon: string | null
  toestemmingFoto: boolean
  toestemmingNieuws: boolean
}

export const FICHE_VELDEN = ['straat', 'postcode', 'gemeente', 'land', 'telefoon', 'nationaliteit', 'noodcontactNaam', 'noodcontactTelefoon', 'toestemmingFoto', 'toestemmingNieuws'] as const

const tekst = (v: unknown, max: number): string | null => {
  const s = String(v ?? '')
    .replace(/[\u0000-\u001f]/g, ' ')
    .trim()
    .slice(0, max)
  return s || null
}

/** Een telefoonnummer zoals mensen het tikken: cijfers, spaties, +, /, ., -, haakjes; 8 tot 15 cijfers. */
export const geldigeTelefoon = (t: string): boolean => /^[+\d][\d\s/.()-]{6,20}$/.test(t) && (t.match(/\d/g)?.length ?? 0) >= 8 && (t.match(/\d/g)?.length ?? 0) <= 15

/** Nakijken wat er binnenkomt. Enkel de opgegeven velden; geeft de fout of de schone waarden. */
export function ficheUit(invoer: Record<string, unknown>): { ok: true; fiche: Partial<Fiche> } | { ok: false; error: string } {
  const f: Partial<Fiche> = {}
  for (const k of FICHE_VELDEN) {
    if (!(k in invoer)) continue
    if (k === 'toestemmingFoto' || k === 'toestemmingNieuws') f[k] = invoer[k] === true || invoer[k] === 'true' || invoer[k] === 'on'
    else f[k] = tekst(invoer[k], k === 'straat' ? 120 : k === 'gemeente' || k === 'noodcontactNaam' ? 80 : 40)
  }
  const land = f.land?.toUpperCase() ?? null
  if (f.land !== undefined) f.land = land
  if (land && !/^[A-Z]{2}$/.test(land)) return { ok: false, error: 'Land als landcode van 2 letters, bv. BE of NL.' }
  if (f.postcode && (land ?? 'BE') === 'BE' && !/^\d{4}$/.test(f.postcode)) return { ok: false, error: 'Een Belgische postcode heeft 4 cijfers.' }
  if (f.telefoon && !geldigeTelefoon(f.telefoon)) return { ok: false, error: 'Dat telefoonnummer klopt niet.' }
  if (f.noodcontactTelefoon && !geldigeTelefoon(f.noodcontactTelefoon)) return { ok: false, error: 'Het telefoonnummer van het noodcontact klopt niet.' }
  return { ok: true, fiche: f }
}

/** Mag deze gebruiker de fiche van dit lid zien en wijzigen? */
export async function magFiche(payload: Payload, user: unknown, playerId: number): Promise<boolean> {
  if (!user) return false
  if (isFederationLevel(user)) return true
  if (relId((user as { player?: unknown }).player) === playerId || isOuderVan(user, playerId)) return true
  const club = userClubId(user)
  if (club == null || !hasRole(user, 'club-beheerder', 'club-medewerker')) return false
  const p = await payload.findByID({ collection: 'players', id: playerId, depth: 1, overrideAccess: true }).catch(() => null)
  if (!p) return false
  const team = p.team && typeof p.team === 'object' ? (p.team as { club?: unknown }) : null
  return String(relId(p.club) ?? relId(team?.club)) === String(club)
}

export async function ficheLezen(payload: Payload, playerId: number): Promise<(Fiche & { naam: string; lidSinds: string | null; ficheBijgewerktOp: string | null }) | null> {
  const p = await payload.findByID({ collection: 'players', id: playerId, depth: 0, overrideAccess: true }).catch(() => null)
  if (!p) return null
  const r = p as unknown as Record<string, unknown>
  const s = (k: string) => (r[k] == null || r[k] === '' ? null : String(r[k]))
  return {
    naam: String(p.name ?? ''),
    straat: s('straat'),
    postcode: s('postcode'),
    gemeente: s('gemeente'),
    land: s('land'),
    telefoon: s('telefoon'),
    nationaliteit: s('nationaliteit'),
    noodcontactNaam: s('noodcontactNaam'),
    noodcontactTelefoon: s('noodcontactTelefoon'),
    toestemmingFoto: r.toestemmingFoto === true,
    toestemmingNieuws: r.toestemmingNieuws === true,
    lidSinds: s('lidSinds')?.slice(0, 10) ?? null,
    ficheBijgewerktOp: s('ficheBijgewerktOp'),
  }
}

/** De fiche bijwerken. Wijzigt een toestemming, dan wordt de datum van de toestemming mee bewaard. */
export async function ficheBijwerken(payload: Payload, user: unknown, playerId: number, invoer: Record<string, unknown>): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!(await magFiche(payload, user, playerId))) return { ok: false, status: 403, error: 'Je mag de gegevens van dit lid niet wijzigen.' }
  const r = ficheUit(invoer)
  if (!r.ok) return { ok: false, status: 400, error: r.error }
  const voor = await ficheLezen(payload, playerId)
  if (!voor) return { ok: false, status: 404, error: 'Lid niet gevonden.' }
  const nu = new Date().toISOString()
  const toestemmingGewijzigd =
    (r.fiche.toestemmingFoto !== undefined && r.fiche.toestemmingFoto !== voor.toestemmingFoto) ||
    (r.fiche.toestemmingNieuws !== undefined && r.fiche.toestemmingNieuws !== voor.toestemmingNieuws)
  await payload.update({
    collection: 'players',
    id: playerId,
    data: { ...r.fiche, ficheBijgewerktOp: nu, ...(toestemmingGewijzigd ? { toestemmingOp: nu } : {}) } as never,
    overrideAccess: true,
  })
  return { ok: true }
}
