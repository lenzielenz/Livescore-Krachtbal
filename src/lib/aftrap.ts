import type { Payload } from 'payload'

import { hasRole, isClubStaff, isFederationLevel } from './access'
import { refereeMayHandleMatch, type AuthedUser } from './api-auth'
import { magOpstellingVoor } from './club-functies'
import { dateStrBE, formatTimeBE } from './datetime'
import { accountsVanSpeler, clubStaf, meld, relId } from './meldingen'
import { sendPushToClubs } from './push'
import { wedstrijdSelectie } from './wedstrijd-selectie'

// De aftrap verschuift op de wedstrijddag: een ploeg staat in de file, er is ziekte, de vorige
// wedstrijd op het terrein loopt uit — of net omgekeerd: de wedstrijd ervoor valt weg (afgelast,
// forfait) en de volgende kan vroeger beginnen. Eén melding:
//   1. zet het nieuwe uur op de wedstrijd (alle schermen, het startvenster en de kalender volgen);
//   2. schrijft een onveranderlijke regel in het logboek (collections/AftrapWijzigingen.ts) — wie,
//      wanneer, waarom; de federatie gebruikt dat bij een te-laat-boete;
//   3. schuift op vraag de volgende wedstrijden van die dag op hetzelfde terrein mee;
//   4. verwittigt iedereen: beide clubs, de scheidsrechter(s) en de spelers op de selectie.
// "Hetzelfde terrein" = zelfde thuisclub, zelfde dag: er is (nog) geen apart terreinveld.
//
// Wie mag: de federatie, de scheidsrechter van de wedstrijd en de staf van beide clubs (de uitploeg
// die in de file staat meldt het zelf). Meeschuiven raakt andere ploegen en mag dus enkel de
// federatie, de scheidsrechter of de thuisclub (die het terrein beheert).

export const MAX_VERSCHUIVING_MIN = 4 * 60
const REDENEN = new Set(['file', 'ziekte', 'uitloop', 'vervroegen', 'terrein', 'scheidsrechter', 'ander'])
const REDEN_TEKST: Record<string, string> = {
  file: 'file / onderweg',
  ziekte: 'ziekte',
  uitloop: 'vorige wedstrijd loopt uit',
  vervroegen: 'wedstrijd ervoor valt weg',
  terrein: 'terrein of materiaal nog niet klaar',
  scheidsrechter: 'scheidsrechter later',
  ander: 'andere reden',
}

type Ploeg = { id: number; name?: string | null; club?: unknown }
type Wedstrijd = { id: number; status?: string | null; date?: string | null; afgelast?: boolean | null; homeTeam?: unknown; awayTeam?: unknown }

const ploeg = (v: unknown): Ploeg | null => (v && typeof v === 'object' ? (v as Ploeg) : null)
const titel = (m: Wedstrijd) => `${ploeg(m.homeTeam)?.name ?? '?'} – ${ploeg(m.awayTeam)?.name ?? '?'}`
const clubsVan = (m: Wedstrijd) => [relId(ploeg(m.homeTeam)?.club), relId(ploeg(m.awayTeam)?.club)].filter((c): c is number => c != null)

export type AftrapInvoer = { nieuw: string; reden: string; toelichting?: string | null; volgendeOok?: boolean }
export type AftrapUitkomst =
  | { ok: true; verschoven: { id: number; titel: string; naar: string }[] }
  | { ok: false; status: number; error: string }

/** Wat mag deze gebruiker met de aftrap van deze wedstrijd? */
export async function aftrapRechten(
  payload: Payload,
  user: AuthedUser | null,
  m: Wedstrijd,
): Promise<{ wijzigen: boolean; meeschuiven: boolean; rol: string }> {
  const geen = { wijzigen: false, meeschuiven: false, rol: '' }
  if (!user) return geen
  if (isFederationLevel(user)) return { wijzigen: true, meeschuiven: true, rol: 'federatie' }
  if (hasRole(user, 'scheidsrechter') && (await refereeMayHandleMatch(payload, user, m.id))) {
    return { wijzigen: true, meeschuiven: true, rol: 'scheidsrechter' }
  }
  // Clubstaf of de coach van de ploeg (magOpstellingVoor laat elke scheidsrechter door; die
  // kwamen hierboven al aan bod en horen hier dus enkel binnen als ze ook bij de club horen).
  const eigen = relId((user as { club?: unknown }).club)
  const vanPloeg = (t: Ploeg | null) =>
    t != null && eigen != null && relId(t.club) === eigen && (isClubStaff(user) || magOpstellingVoor(user, { id: t.id, club: t.club, category: (t as { category?: string | null }).category }))
  if (vanPloeg(ploeg(m.homeTeam))) return { wijzigen: true, meeschuiven: isClubStaff(user), rol: 'thuisclub' }
  if (vanPloeg(ploeg(m.awayTeam))) return { wijzigen: true, meeschuiven: false, rol: 'uitclub' }
  return geen
}

