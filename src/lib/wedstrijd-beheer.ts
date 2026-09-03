import { brusselsParts, brusselsWallUtc } from './datetime'
import { seasonFromDate } from './seasons'

// Een wedstrijd rechtzetten: het tijdstip, en de naam/club van een ploeg.
//
// Hier staat enkel het rekenwerk, zonder database, zodat het te testen valt. Het rekenwerk dat
// telt is de tijdzone: de datum staat als UTC-instant in de database, maar een beheerder typt
// Belgische kloktijd. "20:30" op 3 september is 18:30 UTC (zomertijd) en op 3 december 19:30 UTC.
// Wie dat door elkaar haalt, verschuift elke wedstrijd een of twee uur — precies de fout die je
// pas merkt wanneer de kantine leeg is.

export type Invoervelden = { datum: string; uur: string }

/** Het opgeslagen instant als datum + uur zoals een Belg ze intypt (voor het invulformulier). */
export function naarInvoervelden(iso: unknown): Invoervelden | null {
  if (typeof iso !== 'string' && !(iso instanceof Date)) return null
  const d = iso instanceof Date ? iso : new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const p = brusselsParts(d)
  const pad = (n: number) => String(n).padStart(2, '0')
  return { datum: `${p.year}-${pad(p.month)}-${pad(p.day)}`, uur: `${pad(p.hour)}:${pad(p.minute)}` }
}

const DATUM = /^(\d{4})-(\d{2})-(\d{2})$/
const UUR = /^(\d{1,2}):(\d{2})$/

/**
 * Datum ("2026-09-12") + uur ("17:30") in Belgische kloktijd → het UTC-instant om op te slaan.
 *
 * Geeft een leesbare fout terug in plaats van te gooien: dit komt uit een formulier, en een
 * beheerder die zich vertypt hoort te lezen wát er scheelt.
 */
export function naarIso(datum: unknown, uur: unknown): { iso: string } | { fout: string } {
  const d = String(datum ?? '').trim()
  const u = String(uur ?? '').trim()
  const md = DATUM.exec(d)
  if (!md) return { fout: 'Geef een datum als jjjj-mm-dd.' }
  const mu = UUR.exec(u)
  if (!mu) return { fout: 'Geef een uur als uu:mm.' }
  const [jaar, maand, dag] = [Number(md[1]), Number(md[2]), Number(md[3])]
  const [uren, minuten] = [Number(mu[1]), Number(mu[2])]
  if (maand < 1 || maand > 12 || dag < 1 || dag > 31) return { fout: 'Die datum bestaat niet.' }
  if (uren > 23 || minuten > 59) return { fout: 'Dat uur bestaat niet.' }
  const at = brusselsWallUtc(jaar, maand, dag, uren, minuten)
  if (Number.isNaN(at.getTime())) return { fout: 'Die datum bestaat niet.' }
  // Terugrekenen: 31 februari wordt door Date stilzwijgend 3 maart. Zo'n typfout hoort een fout te
  // zijn, geen wedstrijd op een andere dag.
  const terug = brusselsParts(at)
  if (terug.year !== jaar || terug.month !== maand || terug.day !== dag) return { fout: 'Die datum bestaat niet.' }
  return { iso: at.toISOString() }
}

/**
 * Het seizoen na een datumcorrectie.
 *
 * Het seizoen volgt normaal uit de datum (juli–juni), maar het is ook met de hand in te vullen.
 * Daarom verzetten we het alleen wanneer het nog gelijkloopt met de óúde datum: dan is het
 * automatisch afgeleid en hoort het mee te schuiven. Staat er iets anders, dan heeft iemand het
 * bewust gezet en blijft het staan. Null = niets wijzigen.
 */
export function nieuwSeizoen(oudeIso: unknown, nieuweIso: string, huidig: unknown): string | null {
  const nieuw = seasonFromDate(new Date(nieuweIso))
  const nu = typeof huidig === 'string' ? huidig.trim() : ''
  if (!nu) return nieuw
  const oud = typeof oudeIso === 'string' || oudeIso instanceof Date ? new Date(oudeIso as string) : null
  if (!oud || Number.isNaN(oud.getTime())) return null
  if (seasonFromDate(oud) !== nu) return null // met de hand gezet — afblijven
  return nieuw === nu ? null : nieuw
}
