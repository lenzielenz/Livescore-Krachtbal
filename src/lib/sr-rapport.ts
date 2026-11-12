import type { Payload } from 'payload'

import { isFederationLevel } from './access'
import { type AuthedUser, isAssignedReferee } from './api-auth'
import { federatieAccounts, meld } from './meldingen'

// Het scheidsrechtersrapport (RCVK item 27, collections/SrRapporten.ts).
//
// Wanneer is een rapport verplicht? Het reglement noemt: een voorbehoud (item 25: "de scheidsrechter
// maakt ook een SR-rapport"), een onregelmatigheid tijdens de wedstrijd (item 27) — een uitsluiting of
// een ernstig incident — en een wedstrijd die niet gespeeld kon worden (item 5.1). Dat leiden we af uit
// het blad zelf (aanleidingenVanBlad); niets wordt dubbel bewaard. Het vinkje `rapportVolgt` op het blad
// dekt een andere onregelmatigheid die de scheidsrechter zelf aanduidt.
//
// Een rapport is een ondertekend document: na het indienen verandert het niet meer. De federatie
// (het scheidsrechterscomité) handelt het af op het bord.

export type Aanleiding = 'voorbehoud' | 'uitsluiting' | 'niet_gespeeld' | 'incident' | 'ander'
export const AANLEIDINGEN: readonly Aanleiding[] = ['voorbehoud', 'uitsluiting', 'niet_gespeeld', 'incident', 'ander']
export const AANLEIDING_LABEL: Record<Aanleiding, string> = {
  voorbehoud: 'Voorbehoud aangetekend',
  uitsluiting: 'Uitsluiting',
  niet_gespeeld: 'Wedstrijd niet (volledig) gespeeld',
  incident: 'Incident of onsportief gedrag',
  ander: 'Andere onregelmatigheid',
}

export const RAPPORT_MIN_TEKENS = 30
export const MAX_BIJLAGEN = 5
export const MAX_BIJLAGE_BYTES = 10 * 1024 * 1024
const BIJLAGE_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])

const relId = (v: unknown): number | null => {
  const id = v && typeof v === 'object' ? (v as { id?: unknown }).id : v
  return id == null || !Number.isFinite(Number(id)) ? null : Number(id)
}
const lijst = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

/**
 * Puur: waarom moet er voor dit blad een rapport komen? Leeg = niet verplicht. Een forfait dat een club
 * vooraf meldde, vraagt geen rapport (de scheidsrechter kwam dan niet); een forfait ter plaatse wel.
 */
export function aanleidingenVanBlad(sheet: {
  voorbehoud?: unknown
  uitsluitingen?: unknown
  rapportVolgt?: unknown
  forfait?: { uitslag?: unknown; moment?: unknown } | null
}): Aanleiding[] {
  const uit: Aanleiding[] = []
  if (lijst(sheet.voorbehoud).length) uit.push('voorbehoud')
  if (lijst(sheet.uitsluitingen).length) uit.push('uitsluiting')
  const ff = sheet.forfait?.uitslag
  if (ff && ff !== 'geen' && (sheet.forfait?.moment ?? 'ter_plaatse') === 'ter_plaatse') uit.push('niet_gespeeld')
  if (sheet.rapportVolgt === true) uit.push('ander')
  return uit
}

/** De accounts van de scheidsrechter(s) van dit blad (toegewezen, reserve, wie floot). */
export async function scheidsrechterAccounts(payload: Payload, sheet: Record<string, unknown>): Promise<number[]> {
  const officials = [sheet.assignedReferee, sheet.backupReferee, sheet.geflotenDoor].map(relId).filter((x): x is number => x != null)
  if (!officials.length) return []
  const res = await payload.find({ collection: 'users', where: { official: { in: officials } }, depth: 0, limit: 10, overrideAccess: true })
  return res.docs.map((u) => Number(u.id))
}

export type Bijlage = { data: Buffer; type: string; naam: string; grootte: number }
export type RapportInvoer = { aanleidingen?: unknown; relaas?: unknown; naam?: unknown; bijlagen?: Bijlage[] }
type Fout = { ok: false; status: number; error: string }

const wedstrijdTitel = (m: Record<string, unknown>) => {
  const n = (t: unknown) => (t && typeof t === 'object' ? String((t as { name?: unknown }).name ?? '?') : '?')
  return `${n(m.homeTeam)} – ${n(m.awayTeam)}`
}

/**
 * De scheidsrechter dient een rapport in (en tekent het met zijn naam). Enkel de toegewezen
 * scheidsrechter van die wedstrijd of de federatie. Meldt het bij de federatie.
 */
