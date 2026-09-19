import type { Payload } from 'payload'

import { brusselsDayBoundsUtc, dateStrBE } from './datetime'
import { buildFixedSimpleScore } from './simple-score'
import { planVeldenSync, randomPairingCode, veldNaam, type DagWedstrijd, type FieldScreenTheme, type VeldRow } from './field-screens'
import { isPreMatchLead } from './tribune'

// DB-laag voor veldschermen — het datamodel en de motivatie staan in collections/FieldScreens.ts,
// de pure planning-/codelogica in field-screens.ts. Alle functies hier draaien met
// overrideAccess: true: de aanroepende API-route deed de rol-/eigenaarscontrole al (club-staf van
// de EIGEN club, of de publieke koppelroute die op de code zelf vertrouwt).

const rel = (v: unknown): number | null =>
  v && typeof v === 'object' ? ((v as { id?: number }).id ?? null) : typeof v === 'number' ? v : null

/** Nieuwe koppelcode die momenteel door geen enkel WACHTEND veldscherm gebruikt wordt (gekoppelde
 * velden tellen niet mee — hun code is toch niet opzoekbaar zolang ze bezet zijn). */
async function uniquePairingCode(payload: Payload): Promise<string> {
  for (let poging = 0; poging < 10; poging++) {
    const code = randomPairingCode()
    const bestaat = await payload
      .find({ collection: 'field-screens', where: { and: [{ pairingCode: { equals: code } }, { pairedMatch: { exists: false } }] }, limit: 1, depth: 0, overrideAccess: true })
      .catch(() => ({ totalDocs: 1 }))
    if (bestaat.totalDocs === 0) return code
  }
  // Extreem onwaarschijnlijk bij 10 pogingen op 900.000 codes — val terug op een verse worp.
  return randomPairingCode()
}

export type FieldScreenRow = {
  id: number
  naam: string
  pairingCode: string | null
  pairedMatchId: number | null
  pairedAt: string | null
  theme: FieldScreenTheme
}

const toFieldScreenRow = (d: Record<string, unknown>): FieldScreenRow => ({
  id: d.id as number,
  naam: String((d as { naam?: unknown }).naam ?? ''),
  pairingCode: ((d as { pairingCode?: unknown }).pairingCode as string | null) ?? null,
  pairedMatchId: rel((d as { pairedMatch?: unknown }).pairedMatch),
  pairedAt: ((d as { pairedAt?: unknown }).pairedAt as string | null) ?? null,
  theme: (d as { theme?: unknown }).theme === 'light' ? 'light' : 'dark',
})

/** Echte velden van een club, in aanmaakvolgorde — de vaste demo-schermen (zie
 * ensureClubDemoScreens) tellen hier bewust niet mee: geen echt veld, dus niet onderhevig aan
 * "aantal velden" (planVeldenSync mag ze nooit aanmaken/verwijderen). */
export async function getClubFieldScreens(payload: Payload, clubId: number): Promise<FieldScreenRow[]> {
  const res = await payload
    .find({
      collection: 'field-screens',
      where: { and: [{ club: { equals: clubId } }, { isDemo: { not_equals: true } }] },
      sort: 'createdAt',
      depth: 0,
      limit: 100,
      overrideAccess: true,
    })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  return res.docs.map((d) => toFieldScreenRow(d as unknown as Record<string, unknown>))
}

/** De twee vaste demo-schermen van een club (wachtscherm + scorebord) als rijen, in dezelfde vorm
 * als getClubFieldScreens — voor weergave op /club/veldscherm naast de echte velden. */
export async function getClubDemoScreens(payload: Payload, clubId: number): Promise<FieldScreenRow[]> {
  const res = await payload
    .find({
      collection: 'field-screens',
      where: { and: [{ club: { equals: clubId } }, { isDemo: { equals: true } }] },
      sort: 'createdAt',
      depth: 0,
      limit: 5,
      overrideAccess: true,
    })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  return res.docs.map((d) => toFieldScreenRow(d as unknown as Record<string, unknown>))
}

