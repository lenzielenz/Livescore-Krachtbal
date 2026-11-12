import type { Payload } from 'payload'

import { hasRole, isFederationLevel, userClubId } from './access'
import { brusselsParts, brusselsWallUtc, dateStrBE, formatDateBE, shiftDateStr } from './datetime'
import { feestdag } from './feestdagen'
import { comiteVoor, VOORBEHOUD_ONDERWERPEN, type VoorbehoudOnderwerp } from './voorbehoud-onderwerpen'
import { clubStaf, federatieAccounts, meld } from './meldingen'

// Voorbehoud en uitsluiting op het wedstrijdblad (RCVK items 25 en 27), en wat er daarna gebeurt.
//
// Op het veld: de kapitein (U12–U16: de coach) vraagt de scheidsrechter een voorbehoud aan te tekenen,
// met een kort relaas, de score en de speeltijd van dat moment. De scheidsrechter noteert het hier
// (blokNoteren, ook een uitsluiting). Na de handtekening van de scheidsrechter verandert er niets meer
// aan (item 37).
//
// Na het indienen wordt elk voorbehoud een dossier bij de federatie (klacht van soort 'voorbehoud',
// status 'te_bekrachtigen'). De club van die ploeg moet het "binnen de 5 werkdagen" bekrachtigen met
// een uitgebreid relaas (voorbehoudBeantwoorden 'bekrachtigen' → status 'open', de federatie beslist
// zoals bij een klacht) of er schriftelijk van afzien ('afzien' → geen kosten). Doet ze niets, dan
// vervalt het voorbehoud en stelt het systeem de 75 euro administratieve kosten voor (lib/boetes.ts,
// aanleiding 'voorbehoud').

export { COMITE_LABEL, comiteVoor, VOORBEHOUD_ONDERWERPEN, type Comite, type VoorbehoudOnderwerp } from './voorbehoud-onderwerpen'

export type BladBlok = 'voorbehoud' | 'uitsluiting'
export type Kant = 'thuis' | 'uit'

export const VOORBEHOUD_WERKDAGEN = 5
export const RELAAS_MIN_TEKENS = 30

const relId = (v: unknown): number | null => {
  const id = v && typeof v === 'object' ? (v as { id?: unknown }).id : v
  return id == null || !Number.isFinite(Number(id)) ? null : Number(id)
}
const tekst = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

/** Puur: is die datum (`YYYY-MM-DD`) een werkdag — geen zaterdag, zondag of wettelijke feestdag? */
export function isWerkdag(dag: string): boolean {
  const [y, m, d] = dag.split('-').map(Number)
  const wd = brusselsParts(brusselsWallUtc(y!, m!, d!, 12)).weekdayMon0
  return wd < 5 && feestdag(dag) == null
}

/**
 * Puur: het einde (23:59 Belgische tijd) van de n-de werkdag na `vanaf`. Zaterdag, zondag en de
 * wettelijke feestdagen (lib/feestdagen.ts) tellen niet.
 */
export function werkdagenNa(vanaf: Date, n: number = VOORBEHOUD_WERKDAGEN): Date {
  let dag = dateStrBE(vanaf)
  let geteld = 0
  while (geteld < n) {
    dag = shiftDateStr(dag, 1)
    if (isWerkdag(dag)) geteld++
  }
  const [y, m, d] = dag.split('-').map(Number)
  return brusselsWallUtc(y!, m!, d!, 23, 59)
}

export type BlokInvoer = {
  side?: unknown
  naam?: unknown
  playerId?: unknown
  reden?: unknown
  score?: unknown
  speeltijd?: unknown
  index?: unknown
  onderwerp?: unknown
}

/**
 * Noteert (of schrapt, met `index`) een voorbehoud of uitsluiting op het blad. Enkel zolang de
 * scheidsrechter nog niet aftekende: daarna ligt het blad vast (item 37). Rechten (toegewezen
 * scheidsrechter of federatie) controleert de route.
 */
