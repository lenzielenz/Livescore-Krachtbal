// De lift in het virtuele stadion: van het gelijkvloers (0) naar het verdiep met de loges (1).
// Puur: de 3D-kant geeft per beeld door waar de speler staat; deze module beslist wat de deuren en
// de kooi doen. Zoals een echte lift:
//  • kom je bij de deur en staat de kooi er, dan gaan de deuren open; staat ze op het andere
//    verdiep, dan roep je ze op (ze rijdt leeg naar je toe en gaat dan open);
//  • stap je in, dan sluiten de deuren na een ogenblik, rijdt de kooi naar het andere verdiep (de
//    nummers boven de deur wisselen mee) en gaan de deuren daar open;
//  • na aankomst rijdt ze pas opnieuw als je eerst uitgestapt en weer ingestapt bent.

export type LiftToestand = 'dicht' | 'openen' | 'open' | 'sluiten' | 'rijden'

export type Lift = {
  toestand: LiftToestand
  /** Waar de kooi is: 0 = gelijkvloers, 1 = verdiep (tussenin tijdens het rijden). */
  hoogte: number
  /** Waar ze heen rijdt. */
  doel: 0 | 1
  /** Hoe ver de deuren open staan: 0 = dicht, 1 = open. */
  deur: number
  /** Tijd in de huidige toestand (s). */
  t: number
  /** Hoe lang de speler al binnen staat met open deuren (s). */
  binnen: number
  /** Rijdt de speler mee? */
  metSpeler: boolean
  /** Na aankomst eerst uitstappen voor je opnieuw kan rijden. */
  uitstappen: boolean
}

export type LiftSpeler = {
  /** Op welk verdiep de speler is (bij het meerijden: het vertrekverdiep tot de aankomst). */
  verdiep: 0 | 1
  /** Staat de speler in de kooi? */
  inKooi: boolean
  /** Staat de speler vlak bij de deur (buiten de kooi)? */
  bijDeur: boolean
}

export const LIFT_DEUR_S = 0.9
export const LIFT_RIT_S = 3.2
export const LIFT_WACHT_S = 1.0
export const LIFT_OPEN_S = 4

export function nieuweLift(): Lift {
  return { toestand: 'dicht', hoogte: 0, doel: 0, deur: 0, t: 0, binnen: 0, metSpeler: false, uitstappen: false }
}

/** Het verdiep waar de kooi staat (of het dichtste tijdens het rijden). */
export const liftVerdiep = (l: Lift): 0 | 1 => (l.hoogte >= 0.5 ? 1 : 0)

/** Hoe ver de deuren op een verdiep open staan (die van een ander verdiep zijn dicht). */
export function deurOp(l: Lift, verdiep: 0 | 1): number {
  if (l.toestand === 'rijden' || liftVerdiep(l) !== verdiep) return 0
  return l.deur
}

const vlot = (x: number) => x * x * (3 - 2 * x)

/**
 * Eén stap van de lift. Geeft de nieuwe lift terug, plus `aangekomen` (het verdiep waar de speler
 * net aankwam, anders null) en `spelerHoogte` (0–1, waar de speler zit als die meerijdt).
 */
export function liftStap(l0: Lift, dt: number, sp: LiftSpeler): { lift: Lift; aangekomen: 0 | 1 | null; spelerHoogte: number | null } {
  const l: Lift = { ...l0, t: l0.t + dt }
  const hier = liftVerdiep(l)
  const spelerHier = sp.verdiep === hier
  const binnen = spelerHier && sp.inKooi
  const bijDeur = spelerHier && sp.bijDeur
  const roep = !spelerHier && sp.bijDeur
  let aangekomen: 0 | 1 | null = null
  const naar = (t: LiftToestand) => {
    l.toestand = t
    l.t = 0
  }

  switch (l.toestand) {
    case 'dicht':
      l.deur = 0
      if (bijDeur || binnen) {
        naar('openen')
      } else if (roep) {
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
      if (binnen) {
        if (!l.uitstappen) {
          l.binnen += dt
          if (l.binnen >= LIFT_WACHT_S) {
            l.metSpeler = true
            naar('sluiten')
          }
        }
      } else {
        l.binnen = 0
        l.uitstappen = false
        if (!bijDeur && l.t >= LIFT_OPEN_S) {
          l.metSpeler = false
          naar('sluiten')
        }
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
          l.doel = hier === 0 ? 1 : 0
          naar('rijden')
        } else {
          l.metSpeler = false
          naar('dicht')
        }
      }
      break
    case 'rijden': {
      l.deur = 0
      const van = l.doel === 1 ? 0 : 1
      const f = Math.min(1, l.t / LIFT_RIT_S)
      l.hoogte = van + (l.doel - van) * vlot(f)
      if (f >= 1) {
        l.hoogte = l.doel
        if (l.metSpeler) {
          aangekomen = l.doel
          l.uitstappen = true
        }
        l.metSpeler = false
        l.binnen = 0
        naar('openen')
      }
      break
    }
  }
  return { lift: l, aangekomen, spelerHoogte: l.toestand === 'rijden' && l0.metSpeler ? l.hoogte : aangekomen != null ? aangekomen : null }
}
