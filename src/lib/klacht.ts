import type { Payload } from 'payload'

import { hasRole, isFederationLevel, userClubId } from './access'
import { clubStaf, federatieAccounts, meld } from './meldingen'

// Klacht over een ingediend wedstrijdblad. Een van beide clubs klaagt met een reden; de federatie
// beslist: het blad heropenen (terug "af te tekenen": verbeteren en opnieuw laten ondertekenen,
// daarna gaat het opnieuw naar iedereen) of de klacht afwijzen. Het ingediende blad blijft onwijzigbaar
// (Item 37) tot de federatie heropent; de PDF van daarvoor blijft bewaard in de klacht.

/** Context-vlag waarmee de statushook (collections/MatchSheets.ts) een heropening doorlaat. */
export const BLAD_HEROPENEN = 'bladHeropenen'

export const KLACHT_MIN_TEKENS = 15

const relId = (v: unknown): number | null => {
  const id = v && typeof v === 'object' ? (v as { id?: unknown }).id : v
  return id == null || !Number.isFinite(Number(id)) ? null : Number(id)
}

/** Puur: mag deze gebruiker over dit blad klagen? Null = ja, anders de reden waarom niet. */
export function klachtWeigering(
  user: unknown,
  w: { bladStatus: string; homeClub: number | null; awayClub: number | null; openKlachtVanClub: boolean },
): string | null {
  if (!user) return 'Log in om een klacht in te dienen.'
  const club = userClubId(user)
  if (!hasRole(user, 'club-beheerder', 'club-medewerker') || club == null) return 'Enkel de clubverantwoordelijken van een van beide ploegen dienen een klacht in.'
  if (![w.homeClub, w.awayClub].some((c) => c != null && String(c) === String(club))) return 'Je club speelde deze wedstrijd niet.'
  if (w.bladStatus !== 'ingediend') return 'Een klacht kan pas als het blad ingediend is.'
  if (w.openKlachtVanClub) return 'Je club heeft al een open klacht over dit blad.'
  return null
}

async function wedstrijdInfo(payload: Payload, matchId: number) {
  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 1, overrideAccess: true })
  const club = (t: unknown) => (t && typeof t === 'object' ? relId((t as { club?: unknown }).club) : null)
  const naam = (t: unknown) => (t && typeof t === 'object' ? String((t as { name?: unknown }).name ?? '') : '')
  const sheet = (await payload.find({ collection: 'matchsheets', where: { match: { equals: matchId } }, depth: 0, limit: 1, overrideAccess: true })).docs[0] ?? null
  return { match, sheet, homeClub: club(match.homeTeam), awayClub: club(match.awayTeam), titel: `${naam(match.homeTeam)} – ${naam(match.awayTeam)}` }
}

export async function klachtIndienen(payload: Payload, user: unknown, matchId: number, reden: string) {
  const r = reden.trim()
  if (r.length < KLACHT_MIN_TEKENS) throw new Error(`Beschrijf de klacht in minstens ${KLACHT_MIN_TEKENS} tekens: wat klopt er niet op het blad?`)
  const w = await wedstrijdInfo(payload, matchId)
  const club = Number(userClubId(user))
  const open = await payload.find({ collection: 'klachten', where: { and: [{ match: { equals: matchId } }, { club: { equals: club } }, { status: { equals: 'open' } }] }, limit: 1, depth: 0, overrideAccess: true })
  const weigering = klachtWeigering(user, { bladStatus: String(w.sheet?.status ?? ''), homeClub: w.homeClub, awayClub: w.awayClub, openKlachtVanClub: open.docs.length > 0 })
  if (weigering) throw new Error(weigering)
  const klacht = await payload.create({
    collection: 'klachten',
    data: { match: matchId, club, ingediendDoor: Number((user as { id?: unknown }).id), reden: r, status: 'open' },
    overrideAccess: true,
  })
  const andere = club === w.homeClub ? w.awayClub : w.homeClub
  await meld(payload, [...(await federatieAccounts(payload)), ...(await clubStaf(payload, andere))], {
    titel: `⚖️ Klacht over het wedstrijdblad ${w.titel}`,
    tekst: r.length > 140 ? `${r.slice(0, 137)}…` : r,
    url: '/beheer/klachten',
  }).catch(() => 0)
  return klacht
}

export async function klachtBehandelen(payload: Payload, user: unknown, klachtId: number, actie: 'heropenen' | 'afwijzen', toelichting: string) {
  if (!isFederationLevel(user)) throw new Error('Enkel de federatie beslist over een klacht.')
  const klacht = await payload.findByID({ collection: 'klachten', id: klachtId, depth: 0, overrideAccess: true })
  if (klacht.status !== 'open') throw new Error('Deze klacht is al behandeld.')
  const t = toelichting.trim()
  if (actie === 'afwijzen' && t.length < 5) throw new Error('Geef kort mee waarom de klacht afgewezen wordt.')
  const matchId = relId(klacht.match)!
  const w = await wedstrijdInfo(payload, matchId)
  const nu = new Date().toISOString()
  let oudePdf: number | null = null

  if (actie === 'heropenen') {
    if (!w.sheet || w.sheet.status !== 'ingediend') throw new Error('Het blad is niet (meer) ingediend.')
    oudePdf = relId(w.sheet.pdf)
    const leeg = { naam: null, handtekening: null, akkoord: false, tijdstip: null }
    await payload.update({
      collection: 'matchsheets',
      id: w.sheet.id,
      data: {
        status: 'af_te_tekenen',
        pdf: null,
        kapiteinThuis: leeg,
        kapiteinUit: leeg,
        scheidsrechter: leeg,
        overrideLog: [
          ...((w.sheet.overrideLog as unknown[]) ?? []),
          { wie: Number((user as { id?: unknown }).id), wanneer: nu, wat: `Heropend na klacht #${klachtId}${t ? `: ${t}` : ''}` },
        ],
      } as never,
      overrideAccess: true,
      context: { [BLAD_HEROPENEN]: true },
    })
  }
  await payload.update({
    collection: 'klachten',
    id: klachtId,
    data: { status: actie === 'heropenen' ? 'heropend' : 'afgewezen', beslissing: t || null, behandeldDoor: Number((user as { id?: unknown }).id), behandeldOp: nu, ...(oudePdf ? { pdfVoorHeropenen: oudePdf } : {}) },
    overrideAccess: true,
  })
  const iedereen = [...(await clubStaf(payload, w.homeClub)), ...(await clubStaf(payload, w.awayClub))]
  await meld(payload, iedereen, {
    titel: actie === 'heropenen' ? `↺ Wedstrijdblad heropend: ${w.titel}` : `⚖️ Klacht afgewezen: ${w.titel}`,
    tekst:
      actie === 'heropenen'
        ? `De federatie heropende het blad na een klacht${t ? ` (${t})` : ''}. Het moet opnieuw ondertekend worden door beide kapiteins en de scheidsrechter.`
        : `De federatie wees de klacht af: ${t}. Het ingediende blad blijft gelden.`,
    url: `/aftekenen/${matchId}`,
  }).catch(() => 0)
  return { matchId, actie }
}