export async function blokNoteren(
  payload: Payload,
  sheet: { id: number | string; status?: unknown; scheidsrechter?: unknown; voorbehoud?: unknown; uitsluitingen?: unknown },
  soort: BladBlok,
  inv: BlokInvoer,
  schrappen = false,
): Promise<{ ok: true; rijen: unknown[] } | { ok: false; status: number; error: string }> {
  if (sheet.status === 'ingediend') return { ok: false, status: 409, error: 'Het blad is al ingediend.' }
  if ((sheet.scheidsrechter as { akkoord?: boolean } | undefined)?.akkoord) {
    return { ok: false, status: 409, error: 'De scheidsrechter tekende al af: daarna verandert er niets meer aan het blad (item 37).' }
  }
  const veld = soort === 'voorbehoud' ? 'voorbehoud' : 'uitsluitingen'
  const rijen = (Array.isArray(sheet[veld]) ? (sheet[veld] as Record<string, unknown>[]) : []).map((r) => ({ ...r }))

  if (schrappen) {
    const i = Number(inv.index)
    if (!Number.isInteger(i) || i < 0 || i >= rijen.length) return { ok: false, status: 400, error: 'Die regel bestaat niet.' }
    rijen.splice(i, 1)
  } else {
    const side = inv.side === 'thuis' || inv.side === 'uit' ? inv.side : null
    if (!side) return { ok: false, status: 400, error: 'Voor welke ploeg?' }
    const reden = tekst(inv.reden, 500)
    if (reden.length < 5) return { ok: false, status: 400, error: soort === 'voorbehoud' ? 'Noteer kort de feiten van het voorbehoud.' : 'Noteer de reden van de uitsluiting.' }
    const basis = { side, reden, score: tekst(inv.score, 20) || null, speeltijd: tekst(inv.speeltijd, 20) || null }
    if (soort === 'voorbehoud') {
      const naam = tekst(inv.naam, 80)
      if (naam.length < 2) return { ok: false, status: 400, error: 'Wie vraagt het voorbehoud (kapitein; U12–U16 de coach)?' }
      const onderwerp = VOORBEHOUD_ONDERWERPEN.some((o) => o.value === inv.onderwerp) ? (inv.onderwerp as VoorbehoudOnderwerp) : null
      if (!onderwerp) return { ok: false, status: 400, error: 'Waarover gaat het voorbehoud? Dat bepaalt welk comité het behandelt.' }
      rijen.push({ ...basis, naam, onderwerp })
    } else {
      const player = Number(inv.playerId)
      const naam = tekst(inv.naam, 80)
      if (!Number.isFinite(player) && naam.length < 2) return { ok: false, status: 400, error: 'Welke speler wordt uitgesloten?' }
      rijen.push({ ...basis, ...(Number.isFinite(player) ? { player } : {}), naam: naam || null })
    }
  }
  const bewaard = await payload.update({ collection: 'matchsheets', id: sheet.id, data: { [veld]: rijen } as never, overrideAccess: true })
  return { ok: true, rijen: (bewaard as unknown as Record<string, unknown[]>)[veld] ?? [] }
}

/**
 * Na het indienen: elk voorbehoud wordt een dossier dat de club van die ploeg moet bekrachtigen.
 * Idempotent (sleutel per regel): een heropend en opnieuw ingediend blad maakt geen dubbels. Geeft
 * het aantal nieuwe dossiers.
 */
