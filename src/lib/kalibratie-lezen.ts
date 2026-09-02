// Het inlezen en nakijken van de kalibratiepunten die uit de app binnenkomen.
//
// Staat hier en niet in de route: een Next-routebestand mag enkel routehandlers exporteren, en
// zonder export valt deze controle niet te testen. Precies deze functie moet wél getest zijn — ze
// is de enige plek waar de app tegenhoudt dat er onzin de kalibratie in glipt, en een kalibratie
// die pas een halfuur later blijkt te rammelen is er een die je twee keer moet zetten.
//
// Twee soorten punten komen hier samen:
//
//   • LIJNKRUISINGEN van het veldmodel, herkenbaar aan hun label (doellijn_thuis_links …). Er zijn
//     er veertien; meer dan dat aanduiden kan niet kloppen.
//   • ANKERPUNTEN buiten het veldmodel — de hoek van de omheining, een paal, de hoek van de
//     kantine. Die staan nergens in het model en brengen daarom hun eigen veldcoördinaten mee,
//     afgelezen van een luchtfoto (lib/luchtfoto.ts).

import { geldigLabel } from './kalibratie-punten'

export type KalibratiePunt = {
  label: string
  x: number
  y: number
  /** Veldcoördinaten in meters. Aanwezig = ankerpunt, afwezig = lijnkruising. */
  veldM?: [number, number] | null
}

/** Hoeveel meter een ankerpunt van het veld mag liggen. Ruim, maar niet grenzeloos. */
export const ANKER_MAX_M = 200

/** De bovengrens op alles samen: veertien lijnkruisingen plus een redelijk aantal ankers.
 *
 *  Er staat géén aparte grens op het aantal kruispunten. Dat leek nuttig ("zoveel zijn er"), maar
 *  het is onbereikbaar: er bestaan er precies veertien, en een label twee keer opgeven wordt al
 *  eerder geweigerd. Een controle die nooit afgaat, wekt enkel de indruk dat er iets bewaakt wordt.
 */
export const MAX_PUNTEN = 40

export function leesPunten(
  ruw: unknown,
  waar: string,
): { punten: KalibratiePunt[] } | { fout: string } {
  if (!Array.isArray(ruw)) return { fout: `${waar}: punten ontbreekt.` }
  if (ruw.length < 1) return { fout: `${waar}: geen punten.` }
  if (ruw.length > MAX_PUNTEN) return { fout: `Meer dan ${MAX_PUNTEN} punten per beeld heeft geen zin.` }

  const punten: KalibratiePunt[] = []
  const gezien = new Set<string>()

  for (const p of ruw as Record<string, unknown>[]) {
    const ruweVeld = (p as { veldM?: unknown }).veldM
    const anker = Array.isArray(ruweVeld) && ruweVeld.length === 2
    let veldM: [number, number] | null = null

    if (anker) {
      const xm = Number(ruweVeld[0])
      const ym = Number(ruweVeld[1])
      if (!Number.isFinite(xm) || !Number.isFinite(ym)) {
        return { fout: `Ankerpunt ${String(p?.label)} heeft geen geldige veldcoördinaten.` }
      }
      if (Math.abs(xm) > ANKER_MAX_M || Math.abs(ym) > ANKER_MAX_M) {
        return { fout: `Ankerpunt ${String(p?.label)} ligt meer dan ${ANKER_MAX_M} m van het veld.` }
      }
      veldM = [Math.round(xm * 100) / 100, Math.round(ym * 100) / 100]
    } else if (!geldigLabel(p?.label)) {
      return { fout: `Onbekend punt: ${String(p?.label)}` }
    }

    const naam = String(p?.label ?? '').trim()
    if (!naam) return { fout: 'Een punt zonder naam kan niet bewaard worden.' }
    const x = Number(p.x)
    const y = Number(p.y)
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) {
      return { fout: `Punt ${naam} heeft geen geldige beeldcoördinaten.` }
    }
    if (gezien.has(naam)) return { fout: `Punt ${naam} staat er twee keer in.` }
    gezien.add(naam)
    punten.push({ label: naam, x: Math.round(x), y: Math.round(y), ...(veldM ? { veldM } : {}) })
  }

  return { punten }
}
