import type { Payload } from 'payload'

import { hasRole, isFederationLevel } from './access'
import { mayScoreMatch, refereeMayHandleMatch, type AuthedUser } from './api-auth'
import { magOpstellingVoor } from './club-functies'
import { accountsVanSpeler, clubStaf, meld, relId } from './meldingen'
import { liveClockSeconds } from './simple-match-engine'
import { wedstrijdSelectie, type Kant } from './wedstrijd-selectie'

// Een blessure tijdens (of rond) een wedstrijd doorgeven. Eén melding doet drie dingen:
//   1. een ongevalsaangifte (collections/Accidents.ts, formulier_14) klaar voor de verzekering,
//      gekoppeld aan wedstrijd, speler en club;
//   2. een regel bij "Opmerkingen / kwetsuren" op het wedstrijdblad (zolang het niet ingediend is),
//      zodat ze op de PDF staat;
//   3. meldingen aan de club van de speler, de speler zelf (en zijn ouders) en de federatie; de speler
//      vindt op zijn profiel de documenten om in te vullen en terug te sturen (lib/ongeval-dossier.ts).
// Doorgeven mag wie de wedstrijd van dichtbij volgt: de scheidsrechter, de aantekentafel, de coach
// of de staf van de ploeg van de speler, en de federatie.

export type BlessureInvoer = { side: Kant; playerId?: number | null; naam?: string | null; omschrijving: string }
/**
 * De omschrijving zonder het voorvoegsel "Wedstrijd (ploeg), <moment>: " dat in de aangifte staat.
 * Het moment bevat zelf een dubbele punt (klok "23:05"), dus knippen we na het bewaarde moment.
 */
export function zonderVoorvoegsel(omstandigheden: unknown, moment: unknown): string {
  const t = String(omstandigheden ?? '')
  const m = String(moment ?? '')
  if (m) {
    const i = t.indexOf(`${m}: `)
    if (t.startsWith('Wedstrijd') && i >= 0) return t.slice(i + m.length + 2)
  }
  return t.replace(/^Wedstrijd[^:]*:\s*/, '')
}

export type BlessureRij = { id: number; naam: string; kant: Kant | null; moment: string; omschrijving: string; tijdstip: string }

const pad = (n: number) => String(n).padStart(2, '0')
const klok = (s: number) => `${pad(Math.floor(Math.max(0, s) / 60))}:${pad(Math.floor(Math.max(0, s)) % 60)}`

type Wedstrijd = {
  id: number
  status?: string | null
  currentHalf?: number | null
  homeTeam?: unknown
  awayTeam?: unknown
  clockRunning?: boolean | null
  clockUpdatedAt?: string | null
  clockSeconds?: number | null
}

async function laadWedstrijd(payload: Payload, matchId: number): Promise<Wedstrijd | null> {
  return (await payload.findByID({ collection: 'matches', id: matchId, depth: 2, overrideAccess: true }).catch(() => null)) as Wedstrijd | null
}

const teamVan = (m: Wedstrijd, side: Kant) => {
  const t = side === 'home' ? m.homeTeam : m.awayTeam
  return t && typeof t === 'object' ? (t as { id: number; name?: string; club?: unknown; category?: string | null }) : null
}

/** Mag deze gebruiker een blessure doorgeven voor deze kant van deze wedstrijd? */
export async function magBlessureMelden(payload: Payload, user: AuthedUser | null, matchId: number, side: Kant): Promise<boolean> {
  if (!user) return false
  if (isFederationLevel(user)) return true
  if (hasRole(user, 'scheidsrechter') && (await refereeMayHandleMatch(payload, user, matchId))) return true
  const m = await laadWedstrijd(payload, matchId)
  if (!m) return false
  const team = teamVan(m, side)
  if (team && magOpstellingVoor(user, { id: team.id, club: team.club, category: team.category })) return true
  // De aantekentafel ziet het gebeuren — maar enkel tijdens of net na de wedstrijd.
  return m.status !== 'scheduled' && (await mayScoreMatch(payload, user, matchId))
}

/** Mag deze gebruiker de blessures van deze wedstrijd zien (namen, omschrijving)? */
export async function magBlessuresZien(payload: Payload, user: AuthedUser | null, matchId: number): Promise<boolean> {
  return (await magBlessureMelden(payload, user, matchId, 'home')) || (await magBlessureMelden(payload, user, matchId, 'away'))
}

