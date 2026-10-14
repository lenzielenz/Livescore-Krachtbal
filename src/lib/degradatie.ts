// Degradatiegevaar voor de eigen ploeg, boven de rangschikking.
//
// Bij krachtbal zakt enkel de allerlaatste van een volwassen reeks. De tekst gaat — net als de
// titeltekst — enkel over je eigen ploeg, en verschijnt alleen als die in de gevarenzone staat:
// laatst, of zo dicht boven de laatste dat één speeldag volstaat om te wisselen. Puur en getest.

import { STANDINGS_POINTS, type StandingRow } from './standings'

const WIN = STANDINGS_POINTS.win
/** Hoeveel punten er op één speeldag tussen twee ploegen kunnen verschuiven (zege tegenover verlies). */
const EEN_SPEELDAG = STANDINGS_POINTS.win - STANDINGS_POINTS.loss

const punten = (n: number) => `${n} ${n === 1 ? 'punt' : 'punten'}`
const wedstrijden = (n: number) => `${n} ${n === 1 ? 'wedstrijd' : 'wedstrijden'}`

/**
 * Eén regel over het degradatiegevaar van de eigen ploeg, of null wanneer die niet in gevaar is.
 * `table` staat gesorteerd zoals de rangschikking (laatste = degradatieplaats).
 */
export function degradatieBoodschap(input: {
  table: StandingRow[]
  remaining: Map<number, number>
  teamId: number
  naam: (teamId: number) => string
}): { text: string; zeker: boolean } | null {
  const { table, remaining, teamId, naam } = input
  const idx = table.findIndex((r) => r.teamId === teamId)
  if (idx < 0 || table.length < 2) return null
  const me = table[idx]
  if (me.played === 0) return null
  const myRem = remaining.get(teamId) ?? 0
  const others = table.filter((r) => r.teamId !== teamId)
  const laatste = idx === table.length - 1
  const seizoenGedaan = myRem === 0 && others.every((o) => (remaining.get(o.teamId) ?? 0) === 0)

  if (seizoenGedaan) return laatste ? { text: `${naam(teamId)} eindigt laatst en degradeert.`, zeker: true } : null

  // Wiskundig veilig: er is een ploeg die, ook als ze alles wint, onder ons blijft.
  if (others.some((o) => o.points + WIN * (remaining.get(o.teamId) ?? 0) < me.points)) return null
  // Wiskundig gezakt: zelfs met enkel zeges haalt de ploeg niemand meer in.
  if (others.every((o) => o.points > me.points + WIN * myRem)) {
    return { text: `${naam(teamId)} kan de laatste plaats niet meer ontlopen en degradeert.`, zeker: true }
  }

  if (laatste) {
    const boven = table[idx - 1]
    const gat = boven.points - me.points
    const stand = gat > 0 ? `op ${punten(gat)} van ${naam(boven.teamId)}` : `met evenveel punten als ${naam(boven.teamId)}`
    return {
      text: `Degradatiegevaar: ${naam(teamId)} staat laatst, ${stand}. Wie laatst eindigt, zakt. Nog ${wedstrijden(myRem)} om dat recht te zetten.`,
      zeker: false,
    }
  }

  const onder = table[table.length - 1]
  const voorsprong = me.points - onder.points
  if (voorsprong > EEN_SPEELDAG) return null
  const stand = voorsprong > 0 ? `met maar ${punten(voorsprong)} voorsprong op ${naam(onder.teamId)}` : `met evenveel punten als ${naam(onder.teamId)}`
  return {
    text: `Opgelet: ${naam(teamId)} staat net boven de degradatieplaats, ${stand}. Eén speeldag kan volstaan om te wisselen.`,
    zeker: false,
  }
}
