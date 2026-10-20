import type { Payload } from 'payload'

import { hasRole, isFederationLevel, userClubId } from './access'
import { zonderVoorvoegsel } from './blessure'
import { accountsVanSpeler, clubStaf, meld, relId } from './meldingen'
import { kinderIds } from './ouders'

// Het dossier van een blessure (collections/Accidents.ts), na het doorgeven (lib/blessure.ts):
//   1. de speler (of zijn ouder) vindt op "Mijn profiel" de aangifte (vooraf ingevuld) en het
//      geneeskundig getuigschrift voor de dokter;
//   2. hij laat ze invullen, laadt ze op en dient in → de federatie (en de club) krijgen een melding;
//   3. de federatie handelt af, of stuurt terug met een opmerking (iets ontbreekt) → speler en club horen het.
// De club kan het voor haar speler doen (bv. een jeugdspeler zonder login).

export type OngevalRol = 'federatie' | 'club' | 'speler'
export type OngevalStatus = 'gemeld' | 'ingediend' | 'afgehandeld'
export type DocSoort = 'aangifte' | 'getuigschrift' | 'ander'
export type Uitkomst = { ok: true } | { ok: false; status: number; error: string }

export const DOC_SOORTEN: { value: DocSoort; label: string }[] = [
  { value: 'aangifte', label: 'Aangifte (ingevuld en ondertekend)' },
  { value: 'getuigschrift', label: 'Geneeskundig getuigschrift (dokter)' },
  { value: 'ander', label: 'Ander document' },
]
export const STATUS_LABEL: Record<OngevalStatus, string> = {
  gemeld: 'Documenten te bezorgen',
  ingediend: 'Bij de federatie',
  afgehandeld: 'Afgehandeld',
}

type Aangifte = { id: number; player?: unknown; club?: unknown; status?: string | null; slachtofferNaam?: string | null }

/** Wat is deze gebruiker voor deze aangifte? Null = niets te zien. */
export function ongevalRol(user: unknown, a: Aangifte): OngevalRol | null {
  if (!user) return null
  if (isFederationLevel(user)) return 'federatie'
  const speler = relId(a.player)
  if (speler != null && (relId((user as { player?: unknown }).player) === speler || kinderIds(user).includes(speler))) return 'speler'
  const club = relId(a.club)
  if (club != null && hasRole(user, 'club-beheerder', 'club-medewerker') && String(userClubId(user)) === String(club)) return 'club'
  return null
}

async function laad(payload: Payload, id: number): Promise<Aangifte | null> {
  return (await payload.findByID({ collection: 'accidents', id, depth: 0, overrideAccess: true }).catch(() => null)) as Aangifte | null
}

async function federatieAccounts(payload: Payload): Promise<number[]> {
  const res = await payload.find({ collection: 'users', where: { roles: { contains: 'federatie' } }, depth: 0, limit: 25, overrideAccess: true })
  return res.docs.map((u) => Number(u.id))
}

/** Een ingevuld document opladen bij de aangifte. */
export async function documentOpladen(
  payload: Payload,
  user: { id: number | string },
  accidentId: number,
  soort: DocSoort,
  bestand: File,
): Promise<Uitkomst> {
  const a = await laad(payload, accidentId)
  if (!a) return { ok: false, status: 404, error: 'Aangifte niet gevonden.' }
  if (!ongevalRol(user, a)) return { ok: false, status: 403, error: 'Geen toegang tot deze aangifte.' }
  if (a.status === 'afgehandeld') return { ok: false, status: 409, error: 'Deze aangifte is al afgehandeld.' }
  if (!DOC_SOORTEN.some((d) => d.value === soort)) return { ok: false, status: 400, error: 'Kies wat voor document het is.' }
  const ext = bestand.type === 'application/pdf' ? 'pdf' : bestand.type.split('/')[1]
  await payload.create({
    collection: 'ongeval-documenten',
    data: { accident: accidentId, player: relId(a.player), club: relId(a.club), soort, geuploadDoor: Number(user.id) },
    // Geen originele bestandsnaam: die bevat vaak de naam van het kind of de dokter.
    file: { data: Buffer.from(await bestand.arrayBuffer()), mimetype: bestand.type, name: `ongeval-${accidentId}-${soort}-${Date.now()}.${ext}`, size: bestand.size },
    overrideAccess: true,
  })
  return { ok: true }
}

