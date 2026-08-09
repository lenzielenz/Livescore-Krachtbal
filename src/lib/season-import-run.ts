import type { Payload } from 'payload'

import { competitionWhere } from './analyse-access'
import { reeksCategorie, type Reeks } from './reeksen'
import {
  matchSleutel,
  naamSleutel,
  planSeason,
  type ImportSamenvatting,
  type SeasonPlan,
} from './season-import'

// Voert een seizoensplan uit tegen de database. Twee standen:
//   - proef  : niets schrijven, enkel vertellen wat er zou gebeuren
//   - echt   : ontbrekende clubs en ploegen aanmaken, daarna de wedstrijden
//
// Opnieuw importeren is veilig: een wedstrijd die al bestaat (zelfde reeks, dag en ploegen) wordt
// overgeslagen. Zo kan de federatie hetzelfde bestand nog eens doorsturen met een paar correcties
// erin zonder dat de kalender verdubbelt.
//
// De vorm van het antwoord (ImportSamenvatting) staat bewust in season-import.ts: dit bestand
// importeert Payload, en dat hoort niet in de bundel van een client-component terecht te komen.

export type { ImportSamenvatting }

/**
 * Bepaal wat er moet gebeuren en (optioneel) voer het uit.
 * `commit: false` schrijft niets — dat is de proefronde die de gebruiker eerst te zien krijgt.
 */
export async function runSeasonImport(
  payload: Payload,
  rows: string[][],
  opts: { commit: boolean },
): Promise<ImportSamenvatting> {
  const plan: SeasonPlan = planSeason(rows)

  const samenvatting: ImportSamenvatting = {
    gelezen: { rijen: rows.length, wedstrijden: plan.matches.length },
    nieuweClubs: [],
    nieuwePloegen: [],
    nieuweWedstrijden: 0,
    bestaandeWedstrijden: 0,
    issues: plan.issues,
    voorbeeld: plan.matches.slice(0, 8).map((m) => ({
      datum: m.dateIso,
      reeks: m.reeks,
      thuis: m.thuis,
      uit: m.uit,
    })),
    header: plan.header,
  }
  if (plan.matches.length === 0) return samenvatting

  // ── Bestaande clubs en ploegen inlezen ──
  const clubsRes = await payload
    .find({ collection: 'clubs', where: competitionWhere(), depth: 0, limit: 1000, overrideAccess: true })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const clubIdPerNaam = new Map<string, number>()
  for (const c of clubsRes.docs) clubIdPerNaam.set(naamSleutel(String((c as { name?: unknown }).name ?? '')), c.id as number)

  const teamsRes = await payload
    .find({ collection: 'teams', where: competitionWhere(), depth: 0, limit: 5000, overrideAccess: true })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const teamIdPerSleutel = new Map<string, number>()
  for (const t of teamsRes.docs) {
    const naam = String((t as { name?: unknown }).name ?? '')
    const reeks = String((t as { reeks?: unknown }).reeks ?? '')
    teamIdPerSleutel.set(`${naamSleutel(naam)}|${reeks}`, t.id as number)
  }

  samenvatting.nieuweClubs = plan.clubs.filter((c) => !clubIdPerNaam.has(naamSleutel(c)))
  samenvatting.nieuwePloegen = plan.teams.filter((t) => !teamIdPerSleutel.has(`${naamSleutel(t.naam)}|${t.reeks}`))

  // ── Bestaande wedstrijden van de betrokken seizoenen inlezen ──
  const seizoenen = [...new Set(plan.matches.map((m) => m.seizoen))]
  const bestaandeRes = await payload
    .find({
      collection: 'matches',
      where: { and: [{ seizoen: { in: seizoenen } }, competitionWhere()] },
      depth: 1,
      limit: 5000,
      overrideAccess: true,
    })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))

  const naamVanTeam = (v: unknown): string =>
    v && typeof v === 'object' ? String((v as { name?: unknown }).name ?? '') : ''
  const bestaandeSleutels = new Set<string>()
  for (const m of bestaandeRes.docs) {
    const reeks = String((m as { reeks?: unknown }).reeks ?? '')
    const datum = String((m as { date?: unknown }).date ?? '')
    const thuis = naamVanTeam((m as { homeTeam?: unknown }).homeTeam)
    const uit = naamVanTeam((m as { awayTeam?: unknown }).awayTeam)
    if (!reeks || !datum || !thuis || !uit) continue
    bestaandeSleutels.add(matchSleutel(reeks, datum, thuis, uit))
  }

  const teDoen = plan.matches.filter((m) => !bestaandeSleutels.has(m.sleutel))
  samenvatting.nieuweWedstrijden = teDoen.length
  samenvatting.bestaandeWedstrijden = plan.matches.length - teDoen.length

  if (!opts.commit) return samenvatting

  // ── Uitvoeren ──
  const aangemaakt = { clubs: 0, ploegen: 0, wedstrijden: 0 }

  for (const clubNaam of samenvatting.nieuweClubs) {
    try {
      const doc = await payload.create({ collection: 'clubs', data: { name: clubNaam }, overrideAccess: true })
      clubIdPerNaam.set(naamSleutel(clubNaam), doc.id as number)
      aangemaakt.clubs += 1
    } catch (e) {
      plan.issues.push({ rij: 0, reden: `Club "${clubNaam}" aanmaken mislukte: ${(e as Error).message}`, ruw: clubNaam })
    }
  }

  for (const ploeg of samenvatting.nieuwePloegen) {
    const clubId = clubIdPerNaam.get(naamSleutel(ploeg.club))
    if (clubId == null) {
      plan.issues.push({ rij: 0, reden: `Ploeg "${ploeg.naam}" overgeslagen: club "${ploeg.club}" ontbreekt.`, ruw: ploeg.naam })
      continue
    }
    try {
      const doc = await payload.create({
        collection: 'teams',
        data: { name: ploeg.naam, club: clubId, reeks: ploeg.reeks, category: reeksCategorie(ploeg.reeks) },
        overrideAccess: true,
      })
      teamIdPerSleutel.set(`${naamSleutel(ploeg.naam)}|${ploeg.reeks}`, doc.id as number)
      aangemaakt.ploegen += 1
    } catch (e) {
      plan.issues.push({ rij: 0, reden: `Ploeg "${ploeg.naam}" aanmaken mislukte: ${(e as Error).message}`, ruw: ploeg.naam })
    }
  }

  for (const m of teDoen) {
    const thuisId = teamIdPerSleutel.get(`${naamSleutel(m.thuis)}|${m.reeks}`)
    const uitId = teamIdPerSleutel.get(`${naamSleutel(m.uit)}|${m.reeks}`)
    if (thuisId == null || uitId == null) {
      plan.issues.push({
        rij: m.rij,
        reden: `Ploeg niet gevonden: ${thuisId == null ? m.thuis : m.uit}`,
        ruw: `${m.thuis} – ${m.uit}`,
      })
      continue
    }
    try {
      await payload.create({
        collection: 'matches',
        data: {
          reeks: m.reeks,
          category: m.category,
          homeTeam: thuisId,
          awayTeam: uitId,
          date: m.dateIso,
          status: 'scheduled',
          goalAreaDepth: 10,
          seizoen: m.seizoen,
        },
        overrideAccess: true,
      })
      aangemaakt.wedstrijden += 1
    } catch (e) {
      plan.issues.push({ rij: m.rij, reden: `Wedstrijd aanmaken mislukte: ${(e as Error).message}`, ruw: `${m.thuis} – ${m.uit}` })
    }
  }

  samenvatting.aangemaakt = aangemaakt
  samenvatting.issues = plan.issues
  return samenvatting
}