export async function voorbehoudenOpenen(payload: Payload, matchId: number, nu: Date = new Date()): Promise<number> {
  const sheet = (await payload.find({ collection: 'matchsheets', where: { match: { equals: matchId } }, depth: 0, limit: 1, overrideAccess: true })).docs[0]
  const rijen = (sheet?.voorbehoud ?? []) as {
    id?: string | null
    side?: string | null
    naam?: string | null
    reden?: string | null
    score?: string | null
    speeltijd?: string | null
    onderwerp?: string | null
  }[]
  if (!sheet || !rijen.length) return 0
  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 1, overrideAccess: true })
  const ploeg = (t: unknown) => (t && typeof t === 'object' ? (t as { name?: unknown; club?: unknown }) : null)
  const titel = `${String(ploeg(match.homeTeam)?.name ?? '?')} – ${String(ploeg(match.awayTeam)?.name ?? '?')}`
  const tegen = werkdagenNa(nu)
  let nieuw = 0
  for (const [i, r] of rijen.entries()) {
    const club = relId(ploeg(r.side === 'uit' ? match.awayTeam : match.homeTeam)?.club)
    if (club == null) continue
    const sleutel = `voorbehoud:${sheet.id}:${r.id ?? i}`
    const al = await payload.count({ collection: 'klachten', where: { sleutel: { equals: sleutel } }, overrideAccess: true })
    if (al.totalDocs) continue
    const onderwerp = VOORBEHOUD_ONDERWERPEN.find((o) => o.value === r.onderwerp)
    const reden = [
      onderwerp ? `${onderwerp.label}:` : null,
      r.reden,
      r.score ? `stand ${r.score}` : null,
      r.speeltijd ? `speeltijd ${r.speeltijd}` : null,
      r.naam ? `gevraagd door ${r.naam}` : null,
    ]
      .filter(Boolean)
      .join(' — ')
      .replace(': —', ':')
    await payload.create({
      collection: 'klachten',
      data: {
        match: matchId,
        club,
        soort: 'voorbehoud',
        status: 'te_bekrachtigen',
        reden,
        bekrachtigTegen: tegen.toISOString(),
        sleutel,
        comite: comiteVoor(r.onderwerp),
      },
      overrideAccess: true,
    })
    nieuw++
    await meld(payload, await clubStaf(payload, club), {
      titel: `⚖️ Voorbehoud te bekrachtigen: ${titel}`,
      tekst: `Uw kapitein liet voorbehoud aantekenen. Bekrachtig het tegen ${formatDateBE(tegen.toISOString(), { weekday: 'long', day: 'numeric', month: 'long' })} met een uitgebreid relaas, of zie ervan af. Zonder antwoord vervalt het en volgen 75 euro administratieve kosten (RCVK item 25).`,
      url: `/aftekenen/${matchId}`,
    }).catch(() => 0)
  }
  return nieuw
}

export type Antwoord = { ok: true; status: string } | { ok: false; status: number; error: string }

/** De club bekrachtigt een voorbehoud (met relaas) of ziet ervan af. De federatie mag het ook in haar naam. */
export async function voorbehoudBeantwoorden(
  payload: Payload,
  user: unknown,
  klachtId: number,
  actie: 'bekrachtigen' | 'afzien',
  relaas: string,
  nu: Date = new Date(),
): Promise<Antwoord> {
  const k = await payload.findByID({ collection: 'klachten', id: klachtId, depth: 1, overrideAccess: true }).catch(() => null)
  if (!k || k.soort !== 'voorbehoud') return { ok: false, status: 404, error: 'Voorbehoud niet gevonden.' }
  const club = relId(k.club)
  const vanClub = club != null && String(userClubId(user)) === String(club) && hasRole(user, 'club-beheerder', 'club-medewerker')
  if (!vanClub && !isFederationLevel(user)) return { ok: false, status: 403, error: 'Enkel de clubverantwoordelijken van die ploeg beantwoorden dit voorbehoud.' }
  if (k.status !== 'te_bekrachtigen') return { ok: false, status: 409, error: 'Dit voorbehoud is al beantwoord.' }
  if (k.bekrachtigTegen && new Date(String(k.bekrachtigTegen)).getTime() < nu.getTime() && !isFederationLevel(user)) {
    return { ok: false, status: 409, error: 'De termijn van 5 werkdagen is verstreken.' }
  }
  const r = relaas.trim().slice(0, 4000)
  if (actie === 'bekrachtigen' && r.length < RELAAS_MIN_TEKENS) {
    return { ok: false, status: 400, error: `Geef een uitgebreid relaas van de feiten (minstens ${RELAAS_MIN_TEKENS} tekens).` }
  }
  const status = actie === 'bekrachtigen' ? 'open' : 'afgezien'
  await payload.update({
    collection: 'klachten',
    id: klachtId,
    data: { status, relaas: r || null, ingediendDoor: Number((user as { id?: unknown }).id) },
    overrideAccess: true,
  })
  if (actie === 'bekrachtigen') {
    await meld(payload, await federatieAccounts(payload), {
      titel: '⚖️ Voorbehoud bekrachtigd',
      tekst: r.length > 140 ? `${r.slice(0, 137)}…` : r,
      url: `/federatie/aanvragen?dossier=klacht:${klachtId}`,
    }).catch(() => 0)
  }
  return { ok: true, status }
}