/** De volgende wedstrijden van die dag op hetzelfde terrein (zelfde thuisclub), nog te spelen. */
export async function volgendeOpTerrein(payload: Payload, m: Wedstrijd): Promise<Wedstrijd[]> {
  const thuisClub = relId(ploeg(m.homeTeam)?.club)
  if (thuisClub == null || !m.date) return []
  const dag = dateStrBE(new Date(m.date))
  const ploegen = await payload.find({ collection: 'teams', where: { club: { equals: thuisClub } }, depth: 0, limit: 100, overrideAccess: true })
  const res = await payload.find({
    collection: 'matches',
    where: {
      and: [
        { homeTeam: { in: ploegen.docs.map((t) => t.id) } },
        { date: { greater_than: m.date } },
        { status: { equals: 'scheduled' } },
        { id: { not_equals: m.id } },
      ],
    },
    sort: 'date',
    depth: 1,
    limit: 20,
    overrideAccess: true,
  })
  return (res.docs as unknown as Wedstrijd[]).filter((w) => w.date && dateStrBE(new Date(w.date)) === dag && !w.afgelast)
}

/** Iedereen die het moet weten: staf van beide clubs, de scheidsrechter(s), de spelers op de selectie. */
export async function betrokkenen(payload: Payload, m: { id: number; homeTeam?: unknown; awayTeam?: unknown }): Promise<number[]> {
  const staf = (await Promise.all(clubsVan(m).map((c) => clubStaf(payload, c)))).flat()
  const sheet = (await payload.find({ collection: 'matchsheets', where: { match: { equals: m.id } }, depth: 0, limit: 1, overrideAccess: true })).docs[0] as
    | { assignedReferee?: unknown; officials?: unknown }
    | undefined
  const off = relId(sheet?.assignedReferee)
  const refs = off != null ? (await payload.find({ collection: 'users', where: { official: { equals: off } }, depth: 0, limit: 3, overrideAccess: true })).docs.map((u) => Number(u.id)) : []
  const sel = await wedstrijdSelectie(payload, m.id)
  const spelers = (await Promise.all([...sel.home, ...sel.away].map((r) => accountsVanSpeler(payload, r.id)))).flat()
  return [...staf, ...refs, ...spelers]
}

