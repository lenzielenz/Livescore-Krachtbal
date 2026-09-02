// Wind, in woorden die een krachtballer iets zeggen.
//
// Krachtbal is een buitensport waarin de bal ver door de lucht gaat: wind is geen weetje maar
// speelinformatie. Een getal alleen ("18 km/u") zegt weinig als je niet dagelijks met snelheden
// werkt — de richting en een woord erbij maken het bruikbaar.

const ROOS = ['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW'] as const

/**
 * De windroos-afkorting voor een richting in graden.
 *
 * Meteorologisch is dat de richting waar de wind VANDAAN komt: 0° = uit het noorden.
 */
export function windRichting(graden: number): string {
  if (!Number.isFinite(graden)) return '—'
  const g = ((graden % 360) + 360) % 360
  // Elk vak is 45° breed en ligt gecentreerd op zijn richting; vandaar de halve stap erbij.
  return ROOS[Math.round(g / 45) % 8]
}

/**
 * Een pijl die toont waar de wind naartoe waait.
 *
 * Bewust andersom dan de richting hierboven: op een scherm lees je een pijl als "die kant op",
 * en dat is de kant waar de wind naartoe blaast — 180° van waar hij vandaan komt.
 */
export function windPijl(graden: number): string {
  const pijlen = ['↓', '↙', '←', '↖', '↑', '↗', '→', '↘']
  if (!Number.isFinite(graden)) return '·'
  const g = ((graden % 360) + 360) % 360
  return pijlen[Math.round(g / 45) % 8]
}

/**
 * Wat die snelheid betekent voor het spel (km/u).
 *
 * De grenzen volgen de schaal van Beaufort, samengevat tot wat er op een veld toe doet: vanaf
 * ongeveer 20 km/u begint de wind een lange worp te verleggen, vanaf 40 km/u wordt het lastig.
 */
export function windOmschrijving(kmu: number): string {
  if (!Number.isFinite(kmu) || kmu < 0) return '—'
  if (kmu < 6) return 'windstil'
  if (kmu < 12) return 'zwak'
  if (kmu < 20) return 'matig'
  if (kmu < 29) return 'vrij krachtig'
  if (kmu < 39) return 'krachtig'
  if (kmu < 50) return 'hard'
  return 'stormachtig'
}

/** Zet de wind in één regel: "💨 18 km/u ZW ↗ · matig". */
export function windTekst(kmu: number, graden?: number | null): string {
  const snelheid = Number.isFinite(kmu) ? `${Math.round(kmu)} km/u` : '—'
  const richting = graden == null || !Number.isFinite(graden) ? '' : ` ${windRichting(graden)} ${windPijl(graden)}`
  return `${snelheid}${richting} · ${windOmschrijving(kmu)}`
}
