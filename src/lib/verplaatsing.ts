import type { Payload } from 'payload'

import { hasRole, isFederationLevel, userClubId } from './access'
import { betrokkenen } from './aftrap'
import type { AuthedUser } from './api-auth'
import { formatDateTimeBE } from './datetime'
import { clubStaf, federatieAccounts, meld, relId } from './meldingen'

// Verplaatsingsaanvraag (collections/Verplaatsingsaanvragen.ts):
//   club vraagt aan (nieuwe datum + reden) → tegenpartij akkoord/weigert → federatie keurt goed of
//   wijst af. Bij goedkeuring krijgt de wedstrijd de nieuwe datum en hoort iedereen het: beide clubs,
//   de scheidsrechter (die laat weten als hij dan niet kan) en de spelers op de selectie.
// Een aanvraag kan zolang de wedstrijd gepland is; de aanvrager kan ze intrekken tot de federatie beslist.

export type Uitkomst = { ok: true; id?: number } | { ok: false; status: number; error: string }

type Ploeg = { name?: string | null; club?: unknown }
type Wedstrijd = { id: number; status?: string | null; date?: string | null; afgelast?: boolean | null; homeTeam?: unknown; awayTeam?: unknown }
const ploeg = (v: unknown): Ploeg | null => (v && typeof v === 'object' ? (v as Ploeg) : null)
const titel = (m: Wedstrijd) => `${ploeg(m.homeTeam)?.name ?? '?'} – ${ploeg(m.awayTeam)?.name ?? '?'}`

async function wedstrijd(payload: Payload, id: number) {
  return (await payload.findByID({ collection: 'matches', id, depth: 1, overrideAccess: true }).catch(() => null)) as Wedstrijd | null
}

/** Welke kant is deze clubgebruiker in deze wedstrijd (of null)? */
function eigenKlub(user: AuthedUser | null, m: Wedstrijd): number | null {
  if (!user || !hasRole(user, 'club-beheerder', 'club-medewerker')) return null
  const c = Number(userClubId(user))
  return [relId(ploeg(m.homeTeam)?.club), relId(ploeg(m.awayTeam)?.club)].includes(c) ? c : null
}

export async function verplaatsingAanvragen(payload: Payload, user: AuthedUser, matchId: number, voorgesteld: string, reden: string): Promise<Uitkomst> {
  const m = await wedstrijd(payload, matchId)
  if (!m) return { ok: false, status: 404, error: 'Wedstrijd niet gevonden.' }
  const club = eigenKlub(user, m)
  if (club == null) return { ok: false, status: 403, error: 'Enkel de staf van een van beide clubs vraagt een verplaatsing aan.' }
  if (m.status !== 'scheduled') return { ok: false, status: 409, error: 'Enkel een geplande wedstrijd kan verplaatst worden.' }
  const d = new Date(voorgesteld)
  if (Number.isNaN(d.getTime()) || d.getTime() < Date.now()) return { ok: false, status: 400, error: 'Kies een datum in de toekomst.' }
  if (!reden.trim()) return { ok: false, status: 400, error: 'Geef een reden.' }
  const open = await payload.count({ collection: 'verplaatsingsaanvragen', where: { and: [{ match: { equals: matchId } }, { status: { in: ['wacht_tegenpartij', 'wacht_federatie'] } }] }, overrideAccess: true })
  if (open.totalDocs > 0) return { ok: false, status: 409, error: 'Er loopt al een aanvraag voor deze wedstrijd.' }
  const thuis = relId(ploeg(m.homeTeam)?.club)
  const uit = relId(ploeg(m.awayTeam)?.club)
  const tegen = club === thuis ? uit : thuis
  const a = await payload.create({
    collection: 'verplaatsingsaanvragen',
    data: { match: matchId, aanvrager: club, tegenpartij: tegen, oorspronkelijk: m.date, voorgesteld: d.toISOString(), reden: reden.trim().slice(0, 1000), status: 'wacht_tegenpartij', aangevraagdDoor: Number(user.id) },
    overrideAccess: true,
  })
  await meld(payload, await clubStaf(payload, tegen), {
    titel: `🔁 Verplaatsing gevraagd: ${titel(m)}`,
    tekst: `Naar ${formatDateTimeBE(d.toISOString())} (nu ${formatDateTimeBE(String(m.date))}). Reden: ${reden.trim()}. Ga je akkoord?`,
    url: `/match/${matchId}`,
  })
  return { ok: true, id: Number(a.id) }
}

