import type { Payload } from 'payload'

import { competitionWhere } from './analyse-access'
import { dateStrBE } from './datetime'
import { deleteMatchesCascade } from './match-cleanup'

// Dubbele wedstrijden vinden en opruimen.
//
// Waarom dit bestaat. Een seizoensimport van 2400 wedstrijden duurt minuten. Wie in die tijd
// denkt dat er niets gebeurt en opnieuw op importeren drukt, zet een tweede import naast de
// eerste — en dan staat de hele kalender dubbel. Dat is precies wat er gebeurd is. De import
// zelf is daartegen beveiligd (zie `season-import-run`), maar dat helpt niet voor de kalender
// die er al dubbel in staat: die moet eruit kunnen zonder dat iemand 2400 rijen met de hand
// nakijkt.
//
// De sleutel is dezelfde als die van de import (`matchSleutel`): reeks + Belgische kalenderdag
// + de twee ploegen. Bewust niet het úúr — een import die het uur verkeerd las en een die het
// goed las, zijn nog altijd dezelfde wedstrijd, en dat is juist het paar dat je wil opruimen.

/** Moet letterlijk ingetypt worden vóór er opgeruimd mag worden — zelfde vangnet als de wipe. */
export const ONTDUBBEL_CONFIRM_PHRASE = 'VERWIJDER DUBBELS'

/** De sleutel waarop twee wedstrijden "dezelfde" zijn: reeks, dag, thuisploeg, uitploeg. */
export function duplicaatSleutel(
  reeks: string,
  dateIso: string,
  thuisId: number | string,
  uitId: number | string,
): string {
  const d = new Date(dateIso)
  const dag = Number.isNaN(d.getTime()) ? String(dateIso).slice(0, 10) : dateStrBE(d)
  return `${reeks}|${dag}|${thuisId}|${uitId}`
}

/** Het minimum dat een wedstrijd moet dragen om er een dubbel uit te kiezen. */
export type DubbelKandidaat = {
  id: number
  status?: string | null
  /** Is er al aan gewerkt? (worpen, wedstrijdblad, video …) — dan is dit niet de weg te gooien kopie. */
  heeftData?: boolean
}

/**
 * Welke van de dubbels blijft staan?
 *
 * De volgorde is niet willekeurig. Een wedstrijd waar al aan gewerkt is — gespeeld, aangetekend,
 * een video aan gekoppeld — mag NOOIT sneuvelen voor een verse lege kopie: dan gooi je de enige
 * echte data weg om een importfout op te ruimen. Pas als geen van de dubbels iets draagt, wint
 * de oudste (het laagste id): dat is degene waar de rest van de app het langst naar verwijst.
 */
export function kiesBehouder<T extends DubbelKandidaat>(groep: T[]): T | null {
  if (groep.length === 0) return null
  const gewicht = (m: T) => (m.heeftData ? 2 : m.status && m.status !== 'scheduled' ? 1 : 0)
  return groep.reduce((best, m) => {
    const g = gewicht(m)
    const b = gewicht(best)
    if (g !== b) return g > b ? m : best
    return m.id < best.id ? m : best
  })
}

/**
 * Alles wat weg mag, uit een lijst wedstrijden: per sleutel blijft er één over.
 *
 * Puur, zodat de keuze te controleren valt zonder database — en zodat een test kan vastleggen
 * dat een gespeelde wedstrijd nooit als "dubbel" verdwijnt.
 */
export function overtolligeIds<T extends DubbelKandidaat & { sleutel: string }>(matches: T[]): number[] {
  const groepen = new Map<string, T[]>()
  for (const m of matches) {
    const g = groepen.get(m.sleutel)
    if (g) g.push(m)
    else groepen.set(m.sleutel, [m])
  }
  const weg: number[] = []
  for (const groep of groepen.values()) {
    if (groep.length < 2) continue
    const houden = kiesBehouder(groep)
    for (const m of groep) if (m.id !== houden?.id) weg.push(m.id)
  }
  return weg.sort((a, b) => a - b)
}

