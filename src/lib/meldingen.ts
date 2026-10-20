import type { Payload } from 'payload'

import { sendPushToUsers } from './push'

// Meldingen aan personen: een rij in de meldingenbox (🔔, /meldingen) én een push als die aan staat.
// Gebruikt voor de medische kaart, de registratie en andere "de andere partij moet het weten".

export type Melding = { titel: string; tekst?: string; url?: string }

const relId = (v: unknown): number | null => {
  const id = v && typeof v === 'object' ? (v as { id?: unknown }).id : v
  return id == null || !Number.isFinite(Number(id)) ? null : Number(id)
}

export async function meld(payload: Payload, userIds: (number | null | undefined)[], m: Melding): Promise<number> {
  const ids = [...new Set(userIds.filter((u): u is number => u != null))]
  for (const user of ids) {
    await payload.create({ collection: 'meldingen', data: { user, titel: m.titel, tekst: m.tekst, url: m.url, gelezen: false }, overrideAccess: true })
  }
  if (ids.length) void sendPushToUsers(payload, ids, { title: m.titel, body: m.tekst ?? '', url: m.url }).catch(() => null)
  return ids.length
}

/** De accounts die de club beheren (club-beheerder en club-medewerker). */
export async function clubStaf(payload: Payload, clubId: number | null): Promise<number[]> {
  if (clubId == null) return []
  const res = await payload.find({
    collection: 'users',
    where: { and: [{ club: { equals: clubId } }, { or: [{ roles: { contains: 'club-beheerder' } }, { roles: { contains: 'club-medewerker' } }] }] },
    depth: 0,
    limit: 100,
    overrideAccess: true,
  })
  return res.docs.map((u) => Number(u.id))
}

/** De account(s) gekoppeld aan dit spelersdossier (het lid zelf). */
export async function accountsVanSpeler(payload: Payload, playerId: number): Promise<number[]> {
  const res = await payload.find({ collection: 'users', where: { player: { equals: playerId } }, depth: 0, limit: 5, overrideAccess: true })
  return res.docs.map((u) => Number(u.id))
}

export { relId }
