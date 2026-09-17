import type { Payload } from 'payload'

import { competitionWhere } from './analyse-access'
import { isPlayed, norm, type RawResult } from './results-import'
import { buildFixedSimpleScore, readSimpleScore } from './simple-score'

// Officiële uitslagen op onze kalender toepassen.
//
// Het gevaarlijke aan een AUTOMATISCHE import is dat ze wedstrijden overschrijft die we zelf
// registreerden. Twee redenen om dat nooit te doen:
//  1. `simpleScore` wordt in de match-state OPGETELD bij de score uit de worpen. Een geïmporteerde
//     eindstand op een wedstrijd die met het veldschema aangetekend werd, verdubbelt dus de stand.
//  2. Het wedstrijdblad is het officiële document. Wat daar afgetekend is, gaat vóór een
//     webpagina.
//
// Daarom: enkel wedstrijden aanvullen die bij ons nog géén eigen registratie hebben. De rest wordt
// gerapporteerd, niet stilzwijgend overgeslagen — zo zie je meteen wanneer twee bronnen uiteenlopen.

export interface UitslagRapport {
  /** Rijen met een echte uitslag (vrije weekends en niet-gespeelde eruit). */
  gespeeld: number
  /** Rijen die we aan een wedstrijd in onze kalender konden koppelen. */
  gekoppeld: number
  /** Wedstrijden waarvan de uitslag (zou worden) weggeschreven. */
  bijgewerkt: number
  /** Stond hier al met exact dezelfde uitslag. */
  ongewijzigd: number
  /** Overgeslagen omdat wij ze zelf aantekenden (worpen of ingediend wedstrijdblad). */
  zelfAangetekend: string[]
  /** Onze stand verschilt van die van de federatie — vraagt een menselijke blik. */
  conflicten: string[]
  /** Niet teruggevonden in onze kalender. */
  onbekend: string[]
  /** Reekscodes die we niet kennen. */
  reeksOnbekend: string[]
  voorbeelden: string[]
  fouten: string[]
}

const rel = (v: unknown): number | null =>
  v && typeof v === 'object' ? ((v as { id?: number }).id ?? null) : typeof v === 'number' ? v : null

const leeg = (): UitslagRapport => ({
  gespeeld: 0,
  gekoppeld: 0,
  bijgewerkt: 0,
  ongewijzigd: 0,
  zelfAangetekend: [],
  conflicten: [],
  onbekend: [],
  reeksOnbekend: [],
  voorbeelden: [],
  fouten: [],
})

/** Hoeveel dagen een wedstrijd verschoven mag zijn en tóch dezelfde wedstrijd is. */
const DAG_MARGE = 7
const DAG_MS = 24 * 60 * 60 * 1000

/**
 * Past de gelezen uitslagen toe. Zonder `commit` verandert er niets — dan is dit een voorbeschouwing
 * die exact hetzelfde rapport oplevert als de echte uitvoering.
 */
