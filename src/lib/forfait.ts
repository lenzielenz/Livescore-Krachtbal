import type { Payload } from 'payload'

import { isClubStaff, isFederationLevel, userClubId } from './access'
import { betrokkenen } from './aftrap'
import type { AuthedUser } from './api-auth'
import { volgBladStatus } from './blad-status'
import { boeteVoorstellen } from './boetes'
import { magOpstellingVoor } from './club-functies'
import { brusselsParts, brusselsWallUtc, dateStrBE, formatDateTimeBE, shiftDateStr } from './datetime'
import { getOrCreateMatchSheet } from './matchsheet-data'
import { federatieAccounts, meld } from './meldingen'
import { buildFixedSimpleScore, EMPTY_SIMPLE_SCORE } from './simple-score'
import { forfaitScore } from './standings'

// Forfaits (RCVK item 34). Twee wegen naar hetzelfde forfait op het blad:
// - de club MELDT vooraf dat een ploeg niet komt (forfaitMelden). Iedereen hoort het meteen: de
//   tegenpartij, de scheidsrechter (die dan niet hoeft te komen), de federatie en de spelers op de
//   selectie. Het moment telt: vóór vrijdag 12u van het speelweekend is "tijdig", daarna "laat" — de
//   boetelijst kan per moment een ander bedrag hebben (lib/boetes.ts);
// - de scheidsrechter STELT ter plaatse vast dat een ploeg er niet is (actie 'forfait' op
//   /api/matchsheet/[id]/referee): moment "ter plaatse".
// "Een forfait vervalt bij afgelasting [...] Als de match in kwestie verplaatst wordt, wordt de FF
// geannuleerd" (item 34): een vooraf gemeld forfait vervalt bij een verplaatsing (forfaitVervalt),
// samen met de boetevoorstellen die eruit volgden.

export type ForfaitUitslag = 'geen' | 'thuis' | 'uit' | 'dubbel'
export type ForfaitMoment = 'vooraf' | 'laat' | 'ter_plaatse'
export type Kant = 'thuis' | 'uit'
export type Uitkomst = { ok: true; uitslag: ForfaitUitslag; moment?: ForfaitMoment } | { ok: false; status: number; error: string }

const relId = (v: unknown): number | null => {
  const id = v && typeof v === 'object' ? (v as { id?: unknown }).id : v
  return id == null || !Number.isFinite(Number(id)) ? null : Number(id)
}
type Ploeg = { id?: unknown; name?: unknown; club?: unknown; category?: unknown } | null
const ploeg = (v: unknown): Ploeg => (v && typeof v === 'object' ? (v as Ploeg) : null)

/**
 * Puur: tot wanneer een forfait als tijdig gemeld telt. Een weekendwedstrijd (vrijdagavond, zaterdag,
 * zondag): vrijdag 12u van dat weekend (item 34: "forfaits na vrijdag 12u moeten ook telefonisch
 * gemeld worden"). Een midweekwedstrijd: 24 uur vóór de aftrap — het reglement zegt er niets over;
 * dit is een redelijke, uitlegbare grens die de federatie kan bijsturen.
 */
export function forfaitGrens(aftrap: Date): Date {
  const p = brusselsParts(aftrap)
  const weekend = p.weekdayMon0 >= 5 || (p.weekdayMon0 === 4 && p.hour >= 12)
  if (!weekend) return new Date(aftrap.getTime() - 24 * 3_600_000)
  const vrijdag = shiftDateStr(dateStrBE(aftrap), -(p.weekdayMon0 - 4))
  const [y, m, d] = vrijdag.split('-').map(Number)
  return brusselsWallUtc(y!, m!, d!, 12, 0)
}

/** Puur: tijdig of laat gemeld. */
export function forfaitMomentVoor(gemeldOp: Date, aftrap: Date): 'vooraf' | 'laat' {
  return gemeldOp.getTime() < forfaitGrens(aftrap).getTime() ? 'vooraf' : 'laat'
}

/** Puur: de nieuwe uitslag als `kant` forfait geeft bovenop wat er al stond. Null = niets verandert. */
export function nieuweUitslag(huidig: ForfaitUitslag, kant: Kant): ForfaitUitslag | null {
  if (huidig === 'geen') return kant
  if (huidig === kant || huidig === 'dubbel') return null
  return 'dubbel'
}

/**
 * Zet de forfait-uitslag op het blad en de wedstrijd: de niet-forfaiterende ploeg wint (forfaitScore),
 * de wedstrijd staat op afgelopen. 'geen' draait een forfait terug (wedstrijd weer gepland, score leeg).
 * Gedeeld door de club (melden), de scheidsrechter (ter plaatse) en het vervallen.
 */
export async function zetForfait(
  payload: Payload,
  matchId: number,
  sheetId: number | string,
  uitslag: ForfaitUitslag,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await payload.update({ collection: 'matchsheets', id: sheetId, data: { forfait: { uitslag, ...extra } } as never, overrideAccess: true })
  const score = forfaitScore(uitslag)
  await payload.update({
    collection: 'matches',
    id: matchId,
    data: score
      ? { status: 'finished', simpleScore: buildFixedSimpleScore(score.home, score.away) as unknown as Record<string, unknown> }
      : { status: 'scheduled', simpleScore: EMPTY_SIMPLE_SCORE as unknown as Record<string, unknown> },
    overrideAccess: true,
  })
  await volgBladStatus(payload, matchId)
}

/** Mag deze gebruiker voor deze ploeg forfait melden? De federatie, of de staf/coach van die ploeg. */
export function magForfaitMelden(user: unknown, team: { id: number; club: number | null; category?: string | null }): boolean {
  if (!user) return false
  if (isFederationLevel(user)) return true
  const eigen = userClubId(user)
  if (eigen == null || team.club == null || String(eigen) !== String(team.club)) return false
  return isClubStaff(user) || magOpstellingVoor(user, team)
}