/** De speler (of de club) dient het dossier in bij de federatie: aangifte + getuigschrift moeten erbij zijn. */
export async function ongevalIndienen(payload: Payload, user: { id: number | string }, accidentId: number): Promise<Uitkomst> {
  const a = await laad(payload, accidentId)
  if (!a) return { ok: false, status: 404, error: 'Aangifte niet gevonden.' }
  const rol = ongevalRol(user, a)
  if (rol !== 'speler' && rol !== 'club' && rol !== 'federatie') return { ok: false, status: 403, error: 'Geen toegang tot deze aangifte.' }
  if (a.status !== 'gemeld') return { ok: false, status: 409, error: 'Dit dossier ligt al bij de federatie.' }
  const docs = await payload.find({ collection: 'ongeval-documenten', where: { accident: { equals: accidentId } }, depth: 0, limit: 50, overrideAccess: true })
  const soorten = new Set(docs.docs.map((d) => d.soort))
  const ontbreekt = [!soorten.has('aangifte') && 'de ingevulde aangifte', !soorten.has('getuigschrift') && 'het geneeskundig getuigschrift'].filter(Boolean)
  if (ontbreekt.length) return { ok: false, status: 400, error: `Laad eerst ${ontbreekt.join(' en ')} op.` }
  await payload.update({
    collection: 'accidents',
    id: accidentId,
    data: { status: 'ingediend', ingediendOp: new Date().toISOString() },
    overrideAccess: true,
  })
  const naam = String(a.slachtofferNaam ?? '')
  await meld(payload, [...(await federatieAccounts(payload)), ...(rol === 'speler' ? await clubStaf(payload, relId(a.club)) : [])], {
    titel: `🚑 Ongevalsdossier ingediend: ${naam}`,
    tekst: 'Aangifte en geneeskundig getuigschrift zijn opgeladen.',
    url: '/ongevallen',
  })
  return { ok: true }
}

/** De federatie handelt af, of stuurt terug met wat er ontbreekt. Speler (of ouder) en club horen het. */
export async function ongevalBeoordelen(
  payload: Payload,
  accidentId: number,
  besluit: 'afhandelen' | 'terugsturen',
  opmerking?: string,
): Promise<Uitkomst> {
  const a = await laad(payload, accidentId)
  if (!a) return { ok: false, status: 404, error: 'Aangifte niet gevonden.' }
  const tekst = (opmerking ?? '').trim()
  if (besluit === 'terugsturen' && !tekst) return { ok: false, status: 400, error: 'Zeg wat er ontbreekt; de speler ziet je opmerking.' }
  await payload.update({
    collection: 'accidents',
    id: accidentId,
    data:
      besluit === 'afhandelen'
        ? { status: 'afgehandeld', afgehandeldOp: new Date().toISOString(), federatieOpmerking: tekst || null }
        : { status: 'gemeld', federatieOpmerking: tekst },
    overrideAccess: true,
  })
  const speler = relId(a.player)
  const naam = String(a.slachtofferNaam ?? '')
  await meld(payload, [...(speler != null ? await accountsVanSpeler(payload, speler) : []), ...(await clubStaf(payload, relId(a.club)))], {
    titel: besluit === 'afhandelen' ? `✅ Ongevalsdossier afgehandeld: ${naam}` : `↩️ Ongevalsdossier aan te vullen: ${naam}`,
    tekst: tekst || 'De federatie stuurde het dossier door naar de verzekering.',
    url: '/profiel#ongevallen',
  })
  return { ok: true }
}

export type DossierDoc = { id: number; soort: string; url: string | null; datum: string }
export type Dossier = {
  id: number
  naam: string
  club: string
  wedstrijd: string | null
  datum: string | null
  moment: string
  omschrijving: string
  status: OngevalStatus
  opmerking: string | null
  documenten: DossierDoc[]
}

/** Aangiften met hun documenten, voor het profiel (speler/ouder), de club of de federatie. */
export async function dossiers(payload: Payload, where: Record<string, unknown>, limit = 100): Promise<Dossier[]> {
  const res = await payload.find({ collection: 'accidents', where: where as never, sort: '-createdAt', depth: 1, limit, overrideAccess: true })
  if (!res.docs.length) return []
  const docs = await payload.find({
    collection: 'ongeval-documenten',
    where: { accident: { in: res.docs.map((a) => a.id) } },
    sort: 'createdAt',
    depth: 0,
    limit: 1000,
    overrideAccess: true,
  })
  return res.docs.map((a) => {
    const m = a.match && typeof a.match === 'object' ? (a.match as { title?: unknown }) : null
    const c = a.club && typeof a.club === 'object' ? (a.club as { name?: unknown }) : null
    return {
      id: Number(a.id),
      naam: String(a.slachtofferNaam ?? ''),
      club: String(c?.name ?? ''),
      wedstrijd: m?.title ? String(m.title) : null,
      datum: a.ongevalDatum ? String(a.ongevalDatum) : null,
      moment: String((a as { moment?: unknown }).moment ?? ''),
      // Zonder het voorvoegsel "Wedstrijd (ploeg), moment:" — dat staat er al apart.
      omschrijving: zonderVoorvoegsel(a.omstandigheden, a.moment),
      status: ((a as { status?: string }).status ?? 'gemeld') as OngevalStatus,
      opmerking: ((a as { federatieOpmerking?: string | null }).federatieOpmerking ?? null) || null,
      documenten: docs.docs
        .filter((d) => relId(d.accident) === Number(a.id))
        .map((d) => ({
          id: Number(d.id),
          soort: String(d.soort),
          url: d.filename ? `/api/ongeval-documenten/file/${encodeURIComponent(String(d.filename))}` : null,
          datum: String(d.createdAt),
        })),
    }
  })
}