export async function rapportIndienen(
  payload: Payload,
  user: AuthedUser,
  matchId: number,
  inv: RapportInvoer,
  nu: Date = new Date(),
): Promise<{ ok: true; id: number } | Fout> {
  if (!(await isAssignedReferee(payload, user, matchId))) {
    return { ok: false, status: 403, error: 'Enkel de scheidsrechter van deze wedstrijd maakt een rapport op.' }
  }
  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 1, overrideAccess: true }).catch(() => null)
  if (!match) return { ok: false, status: 404, error: 'Wedstrijd niet gevonden.' }

  const aanleidingen = [...new Set(lijst(inv.aanleidingen).map(String))].filter((a): a is Aanleiding => (AANLEIDINGEN as readonly string[]).includes(a))
  if (!aanleidingen.length) return { ok: false, status: 400, error: 'Kies waarover het rapport gaat.' }
  const relaas = String(inv.relaas ?? '').trim().slice(0, 8000)
  if (relaas.length < RAPPORT_MIN_TEKENS) return { ok: false, status: 400, error: `Beschrijf de feiten (minstens ${RAPPORT_MIN_TEKENS} tekens).` }
  const naam = String(inv.naam ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)
  if (naam.length < 2) return { ok: false, status: 400, error: 'Teken het rapport met je naam.' }

  const bijlagen = inv.bijlagen ?? []
  if (bijlagen.length > MAX_BIJLAGEN) return { ok: false, status: 400, error: `Maximaal ${MAX_BIJLAGEN} bijlagen.` }
  for (const b of bijlagen) {
    if (!BIJLAGE_TYPES.has(b.type)) return { ok: false, status: 400, error: `"${b.naam}": enkel PDF of een foto (JPG, PNG, WebP).` }
    if (b.grootte > MAX_BIJLAGE_BYTES) return { ok: false, status: 400, error: `"${b.naam}" is groter dan 10 MB.` }
  }

  const bijlageIds: number[] = []
  for (const [i, b] of bijlagen.entries()) {
    const ext = b.type === 'application/pdf' ? 'pdf' : b.type.split('/')[1] === 'jpeg' ? 'jpg' : b.type.split('/')[1]
    const doc = await payload.create({
      collection: 'rapport-bijlagen',
      data: { match: matchId, geuploadDoor: Number(user.id) },
      file: { data: b.data, mimetype: b.type, name: `rapport-${matchId}-${nu.getTime()}-${i + 1}.${ext}`, size: b.grootte },
      overrideAccess: true,
    })
    bijlageIds.push(Number(doc.id))
  }

  const rapport = await payload.create({
    collection: 'sr-rapporten',
    data: {
      match: matchId,
      scheidsrechter: Number(user.id),
      aanleidingen,
      relaas,
      bijlagen: bijlageIds,
      ondertekendNaam: naam,
      ondertekendOp: nu.toISOString(),
      status: 'ingediend',
    },
    overrideAccess: true,
  })

  await meld(payload, await federatieAccounts(payload), {
    titel: `🧑‍⚖️ Scheidsrechtersrapport: ${wedstrijdTitel(match as unknown as Record<string, unknown>)}`,
    tekst: `${aanleidingen.map((a) => AANLEIDING_LABEL[a]).join(', ')} — ondertekend door ${naam}.`,
    url: `/federatie/aanvragen?dossier=rapport:${rapport.id}`,
  }).catch(() => 0)
  return { ok: true, id: Number(rapport.id) }
}

/** Het comité handelt een rapport af (met een besluit). De scheidsrechter krijgt een melding. */
export async function rapportAfhandelen(
  payload: Payload,
  me: AuthedUser,
  id: number,
  besluit: string,
  nu: Date = new Date(),
): Promise<{ ok: true } | Fout> {
  if (!isFederationLevel(me)) return { ok: false, status: 403, error: 'Enkel de federatie.' }
  const r = await payload.findByID({ collection: 'sr-rapporten', id, depth: 1, overrideAccess: true }).catch(() => null)
  if (!r) return { ok: false, status: 404, error: 'Rapport niet gevonden.' }
  if (r.status !== 'ingediend') return { ok: false, status: 409, error: 'Dit rapport is al afgehandeld.' }
  await payload.update({
    collection: 'sr-rapporten',
    id,
    data: { status: 'afgehandeld', besluit: besluit.trim().slice(0, 4000) || null, behandeldDoor: Number(me.id), behandeldOp: nu.toISOString() },
    overrideAccess: true,
  })
  await meld(payload, [relId(r.scheidsrechter)], {
    titel: '🧑‍⚖️ Je scheidsrechtersrapport is afgehandeld',
    tekst: besluit.trim() ? besluit.trim().slice(0, 140) : `Wedstrijd ${wedstrijdTitel((r.match ?? {}) as unknown as Record<string, unknown>)}`,
    url: `/scheidsrechter/${relId(r.match) ?? ''}`,
  }).catch(() => 0)
  return { ok: true }
}

export type RapportKort = {
  id: number
  aanleidingen: Aanleiding[]
  relaas: string
  ondertekendNaam: string
  ondertekendOp: string
  status: string
  besluit: string | null
  bijlagen: { id: number; naam: string; url: string | null }[]
}

/** De rapporten bij een wedstrijd (voor het scheidsrechtersscherm en de PDF). */
export async function rapportenVanWedstrijd(payload: Payload, matchId: number): Promise<RapportKort[]> {
  const res = await payload.find({ collection: 'sr-rapporten', where: { match: { equals: matchId } }, depth: 1, sort: 'createdAt', limit: 20, overrideAccess: true })
  return res.docs.map((r) => ({
    id: Number(r.id),
    aanleidingen: (r.aanleidingen ?? []) as Aanleiding[],
    relaas: String(r.relaas ?? ''),
    ondertekendNaam: String(r.ondertekendNaam ?? ''),
    ondertekendOp: String(r.ondertekendOp ?? ''),
    status: String(r.status ?? 'ingediend'),
    besluit: (r.besluit as string | null) ?? null,
    bijlagen: lijst(r.bijlagen).map((b) => {
      const d = (b && typeof b === 'object' ? b : { id: b }) as { id: unknown; filename?: unknown }
      return {
        id: Number(d.id),
        naam: String(d.filename ?? `bijlage ${String(d.id)}`),
        url: d.filename ? `/api/rapport-bijlagen/file/${encodeURIComponent(String(d.filename))}` : null,
      }
    }),
  }))
}
