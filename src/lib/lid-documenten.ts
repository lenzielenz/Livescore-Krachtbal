import type { Payload } from 'payload'

import { hasRole, isFederationLevel } from './access'
import { magFiche } from './ledenfiche'
import { relId } from './meldingen'
import { clubStaf, meld } from './meldingen'

// Documenten per lid (collection "lid-documenten"): opladen, oplijsten, verwijderen. Wie bij het lid hoort (de
// federatie, de staf van zijn club, het lid zelf en de ouders — lib/ledenfiche.ts → magFiche) mag opladen en zien;
// een document "niet zichtbaar voor het lid" zien enkel de club en de federatie.

export const DOC_SOORTEN = ['identiteit', 'mutualiteit', 'toestemming', 'verzekering', 'ander'] as const
export type DocSoort = (typeof DOC_SOORTEN)[number]
export const DOC_SOORT_LABEL: Record<DocSoort, string> = {
  identiteit: 'Identiteit',
  mutualiteit: 'Mutualiteit',
  toestemming: 'Toestemming',
  verzekering: 'Verzekering',
  ander: 'Ander',
}
export const DOC_MAX_BYTES = 10 * 1024 * 1024
const TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])

export type DocRij = { id: number; titel: string; soort: DocSoort; opmerking: string | null; url: string | null; op: string; zichtbaarVoorLid: boolean; magWeg: boolean }

/** Is deze gebruiker staf (club of federatie) — dan ziet hij ook de interne documenten. */
const isStaf = (user: unknown) => isFederationLevel(user) || hasRole(user, 'club-beheerder', 'club-medewerker')

export async function documentenVan(payload: Payload, user: unknown, playerId: number): Promise<DocRij[] | null> {
  if (!(await magFiche(payload, user, playerId))) return null
  const staf = isStaf(user)
  const res = await payload.find({
    collection: 'lid-documenten',
    where: { and: [{ player: { equals: playerId } }, ...(staf ? [] : [{ zichtbaarVoorLid: { equals: true } }])] },
    sort: '-createdAt',
    depth: 0,
    limit: 200,
    overrideAccess: true,
  })
  const uid = Number((user as { id?: unknown }).id)
  return res.docs.map((d) => ({
    id: Number(d.id),
    titel: String(d.titel ?? ''),
    soort: (DOC_SOORTEN as readonly string[]).includes(String(d.soort)) ? (d.soort as DocSoort) : 'ander',
    opmerking: (d.opmerking as string | null) ?? null,
    url: typeof d.url === 'string' ? d.url : null,
    op: String(d.createdAt),
    zichtbaarVoorLid: d.zichtbaarVoorLid !== false,
    magWeg: staf || relId(d.geuploadDoor) === uid,
  }))
}

export async function documentOpladen(
  payload: Payload,
  user: { id: unknown } & Record<string, unknown>,
  playerId: number,
  o: { bestand: unknown; titel: unknown; soort: unknown; opmerking?: unknown; zichtbaarVoorLid?: unknown },
): Promise<{ ok: true; id: number } | { ok: false; status: number; error: string }> {
  if (!(await magFiche(payload, user, playerId))) return { ok: false, status: 403, error: 'Je mag voor dit lid geen documenten opladen.' }
  const f = o.bestand
  if (!(f instanceof File) || f.size === 0) return { ok: false, status: 400, error: 'Kies een bestand.' }
  if (!TYPES.has(f.type)) return { ok: false, status: 400, error: 'Enkel een PDF of een foto (JPG, PNG, WebP).' }
  if (f.size > DOC_MAX_BYTES) return { ok: false, status: 400, error: 'Het bestand is groter dan 10 MB.' }
  const titel = String(o.titel ?? '').trim().slice(0, 120)
  if (titel.length < 2) return { ok: false, status: 400, error: 'Geef het document een titel.' }
  const soort = (DOC_SOORTEN as readonly string[]).includes(String(o.soort)) ? (o.soort as DocSoort) : 'ander'
  const p = await payload.findByID({ collection: 'players', id: playerId, depth: 1, overrideAccess: true })
  const team = p.team && typeof p.team === 'object' ? (p.team as { club?: unknown }) : null
  const club = relId(p.club) ?? relId(team?.club)
  // Enkel de staf kan iets verbergen voor het lid; wat het lid zelf oplaadt, ziet het altijd.
  const zichtbaar = isStaf(user) ? o.zichtbaarVoorLid !== false && o.zichtbaarVoorLid !== 'false' : true
  const ext = f.type === 'application/pdf' ? 'pdf' : f.type.split('/')[1]
  const doc = await payload.create({
    collection: 'lid-documenten',
    data: { player: playerId, club, soort, titel, opmerking: String(o.opmerking ?? '').trim().slice(0, 300) || null, zichtbaarVoorLid: zichtbaar, geuploadDoor: Number(user.id) } as never,
    // Geen originele bestandsnaam: die bevat vaak persoonsgegevens.
    file: { data: Buffer.from(await f.arrayBuffer()), mimetype: f.type, name: `document-${playerId}-${Date.now()}.${ext}`, size: f.size },
    overrideAccess: true,
  })
  // Het lid of een ouder laadt iets op: de club hoort het.
  if (!isStaf(user)) {
    await meld(payload, await clubStaf(payload, club), { titel: `📎 Nieuw document voor ${String(p.name ?? '')}`, tekst: `${DOC_SOORT_LABEL[soort]}: ${titel}`, url: `/lid/${playerId}` })
  }
  return { ok: true, id: Number(doc.id) }
}

export async function documentVerwijderen(payload: Payload, user: unknown, id: number): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const d = await payload.findByID({ collection: 'lid-documenten', id, depth: 0, overrideAccess: true }).catch(() => null)
  const pid = relId(d?.player)
  if (!d || pid == null || !(await magFiche(payload, user, pid))) return { ok: false, status: 404, error: 'Document niet gevonden.' }
  if (!isStaf(user) && relId(d.geuploadDoor) !== Number((user as { id?: unknown }).id)) return { ok: false, status: 403, error: 'Enkel wie het opliet, of de club, verwijdert een document.' }
  await payload.delete({ collection: 'lid-documenten', id, overrideAccess: true })
  return { ok: true }
}
