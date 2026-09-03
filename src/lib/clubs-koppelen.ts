import { clubVanPloeg, naamSleutel } from './season-import'

// Ploegen aan hun echte club koppelen.
//
// Het logo, de kleuren en de accounts hangen aan de CLUB; een ploeg wijst ernaar. Zolang de import
// de club uit de ploegnaam afleidde zonder "A-1"/"B-2" te kennen, kreeg elke ploeg haar eigen club:
// "KBC St. Michiels A-1", "KBC St. Michiels B-2" en "KBC St. Michiels" stonden als drie clubs in de
// database, elk met een eigen (leeg) logo. De afleiding is intussen juist, maar de bestaande data
// niet — dat herstelt deze planner.
//
// Puur en zonder database: wie de ploegen en clubs binnenbrengt, krijgt een plan terug dat eerst
// als voorbeeld getoond wordt en pas daarna uitgevoerd. Uitvoeren is idempotent: een tweede keer
// plannen op de herstelde data geeft een leeg plan.

export type Ploeg = { id: number; naam: string; clubId: number | null }
export type Club = { id: number; naam: string; heeftLogo: boolean }

export type Verhuizing = {
  ploegId: number
  ploegNaam: string
  vanClubId: number | null
  vanClubNaam: string
  /** Bestaande club, of null wanneer ze nog aangemaakt moet worden (zie `naarClubNaam`). */
  naarClubId: number | null
  naarClubNaam: string
}

export type Plan = {
  verhuizingen: Verhuizing[]
  /** Clubs die nog niet bestaan en aangemaakt worden (unieke namen). */
  nieuweClubs: string[]
  /** Clubs die na de verhuizing geen ploeg meer hebben en veilig weg kunnen. */
  opTeRuimen: { id: number; naam: string; naarClubId: number | null; naarClubNaam: string }[]
  /** Clubs die leeg raken maar iets dragen (logo) dat je niet blind wil weggooien. */
  behouden: { id: number; naam: string; reden: string }[]
  /** Doelclubs zonder logo: één upload daar, en al hun ploegen tonen het. */
  doelenZonderLogo: string[]
}

/**
 * Welke club hoort bij welke ploeg?
 *
 * Kandidaten zijn de clubs waarvan de naam — zonder hoofdletters en leestekens — gelijk is aan de
 * clubnaam die uit de ploegnaam volgt. Zijn er meerdere (bv. "KBC St. Michiels" en "KBC St Michiels"),
 * dan wint de club met een logo, daarna de club met de meeste ploegen: dat is de club waar de
 * organisatie al aan gewerkt heeft.
 */
export function planClubKoppeling(ploegen: Ploeg[], clubs: Club[]): Plan {
  const perSleutel = new Map<string, Club[]>()
  for (const c of clubs) {
    const k = naamSleutel(c.naam)
    if (!k) continue
    perSleutel.set(k, [...(perSleutel.get(k) ?? []), c])
  }
  const ploegenPerClub = new Map<number, number>()
  for (const p of ploegen) if (p.clubId != null) ploegenPerClub.set(p.clubId, (ploegenPerClub.get(p.clubId) ?? 0) + 1)
  const clubNaam = new Map(clubs.map((c) => [c.id, c.naam]))
  const clubLogo = new Map(clubs.map((c) => [c.id, c.heeftLogo]))

  const kies = (kandidaten: Club[]): Club =>
    [...kandidaten].sort((a, b) => {
      if (a.heeftLogo !== b.heeftLogo) return a.heeftLogo ? -1 : 1
      const pa = ploegenPerClub.get(a.id) ?? 0
      const pb = ploegenPerClub.get(b.id) ?? 0
      if (pa !== pb) return pb - pa
      return a.id - b.id
    })[0]

  const verhuizingen: Verhuizing[] = []
  const nieuw = new Map<string, string>() // sleutel → nette naam
  // Ploegen die na het plan per club overblijven.
  const blijft = new Map<number, number>(ploegenPerClub)

  for (const p of ploegen) {
    const doelNaam = clubVanPloeg(p.naam)
    const sleutel = naamSleutel(doelNaam)
    if (!sleutel) continue
    const kandidaten = perSleutel.get(sleutel)
    const doel = kandidaten && kandidaten.length ? kies(kandidaten) : null
    const naarClubId = doel ? doel.id : null
    if (doel && p.clubId === doel.id) continue
    if (!doel) nieuw.set(sleutel, doelNaam)
    verhuizingen.push({
      ploegId: p.id,
      ploegNaam: p.naam,
      vanClubId: p.clubId,
      vanClubNaam: p.clubId != null ? (clubNaam.get(p.clubId) ?? '?') : '—',
      naarClubId,
      naarClubNaam: doel ? doel.naam : doelNaam,
    })
    if (p.clubId != null) blijft.set(p.clubId, (blijft.get(p.clubId) ?? 1) - 1)
    if (naarClubId != null) blijft.set(naarClubId, (blijft.get(naarClubId) ?? 0) + 1)
  }

  // Een club die door dit plan leeg raakt, was een club-per-ploeg: die mag weg — tenzij ze een logo
  // draagt, want dat verlies je niet zomaar. Dan liever melden en handmatig samenvoegen.
  const geraakt = new Set(verhuizingen.map((v) => v.vanClubId).filter((id): id is number => id != null))
  const opTeRuimen: Plan['opTeRuimen'] = []
  const behouden: Plan['behouden'] = []
  for (const id of geraakt) {
    if ((blijft.get(id) ?? 0) > 0) continue
    const naam = clubNaam.get(id) ?? '?'
    const eerste = verhuizingen.find((v) => v.vanClubId === id)!
    if (clubLogo.get(id)) {
      behouden.push({ id, naam, reden: 'heeft een logo — voeg handmatig samen zodat dat bewaard blijft' })
      continue
    }
    opTeRuimen.push({ id, naam, naarClubId: eerste.naarClubId, naarClubNaam: eerste.naarClubNaam })
  }

  const doelen = new Set<string>()
  for (const v of verhuizingen) {
    const heeftLogo = v.naarClubId != null ? clubLogo.get(v.naarClubId) : false
    if (!heeftLogo) doelen.add(v.naarClubNaam)
  }

  return {
    verhuizingen,
    nieuweClubs: [...nieuw.values()],
    opTeRuimen,
    behouden,
    doelenZonderLogo: [...doelen].sort(),
  }
}
