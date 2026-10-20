import type { Payload } from 'payload'

import { hasRole, isFederationLevel, userClubId } from './access'
import type { AuthedUser } from './api-auth'
import { dateStrBE, formatDateTimeBE, shiftDateStr, zaterdagVan } from './datetime'
import { clubStaf, federatieAccounts, meld, relId } from './meldingen'
import { REEKS_OPTIONS, reeksCategorie, type Reeks } from './reeksen'

// Inschrijving van ploegen per seizoen (collections/Inschrijvingen.ts):
//   federatie opent een ronde (deadline + speelweekends) → elke club schrijft vóór de deadline haar
//   ploegen in, per reeks, met haar voorkeuren → de federatie verwerkt (ploegen bijgewerkt of
//   aangemaakt, koppels gezet) → kalender met voorkeuren (lib/kalender-planner.ts).
// Een club kan tot de deadline aanpassen en opnieuw indienen; daarna ligt ze vast.

export type Uitkomst = { ok: true; id?: number } | { ok: false; status: number; error: string }

export type InschrijvingPloeg = {
  team?: number | null
  naam: string
  reeks: string
  thuisdag?: 'za' | 'zo' | null
  thuisUur?: string | null
  koppelMet?: string | null
  opmerking?: string | null
}
export type InschrijvingInvoer = {
  ploegen: InschrijvingPloeg[]
  aantalVelden?: number | null
  onbeschikbaar?: { weekend: string; reden?: string | null; hard?: boolean }[]
  wensen?: string | null
}
export type Ronde = {
  id: number
  seizoen: string
  deadline: string
  status: string
  eersteWeekend: string
  laatsteWeekend: string
  vrijeWeekends: { weekend: string; reden?: string | null }[]
  toelichting?: string | null
}

const REEKSEN = new Set<string>(REEKS_OPTIONS.map((r) => r.value))
const UUR = /^([01]?\d|2[0-3]):[0-5]\d$/

export { zaterdagVan }

/** Alle speelweekends (zaterdagen) van een ronde, zonder de vrije weekends. */
export function speelweekends(r: Pick<Ronde, 'eersteWeekend' | 'laatsteWeekend' | 'vrijeWeekends'>): string[] {
  const vrij = new Set(r.vrijeWeekends.map((v) => zaterdagVan(v.weekend)))
  const uit: string[] = []
  let w = zaterdagVan(r.eersteWeekend)
  const laatste = zaterdagVan(r.laatsteWeekend)
  for (let i = 0; i < 80 && w <= laatste; i++) {
    if (!vrij.has(w)) uit.push(w)
    w = shiftDateStr(w, 7)
  }
  return uit
}

const dag = (v: unknown) => (v ? dateStrBE(new Date(String(v))) : '')

function naarRonde(d: Record<string, unknown>): Ronde {
  return {
    id: Number(d.id),
    seizoen: String(d.seizoen),
    deadline: String(d.deadline),
    status: String(d.status ?? 'open'),
    eersteWeekend: dag(d.eersteWeekend),
    laatsteWeekend: dag(d.laatsteWeekend),
    vrijeWeekends: ((d.vrijeWeekends as { weekend?: unknown; reden?: string | null }[] | undefined) ?? []).map((v) => ({ weekend: dag(v.weekend), reden: v.reden ?? null })),
    toelichting: (d.toelichting as string | null) ?? null,
  }
}

export async function rondeVan(payload: Payload, id: number): Promise<Ronde | null> {
  const d = await payload.findByID({ collection: 'inschrijvingsrondes', id, depth: 0, overrideAccess: true }).catch(() => null)
  return d ? naarRonde(d as unknown as Record<string, unknown>) : null
}

/** De jongste ronde (open of niet). */
export async function laatsteRonde(payload: Payload): Promise<Ronde | null> {
  const res = await payload.find({ collection: 'inschrijvingsrondes', sort: '-createdAt', depth: 0, limit: 1, overrideAccess: true })
  return res.docs[0] ? naarRonde(res.docs[0] as unknown as Record<string, unknown>) : null
}

export const rondeOpen = (r: Ronde, nu = Date.now()) => r.status === 'open' && new Date(r.deadline).getTime() > nu

