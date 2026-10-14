// De hall of fame in de gangen van Virtueel krachtbal: welke borden er hangen.
//
// Puur: krijgt de erelijst (zoals fetchErelijstData ze aanlevert) en de naam van je club, en kiest
// de borden. Je eigen club: elke titel, beker en referendumprijs van haar spelers, recentste
// eerst. Heeft je club (nog) niets, of kijk je zonder club, dan hangen de recentste kampioenen van
// de federatie er: de erelijst ontdekken kan dan nog altijd.

import { canoniekeClubNaam, isPlaceholder, seizoenNaarJaar, type BekerwinnaarsSeizoenInput, type KampioenenSeizoenInput, type ReferendumPrijsInput } from './erelijst'
import type { EreBord, EreZaal } from './virtueel'

const sleutel = (s: string) => canoniekeClubNaam(s).toLowerCase().replace(/[^a-z0-9]/g, '')

const meervoud = (n: number, een: string, veel: string) => `${n} ${n === 1 ? een : veel}`

export function eregalerij(
  clubNaam: string | null,
  data: { kampioenenSeizoenen: KampioenenSeizoenInput[]; bekerwinnaarsSeizoenen: BekerwinnaarsSeizoenInput[]; referendumPrijzen: ReferendumPrijsInput[] },
  max = 24,
): EreZaal | null {
  const jaarVan = (seizoen: string) => seizoenNaarJaar(seizoen) || 0
  if (clubNaam) {
    const mijn = sleutel(clubNaam)
    const titels: (EreBord & { j: number })[] = data.kampioenenSeizoenen.flatMap((s) =>
      s.reeksen
        .filter((r) => !isPlaceholder(r.kampioen) && sleutel(r.kampioen) === mijn)
        .map((r) => ({ soort: 'titel' as const, jaar: s.seizoen, kop: 'KAMPIOEN', tekst: r.reeksNaam, j: jaarVan(s.seizoen) })),
    )
    const bekers: (EreBord & { j: number })[] = data.bekerwinnaarsSeizoenen.flatMap((s) =>
      s.winnaars
        .filter((w) => !isPlaceholder(w.ploeg) && sleutel(w.ploeg) === mijn)
        .map((w) => ({ soort: 'beker' as const, jaar: s.seizoen, kop: 'BEKERWINNAAR', tekst: w.categorie, j: jaarVan(s.seizoen) })),
    )
    const laureaten: (EreBord & { j: number })[] = data.referendumPrijzen.flatMap((p) =>
      p.winnaars
        .filter((w) => !isPlaceholder(w.naam) && !isPlaceholder(w.club) && sleutel(w.club) === mijn)
        .map((w) => ({ soort: 'referendum' as const, jaar: w.jaar, kop: p.prijs.toUpperCase(), tekst: w.naam, j: Number(w.jaar) || 0 })),
    )
    const alles = [...titels, ...bekers, ...laureaten]
    if (alles.length > 0) {
      return {
        eigen: true,
        kop: `HALL OF FAME · ${canoniekeClubNaam(clubNaam).toUpperCase()}`,
        totaal: [meervoud(titels.length, 'titel', 'titels'), meervoud(bekers.length, 'beker', 'bekers'), meervoud(laureaten.length, 'laureaat', 'laureaten')].join(' · '),
        borden: alles
          .sort((a, b) => b.j - a.j)
          .slice(0, max)
          .map(({ j: _j, ...b }) => b),
      }
    }
  }
  // Geen club of nog geen prijzen: de recentste kampioenen van de federatie.
  const recent: EreBord[] = data.kampioenenSeizoenen
    .flatMap((s) =>
      s.reeksen
        .filter((r) => !isPlaceholder(r.kampioen))
        .map((r) => ({ soort: 'titel' as const, jaar: s.seizoen, kop: canoniekeClubNaam(r.kampioen).toUpperCase(), tekst: `Kampioen ${r.reeksNaam}`, j: jaarVan(s.seizoen) })),
    )
    .sort((a, b) => b.j - a.j)
    .slice(0, max)
    .map(({ j: _j, ...b }) => b)
  if (recent.length === 0) return null
  return { eigen: false, kop: 'HALL OF FAME · KRACHTBAL', totaal: 'De recentste kampioenen van de federatie', borden: recent }
}
