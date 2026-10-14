// De hall of fame in de gangen van Virtueel krachtbal: welke borden er hangen.
//
// Puur: krijgt de erelijst (zoals fetchErelijstData ze aanlevert) en de naam van je club, en kiest
// de borden. Je eigen club: elke titel, beker en referendumprijs van haar spelers, recentste
// eerst. Heeft je club (nog) niets, of kijk je zonder club, dan hangen de recentste kampioenen van
// de federatie er: de erelijst ontdekken kan dan nog altijd.

import { canoniekeClubNaam, canoniekeReeksNaam, isPlaceholder, seizoenNaarJaar, type BekerwinnaarsSeizoenInput, type KampioenenSeizoenInput, type ReferendumPrijsInput } from './erelijst'
import type { EreBord, EreZaal } from './virtueel'

const sleutel = (s: string) => canoniekeClubNaam(s).toLowerCase().replace(/[^a-z0-9]/g, '')

const meervoud = (n: number, een: string, veel: string) => `${n} ${n === 1 ? een : veel}`

/** Nederlandse rangtelwoorden: 1ste, 2de, 3de, …, 8ste, …, 20ste, 21ste. */
export function rangtelwoord(n: number): string {
  return `${n}${n === 1 || n === 8 || n >= 20 ? 'ste' : 'de'}`
}

type Ruw = EreBord & { j: number; groep: string; persoon?: string }

/** Nummert de prijzen chronologisch (oudste = 1) en vult `extra` met wat elke prijs bijzonder maakt. */
function verrijk(lijst: Ruw[], soortNaam: { een: string; groep: (b: Ruw) => string }): void {
  const chrono = [...lijst].sort((a, b) => a.j - b.j)
  const perGroep = new Map<string, number>()
  const perPersoon = new Map<string, number>()
  chrono.forEach((b, i) => {
    const g = (perGroep.get(b.groep) ?? 0) + 1
    perGroep.set(b.groep, g)
    b.nummer = i + 1
    const delen = [[rangtelwoord(g), soortNaam.een, soortNaam.groep(b)].filter(Boolean).join(' '), `${rangtelwoord(i + 1)} ${soortNaam.een} van de club`]
    if (b.persoon) {
      const k = (perPersoon.get(b.persoon) ?? 0) + 1
      perPersoon.set(b.persoon, k)
      delen.splice(1, 1, k > 1 ? `${rangtelwoord(k)} keer voor ${b.persoon}` : `${rangtelwoord(i + 1)} laureaat van de club`)
    }
    b.extra = delen.join(' · ')
  })
}

export function eregalerij(
  clubNaam: string | null,
  data: { kampioenenSeizoenen: KampioenenSeizoenInput[]; bekerwinnaarsSeizoenen: BekerwinnaarsSeizoenInput[]; referendumPrijzen: ReferendumPrijsInput[] },
  max = 24,
  maxVroeger = 10,
): EreZaal | null {
  const jaarVan = (seizoen: string) => seizoenNaarJaar(seizoen) || 0
  const schoon = ({ j: _j, groep: _g, persoon: _p, ...b }: Ruw): EreBord => b
  if (clubNaam) {
    const mijn = sleutel(clubNaam)
    const titels: Ruw[] = data.kampioenenSeizoenen.flatMap((s) =>
      s.reeksen
        .filter((r) => !isPlaceholder(r.kampioen) && sleutel(r.kampioen) === mijn)
        .map((r) => ({ soort: 'titel' as const, jaar: s.seizoen, kop: 'KAMPIOEN', tekst: r.reeksNaam, j: jaarVan(s.seizoen), groep: canoniekeReeksNaam(r.reeksNaam) })),
    )
    const bekers: Ruw[] = data.bekerwinnaarsSeizoenen.flatMap((s) =>
      s.winnaars
        .filter((w) => !isPlaceholder(w.ploeg) && sleutel(w.ploeg) === mijn)
        .map((w) => ({ soort: 'beker' as const, jaar: s.seizoen, kop: 'BEKERWINNAAR', tekst: w.categorie, j: jaarVan(s.seizoen), groep: canoniekeReeksNaam(w.categorie) })),
    )
    const laureaten: Ruw[] = data.referendumPrijzen.flatMap((p) =>
      p.winnaars
        .filter((w) => !isPlaceholder(w.naam) && !isPlaceholder(w.club) && sleutel(w.club) === mijn)
        .map((w) => ({ soort: 'referendum' as const, jaar: w.jaar, kop: p.prijs.toUpperCase(), tekst: w.naam, j: Number(w.jaar) || 0, groep: p.prijs, persoon: w.naam })),
    )
    verrijk(titels, { een: 'titel', groep: (b) => `in ${b.tekst}` })
    verrijk(bekers, { een: 'beker', groep: (b) => `in ${b.tekst}` })
    verrijk(laureaten, { een: '', groep: (b) => `${b.groep} voor de club` })
    const alles = [...titels, ...bekers, ...laureaten]
    if (alles.length > 0) {
      return {
        eigen: true,
        kop: `HALL OF FAME · ${canoniekeClubNaam(clubNaam).toUpperCase()}`,
        totaal: [meervoud(titels.length, 'titel', 'titels'), meervoud(bekers.length, 'beker', 'bekers'), meervoud(laureaten.length, 'laureaat', 'laureaten')].join(' · '),
        borden: [...alles]
          .sort((a, b) => b.j - a.j)
          .slice(0, max)
          .map(schoon),
        sterren: [...laureaten].sort((a, b) => a.j - b.j).map((b) => ({ naam: b.tekst, prijs: b.groep, jaar: b.jaar })),
        vroeger: [...titels, ...bekers]
          .sort((a, b) => a.j - b.j)
          .slice(0, maxVroeger)
          .map(schoon),
      }
    }
  }
  // Geen club of nog geen prijzen: de recentste kampioenen van de federatie.
  const recent: EreBord[] = data.kampioenenSeizoenen
    .flatMap((s) =>
      s.reeksen
        .filter((r) => !isPlaceholder(r.kampioen))
        .map((r) => ({ soort: 'titel' as const, jaar: s.seizoen, kop: canoniekeClubNaam(r.kampioen).toUpperCase(), tekst: `Kampioen ${r.reeksNaam}`, j: jaarVan(s.seizoen), groep: '' })),
    )
    .sort((a, b) => b.j - a.j)
    .slice(0, max)
    .map(schoon)
  if (recent.length === 0) return null
  return { eigen: false, kop: 'HALL OF FAME · KRACHTBAL', totaal: 'De recentste kampioenen van de federatie', borden: recent }
}