/** Kleurthema van één veld wijzigen — enkel dat, geen andere velden aangeraakt. De caller
 * (api/veldscherm/thema) controleerde al dat het veld bij de club van de aanroeper hoort. */
export async function setFieldScreenTheme(payload: Payload, fieldScreenId: number, theme: FieldScreenTheme): Promise<void> {
  await payload.update({ collection: 'field-screens', id: fieldScreenId, data: { theme }, overrideAccess: true })
}

export type VeldenSyncResult = { screens: FieldScreenRow[]; blockedByLive: string[] }

/** Breng het aantal veldschermen van een club naar `target` — zie planVeldenSync voor de regels
 * (nooit een gekoppeld veld verwijderen). */
export async function syncVeldenCount(payload: Payload, clubId: number, target: number): Promise<VeldenSyncResult> {
  const existing = await getClubFieldScreens(payload, clubId)
  const rows: VeldRow[] = existing.map((v) => ({ id: v.id, naam: v.naam, paired: v.pairedMatchId != null }))
  const plan = planVeldenSync(rows, target)

  for (const id of plan.toRemove) {
    await payload.delete({ collection: 'field-screens', id, overrideAccess: true }).catch(() => {})
  }
  for (let i = 0; i < plan.toCreate; i++) {
    const volgnummer = existing.length + i + 1
    const code = await uniquePairingCode(payload)
    await payload.create({
      collection: 'field-screens',
      data: { club: clubId, naam: veldNaam(volgnummer), pairingCode: code },
      overrideAccess: true,
    })
  }

  return { screens: await getClubFieldScreens(payload, clubId), blockedByLive: plan.blockedByLive }
}

export type PairResult = { ok: true; fieldScreenId: number } | { ok: false; error: string }

/** Koppel een gestarte wedstrijd aan het veldscherm met deze koppelcode. Vertrouwt bewust enkel op
 * de code (net als een Chromecast-/Apple TV-pincode) — wie de code op de tv kan lezen, staat
 * fysiek bij dat veld. De club-check hieronder is een extra veiligheidsnet tegen een toevallige
 * codebotsing, niet de eigenlijke toegangscontrole. */
