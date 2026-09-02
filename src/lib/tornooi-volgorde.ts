// In welke volgorde staan de wedstrijden van een tornooireeks op het scherm?
//
// Ze stonden in schemavolgorde: de volgorde waarin de loting ze aanmaakte. Dat is de juiste
// volgorde voor een bekerschema (ronde na ronde), maar niet voor een lijst waar je iets in moet
// terúgvinden. Aan een tornooi zoek je op uur — "die van kwart over drie" — en dan is een lijst
// met 15:10, 17:30, 14:00, 16:20 na elkaar hinderlijk.
//
// Dus: op speeltijd. Wat nog geen uur heeft, komt achteraan in schemavolgorde — dat is namelijk
// precies waar het thuishoort: wedstrijden zonder uur zijn meestal de latere rondes, waarvan de
// ploegen nog moeten blijken.

export type TeSorteren = {
  /** Gepland aanvangsuur (ISO), of null als het nog niet vastligt. */
  plannedAt?: string | null
  round: number
  position: number
}

const tijd = (m: TeSorteren): number | null => {
  if (!m.plannedAt) return null
  const t = new Date(m.plannedAt).getTime()
  return Number.isNaN(t) ? null : t
}

/**
 * Wedstrijden op speeltijd, met de ongeplande achteraan.
 *
 * Sorteert een kopie: de aanroeper werkt vaak met de lijst uit de livestream, en die mag niet
 * onder handen genomen worden terwijl React ernaar kijkt.
 */
export function opSpeeltijd<T extends TeSorteren>(matches: T[]): T[] {
  return [...matches].sort((a, b) => {
    const ta = tijd(a)
    const tb = tijd(b)
    if (ta != null && tb != null && ta !== tb) return ta - tb
    if (ta != null && tb == null) return -1
    if (ta == null && tb != null) return 1
    // Gelijk uur of allebei zonder uur: terug naar de schemavolgorde, zodat de lijst niet
    // willekeurig van plaats wisselt bij elke live-update.
    if (a.round !== b.round) return a.round - b.round
    return a.position - b.position
  })
}
