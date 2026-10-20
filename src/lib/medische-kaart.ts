import type { Payload } from 'payload'

import { hasRole, isFederationLevel, userClubId } from './access'
import { accountsVanSpeler, clubStaf, meld, relId } from './meldingen'

// Een medische kaart aanvragen bij de federatie. Het lid zelf (vanuit zijn profiel) of de club voor
// een lid. De aanvraag gaat rechtstreeks naar de federatie; de ANDERE partij krijgt een melding: vraagt
// het lid, dan weet de club het; vraagt de club, dan weet het lid het. Behandelt de federatie de
// aanvraag, dan horen beiden het.

export type AanvraagUitkomst = { ok: true; id: number } | { ok: false; status: number; error: string }

export async function kaartAanvragen(payload: Payload, user: unknown, playerId: number): Promise<AanvraagUitkomst> {
  const speler = await payload.findByID({ collection: 'players', id: playerId, depth: 0, overrideAccess: true }).catch(() => null)
  if (!speler) return { ok: false, status: 404, error: 'Lid niet gevonden.' }
  const club = relId(speler.club)
  const eigenSpeler = relId((user as { player?: unknown } | null)?.player) === playerId
  const clubStafVanLid = hasRole(user, 'club-beheerder', 'club-medewerker') && club != null && String(userClubId(user)) === String(club)
  if (!eigenSpeler && !clubStafVanLid && !isFederationLevel(user)) {
    return { ok: false, status: 403, error: 'Je kan enkel voor jezelf of voor een lid van je eigen club een kaart aanvragen.' }
  }
  const open = await payload.find({
    collection: 'medische-kaart-aanvragen',
    where: { and: [{ player: { equals: playerId } }, { status: { equals: 'aangevraagd' } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (open.docs.length) return { ok: false, status: 409, error: 'Er loopt al een aanvraag voor dit lid bij de federatie.' }

  const via = eigenSpeler ? 'lid' : 'club'
  const doc = await payload.create({
    collection: 'medische-kaart-aanvragen',
    data: { player: playerId, club, aangevraagdDoor: Number((user as { id: unknown }).id), via, status: 'aangevraagd' },
    overrideAccess: true,
  })
  const naam = String(speler.name ?? '')
  if (via === 'lid') {
    await meld(payload, await clubStaf(payload, club), {
      titel: `🩺 ${naam} vroeg een medische kaart aan`,
      tekst: 'De aanvraag ging rechtstreeks naar de federatie.',
      url: '/club/leden',
    })
  } else {
    await meld(payload, await accountsVanSpeler(payload, playerId), {
      titel: '🩺 Je club vroeg je medische kaart aan',
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