/** De inschrijving van deze club, of een voorstel op basis van haar huidige ploegen. */
export async function inschrijvingVanClub(payload: Payload, rondeId: number, clubId: number) {
  const res = await payload.find({
    collection: 'inschrijvingen',
    where: { and: [{ ronde: { equals: rondeId } }, { club: { equals: clubId } }] },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  })
  const doc = res.docs[0] as unknown as Record<string, unknown> | undefined
  if (doc) {
    return {
      id: Number(doc.id),
      status: String(doc.status),
      ingediendOp: (doc.ingediendOp as string | null) ?? null,
      ploegen: ((doc.ploegen as Record<string, unknown>[] | undefined) ?? []).map((p) => ({
        team: relId(p.team),
        naam: String(p.naam ?? ''),
        reeks: String(p.reeks ?? ''),
        thuisdag: (p.thuisdag as 'za' | 'zo' | null) ?? null,
        thuisUur: (p.thuisUur as string | null) ?? null,
        koppelMet: (p.koppelMet as string | null) ?? null,
        opmerking: (p.opmerking as string | null) ?? null,
      })),
      aantalVelden: Number(doc.aantalVelden ?? 1),
      onbeschikbaar: ((doc.onbeschikbaar as Record<string, unknown>[] | undefined) ?? []).map((o) => ({ weekend: dag(o.weekend), reden: (o.reden as string | null) ?? null, hard: o.hard !== false })),
      wensen: (doc.wensen as string | null) ?? null,
    }
  }
  // Nog niets: start van de ploegen van vorig seizoen (in competitie), met hun thuisuur en koppel.
  const teams = await payload.find({ collection: 'teams', where: { and: [{ club: { equals: clubId } }, { analyseOnly: { not_equals: true } }] }, depth: 1, limit: 100, overrideAccess: true })
  const competitie = teams.docs.filter((t) => t.reeks && REEKSEN.has(String(t.reeks)) && !['recreatief', 'beker', 'andere'].includes(String(t.reeks)))
  return {
    id: null,
    status: 'nieuw',
    ingediendOp: null,
    ploegen: competitie.map((t) => {
      const uur = /(\d{1,2}:\d{2})/.exec(String(t.thuisUur ?? ''))?.[1] ?? null
      const dagTekst = /\b(za|zo)\b/i.exec(String(t.thuisUur ?? ''))?.[1]?.toLowerCase() as 'za' | 'zo' | undefined
      const koppel = t.koppelMet && typeof t.koppelMet === 'object' ? String((t.koppelMet as { name?: unknown }).name ?? '') : null
      return {
        team: Number(t.id),
        naam: String(t.name),
        reeks: String(t.reeks),
        thuisdag: ((t as { thuisdag?: 'za' | 'zo' | null }).thuisdag ?? dagTekst ?? null) as 'za' | 'zo' | null,
        thuisUur: uur,
        koppelMet: koppel,
        opmerking: null,
      }
    }),
    aantalVelden: 1,
    onbeschikbaar: [] as { weekend: string; reden: string | null; hard: boolean }[],
    wensen: null,
  }
}

/** Fout in de invoer, of null. */
export function controleerInschrijving(inv: InschrijvingInvoer): string | null {
  if (!Array.isArray(inv.ploegen)) return 'Geen ploegen.'
  const namen = new Set<string>()
  for (const p of inv.ploegen) {
    const n = String(p.naam ?? '').trim()
    if (!n) return 'Elke ploeg heeft een naam nodig.'
    if (namen.has(n.toLowerCase())) return `Twee ploegen heten "${n}".`
    namen.add(n.toLowerCase())
    if (!REEKSEN.has(String(p.reeks))) return `Kies een reeks voor ${n}.`
    if (p.thuisUur && !UUR.test(p.thuisUur.trim())) return `Thuisuur van ${n}: gebruik UU:MM, bv. 14:30.`
    if (p.thuisdag && p.thuisdag !== 'za' && p.thuisdag !== 'zo') return `Thuisdag van ${n}: zaterdag of zondag.`
  }
  for (const p of inv.ploegen) {
    if (!p.koppelMet?.trim()) continue
    const ander = inv.ploegen.find((x) => x.naam.trim().toLowerCase() === p.koppelMet!.trim().toLowerCase())
    if (!ander) return `${p.naam}: koppelploeg "${p.koppelMet}" staat niet in de lijst.`
    if (ander.reeks === p.reeks) return `${p.naam} en ${ander.naam} spelen in dezelfde reeks: koppelen kan enkel over reeksen heen.`
  }
  for (const o of inv.onbeschikbaar ?? []) {
    if (!/^\d{4}-\d{2}-\d{2}/.test(String(o.weekend))) return 'Een datum bij "terrein niet vrij" is ongeldig.'
  }
  return null
}

