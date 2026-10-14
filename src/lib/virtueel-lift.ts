// De lift in het virtuele stadion: van de kelder (-1) via het gelijkvloers (0) en de loges (1)
// tot op het dak (2, de ringwandeling). Puur: de 3D-kant geeft per beeld door waar de speler
// staat en welk verdiep hij in de kooi koos; deze module beslist wat de deuren en de kooi doen.
// Zoals een echte lift:
//  • kom je bij de deur en staat de kooi er, dan gaan de deuren open; staat ze op een ander
//    verdiep, dan roep je ze op (ze rijdt leeg naar je toe en gaat dan open);
//  • in de kooi kies je je verdiep: de deuren sluiten, de kooi rijdt (de nummers boven de deur
//    wisselen mee) en op het gekozen verdiep gaan de deuren open;
//  • zonder keuze blijft de kooi gewoon open staan met jou erin.

/** De verdiepen die de lift bedient, van onder naar boven. `y` = hoogte van de vloer (m). */
export const VERDIEPEN = [
  { nr: -1, y: -7, label: '-1', naam: 'Wellness & ontspanning', sub: 'Fitness · sauna · zwembad · cinema · gaming' },
  { nr: 0, y: 0, label: '0', naam: 'Gelijkvloers', sub: 'Hall of Fame · tribunes · kleedkamers' },
  { nr: 1, y: 7.6, label: '1', naam: 'VIP-loges', sub: 'Loges · de oude bekers' },
  { nr: 2, y: 15.75, label: 'D', naam: 'Dak', sub: 'Ringwandeling rond het stadion' },
] as const

export type VerdiepNr = (typeof VERDIEPEN)[number]['nr']
export const LAAGSTE = VERDIEPEN[0].nr
export const HOOGSTE = VERDIEPEN[VERDIEPEN.length - 1].nr

/** De vloerhoogte (m) bij een (eventueel tussenliggende) liftstand. */
export function liftY(hoogte: number): number {
  const h = Math.min(HOOGSTE, Math.max(LAAGSTE, hoogte))
  const i = Math.min(VERDIEPEN.length - 2, Math.floor(h - LAAGSTE))
  const a = VERDIEPEN[i]
  const b = VERDIEPEN[i + 1]
  return a.y + (b.y - a.y) * (h - a.nr)
}

/** Het verdiep waar een vloerhoogte bij hoort (het dichtste). */
export function verdiepBijY(y: number): VerdiepNr {
  let beste: VerdiepNr = 0
  for (const v of VERDIEPEN) if (Math.abs(v.y - y) < Math.abs(liftY(beste) - y)) beste = v.nr
  return beste
}

export type LiftToestand = 'dicht' | 'openen' | 'open' | 'sluiten' | 'rijden'

export type Lift = {
  toestand: LiftToestand
  /** Waar de kooi is, in verdiepen (tussenin tijdens het rijden). */
  hoogte: number
  /** Van waar en naar waar ze rijdt. */
  van: number
  doel: number
  /** Hoe ver de deuren open staan: 0 = dicht, 1 = open. */
  deur: number
  /** Tijd in de huidige toestand (s). */
  t: number
  /** Rijdt de speler mee? */
  metSpeler: boolean
}

export type LiftSpeler = {
  /** Op welk verdiep de speler is (bij het meerijden: het vertrekverdiep tot de aankomst). */
  verdiep: number
  /** Staat de speler in de kooi? */
  inKooi: boolean
  /** Staat de speler vlak bij de deur (buiten de kooi)? */
  bijDeur: boolean
  /** Het verdiep dat de speler in de kooi koos (null = nog niets gekozen). */
  keuze: number | null
}

export const LIFT_DEUR_S = 0.9
export const LIFT_RIT_BASIS_S = 1.4
export const LIFT_RIT_PER_VERDIEP_S = 1.6
export const LIFT_OPEN_S = 4

export function nieuweLift(): Lift {
  return { toestand: 'dicht', hoogte: 0, van: 0, doel: 0, deur: 0, t: 0, metSpeler: false }
}

/** Het verdiep waar de kooi staat (of het dichtste tijdens het rijden). */
export const liftVerdiep = (l: Lift): number => Math.round(l.hoogte)