export async function pairMatchToCode(payload: Payload, code: string, matchId: number): Promise<PairResult> {
  const screenRes = await payload
    .find({
      collection: 'field-screens',
      where: { and: [{ pairingCode: { equals: code } }, { pairedMatch: { exists: false } }, { isDemo: { not_equals: true } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const screen = screenRes.docs[0]
  if (!screen) return { ok: false, error: 'Onbekende of al gebruikte koppelcode.' }

  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 1 }).catch(() => null)
  if (!match) return { ok: false, error: 'Wedstrijd niet gevonden.' }
  // Live mag altijd; een geplande wedstrijd mag al vanaf een uur vóór de aftrap — zo staat het
  // scherm al klaar wanneer de aantekenaar effectief start.
  const magAlKoppelen = match.status === 'live' || (match.status === 'scheduled' && isPreMatchLead(match.date as string | null))
  if (!magAlKoppelen) {
    return { ok: false, error: 'Koppelen kan enkel vanaf een uur vóór de aftrap tot de wedstrijd live is.' }
  }

  const screenClubId = rel((screen as { club?: unknown }).club)
  const homeTeam = match.homeTeam as { club?: unknown } | number | null | undefined
  const homeClubId = homeTeam && typeof homeTeam === 'object' ? rel(homeTeam.club) : null
  if (screenClubId != null && homeClubId != null && screenClubId !== homeClubId) {
    return { ok: false, error: 'Deze code hoort bij een veldscherm van een andere club.' }
  }

  await payload.update({
    collection: 'field-screens',
    id: screen.id as number,
    data: { pairedMatch: matchId, pairedAt: new Date().toISOString() },
    overrideAccess: true,
  })
  return { ok: true, fieldScreenId: screen.id as number }
}

/** Ontkoppel elk veldscherm dat aan deze wedstrijd gekoppeld stond, en geef het een verse
 * koppelcode — zodat het wachtscherm meteen weer bruikbaar is voor de volgende wedstrijd.
 * Aangeroepen vanuit Matches.ts's afterChange-hook zodra de status naar 'finished' gaat, ongeacht
 * via welk pad dat gebeurde (aantekenscherm, forfait, import, federatie-sync). */
export async function unpairFieldScreensForMatch(payload: Payload, matchId: number): Promise<void> {
  const res = await payload
    .find({ collection: 'field-screens', where: { pairedMatch: { equals: matchId } }, depth: 0, limit: 20, overrideAccess: true })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  for (const doc of res.docs) {
    const code = await uniquePairingCode(payload)
    await payload
      .update({ collection: 'field-screens', id: doc.id as number, data: { pairedMatch: null, pairedAt: null, pairingCode: code }, overrideAccess: true })
      .catch(() => {})
  }
}

export type PublicFieldScreenState = {
  fieldScreenId: number
  clubId: number | null
  clubName: string
  naam: string
  pairingCode: string | null
  pairedMatchId: number | null
  theme: FieldScreenTheme
  isDemo: boolean
}

/** Publieke, minimale staat van één veldscherm — wat de tv-pagina en de pollende sync nodig
 * hebben. Bewust geen rauwe collection-read: dit is de enige weg waarlangs een niet-ingelogde
 * tv-browser iets over een veldscherm te weten komt. */
export async function getPublicFieldScreenState(payload: Payload, fieldScreenId: number): Promise<PublicFieldScreenState | null> {
  const doc = await payload.findByID({ collection: 'field-screens', id: fieldScreenId, depth: 1, overrideAccess: true }).catch(() => null)
  if (!doc) return null
  const club = (doc as { club?: unknown }).club
  return {
    fieldScreenId,
    clubId: rel(club),
    clubName: club && typeof club === 'object' ? String((club as { name?: unknown }).name ?? '—') : '—',
    naam: String((doc as { naam?: unknown }).naam ?? ''),
    pairingCode: ((doc as { pairingCode?: unknown }).pairingCode as string | null) ?? null,
    pairedMatchId: rel((doc as { pairedMatch?: unknown }).pairedMatch),
    theme: (doc as { theme?: unknown }).theme === 'light' ? 'light' : 'dark',
    isDemo: Boolean((doc as { isDemo?: unknown }).isDemo),
  }
}

/** Alle thuiswedstrijden van vandaag voor een club — het wachtscherm toont deze zolang er niets
 * gekoppeld is. */
export async function todaysHomeMatches(payload: Payload, clubId: number, now: Date = new Date()): Promise<DagWedstrijd[]> {
  const { start, end } = brusselsDayBoundsUtc(dateStrBE(now))
  const res = await payload
    .find({
      collection: 'matches',
      where: {
        and: [
          { 'homeTeam.club': { equals: clubId } },
          { date: { greater_than_equal: start } },
          { date: { less_than: end } },
          { analyseOnly: { not_equals: true } },
          { isDemo: { not_equals: true } },
        ],
      },
      sort: 'date',
      depth: 1,
      limit: 50,
    })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  return res.docs.map((m) => {
    const away = (m as { awayTeam?: unknown }).awayTeam
    return {
      id: m.id as number,
      time: String((m as { date?: unknown }).date ?? ''),
      opponent: away && typeof away === 'object' ? String((away as { name?: unknown }).name ?? '—') : '—',
      reeks: ((m as { reeks?: unknown }).reeks as string | null) ?? null,
      status: String((m as { status?: unknown }).status ?? 'scheduled'),
    }
  })
}

const DEMO_WACHT_NAAM = 'Demo — wachtscherm'
const DEMO_SCORE_NAAM = 'Demo — scorebord'

export type ClubDemoScreens = { wachtId: number; scoreId: number }

/**
 * Zorgt dat een club twee vaste demo-veldschermen heeft: een permanent wachtscherm (met een
 * fictieve dagplanning — zie fictionalDagplanning) en een scherm dat permanent gekoppeld blijft
 * aan een fictieve, altijd-live demo-wedstrijd. Die wedstrijd is isDemo: true en dus onzichtbaar
 * op elke publieke lijst/stand/recap (zie o.a. loadLiveDay.ts, match-notify.ts) — en blijft
 * gekoppeld omdat Matches.ts's afterChange-hook enkel ontkoppelt bij de overgang náár 'finished',
 * wat hier nooit gebeurt. Bedoeld om het uiterlijk van beide schermtoestanden te kunnen
 * testen/tunen zonder ooit een echte wedstrijd nodig te hebben. Idempotent.
 *
 * Geeft null terug als de club nog geen eigen team heeft, of als er nog geen ander team in de
 * competitie zit om als fictieve tegenstander te tonen.
 */
export async function ensureClubDemoScreens(payload: Payload, clubId: number): Promise<ClubDemoScreens | null> {
  const existing = await payload
    .find({ collection: 'field-screens', where: { and: [{ club: { equals: clubId } }, { isDemo: { equals: true } }] }, depth: 0, limit: 5, overrideAccess: true })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  let wachtId = (existing.docs.find((d) => (d as { naam?: unknown }).naam === DEMO_WACHT_NAAM)?.id as number | undefined) ?? undefined
  let scoreId = (existing.docs.find((d) => (d as { naam?: unknown }).naam === DEMO_SCORE_NAAM)?.id as number | undefined) ?? undefined
  if (wachtId && scoreId) return { wachtId, scoreId }

  const homeTeam = (await payload.find({ collection: 'teams', where: { club: { equals: clubId } }, limit: 1, depth: 0, overrideAccess: true }).catch(() => ({ docs: [] as Record<string, unknown>[] }))).docs[0]
  const homeReeks = (homeTeam as { reeks?: string | null } | undefined)?.reeks
  // De wedstrijd MOET een tegenstander in dezelfde reeks krijgen: Matches.ts's awayTeam-veld
  // (filterOptions) weigert anders elke andere ploeg, en die validatie geldt ook server-side bij
  // overrideAccess — een mismatch laat deze create mislukken en zou de hele pagina platleggen.
  const awayTeam = homeReeks
    ? (
        await payload
          .find({ collection: 'teams', where: { and: [{ club: { not_equals: clubId } }, { reeks: { equals: homeReeks } }] }, limit: 1, depth: 0, overrideAccess: true })
          .catch(() => ({ docs: [] as Record<string, unknown>[] }))
      ).docs[0]
    : undefined
  if (!homeTeam || !awayTeam) return null

  if (!wachtId) {
    const created = await payload.create({
      collection: 'field-screens',
      data: { club: clubId, naam: DEMO_WACHT_NAAM, isDemo: true, pairingCode: randomPairingCode() },
      overrideAccess: true,
    })
    wachtId = created.id
  }

  if (!scoreId) {
    // Nooit de hele pagina laten crashen op een onverwachte validatiefout hier (bv. een
    // reglementswijziging op Matches.ts die deze fictieve combinatie alsnog afwijst) — zonder
    // scorebord toont de admin-pagina dan gewoon enkel het wachtscherm-demo.
    scoreId = await (async () => {
      const now = new Date()
      const demoMatch = await payload.create({
        collection: 'matches',
        data: {
          homeTeam: homeTeam.id as number,
          awayTeam: awayTeam.id as number,
          date: now.toISOString(),
          status: 'live',
          reeks: ((homeTeam as { reeks?: string | null }).reeks ?? undefined) as never,
          isDemo: true,
          analyseOnly: false,
          goalAreaDepth: 10,
          currentHalf: 1,
          clockRunning: true,
          clockSeconds: 420,
          clockUpdatedAt: now.toISOString(),
          simpleScore: buildFixedSimpleScore(6, 4) as unknown as Record<string, unknown>,
        },
        overrideAccess: true,
      })
      const created = await payload.create({
        collection: 'field-screens',
        data: { club: clubId, naam: DEMO_SCORE_NAAM, isDemo: true, pairedMatch: demoMatch.id, pairedAt: now.toISOString() },
        overrideAccess: true,
      })
      return created.id
    })().catch(() => undefined)
  }

  if (!scoreId) return null
  return { wachtId, scoreId }
}