/** "1e helft 12:30, stand 10–8" — het moment van de blessure, uit de wedstrijd zelf. */
async function momentVan(payload: Payload, m: Wedstrijd): Promise<string> {
  if (m.status === 'scheduled') return 'vóór de wedstrijd'
  const { buildMatchState } = await import('./match-engine')
  const st = await buildMatchState(payload, m.id).catch(() => null)
  const stand = st ? `stand ${st.score.home}–${st.score.away}` : ''
  if (m.status === 'finished') return `na de wedstrijd${stand ? `, ${stand}` : ''}`
  return `${m.currentHalf === 2 ? '2e' : '1e'} helft ${klok(liveClockSeconds(m))}${stand ? `, ${stand}` : ''}`
}

export async function blessureMelden(
  payload: Payload,
  user: AuthedUser,
  matchId: number,
  inv: BlessureInvoer,
): Promise<{ ok: true; id: number } | { ok: false; status: number; error: string }> {
  const omschrijving = inv.omschrijving.replace(/\s+/g, ' ').trim()
  if (!omschrijving) return { ok: false, status: 400, error: 'Omschrijf kort wat er gebeurde.' }
  if (omschrijving.length > 1000) return { ok: false, status: 400, error: 'Hou de omschrijving korter (max. 1000 tekens).' }
  if (!(await magBlessureMelden(payload, user, matchId, inv.side))) {
    return { ok: false, status: 403, error: 'Enkel de scheidsrechter, de aantekentafel, de coach of de club van deze ploeg geeft een blessure door.' }
  }
  const m = await laadWedstrijd(payload, matchId)
  if (!m) return { ok: false, status: 404, error: 'Wedstrijd niet gevonden.' }
  const team = teamVan(m, inv.side)

  // De speler: uit de selectie van die kant of uit de ploeg. Geen lid (bv. een toeschouwer of een
  // official)? Dan volstaat een naam.
  type Speler = { id: number; name?: string | null; birthDate?: string | null; team?: unknown }
  let speler: Speler | null = null
  if (inv.playerId != null) {
    speler = (await payload.findByID({ collection: 'players', id: Number(inv.playerId), depth: 0, overrideAccess: true }).catch(() => null)) as Speler | null
    const sel = (await wedstrijdSelectie(payload, matchId))[inv.side].map((r) => r.id)
    if (!speler || !(sel.includes(Number(speler.id)) || relId(speler.team) === team?.id)) {
      return { ok: false, status: 400, error: 'Die speler hoort niet bij deze ploeg.' }
    }
  }
  const naam = (speler?.name ?? inv.naam ?? '').replace(/\s+/g, ' ').trim()
  if (!naam) return { ok: false, status: 400, error: 'Kies de speler of geef een naam.' }

  const club = relId(team?.club)
  const thuis = teamVan(m, 'home')
  const thuisClub = thuis?.club && typeof thuis.club === 'object' ? (thuis.club as { name?: string; accommodatie?: string; plaats?: string }) : null
  const moment = await momentVan(payload, m)
  const ploeg = team?.name ? ` (${team.name})` : ''
  const doc = await payload.create({
    collection: 'accidents',
    data: {
      match: matchId,
      player: speler ? Number(speler.id) : null,
      club,
      gemeldDoor: Number(user.id),
      moment,
      slachtofferNaam: naam,
      slachtofferGeboortedatum: speler?.birthDate ?? null,
      ongevalPlaats: thuisClub?.accommodatie || thuisClub?.plaats || thuisClub?.name || null,
      ongevalDatum: new Date().toISOString(),
      omstandigheden: `Wedstrijd${ploeg}, ${moment}: ${omschrijving}`,
    },
    overrideAccess: true,
  })

  // Op het wedstrijdblad, zodat de kwetsuur op de ingediende PDF staat. Na indienen kan dat niet
  // meer (Item 37); de aangifte zelf bestaat dan wel.
  const sheet = (await payload.find({ collection: 'matchsheets', where: { match: { equals: matchId } }, depth: 0, limit: 1, overrideAccess: true })).docs[0]
  if (sheet && sheet.status !== 'ingediend') {
    const regel = `Kwetsuur ${moment}: ${naam}${ploeg} — ${omschrijving}`
    const vorige = String(sheet.opmerkingen ?? '').trim()
    await payload.update({
      collection: 'matchsheets',
      id: sheet.id,
      data: { opmerkingen: vorige ? `${vorige}\n${regel}` : regel },
      overrideAccess: true,
    })
  }

  // Meldingen. De speler zelf (en zijn ouders) krijgt de weg naar zijn documenten; de club en de
  // federatie zien de blessure in het overzicht (lib/ongeval-dossier.ts, /ongevallen).
  const federatie = await payload.find({ collection: 'users', where: { roles: { contains: 'federatie' } }, depth: 0, limit: 25, overrideAccess: true })
  const melder = Number(user.id)
  const spelerAccounts = speler ? await accountsVanSpeler(payload, Number(speler.id)) : []
  await meld(payload, spelerAccounts, {
    titel: `🚑 Blessure doorgegeven: ${naam}`,
    tekst: 'Laat de aangifte en het geneeskundig getuigschrift invullen en stuur ze via je profiel terug naar de federatie.',
    url: '/profiel#ongevallen',
  })
  const anderen = [...(await clubStaf(payload, club)), ...federatie.docs.map((u) => Number(u.id))].filter(
    (id) => id !== melder && !spelerAccounts.includes(id),
  )
  await meld(payload, anderen, { titel: `🚑 Blessure: ${naam}${ploeg}`, tekst: `${moment}. ${omschrijving}`, url: '/ongevallen' })
  return { ok: true, id: Number(doc.id) }
}