/** De club (of de federatie) meldt vooraf dat een ploeg forfait geeft. */
export async function forfaitMelden(
  payload: Payload,
  user: AuthedUser,
  matchId: number,
  inv: { kant?: unknown; reden?: unknown },
  nu: Date = new Date(),
): Promise<Uitkomst> {
  const kant = inv.kant === 'thuis' || inv.kant === 'uit' ? inv.kant : null
  if (!kant) return { ok: false, status: 400, error: 'Welke ploeg geeft forfait?' }
  const reden = String(inv.reden ?? '').replace(/\s+/g, ' ').trim().slice(0, 300)
  if (reden.length < 5) return { ok: false, status: 400, error: 'Geef kort de reden van het forfait.' }

  const m = await payload.findByID({ collection: 'matches', id: matchId, depth: 1, overrideAccess: true }).catch(() => null)
  if (!m) return { ok: false, status: 404, error: 'Wedstrijd niet gevonden.' }
  const team = ploeg(kant === 'thuis' ? m.homeTeam : m.awayTeam)
  const teamInfo = { id: relId(team) ?? -1, club: relId(team?.club), category: team?.category == null ? null : String(team.category) }
  if (!magForfaitMelden(user, teamInfo)) return { ok: false, status: 403, error: 'Enkel de club van die ploeg (of de federatie) meldt een forfait.' }
  if (m.status === 'live') return { ok: false, status: 409, error: 'De wedstrijd is al bezig.' }
  if (m.afgelast) return { ok: false, status: 409, error: 'Deze wedstrijd is afgelast: er valt geen forfait meer te geven.' }
  if (!m.date) return { ok: false, status: 409, error: 'De wedstrijd heeft nog geen datum.' }

  const sheet = await getOrCreateMatchSheet(payload, matchId)
  if (sheet.status === 'ingediend') return { ok: false, status: 409, error: 'Het wedstrijdblad is al ingediend.' }
  const ff = (sheet.forfait ?? {}) as { uitslag?: ForfaitUitslag }
  const huidig = ff.uitslag ?? 'geen'
  if (m.status === 'finished' && huidig === 'geen') return { ok: false, status: 409, error: 'De wedstrijd is al gespeeld.' }
  const uitslag = nieuweUitslag(huidig, kant)
  if (!uitslag) return { ok: false, status: 409, error: 'Dat forfait is al gemeld.' }

  const moment = forfaitMomentVoor(nu, new Date(String(m.date)))
  await zetForfait(payload, matchId, sheet.id, uitslag, {
    gemeldOp: nu.toISOString(),
    gemeldDoor: Number(user.id),
    moment,
    reden,
    ...(kant === 'thuis' ? { gemeldThuis: true } : { gemeldUit: true }),
  })

  const titel = `${String(ploeg(m.homeTeam)?.name ?? '?')} – ${String(ploeg(m.awayTeam)?.name ?? '?')}`
  const wie = [...(await betrokkenen(payload, { id: matchId, homeTeam: m.homeTeam, awayTeam: m.awayTeam }).catch(() => [] as number[])), ...(await federatieAccounts(payload))]
  await meld(payload, wie.filter((u) => u !== Number(user.id)), {
    titel: `🚫 Forfait: ${String(team?.name ?? 'een ploeg')} komt niet`,
    tekst: `${titel}, ${formatDateTimeBE(String(m.date))}. De wedstrijd gaat niet door. Reden: ${reden}.${moment === 'laat' ? ' Laat gemeld (na vrijdag 12u): bel ook de secretaris van het NSC.' : ''} Scheidsrechter: je hoeft niet te komen.`,
    url: `/match/${matchId}`,
  }).catch(() => 0)

  // Het boetevoorstel volgt meteen: de federatie ziet het op het bord zonder iets te moeten scannen.
  await boeteVoorstellen(payload).catch(() => 0)
  return { ok: true, uitslag, moment }
}

/**
 * Een vooraf gemeld forfait vervalt (item 34) — bij een verplaatsing van de wedstrijd. De wedstrijd
 * staat weer gepland, het blad zonder forfait, en de boetevoorstellen die uit dat forfait volgden
 * (nog niet opgelegd) worden geschrapt. Een forfait dat de scheidsrechter ter plaatse vaststelde, of
 * een blad dat al ingediend is, raken we niet aan. Geeft true als er iets verviel.
 */
export async function forfaitVervalt(payload: Payload, matchId: number, reden: string): Promise<boolean> {
  const sheet = (await payload.find({ collection: 'matchsheets', where: { match: { equals: matchId } }, depth: 0, limit: 1, overrideAccess: true })).docs[0]
  const ff = (sheet?.forfait ?? {}) as { uitslag?: string; gemeldOp?: string | null }
  if (!sheet || sheet.status === 'ingediend' || !ff.gemeldOp || !ff.uitslag || ff.uitslag === 'geen') return false
  await zetForfait(payload, matchId, sheet.id, 'geen', { gemeldOp: null, gemeldDoor: null, moment: null, reden: null, gemeldThuis: false, gemeldUit: false })
  const voorstellen = await payload.find({
    collection: 'boetes',
    where: { and: [{ match: { equals: matchId } }, { status: { equals: 'voorstel' } }, { sleutel: { like: 'forfait:' } }] },
    depth: 0,
    limit: 20,
    overrideAccess: true,
  })
  for (const b of voorstellen.docs) {
    await payload.update({ collection: 'boetes', id: b.id, data: { status: 'vernietigd', federatieOpmerking: `Forfait vervallen: ${reden}` }, overrideAccess: true })
  }
  return true
}
