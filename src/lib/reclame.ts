// Hoe een reclamebeeld in zijn tegel valt.
//
// Reclame komt binnen zoals ze binnenkomt: een liggende banner, een vierkant logo, een foto van
// een affiche die scheef genomen is, wit-op-wit of juist knalgeel. Zonder ingreep botst dat
// allemaal in dezelfde balk en wordt het rommelig — precies wat een scherm in de kantine niet mag
// zijn.
//
// Twee middelen, en ze horen bij elkaar:
//
//   1. De BEHEERDER snijdt bij. Zoomen, verschuiven en draaien tot het beeld recht en vol in de
//      tegel staat. Dat is deze module: één beschrijving van de uitsnede die de admin-voorvertoning
//      én het scherm gebruiken, zodat "wat je opslaat is wat de kantine ziet".
//   2. Het SCHERM egaliseert. Elke tegel is even hoog, met dezelfde marge en dezelfde rustige
//      achtergrond. Een donker logo en een witte flyer staan dan naast elkaar zonder te vloeken.
//      Wie een eigen achtergrondkleur wil (een logo dat op wit hóórt te staan), zet die per
//      reclame.
//
// Dezelfde opzet als de clublogo's (lib/logo-fit.ts), met één toevoeging: rotatie. Een foto van
// een sponsorbord hangt zelden perfect waterpas.

import type { CSSProperties } from 'react'

export type ReclameUitsnede = {
  /** 1 = passend, hoger = ingezoomd. */
  zoom: number
  /** Verschuiving binnen de tegel, in procent van de tegel (-50..50). */
  offsetX: number
  offsetY: number
  /** Draaiing in graden (-180..180). Voor een scheef gefotografeerd bord. */
  rotatie: number
}

export const DEFAULT_UITSNEDE: ReclameUitsnede = { zoom: 1, offsetX: 0, offsetY: 0, rotatie: 0 }

export const ZOOM_MIN = 1
export const ZOOM_MAX = 4
export const OFFSET_BEREIK = 50
export const ROTATIE_BEREIK = 180

const klem = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** Een veilige uitsnede uit ruwe (mogelijk ontbrekende) databasewaarden. */
export function normaliseerUitsnede(ruw: Partial<ReclameUitsnede> | null | undefined): ReclameUitsnede {
  if (!ruw) return DEFAULT_UITSNEDE
  const getal = (v: unknown, terugval: number) => (typeof v === 'number' && Number.isFinite(v) ? v : terugval)
  return {
    zoom: klem(getal(ruw.zoom, 1) > 0 ? getal(ruw.zoom, 1) : 1, ZOOM_MIN, ZOOM_MAX),
    offsetX: klem(getal(ruw.offsetX, 0), -OFFSET_BEREIK, OFFSET_BEREIK),
    offsetY: klem(getal(ruw.offsetY, 0), -OFFSET_BEREIK, OFFSET_BEREIK),
    rotatie: klem(getal(ruw.rotatie, 0), -ROTATIE_BEREIK, ROTATIE_BEREIK),
  }
}

/** Wijkt deze uitsnede af van de standaard (en is er dus een transform nodig)? */
export function heeftUitsnede(u: ReclameUitsnede | null | undefined): boolean {
  if (!u) return false
  return u.zoom !== 1 || u.offsetX !== 0 || u.offsetY !== 0 || u.rotatie !== 0
}

/**
 * De CSS-transform voor het beeld in de tegel.
 *
 * Volgorde telt: eerst verschuiven, dan draaien, dan zoomen. Zo draait het beeld om het punt dat
 * de beheerder in het midden zette, en niet om een hoek — anders loopt het beeld weg zodra je aan
 * de draaiknop komt, en dat voelt kapot.
 */
export function uitsnedeStijl(u: ReclameUitsnede | null | undefined): CSSProperties | undefined {
  if (!heeftUitsnede(u)) return undefined
  const { zoom, offsetX, offsetY, rotatie } = u as ReclameUitsnede
  return {
    transform: `translate(${offsetX}%, ${offsetY}%) rotate(${rotatie}deg) scale(${zoom})`,
    transformOrigin: 'center',
  }
}