/** Mag deze gebruiker de inschrijving van deze club doen? Clubbeheerder/-medewerker van de club, of de federatie. */
export function magInschrijven(user: AuthedUser | null, clubId: number): boolean {
  if (!user) return false
  if (isFederationLevel(user)) return true
  return hasRole(user, 'club-beheerder', 'club-medewerker') && Number(userClubId(user)) === clubId
}

export async function inschrijvingOpslaan(
  payload: Payload,
  user: AuthedUser,
  rondeId: number,
  clubId: number,
  inv: InschrijvingInvoer,
  indienen: boolean,
): Promise<Uitkomst> {
  if (!magInschrijven(user, clubId)) return { ok: false, status: 403, error: 'Enkel de clubbeheerder schrijft de ploegen in.' }
  const ronde = await rondeVan(payload, rondeId)
  if (!ronde) return { ok: false, status: 404, error: 'Inschrijvingsronde niet gevonden.' }
  if (!rondeOpen(ronde) && !isFederationLevel(user)) return { ok: false, status: 409, error: `De inschrijvingen zijn gesloten (deadline ${formatDateTimeBE(ronde.deadline)}).` }
  const fout = controleerInschrijving(inv)
  if (fout) return { ok: false, status: 400, error: fout }
  const huidig = await inschrijvingVanClub(payload, rondeId, clubId)
  if (huidig.status === 'verwerkt') return { ok: false, status: 409, error: 'De federatie verwerkte jullie inschrijving al — vraag haar om een wijziging.' }
  const data = {
    ronde: rondeId,
    club: clubId,
    ploegen: inv.ploegen.map((p) => ({
      team: p.team ?? null,
      naam: p.naam.trim(),
      reeks: p.reeks as never,
      thuisdag: p.thuisdag ?? null,
      thuisUur: p.thuisUur?.trim() || null,
      koppelMet: p.koppelMet?.trim() || null,
      opmerking: p.opmerking?.trim() || null,
    })),
    aantalVelden: Math.min(4, Math.max(1, Number(inv.aantalVelden ?? 1) || 1)),
    onbeschikbaar: (inv.onbeschikbaar ?? []).map((o) => ({ weekend: zaterdagVan(o.weekend), reden: o.reden?.trim() || null, hard: o.hard !== false })),
    wensen: inv.wensen?.trim() || null,
    status: indienen ? 'ingediend' : huidig.status === 'ingediend' ? 'ingediend' : 'concept',
    ...(indienen ? { ingediendOp: new Date().toISOString() } : {}),
  }
  const doc = huidig.id
    ? await payload.update({ collection: 'inschrijvingen', id: huidig.id, data: data as never, overrideAccess: true })
    : await payload.create({ collection: 'inschrijvingen', data: data as never, overrideAccess: true })
  if (indienen) {
    const club = await payload.findByID({ collection: 'clubs', id: clubId, depth: 0, overrideAccess: true }).catch(() => null)
    await meld(payload, await federatieAccounts(payload), {
      titel: `📝 Inschrijving ${ronde.seizoen}: ${String(club?.name ?? 'club')}`,
      tekst: `${inv.ploegen.length} ploeg(en) ingediend.`,
      url: '/beheer/inschrijvingen',
    })
  }
  return { ok: true, id: Number(doc.id) }
}

/**
 * De federatie verwerkt een ingediende inschrijving: elke ploeg wordt bijgewerkt (reeks, thuisdag,
 * thuisuur) of aangemaakt, en de koppels worden gezet. Daarna is ze klaar voor de kalender.
 */