export async function pasUitslagenToe(
  payload: Payload,
  rijen: RawResult[],
  opties: { commit?: boolean } = {},
): Promise<UitslagRapport> {
  const commit = opties.commit === true
  const rapport = leeg()
  const gespeeld = rijen.filter(isPlayed)
  rapport.gespeeld = gespeeld.length
  if (gespeeld.length === 0) return rapport

  // Ploegen per (naam, reeks). We maken hier bewust géén nieuwe ploegen aan: de kalender staat al
  // in het platform, en een tikfout in een naam mag geen spookploeg opleveren. Wat niet matcht,
  // komt in het rapport.
  const teamsRes = await payload
    .find({ collection: 'teams', where: competitionWhere(), depth: 0, limit: 5000, overrideAccess: true })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const teamsPerNaam = new Map<string, { id: number; reeks: string }[]>()
  for (const t of teamsRes.docs) {
    const key = norm(String((t as { name?: unknown }).name ?? ''))
    if (!key) continue
    const arr = teamsPerNaam.get(key) ?? []
    arr.push({ id: (t as { id: number }).id, reeks: String((t as { reeks?: unknown }).reeks ?? '') })
    teamsPerNaam.set(key, arr)
  }
  const zoekPloeg = (naam: string, reeks: string): number | null => {
    const lijst = teamsPerNaam.get(norm(naam)) ?? []
    const exact = lijst.find((x) => x.reeks === reeks)
    if (exact) return exact.id
    // Zonder reeks-treffer enkel accepteren als de naam over het hele platform uniek is.
    return lijst.length === 1 ? lijst[0].id : null
  }

  // Onze wedstrijden van de betrokken reeksen, geïndexeerd op ploegenpaar.
  const reeksen = [...new Set(gespeeld.map((r) => r.reeks).filter((x): x is string => !!x))]
  const matchRes = reeksen.length
    ? await payload
        .find({ collection: 'matches', where: { reeks: { in: reeksen } }, depth: 0, limit: 8000, overrideAccess: true })
        .catch(() => ({ docs: [] as Record<string, unknown>[] }))
    : { docs: [] as Record<string, unknown>[] }
  type Wedstrijd = { id: number; date: string; status: string; simpleScore: unknown }
  const perPaar = new Map<string, Wedstrijd[]>()
  for (const m of matchRes.docs) {
    if ((m as { analyseOnly?: boolean }).analyseOnly) continue
    const hid = rel((m as { homeTeam?: unknown }).homeTeam)
    const aid = rel((m as { awayTeam?: unknown }).awayTeam)
    if (hid == null || aid == null) continue
    const key = `${String((m as { reeks?: unknown }).reeks ?? '')}|${hid}|${aid}`
    const arr = perPaar.get(key) ?? []
    arr.push({
      id: (m as { id: number }).id,
      date: String((m as { date?: unknown }).date ?? ''),
      status: String((m as { status?: unknown }).status ?? ''),
      simpleScore: (m as { simpleScore?: unknown }).simpleScore,
    })
    perPaar.set(key, arr)
  }

  // Welke van onze wedstrijden hebben een EIGEN registratie? Die blijven onaangeroerd.
  const alleIds = [...perPaar.values()].flat().map((m) => m.id)
  const metWorpen = new Set<number>()
  const metBlad = new Set<number>()
  if (alleIds.length) {
    const worpen = await payload
      .find({ collection: 'throws', where: { match: { in: alleIds } }, depth: 0, pagination: false, select: { match: true }, overrideAccess: true })
      .catch(() => ({ docs: [] as Record<string, unknown>[] }))
    for (const t of worpen.docs) {
      const mid = rel((t as { match?: unknown }).match)
      if (mid != null) metWorpen.add(mid)
    }
    const bladen = await payload
      .find({ collection: 'matchsheets', where: { match: { in: alleIds } }, depth: 0, limit: 8000, overrideAccess: true })
      .catch(() => ({ docs: [] as Record<string, unknown>[] }))
    for (const s of bladen.docs) {
      if (String((s as { status?: unknown }).status ?? 'concept') === 'concept') continue
      const mid = rel((s as { match?: unknown }).match)
      if (mid != null) metBlad.add(mid)
    }
  }

  for (const r of gespeeld) {
    if (!r.reeks) {
      if (!rapport.reeksOnbekend.includes(r.reeksCode)) rapport.reeksOnbekend.push(r.reeksCode)
      continue
    }
    const omschrijving = `${r.date || '?'} · ${r.home} ${r.homeScore}–${r.awayScore} ${r.away} (${r.reeks})`
    const hid = zoekPloeg(r.home, r.reeks)
    const aid = zoekPloeg(r.away, r.reeks)
    if (hid == null || aid == null) {
      if (rapport.onbekend.length < 60) rapport.onbekend.push(omschrijving)
      continue
    }

    // Zelfde ploegen in dezelfde reeks: eerst exact op datum, anders de dichtstbijzijnde binnen
    // een week (een verplaatste wedstrijd houdt bij de federatie soms de oude datum).
    const kandidaten = perPaar.get(`${r.reeks}|${hid}|${aid}`) ?? []
    let wedstrijd: Wedstrijd | undefined = kandidaten.find((m) => m.date.slice(0, 10) === r.date)
    if (!wedstrijd && r.date) {
      const doel = new Date(`${r.date}T12:00:00`).getTime()
      const dichtbij = kandidaten
        .map((m) => ({ m, afstand: Math.abs(new Date(m.date).getTime() - doel) }))
        .filter((x) => Number.isFinite(x.afstand) && x.afstand <= DAG_MARGE * DAG_MS)
        .sort((a, b) => a.afstand - b.afstand)
      wedstrijd = dichtbij[0]?.m
    }
    if (!wedstrijd && kandidaten.length === 1) wedstrijd = kandidaten[0]
    if (!wedstrijd) {
      if (rapport.onbekend.length < 60) rapport.onbekend.push(omschrijving)
      continue
    }
    rapport.gekoppeld++

    if (metWorpen.has(wedstrijd.id) || metBlad.has(wedstrijd.id)) {
      if (rapport.zelfAangetekend.length < 60) rapport.zelfAangetekend.push(omschrijving)
      continue
    }

    // Staat er al een (eerder geïmporteerde) uitslag? Vergelijken i.p.v. blind overschrijven.
    const huidig = readSimpleScore({ simpleScore: wedstrijd.simpleScore })
    const eigenThuis = huidig.goals.filter((g) => g.side === 'home').reduce((n, g) => n + g.points, 0)
    const eigenUit = huidig.goals.filter((g) => g.side === 'away').reduce((n, g) => n + g.points, 0)
    const heeftScore = huidig.goals.length > 0
    if (heeftScore && eigenThuis === r.homeScore && eigenUit === r.awayScore && wedstrijd.status === 'finished') {
      rapport.ongewijzigd++
      continue
    }
    if (heeftScore && (eigenThuis !== r.homeScore || eigenUit !== r.awayScore)) {
      // Onze stand wijkt af. De federatie is de officiële bron, dus we nemen ze over — maar we
      // melden het, want dit is precies het geval dat iemand moet zien.
      if (rapport.conflicten.length < 60) {
        rapport.conflicten.push(`${omschrijving} — bij ons ${eigenThuis}–${eigenUit}`)
      }
    }

    rapport.bijgewerkt++
    if (rapport.voorbeelden.length < 10) rapport.voorbeelden.push(omschrijving)
    if (!commit) continue
    try {
      await payload.update({
        collection: 'matches',
        id: wedstrijd.id,
        data: {
          status: 'finished',
          simpleScore: buildFixedSimpleScore(r.homeScore, r.awayScore) as unknown as Record<string, unknown>,
          autoImported: true,
        },
        overrideAccess: true,
      })
    } catch (e) {
      if (rapport.fouten.length < 10) rapport.fouten.push(`${omschrijving}: ${(e as Error).message}`)
      rapport.bijgewerkt--
    }
  }

  return rapport
}