export async function aftrapVerschuiven(payload: Payload, user: AuthedUser, matchId: number, inv: AftrapInvoer): Promise<AftrapUitkomst> {
  const m = (await payload.findByID({ collection: 'matches', id: matchId, depth: 1, overrideAccess: true }).catch(() => null)) as Wedstrijd | null
  if (!m || !m.date) return { ok: false, status: 404, error: 'Wedstrijd niet gevonden.' }
  const recht = await aftrapRechten(payload, user, m)
  if (!recht.wijzigen) return { ok: false, status: 403, error: 'Enkel de scheidsrechter, de federatie of een van beide clubs kan de aftrap verschuiven.' }
  if (m.status !== 'scheduled') return { ok: false, status: 409, error: m.status === 'live' ? 'De wedstrijd is al bezig.' : 'De wedstrijd is al gespeeld.' }
  if (m.afgelast) return { ok: false, status: 409, error: 'Deze wedstrijd is afgelast.' }
  if (!REDENEN.has(inv.reden)) return { ok: false, status: 400, error: 'Kies de reden.' }
  const van = new Date(m.date)
  const naar = new Date(inv.nieuw)
  if (Number.isNaN(naar.getTime())) return { ok: false, status: 400, error: 'Geef een geldig uur.' }
  if (dateStrBE(naar) !== dateStrBE(van)) {
    return { ok: false, status: 400, error: 'Enkel op dezelfde dag. Een andere dag is een verplaatsing — die vraag je aan de federatie.' }
  }
  const deltaMs = naar.getTime() - van.getTime()
  if (deltaMs === 0) return { ok: false, status: 400, error: 'Dat is hetzelfde uur.' }
  if (Math.abs(deltaMs) > MAX_VERSCHUIVING_MIN * 60_000) return { ok: false, status: 400, error: 'Meer dan 4 uur verschuiven kan niet op de dag zelf — vraag een verplaatsing aan.' }
  // Vroeger beginnen: nooit in het verleden, en nooit vóór het einde van een wedstrijd die nog
  // gepland staat op hetzelfde terrein (die gaat dan door en het terrein is bezet).
  if (deltaMs < 0 && naar.getTime() < Date.now() - 5 * 60_000) return { ok: false, status: 400, error: 'Dat uur is al voorbij.' }
  if (inv.volgendeOok && !recht.meeschuiven) {
    return { ok: false, status: 403, error: 'De volgende wedstrijden op het terrein meeschuiven kan enkel de thuisclub, de scheidsrechter of de federatie.' }
  }

  const naam = `${String((user as { name?: unknown }).name ?? '').trim() || 'Iemand'} (${recht.rol})`
  const toelichting = inv.toelichting?.trim().slice(0, 500) || null
  const schrijf = async (w: Wedstrijd, nieuw: Date, aanleiding?: number) => {
    const rij = await payload.create({
      collection: 'aftrap-wijzigingen',
      data: {
        match: w.id,
        clubs: clubsVan(w),
        van: w.date!,
        naar: nieuw.toISOString(),
        reden: inv.reden as never,
        toelichting,
        gemeldDoor: Number(user.id),
        gemeldDoorNaam: naam,
        ...(aanleiding ? { aanleiding } : {}),
      },
      overrideAccess: true,
    })
    await payload.update({ collection: 'matches', id: w.id, data: { date: nieuw.toISOString() }, overrideAccess: true })
    return Number(rij.id)
  }

  const volgende = inv.volgendeOok ? await volgendeOpTerrein(payload, m) : []
  const hoofd = await schrijf(m, naar)
  const verschoven = [{ id: m.id, titel: titel(m), naar: naar.toISOString(), van: m.date }]
  for (const w of volgende) {
    const nieuw = new Date(new Date(w.date!).getTime() + deltaMs)
    await schrijf(w, nieuw, hoofd)
    verschoven.push({ id: w.id, titel: titel(w), naar: nieuw.toISOString(), van: w.date! })
  }

  // Iedereen verwittigen, per wedstrijd (andere ploegen, andere spelers).
  const richting = deltaMs > 0 ? 'later' : 'vroeger'
  const min = Math.round(Math.abs(deltaMs) / 60_000)
  for (const v of verschoven) {
    const w = v.id === m.id ? m : volgende.find((x) => x.id === v.id)!
    const tekst = `Aftrap ${formatTimeBE(v.van)} → ${formatTimeBE(v.naar)} (${min} min ${richting}): ${REDEN_TEKST[inv.reden]}${
      v.id === m.id ? '' : `, mee verschoven met ${titel(m)}`
    }.${toelichting && v.id === m.id ? ` ${toelichting}` : ''}`
    const ontvangers = (await betrokkenen(payload, w)).filter((id) => id !== Number(user.id))
    await meld(payload, ontvangers, { titel: `⏱️ ${v.titel}`, tekst, url: `/match/${v.id}` })
    void sendPushToClubs(payload, clubsVan(w), { title: `⏱️ ${v.titel}`, body: tekst, url: `/match/${v.id}`, tag: `aftrap-${v.id}` }).catch(() => null)
  }
  return { ok: true, verschoven: verschoven.map(({ id, titel: t, naar: n }) => ({ id, titel: t, naar: n })) }
}

export type AftrapRij = { id: number; van: string; naar: string; reden: string; redenTekst: string; toelichting: string | null; door: string; meegeschoven: boolean; op: string }

export async function aftrapGeschiedenis(payload: Payload, matchId: number): Promise<AftrapRij[]> {
  const res = await payload.find({ collection: 'aftrap-wijzigingen', where: { match: { equals: matchId } }, sort: '-createdAt', depth: 0, limit: 20, overrideAccess: true })
  return res.docs.map((d) => ({
    id: Number(d.id),
    van: String(d.van),
    naar: String(d.naar),
    reden: String(d.reden),
    redenTekst: REDEN_TEKST[String(d.reden)] ?? String(d.reden),
    toelichting: (d.toelichting as string | null) ?? null,
    door: String(d.gemeldDoorNaam ?? ''),
    meegeschoven: d.aanleiding != null,
    op: String(d.createdAt),
  }))
}