export async function inschrijvingVerwerken(payload: Payload, id: number): Promise<Uitkomst> {
  const doc = (await payload.findByID({ collection: 'inschrijvingen', id, depth: 0, overrideAccess: true }).catch(() => null)) as Record<string, unknown> | null
  if (!doc) return { ok: false, status: 404, error: 'Inschrijving niet gevonden.' }
  if (doc.status === 'concept') return { ok: false, status: 409, error: 'De club heeft nog niet ingediend.' }
  const clubId = relId(doc.club)!
  const rijen = (doc.ploegen as Record<string, unknown>[] | undefined) ?? []
  const idPerNaam = new Map<string, number>()
  for (const p of rijen) {
    const naam = String(p.naam).trim()
    const reeks = String(p.reeks) as Reeks
    const data = {
      name: naam,
      club: clubId,
      reeks: reeks as never,
      category: reeksCategorie(reeks),
      thuisdag: (p.thuisdag as 'za' | 'zo' | null) ?? null,
      thuisUur: (p.thuisUur as string | null) ?? null,
    }
    const teamId = relId(p.team)
    const bestaand = teamId != null ? await payload.findByID({ collection: 'teams', id: teamId, depth: 0, overrideAccess: true }).catch(() => null) : null
    const t = bestaand && relId(bestaand.club) === clubId
      ? await payload.update({ collection: 'teams', id: teamId!, data: data as never, overrideAccess: true })
      : await payload.create({ collection: 'teams', data: data as never, overrideAccess: true })
    idPerNaam.set(naam.toLowerCase(), Number(t.id))
  }
  // Koppels in beide richtingen (de planner neemt ze als paar).
  for (const p of rijen) {
    const k = String(p.koppelMet ?? '').trim().toLowerCase()
    const a = idPerNaam.get(String(p.naam).trim().toLowerCase())
    const b = k ? idPerNaam.get(k) : undefined
    if (a == null) continue
    await payload.update({ collection: 'teams', id: a, data: { koppelMet: b ?? null } as never, overrideAccess: true })
    if (b != null) await payload.update({ collection: 'teams', id: b, data: { koppelMet: a } as never, overrideAccess: true })
  }
  await payload.update({ collection: 'inschrijvingen', id, data: { status: 'verwerkt' } as never, overrideAccess: true })
  await meld(payload, await clubStaf(payload, clubId), { titel: '✅ Inschrijving verwerkt', tekst: `${rijen.length} ploeg(en) staan klaar voor de kalender.`, url: '/club/inschrijving' })
  return { ok: true, id }
}

export type InschrijvingRij = {
  id: number | null
  clubId: number
  clubNaam: string
  status: string
  ingediendOp: string | null
  ploegen: { naam: string; reeks: string; thuis: string; koppelMet: string | null }[]
  onbeschikbaar: number
  wensen: string | null
}

/** Overzicht voor de federatie: elke club (ook wie nog niets deed), met wat ze inschreef. */
export async function inschrijvingOverzicht(payload: Payload, rondeId: number): Promise<InschrijvingRij[]> {
  const clubs = await payload.find({ collection: 'clubs', where: { analyseOnly: { not_equals: true } }, depth: 0, limit: 500, sort: 'name', overrideAccess: true })
  const ins = await payload.find({ collection: 'inschrijvingen', where: { ronde: { equals: rondeId } }, depth: 0, limit: 500, overrideAccess: true })
  const perClub = new Map(ins.docs.map((d) => [relId(d.club), d as unknown as Record<string, unknown>]))
  return clubs.docs.map((c) => {
    const d = perClub.get(Number(c.id))
    const ploegen = ((d?.ploegen as Record<string, unknown>[] | undefined) ?? []).map((p) => ({
      naam: String(p.naam),
      reeks: String(p.reeks),
      thuis: `${p.thuisdag === 'zo' ? 'zo' : p.thuisdag === 'za' ? 'za' : ''} ${String(p.thuisUur ?? '')}`.trim(),
      koppelMet: (p.koppelMet as string | null) ?? null,
    }))
    return {
      id: d ? Number(d.id) : null,
      clubId: Number(c.id),
      clubNaam: String(c.name),
      status: d ? String(d.status) : 'niets',
      ingediendOp: (d?.ingediendOp as string | null) ?? null,
      ploegen,
      onbeschikbaar: ((d?.onbeschikbaar as unknown[] | undefined) ?? []).length,
      wensen: (d?.wensen as string | null) ?? null,
    }
  })
}
