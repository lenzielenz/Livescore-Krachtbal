// Het ledenoverzicht van de federatie per club — hoeveel leden, wie is goedgekeurd, wie wacht op de
// federatie, wie de club nog in orde moet brengen — en de herinnering die de federatie een club
// stuurt. Puur: de pagina (/beheer/leden) en de route (/api/federatie/herinnering) halen de leden
// op; hier staat wat er geteld wordt en hoe de herinnering luidt, zodat wat je vooraf ziet exact is
// wat er verstuurd wordt.

import { KEURING_GELDIG_DAGEN } from './registratie'

export type LidToestand = 'ok' | 'wacht' | 'todo' | 'fout' | 'lid'

export type OverzichtLid = {
  id: number
  naam: string
  clubId: number | null
  clubNaam: string
  toon: LidToestand
  /** Waarom het lid niet in orde is (uit registratieIcoon / de afkeurreden). */
  reden: string
  /** Datum van de medische keuring (YYYY-MM-DD) of leeg. */
  keuringOp: string
}

export type ClubLedenRij = {
  clubId: number
  clubNaam: string
  totaal: number
  ok: number
  wacht: number
  todo: number
  afgekeurd: number
  /** Speelgerechtigd, maar de keuring verloopt binnen de termijn. */
  keuringVerloopt: number
  /** Leden die de club nog in orde moet brengen (aanvullen, afgekeurd, keuring bijna verlopen). */
  teDoen: OverzichtLid[]
}

/** Binnen hoeveel dagen een verlopende keuring meetelt in de herinnering. */
export const KEURING_HERINNER_DAGEN = 30

const dagenTot = (op: string, nu: Date) => KEURING_GELDIG_DAGEN - Math.floor((nu.getTime() - new Date(op).getTime()) / 86_400_000)

export function keuringVerlooptBinnenkort(op: string, nu: Date = new Date(), binnen = KEURING_HERINNER_DAGEN): boolean {
  if (!op) return false
  const d = dagenTot(op, nu)
  return d >= 0 && d <= binnen
}

export function ledenPerClub(leden: OverzichtLid[], nu: Date = new Date()): { clubs: ClubLedenRij[]; totaal: Omit<ClubLedenRij, 'clubId' | 'clubNaam' | 'teDoen'> } {
  const map = new Map<number, ClubLedenRij>()
  for (const l of leden) {
    if (l.clubId == null || l.toon === 'lid') continue
    const c = map.get(l.clubId) ?? { clubId: l.clubId, clubNaam: l.clubNaam, totaal: 0, ok: 0, wacht: 0, todo: 0, afgekeurd: 0, keuringVerloopt: 0, teDoen: [] }
    c.totaal += 1
    if (l.toon === 'ok') {
      c.ok += 1
      if (keuringVerlooptBinnenkort(l.keuringOp, nu)) {
        c.keuringVerloopt += 1
        c.teDoen.push(l)
      }
    } else if (l.toon === 'wacht') c.wacht += 1
    else if (l.toon === 'fout') {
      c.afgekeurd += 1
      c.teDoen.push(l)
    } else {
      c.todo += 1
      c.teDoen.push(l)
    }
    map.set(l.clubId, c)
  }
  const clubs = [...map.values()].sort((a, b) => b.teDoen.length - a.teDoen.length || a.clubNaam.localeCompare(b.clubNaam))
  const totaal = { totaal: 0, ok: 0, wacht: 0, todo: 0, afgekeurd: 0, keuringVerloopt: 0 }
  for (const c of clubs) for (const k of Object.keys(totaal) as (keyof typeof totaal)[]) totaal[k] += c[k]
  return { clubs, totaal }
}

export type Herinnering = { titel: string; tekst: string; url: string; regels: string[] }

const meervoud = (n: number, een: string, meer: string) => `${n} ${n === 1 ? een : meer}`

/**
 * De herinnering aan de clubstaf. Kort genoeg voor een pushmelding (titel + eerste zin), met de
 * volledige lijst als regels voor de meldingenbox. Null als er niets te herinneren valt.
 */
export function herinneringVoor(club: ClubLedenRij, nu: Date = new Date()): Herinnering | null {
  if (club.teDoen.length === 0) return null
  const regels = club.teDoen.map((l) => {
    if (l.toon === 'ok') {
      const d = dagenTot(l.keuringOp, nu)
      return `${l.naam} — medische keuring verloopt ${d === 0 ? 'vandaag' : d === 1 ? 'morgen' : `over ${d} dagen`}`
    }
    if (l.toon === 'fout') return `${l.naam} — afgekeurd${l.reden ? `: ${l.reden}` : ''}`
    return `${l.naam} — ${l.reden || 'nog aan te vullen'}`
  })
  const delen = [
    club.todo && meervoud(club.todo, 'lid nog aan te vullen of in te dienen', 'leden nog aan te vullen of in te dienen'),
    club.afgekeurd && meervoud(club.afgekeurd, 'lid afgekeurd', 'leden afgekeurd'),
    club.keuringVerloopt && meervoud(club.keuringVerloopt, 'keuring verloopt binnenkort', 'keuringen verlopen binnenkort'),
  ].filter(Boolean)
  return {
    titel: `Herinnering van de federatie: ${meervoud(club.teDoen.length, 'lid', 'leden')} niet in orde`,
    tekst: `${club.clubNaam}: ${delen.join(', ')}. Wie niet in orde is, kan niet opgesteld worden.`,
    url: '/club/leden',
    regels,
  }
}

/** De tekst zoals ze in de meldingenbox komt: de samenvatting en daaronder per lid wat ontbreekt. */
export function herinneringTekst(h: Herinnering): string {
  return [h.tekst, ...h.regels.map((r) => `• ${r}`)].join('\n')
}
