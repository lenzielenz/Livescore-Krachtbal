// Referendum: speler, speelster en belofte van het jaar. Pure regels — geen DB.
//
// Wie in de hoogste reeks (standaard 1NAH voor de heren, 1NAD voor de dames) minstens
// `minWedstrijden` (standaard 5) wedstrijden speelde, mag stemmen én kan gekozen worden. Elke
// stemmer geeft 5, 4, 3, 2 en 1 punt aan vijf verschillende spelers van de eigen competitie —
// nooit aan zichzelf, nooit aan iemand van de eigen club. De punten worden opgeteld; de hoogste
// totaal is speler (heren) of speelster (dames) van het jaar. De belofte is de beste jonger dan
// `maxLeeftijdBelofte` (standaard 21) op de peildatum. Het reglement legt die leeftijd niet vast:
// de federatie stelt ze per ronde in.

export const PUNTEN = [5, 4, 3, 2, 1] as const
export const MIN_WEDSTRIJDEN = 5
export const MAX_LEEFTIJD_BELOFTE = 21

export type Competitie = 'heren' | 'dames'
export type Kandidaat = { id: number; naam: string; clubId: number | null; clubNaam: string; geboortedatum?: string | null; gespeeld: number }
export type StemRegel = { speler: number; punten: number }
export type Stem = { stemmer: number; regels: StemRegel[] }

export const PRIJZEN: Record<Competitie, { jaar: string; belofte: string }> = {
  heren: { jaar: 'Speler van het jaar', belofte: 'Belofte van het jaar (jongens)' },
  dames: { jaar: 'Speelster van het jaar', belofte: 'Belofte van het jaar (meisjes)' },
}

/** Mag deze speler meedoen (stemmen en gekozen worden)? */
export function stemgerechtigd(gespeeld: number, min: number = MIN_WEDSTRIJDEN): boolean {
  return gespeeld >= min
}

/** Leeftijd (in hele jaren) op de peildatum. */
export function leeftijdOp(geboortedatum: string | Date | null | undefined, peildatum: Date): number | null {
  if (!geboortedatum) return null
  const g = new Date(geboortedatum)
  if (Number.isNaN(g.getTime())) return null
  let jaren = peildatum.getUTCFullYear() - g.getUTCFullYear()
  const nogNiet =
    peildatum.getUTCMonth() < g.getUTCMonth() || (peildatum.getUTCMonth() === g.getUTCMonth() && peildatum.getUTCDate() < g.getUTCDate())
  if (nogNiet) jaren -= 1
  return jaren
}

export function isBelofte(k: Pick<Kandidaat, 'geboortedatum'>, peildatum: Date, maxLeeftijd: number = MAX_LEEFTIJD_BELOFTE): boolean {
  const l = leeftijdOp(k.geboortedatum, peildatum)
  return l != null && l < maxLeeftijd
}

/** Voor wie mag deze stemmer stemmen? Zelfde competitie, niet zichzelf, niet de eigen club. */
export function kiesbaarVoor(stemmer: { id: number; clubId: number | null }, kandidaten: Kandidaat[]): Kandidaat[] {
  return kandidaten.filter((k) => k.id !== stemmer.id && (stemmer.clubId == null || k.clubId !== stemmer.clubId))
}

/** Wat is er mis met deze stem? Lege lijst = geldig. */
export function stemFouten(regels: StemRegel[], stemmer: { id: number; clubId: number | null }, kandidaten: Kandidaat[]): string[] {
  const fouten: string[] = []
  const kiesbaar = new Map(kiesbaarVoor(stemmer, kandidaten).map((k) => [k.id, k]))
  const alle = new Map(kandidaten.map((k) => [k.id, k]))
  if (regels.length !== PUNTEN.length) fouten.push(`Kies precies ${PUNTEN.length} spelers.`)
  const punten = regels.map((r) => r.punten).sort((a, b) => b - a)
  if (punten.join() !== [...PUNTEN].slice(0, regels.length).join() || regels.length !== PUNTEN.length) {
    if (regels.length === PUNTEN.length) fouten.push('Geef elk van de punten 5, 4, 3, 2 en 1 precies één keer.')
  }
  if (new Set(regels.map((r) => r.speler)).size !== regels.length) fouten.push('Elke speler maar één keer.')
  for (const r of regels) {
    if (r.speler === stemmer.id) fouten.push('Je kan niet op jezelf stemmen.')
    else if (!kiesbaar.has(r.speler)) {
      const k = alle.get(r.speler)
      fouten.push(k ? `${k.naam} is van je eigen club.` : 'Een gekozen speler doet niet mee in jouw competitie.')
    }
  }
  return [...new Set(fouten)]
}

export type UitslagRij = Kandidaat & { totaal: number; perPunt: Record<number, number>; stemmen: number }

/**
 * Optellen. Bij gelijke stand: wie meer keer 5 punten kreeg, dan meer keer 4, enz.; daarna op naam
 * (zodat de volgorde stabiel is — de federatie beslist een echte ex aequo zelf).
 */
export function telUitslag(stemmen: Stem[], kandidaten: Kandidaat[]): UitslagRij[] {
  const rij = new Map<number, UitslagRij>(
    kandidaten.map((k) => [k.id, { ...k, totaal: 0, perPunt: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }, stemmen: 0 }]),
  )
  for (const s of stemmen) {
    for (const r of s.regels) {
      const k = rij.get(r.speler)
      if (!k || !PUNTEN.includes(r.punten as (typeof PUNTEN)[number])) continue
      k.totaal += r.punten
      k.perPunt[r.punten] += 1
      k.stemmen += 1
    }
  }
  return [...rij.values()]
    .filter((r) => r.totaal > 0)
    .sort((a, b) => b.totaal - a.totaal || PUNTEN.reduce((d, p) => d || b.perPunt[p] - a.perPunt[p], 0) || a.naam.localeCompare(b.naam))
}