export type OntdubbelResultaat = {
  /** Hoeveel competitiewedstrijden er bekeken zijn. */
  bekeken: number
  /** Hoeveel sleutels meer dan één wedstrijd hadden. */
  groepen: number
  /** Hoeveel wedstrijden er te veel staan (het aantal dat weg zou gaan). */
  overtollig: number
  /** Bij commit: hoeveel er écht verdwenen zijn (nageteld, niet geloofd). */
  verwijderd?: number
  /** Een handvol voorbeelden, zodat je vóór het verwijderen ziet wat er weggaat. */
  voorbeeld: { reeks: string; datum: string; thuis: string; uit: string; aantal: number }[]
}

const relId = (v: unknown): number | null =>
  v && typeof v === 'object' ? ((v as { id?: number }).id ?? null) : typeof v === 'number' ? v : null

const relNaam = (v: unknown): string =>
  v && typeof v === 'object' ? String((v as { name?: unknown }).name ?? '') : ''

/**
 * Zoek dubbele competitiewedstrijden en (bij `commit`) ruim ze op.
 *
 * Een wedstrijd verwijderen gaat via `deleteMatchesCascade`, dus mét alles wat eraan hangt en
 * mét natellen — een dubbel die blijft staan omdat de database hem weigert, mag niet als
 * "opgeruimd" gemeld worden.
 */
export async function ontdubbelWedstrijden(
  payload: Payload,
  opts: { commit: boolean },
): Promise<OntdubbelResultaat> {
  const docs: Record<string, unknown>[] = []
  let page = 1
  for (;;) {
    const res = await payload.find({
      collection: 'matches',
      where: competitionWhere(),
      depth: 1,
      limit: 500,
      page,
      sort: 'id',
      overrideAccess: true,
    })
    docs.push(...(res.docs as unknown as Record<string, unknown>[]))
    if (!res.hasNextPage) break
    page += 1
  }

  const rijen = docs.map((m) => {
    const thuisId = relId(m.homeTeam)
    const uitId = relId(m.awayTeam)
    const reeks = String(m.reeks ?? '')
    const datum = String(m.date ?? '')
    return {
      id: m.id as number,
      status: String(m.status ?? ''),
      // "Er is aan gewerkt": alles wat je kwijt zou zijn als deze kopie sneuvelt.
      heeftData: Boolean(m.videoUrl) || Boolean(m.finishedAt) || Boolean(m.matchsheetLocked),
      sleutel: thuisId != null && uitId != null && reeks && datum
        ? duplicaatSleutel(reeks, datum, thuisId, uitId)
        : `los-${m.id}`, // onvolledig → nooit als dubbel behandelen
      reeks,
      datum,
      thuis: relNaam(m.homeTeam),
      uit: relNaam(m.awayTeam),
    }
  })

  const perSleutel = new Map<string, typeof rijen>()
  for (const r of rijen) {
    const g = perSleutel.get(r.sleutel)
    if (g) g.push(r)
    else perSleutel.set(r.sleutel, [r])
  }
  const dubbeleGroepen = [...perSleutel.values()].filter((g) => g.length > 1)
  const weg = overtolligeIds(rijen)

  const resultaat: OntdubbelResultaat = {
    bekeken: rijen.length,
    groepen: dubbeleGroepen.length,
    overtollig: weg.length,
    voorbeeld: dubbeleGroepen.slice(0, 8).map((g) => ({
      reeks: g[0].reeks,
      datum: g[0].datum,
      thuis: g[0].thuis,
      uit: g[0].uit,
      aantal: g.length,
    })),
  }
  if (!opts.commit || weg.length === 0) return resultaat

  resultaat.verwijderd = await deleteMatchesCascade(payload, { id: { in: weg } })
  return resultaat
}
