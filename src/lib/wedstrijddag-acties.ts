// Welke knoppen hoort een wedstrijdkaart te tonen op de wedstrijddag?
//
// In federatiemodus is de wedstrijddag een keten: opstelling → scheidsrechter → aantekenen →
// aftekenen, en elke schakel bewaakt de volgende. In supportersmodus (zie score-mode.ts) valt die
// keten wég — "vrije livescore, geen scheidsrechter of wedstrijdblad nodig" — en blijft er één
// handeling over: de score doorgeven.
//
// Dat verschil stond verspreid over de schermen, en op het clubdashboard stond het er níét: daar
// bleef "Opstelling" de primaire knop en verving "⏳ Wacht op scheidsrechter" het aantekenen, ook
// wanneer er geen scheidsrechter meer in het spel was. Hier staat de regel één keer, puur en
// getest, zodat elk scherm hetzelfde zegt.

export type WedstrijdActie = 'opstelling' | 'aantekenen' | 'wachtOpScheidsrechter' | 'bekijk'

export function clubActies(opts: {
  supportersMode: boolean
  /** Welke kant van de wedstrijd is de eigen ploeg? */
  side: 'home' | 'away'
  /** Loopt de wedstrijd al? */
  live: boolean
  /** Zette de scheidsrechter het wedstrijdblad al open om aan te tekenen (wedstrijdklaar/bezig)? */
  bladOpen: boolean
  /** Tekent een ANDER iemand deze wedstrijd al actief aan (zie score-trust.ts)? Dan valt
   * 'aantekenen' hier weg — anders kunnen twee mensen tegelijk beginnen aantekenen en dubbel/
   * conflicterend invoeren. De houder van de claim zelf blijft 'aantekenen' gewoon zien. */
  claimedByOther?: boolean
}): WedstrijdActie[] {
  const zonderDubbel = (acties: WedstrijdActie[]): WedstrijdActie[] => {
    if (!opts.claimedByOther) return acties
    const zonder = acties.filter((a) => a !== 'aantekenen')
    return zonder.includes('bekijk') ? zonder : [...zonder, 'bekijk']
  }

  // Supportersmodus: geen opstelling om in te vullen en geen scheidsrechter om op te wachten.
  // Thuis én uit begin je meteen; "Bekijk" blijft ernaast voor wie enkel wil volgen.
  if (opts.supportersMode) return zonderDubbel(['aantekenen', 'bekijk'])

  // Federatiemodus: aantekenen kan zodra de scheidsrechter het blad opende. Een wedstrijd die al
  // LOOPT is altijd open — de aantekentafel moet er terug in kunnen na een refresh of vanaf een
  // ander toestel, en dat geldt voor beide kanten.
  const open = opts.live || opts.bladOpen
  if (opts.side === 'home') {
    return open ? zonderDubbel(['opstelling', 'aantekenen']) : ['opstelling', 'wachtOpScheidsrechter']
  }
  return open ? zonderDubbel(['opstelling', 'aantekenen', 'bekijk']) : ['opstelling', 'bekijk']
}

/** Welke actie krijgt de nadruk (btn-primary)? De rest staat als ghost ernaast. */
export function primaireActie(acties: WedstrijdActie[]): WedstrijdActie | null {
  // Zolang er een opstelling in te vullen is, is dát het werk. Valt ze weg (supportersmodus), dan
  // is aantekenen de hoofdzaak.
  if (acties.includes('opstelling')) return 'opstelling'
  if (acties.includes('aantekenen')) return 'aantekenen'
  return acties[0] ?? null
}

/**
 * Wie mag in de federatieflow vanaf het live-bord naar het aantekenscherm? 'alle' (federatie,
 * admin, aantekenaar, scheidsrechter — de server beslist per wedstrijd verder), 'club' (enkel
 * wedstrijden van de eigen club) of null. In supportersmodus speelt dit niet: daar mag iedereen.
 */
export type AantekenRol = 'alle' | 'club' | null

export function aantekenRolVan(roles: readonly string[] | null | undefined): AantekenRol {
  const r = new Set(roles ?? [])
  if (r.has('admin') || r.has('federatie') || r.has('scorekeeper') || r.has('scheidsrechter')) return 'alle'
  if (r.has('club-beheerder') || r.has('club-medewerker')) return 'club'
  return null
}

/** Toont het live-bord voor deze wedstrijd een "Aantekenen"-knop aan deze kijker? */
export function bordAantekenKnop(o: {
  supportersMode: boolean
  rol: AantekenRol
  myClubId: number | null
  homeClubId: number | null | undefined
  awayClubId: number | null | undefined
  /** Iemand anders tekent deze wedstrijd al aan (en de kijker is geen federatie/admin). */
  iemandAnders: boolean
}): boolean {
  if (o.iemandAnders) return false
  if (o.supportersMode) return true
  if (o.rol === 'alle') return true
  return o.rol === 'club' && o.myClubId != null && (o.homeClubId === o.myClubId || o.awayClubId === o.myClubId)
}