/** De blessures die bij deze wedstrijd doorgegeven werden. */
export async function blessuresVanWedstrijd(payload: Payload, matchId: number): Promise<BlessureRij[]> {
  const m = await laadWedstrijd(payload, matchId)
  const res = await payload.find({ collection: 'accidents', where: { match: { equals: matchId } }, sort: 'createdAt', depth: 0, limit: 50, overrideAccess: true })
  const clubThuis = m ? relId(teamVan(m, 'home')?.club) : null
  const clubUit = m ? relId(teamVan(m, 'away')?.club) : null
  return res.docs.map((a) => {
    const c = relId(a.club)
    return {
      id: Number(a.id),
      naam: String(a.slachtofferNaam ?? ''),
      kant: c != null && c === clubThuis ? 'home' : c != null && c === clubUit ? 'away' : null,
      moment: String(a.moment ?? ''),
      // Zonder het voorvoegsel "Wedstrijd (ploeg), moment:" — dat staat er al apart.
      omschrijving: zonderVoorvoegsel(a.omstandigheden, a.moment),
      tijdstip: String(a.createdAt),
    }
  })
}


/** De ploegen (met hun spelers op het blad) waarvoor deze gebruiker een blessure mag doorgeven. */
export async function blessureKanten(
  payload: Payload,
  user: AuthedUser | null,
  matchId: number,
): Promise<{ side: Kant; teamNaam: string; spelers: { id: number; naam: string; rugnummer: number | null }[] }[]> {
  const m = await laadWedstrijd(payload, matchId)
  if (!m || !user) return []
  const sel = await wedstrijdSelectie(payload, matchId)
  const uit: { side: Kant; teamNaam: string; spelers: { id: number; naam: string; rugnummer: number | null }[] }[] = []
  for (const side of ['home', 'away'] as const) {
    if (!(await magBlessureMelden(payload, user, matchId, side))) continue
    const team = teamVan(m, side)
    const rijen = sel[side]
    const spelers = rijen.length
      ? await payload.find({ collection: 'players', where: { id: { in: rijen.map((r) => r.id) } }, depth: 0, limit: 100, overrideAccess: true })
      : await payload.find({ collection: 'players', where: { team: { equals: team?.id ?? -1 } }, sort: 'shirtNumber', depth: 0, limit: 100, overrideAccess: true })
    const nr = new Map(rijen.map((r) => [r.id, r.rugnummer]))
    uit.push({
      side,
      teamNaam: String(team?.name ?? (side === 'home' ? 'Thuis' : 'Uit')),
      spelers: spelers.docs.map((p) => ({ id: Number(p.id), naam: String(p.name ?? ''), rugnummer: nr.get(Number(p.id)) ?? p.shirtNumber ?? null })),
    })
  }
  return uit
}
