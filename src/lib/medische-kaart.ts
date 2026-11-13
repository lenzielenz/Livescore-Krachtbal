import type { Payload } from 'payload'

import { hasRole, isFederationLevel, userClubId } from './access'
import { accountsVanSpeler, clubStaf, meld, relId } from './meldingen'
import { isOuderVan } from './ouders'
import { attestOpslaan, type AttestUitkomst } from './attest-server'

// Een medische kaart aanvragen bij de federatie. Het lid zelf (vanuit zijn profiel), een ouder voor
// zijn kind (jeugd, lib/ouders.ts) of de club voor een lid. De aanvraag gaat rechtstreeks naar de
// federatie; de ANDERE partij krijgt een melding: vragen lid of ouder, dan weet de club het; vraagt de
// club, dan weten lid en ouder het. Behandelt de federatie de aanvraag, dan horen ze het allemaal.

export type AanvraagUitkomst = { ok: true; id: number } | { ok: false; status: number; error: string }

export async function kaartAanvragen(payload: Payload, user: unknown, playerId: number): Promise<AanvraagUitkomst> {
  const speler = await payload.findByID({ collection: 'players', id: playerId, depth: 0, overrideAccess: true }).catch(() => null)
  if (!speler) return { ok: false, status: 404, error: 'Lid niet gevonden.' }
  const club = relId(speler.club)
  const eigenSpeler = relId((user as { player?: unknown } | null)?.player) === playerId
  const ouder = isOuderVan(user, playerId)
  const clubStafVanLid = hasRole(user, 'club-beheerder', 'club-medewerker') && club != null && String(userClubId(user)) === String(club)
  if (!eigenSpeler && !ouder && !clubStafVanLid && !isFederationLevel(user)) {
    return { ok: false, status: 403, error: 'Je kan enkel voor jezelf, je kind of een lid van je eigen club een kaart aanvragen.' }
  }
  const open = await payload.find({
    collection: 'medische-kaart-aanvragen',
    where: { and: [{ player: { equals: playerId } }, { status: { equals: 'aangevraagd' } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (open.docs.length) return { ok: false, status: 409, error: 'Er loopt al een aanvraag voor dit lid bij de federatie.' }

  const via = eigenSpeler ? 'lid' : ouder ? 'ouder' : 'club'
  const doc = await payload.create({
    collection: 'medische-kaart-aanvragen',
    data: { player: playerId, club, aangevraagdDoor: Number((user as { id: unknown }).id), via, status: 'aangevraagd' },
    overrideAccess: true,
  })
  const naam = String(speler.name ?? '')
  if (via !== 'club') {
    await meld(payload, await clubStaf(payload, club), {
      titel: via === 'ouder' ? `🩺 Een ouder vroeg de medische kaart van ${naam} aan` : `🩺 ${naam} vroeg een medische kaart aan`,
      tekst: 'De aanvraag ging rechtstreeks naar de federatie.',
      url: '/club/leden',
    })
  } else {
    await meld(payload, await accountsVanSpeler(payload, playerId), {
      titel: `🩺 De club vroeg de medische kaart van ${naam} aan`,
      tekst: 'De federatie behandelt de aanvraag; je krijgt bericht.',
      url: '/profiel',
    })
  }
  return { ok: true, id: Number(doc.id) }
}

/** De federatie behandelt aanvragen: verstuurd of geweigerd (met opmerking). Lid en club horen het. */
export async function kaartBehandelen(
  payload: Payload,
  ids: number[],
  status: 'verstuurd' | 'geweigerd',
  opmerking?: string,
): Promise<number> {
  const res = await payload.find({
    collection: 'medische-kaart-aanvragen',
    where: { and: [{ id: { in: ids } }, { status: { equals: 'aangevraagd' } }] },
    depth: 1,
    limit: ids.length || 1,
    overrideAccess: true,
  })
  for (const a of res.docs) {
    await payload.update({
      collection: 'medische-kaart-aanvragen',
      id: a.id,
      data: { status, opmerking: opmerking?.trim() || null, behandeldOp: new Date().toISOString() },
      overrideAccess: true,
    })
    const playerId = relId(a.player)
    const naam = a.player && typeof a.player === 'object' ? String((a.player as { name?: unknown }).name ?? '') : ''
    const m =
      status === 'verstuurd'
        ? { titel: '🩺 Medische kaart verstuurd', tekst: `Voor ${naam}.${opmerking ? ` ${opmerking}` : ''}` }
        : { titel: '🩺 Aanvraag medische kaart geweigerd', tekst: `Voor ${naam}.${opmerking ? ` Reden: ${opmerking}` : ''}` }
    await meld(payload, [...(playerId != null ? await accountsVanSpeler(payload, playerId) : []), ...(await clubStaf(payload, relId(a.club)))], {
      ...m,
      url: '/meldingen',
    })
  }
  return res.docs.length
}

/** Mag deze gebruiker de keuring van dit lid invoeren? Het lid zelf of een ouder (de club doet het via /club/leden). */
export function magKeuringInvoeren(user: unknown, playerId: number): boolean {
  return relId((user as { player?: unknown } | null)?.player) === playerId || isOuderVan(user, playerId)
}

/**
 * Het lid of een ouder laadt het ingevulde attest op (met eventueel de datum van de keuring). Het systeem
 * beoordeelt het meteen (lib/attest.ts): alles juist → goedgekeurd en de keuring geldt; anders kijkt de
 * federatie het na. De club krijgt een melding.
 */
export async function keuringInvoeren(
  payload: Payload,
  user: unknown,
  playerId: number,
  g: { datum: string; bestand: File | null },
): Promise<({ ok: true; id: number } & Pick<AttestUitkomst, 'status' | 'reden' | 'meldingen'>) | { ok: false; status: number; error: string }> {
  if (!magKeuringInvoeren(user, playerId)) return { ok: false, status: 403, error: 'Enkel voor jezelf of je kind.' }
  const speler = await payload.findByID({ collection: 'players', id: playerId, depth: 0, overrideAccess: true }).catch(() => null)
  if (!speler) return { ok: false, status: 404, error: 'Lid niet gevonden.' }
  const datum = g.datum ? g.datum.slice(0, 10) : null
  if (datum) {
    const d = new Date(datum)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datum) || Number.isNaN(d.getTime())) return { ok: false, status: 400, error: 'De datum van de keuring klopt niet.' }
    if (d.getTime() > Date.now() + 86_400_000) return { ok: false, status: 400, error: 'De keuring kan niet in de toekomst liggen.' }
  }
  if (!g.bestand) return { ok: false, status: 400, error: 'Laad het ingevulde attest op: dat is het bewijs van de keuring.' }

  const uit = await attestOpslaan(payload, { playerId, bestand: g.bestand, userId: Number((user as { id: unknown }).id), via: 'lid', keuringOp: datum })
  const naam = String(speler.name ?? '')
  const ouder = isOuderVan(user, playerId)
  await meld(payload, await clubStaf(payload, relId(speler.club)), {
    titel: uit.status === 'goedgekeurd' ? `✅ Medisch attest van ${naam} goedgekeurd` : `🩺 Nieuw medisch attest voor ${naam}`,
    tekst: `${ouder ? 'Een ouder' : naam} laadde het attest op. ${uit.status === 'goedgekeurd' ? 'Alles stond juist: de keuring geldt.' : `De federatie kijkt het na: ${uit.reden ?? ''}`}`,
    url: '/club/leden',
  })
  return { ok: true, id: playerId, status: uit.status, reden: uit.reden, meldingen: uit.meldingen }
}