export async function verplaatsingBeantwoorden(
  payload: Payload,
  user: AuthedUser,
  id: number,
  actie: 'akkoord' | 'weigeren' | 'intrekken' | 'goedkeuren' | 'afwijzen',
  opmerking?: string | null,
): Promise<Uitkomst> {
  const a = await payload.findByID({ collection: 'verplaatsingsaanvragen', id, depth: 0, overrideAccess: true }).catch(() => null)
  if (!a) return { ok: false, status: 404, error: 'Aanvraag niet gevonden.' }
  const m = await wedstrijd(payload, relId(a.match)!)
  if (!m) return { ok: false, status: 404, error: 'Wedstrijd niet gevonden.' }
  const opm = opmerking?.trim().slice(0, 1000) || null
  const nu = new Date().toISOString()
  const club = Number(userClubId(user))
  const isClub = (c: unknown) => hasRole(user, 'club-beheerder', 'club-medewerker') && relId(c) === club
  const fed = isFederationLevel(user)

  if (actie === 'akkoord' || actie === 'weigeren') {
    if (!isClub(a.tegenpartij) && !fed) return { ok: false, status: 403, error: 'Enkel de tegenpartij antwoordt.' }
    if (a.status !== 'wacht_tegenpartij') return { ok: false, status: 409, error: 'Deze aanvraag wacht niet (meer) op de tegenpartij.' }
    await payload.update({ collection: 'verplaatsingsaanvragen', id, data: { status: actie === 'akkoord' ? 'wacht_federatie' : 'geweigerd', tegenpartijOpmerking: opm, ...(actie === 'weigeren' ? { behandeldOp: nu } : {}) }, overrideAccess: true })
    await meld(payload, await clubStaf(payload, relId(a.aanvrager)), {
      titel: actie === 'akkoord' ? `👍 Tegenpartij akkoord: ${titel(m)}` : `✋ Tegenpartij weigert: ${titel(m)}`,
      tekst: actie === 'akkoord' ? `De federatie beslist nu.${opm ? ` ${opm}` : ''}` : opm ?? 'De wedstrijd blijft op de geplande datum.',
      url: `/match/${m.id}`,
    })
    if (actie === 'akkoord') {
      await meld(payload, await federatieAccounts(payload), { titel: `🔁 Verplaatsing te beslissen: ${titel(m)}`, tekst: `Naar ${formatDateTimeBE(String(a.voorgesteld))}; beide clubs akkoord.`, url: '/beheer/planner' })
    }
    return { ok: true }
  }
  if (actie === 'intrekken') {
    if (!isClub(a.aanvrager) && !fed) return { ok: false, status: 403, error: 'Enkel de aanvrager trekt in.' }
    if (a.status !== 'wacht_tegenpartij' && a.status !== 'wacht_federatie') return { ok: false, status: 409, error: 'Deze aanvraag is al behandeld.' }
    await payload.update({ collection: 'verplaatsingsaanvragen', id, data: { status: 'ingetrokken', behandeldOp: nu }, overrideAccess: true })
    await meld(payload, await clubStaf(payload, relId(a.tegenpartij)), { titel: `Verplaatsing ingetrokken: ${titel(m)}`, tekst: 'De wedstrijd blijft op de geplande datum.', url: `/match/${m.id}` })
    return { ok: true }
  }
  if (!fed) return { ok: false, status: 403, error: 'Enkel de federatie beslist.' }
  if (a.status !== 'wacht_federatie' && a.status !== 'wacht_tegenpartij') return { ok: false, status: 409, error: 'Deze aanvraag is al behandeld.' }
  if (actie === 'afwijzen') {
    await payload.update({ collection: 'verplaatsingsaanvragen', id, data: { status: 'afgewezen', federatieOpmerking: opm, behandeldOp: nu }, overrideAccess: true })
    const staf = [...(await clubStaf(payload, relId(a.aanvrager))), ...(await clubStaf(payload, relId(a.tegenpartij)))]
    await meld(payload, staf, { titel: `❌ Verplaatsing afgewezen: ${titel(m)}`, tekst: opm ?? 'De wedstrijd blijft op de geplande datum.', url: `/match/${m.id}` })
    return { ok: true }
  }
  if (m.status !== 'scheduled') return { ok: false, status: 409, error: 'De wedstrijd is niet meer gepland.' }
  await payload.update({ collection: 'matches', id: m.id, data: { date: String(a.voorgesteld), afgelast: false }, overrideAccess: true })
  await payload.update({ collection: 'verplaatsingsaanvragen', id, data: { status: 'goedgekeurd', federatieOpmerking: opm, behandeldOp: nu }, overrideAccess: true })
  await meld(payload, (await betrokkenen(payload, m)).filter((u) => u !== Number(user.id)), {
    titel: `🔁 Verplaatst: ${titel(m)}`,
    tekst: `Nieuw tijdstip: ${formatDateTimeBE(String(a.voorgesteld))} (was ${formatDateTimeBE(String(m.date))}). Scheidsrechter: kan je dan niet, laat het de federatie meteen weten.`,
    url: `/match/${m.id}`,
  })
  return { ok: true }
}

export type VerplaatsingRij = {
  id: number
  matchId: number
  titel: string
  oorspronkelijk: string | null
  voorgesteld: string
  reden: string
  status: string
  aanvragerId: number | null
  tegenpartijId: number | null
  tegenpartijOpmerking: string | null
  federatieOpmerking: string | null
}

export async function verplaatsingen(payload: Payload, where: Record<string, unknown>, limit = 100): Promise<VerplaatsingRij[]> {
  const res = await payload.find({ collection: 'verplaatsingsaanvragen', where: where as never, sort: '-createdAt', depth: 2, limit, overrideAccess: true })
  return res.docs.map((a) => {
    const m = a.match as unknown as Wedstrijd | null
    return {
      id: Number(a.id),
      matchId: relId(a.match)!,
      titel: m && typeof m === 'object' ? titel(m) : 'Wedstrijd',
      oorspronkelijk: (a.oorspronkelijk as string | null) ?? null,
      voorgesteld: String(a.voorgesteld),
      reden: String(a.reden),
      status: String(a.status),
      aanvragerId: relId(a.aanvrager),
      tegenpartijId: relId(a.tegenpartij),
      tegenpartijOpmerking: (a.tegenpartijOpmerking as string | null) ?? null,
      federatieOpmerking: (a.federatieOpmerking as string | null) ?? null,
    }
  })
}