/** Hoe ver de deuren op een verdiep open staan (die van een ander verdiep zijn dicht). */
export function deurOp(l: Lift, verdiep: number): number {
  if (l.toestand === 'rijden' || liftVerdiep(l) !== verdiep) return 0
  return l.deur
}

/** Hoe lang een rit duurt (s). */
export const ritDuur = (van: number, naar: number) => LIFT_RIT_BASIS_S + LIFT_RIT_PER_VERDIEP_S * Math.abs(naar - van)

const vlot = (x: number) => x * x * (3 - 2 * x)
const geldig = (v: number | null): v is number => v != null && VERDIEPEN.some((x) => x.nr === v)

/**
 * Eén stap van de lift. Geeft de nieuwe lift terug, plus `aangekomen` (het verdiep waar de speler
 * net aankwam, anders null), `spelerHoogte` (waar de speler zit als die meerijdt, in verdiepen) en
 * `keuzeGebruikt` (de keuze is aanvaard: de lift vertrekt ermee).
 */
export function liftStap(
  l0: Lift,
  dt: number,
  sp: LiftSpeler,
): { lift: Lift; aangekomen: number | null; spelerHoogte: number | null; keuzeGebruikt: boolean } {
  const l: Lift = { ...l0, t: l0.t + dt }
  const hier = liftVerdiep(l)
  const spelerHier = sp.verdiep === hier
  const binnen = spelerHier && sp.inKooi
  const bijDeur = spelerHier && sp.bijDeur
  const roep = !spelerHier && sp.bijDeur
  const keuze = binnen && geldig(sp.keuze) && sp.keuze !== hier ? sp.keuze : null
  let aangekomen: number | null = null
  let keuzeGebruikt = false
  const naar = (t: LiftToestand) => {
    l.toestand = t
    l.t = 0
  }

  switch (l.toestand) {
    case 'dicht':
      l.deur = 0
      if (keuze != null) {
        // Binnen en al gekozen (bv. de deuren waren net dicht): meteen vertrekken.
        l.van = hier
        l.doel = keuze
        l.metSpeler = true
        keuzeGebruikt = true
        naar('rijden')
      } else if (bijDeur || binnen) {
        naar('openen')
      } else if (roep) {
        l.van = hier
        l.doel = sp.verdiep
        l.metSpeler = false
        naar('rijden')
      }
      break
    case 'openen':
      l.deur = Math.min(1, l.deur + dt / LIFT_DEUR_S)
      if (l.deur >= 1) naar('open')
      break
    case 'open':
      l.deur = 1
      if (keuze != null) {
        l.doel = keuze
        l.metSpeler = true
        keuzeGebruikt = true
        naar('sluiten')
      } else if (!binnen && !bijDeur && l.t >= LIFT_OPEN_S) {
        l.metSpeler = false
        naar('sluiten')
      } else if (binnen || bijDeur) {
        // Zolang er iemand in of aan de deur staat, blijft ze open.
        l.t = 0
      }
      break
    case 'sluiten':
      // Stapt er iemand in of komt er iemand aan terwijl ze sluiten (en rijdt die niet al mee): weer open.
      if (!l.metSpeler && (binnen || bijDeur)) {
        naar('openen')
        break
      }
      l.deur = Math.max(0, l.deur - dt / LIFT_DEUR_S)
      if (l.deur <= 0) {
        if (l.metSpeler && binnen) {
          l.van = hier
          naar('rijden')
        } else {
          l.metSpeler = false
          naar('dicht')
        }
      }
      break
    case 'rijden': {
      l.deur = 0
      const f = Math.min(1, l.t / ritDuur(l.van, l.doel))
      l.hoogte = l.van + (l.doel - l.van) * vlot(f)
      if (f >= 1) {
        l.hoogte = l.doel
        if (l.metSpeler) aangekomen = l.doel
        l.metSpeler = false
        naar('openen')
      }
      break
    }
  }
  return {
    lift: l,
    aangekomen,
    spelerHoogte: l.toestand === 'rijden' && l.metSpeler ? l.hoogte : aangekomen,
    keuzeGebruikt,
  }
}
