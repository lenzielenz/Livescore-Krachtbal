import type { Payload, Where } from 'payload'

import { competitionWhere } from './analyse-access'
import { countMatches, deleteMatchesCascade } from './match-cleanup'
import { reeksCategorie, type Reeks } from './reeksen'
import {
  matchSleutel,
  naamSleutel,
  planSeason,
  uurWaarschuwing,
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

// "Vervang volledig speelplan": elke competitiewedstrijd (elk seizoen, elke reeks) verdwijnt vóór
// de nieuwe kalender ingeladen wordt — inclusief afgesloten historische wedstrijden. Bewust NIET:
// analyse-opnames (privé scoutingdata van een analist, geen competitiewedstrijd) en demo's
// (vluchtig, ruimt zichzelf al op). Clubs/ploegen blijven altijd staan — enkel wedstrijden wissen.
const WIPE_WHERE: Where = { and: [competitionWhere(), { isDemo: { not_equals: true } }] }

/**
 * Bepaal wat er moet gebeuren en (optioneel) voer het uit.
 * `commit: false` schrijft niets — dat is de proefronde die de gebruiker eerst te zien krijgt.
 * `wipe: true` verwijdert vóór het importeren ALLE bestaande competitiewedstrijden (zie
 * WIPE_WHERE hierboven) — onomkeerbaar, enkel voor een volledige seizoensvervanging.
 */
export async function runSeasonImport(
  payload: Payload,
  rows: string[][],
  opts: { commit: boolean; wipe?: boolean },
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
    // Het aanvangsuur is geen rijfout maar hoort wel gezegd te worden: een speelkalender waarin
    // élke wedstrijd op 00:00 belandt, ziet er verder geslaagd uit.
    uren: plan.uren,
    uurWaarschuwing: uurWaarschuwing(plan.uren),
  }
  if (plan.matches.length === 0) return samenvatting

  // ── Vervang volledig speelplan ──
  // Proefronde: enkel tellen. Commit: eerst effectief verwijderen, vóórdat we hieronder bepalen
  // welke wedstrijden "nieuw" zijn — na een wipe is dat altijd het complete bestand.
  if (opts.wipe) {
    if (opts.commit) samenvatting.verwijderd = await deleteMatchesCascade(payload, WIPE_WHERE)
    else samenvatting.teVerwijderen = await countMatches(payload, WIPE_WHERE)
  }

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
  // Bij een volledige vervanging slaan we dit bewust over: na de wipe hierboven bestaat er
  // sowieso niets meer, dus telt straks élke wedstrijd uit het bestand als nieuw.
  // Per bestaande wedstrijd ook onthouden wélke het is en hoe laat ze nu staat: dan kan een
  // tweede import een verkeerd ingelezen aanvangsuur rechtzetten in plaats van de rij over te
  // slaan. Zonder dat blijft een kalender die ooit op 00:00 binnenkwam, voorgoed op 00:00 staan —
  // de dedupe-sleutel kijkt bewust enkel naar de dág, dus opnieuw importeren verandert niets.
  const bestaandeSleutels = new Map<string, { id: number; date: string; status: string }>()
  if (!opts.wipe) {
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
    for (const m of bestaandeRes.docs) {
      const reeks = String((m as { reeks?: unknown }).reeks ?? '')
      const datum = String((m as { date?: unknown }).date ?? '')
      const thuis = naamVanTeam((m as { homeTeam?: unknown }).homeTeam)
      const uit = naamVanTeam((m as { awayTeam?: unknown }).awayTeam)
      if (!reeks || !datum || !thuis || !uit) continue
      bestaandeSleutels.set(matchSleutel(reeks, datum, thuis, uit), {
        id: m.id as number,
        date: datum,
        status: String((m as { status?: unknown }).status ?? ''),
      })
    }
  }

  const teDoen = plan.matches.filter((m) => !bestaandeSleutels.has(m.sleutel))
  samenvatting.nieuweWedstrijden = teDoen.length
  samenvatting.bestaandeWedstrijden = plan.matches.length - teDoen.length

  // Bestaande wedstrijden waarvan het aanvangsuur niet klopt met het bestand. Enkel wedstrijden
  // die nog moeten gespeeld worden: het uur van een gespeelde wedstrijd is geschiedenis en hoort
  // niet achteraf verschoven te worden door een importbestand.
  const teCorrigeren = plan.matches
    .map((m) => ({ m, bestaand: bestaandeSleutels.get(m.sleutel) }))
    .filter(
      (p): p is { m: (typeof plan.matches)[number]; bestaand: { id: number; date: string; status: string } } =>
        p.bestaand != null
        && p.bestaand.status === 'scheduled'
        && new Date(p.bestaand.date).getTime() !== new Date(p.m.dateIso).getTime(),
    )
  samenvatting.teCorrigerenUren = teCorrigeren.length

  if (!opts.commit) return samenvatting

  // Eerst de rechtzettingen: dit is de weg terug voor een kalender die ooit met een onleesbaar
  // aanvangsuur is ingeladen. Hetzelfde bestand nog eens doorsturen zet de uren goed.
  let bijgewerkt = 0
  for (const { m, bestaand } of teCorrigeren) {
    try {
      await payload.update({
        collection: 'matches',
        id: bestaand.id,
        data: { date: m.dateIso },
        overrideAccess: true,
      })
      bijgewerkt += 1
    } catch (e) {
      plan.issues.push({
        rij: m.rij,
        reden: `Aanvangsuur bijwerken mislukte: ${(e as Error).message}`,
        ruw: `${m.thuis} – ${m.uit}`,
      })
    }
  }
  samenvatting.bijgewerkteUren = bijgewerkt

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
