// Supporterspraat in het virtuele stadion: supporters van dezelfde club die er samen zijn, kunnen
// elkaar iets toeroepen en elkaar kledij geven. Het stadion is er vooral voor de jeugd, dus er is
// geen vrije tekst (niets te modereren, niets ongepasts): je kiest uit vaste, positieve
// supportersberichten. Een bericht is vluchtig (enkel in het geheugen, een halve minuut), net als
// de aanwezigheid (virtueel-aanwezig.ts); een geschenk is wel een blijvend spoor
// (virtueel-sporen.ts), want het verandert wie wat bezit.
//
// (Eén instantie: voor meerdere servers hoort dit, net als de hub, achter Redis pub/sub.)

/** De berichten die je kan roepen. `{club}` wordt de clubnaam. */
export const ROEPEN = [
  { id: 'hallo', tekst: '👋 Hallo!' },
  { id: 'welkom', tekst: '🙌 Welkom in het stadion!' },
  { id: 'allez', tekst: '📣 Allez, allez, {club}!' },
  { id: 'komop', tekst: '💪 Kom op, we kunnen dit!' },
  { id: 'ole', tekst: '🎶 Olé, olé, olé!' },
  { id: 'sfeer', tekst: '🔥 Wat een sfeer hier!' },
  { id: 'bravo', tekst: '👏 Goed gedaan!' },
  { id: 'proficiat', tekst: '🎉 Proficiat!' },
  { id: 'outfit', tekst: '🧣 Mooie outfit!' },
  { id: 'goud', tekst: '🟡 Zoeken we samen gouden ballen?' },
  { id: 'volg', tekst: '👀 Volg mij!' },
  { id: 'ruil', tekst: '🎁 Zullen we ruilen?' },
  { id: 'dank', tekst: '🙏 Dankjewel!' },
  { id: 'haha', tekst: '😂 Haha!' },
  { id: 'tot', tekst: '👋 Tot de volgende match!' },
] as const

export type RoepId = (typeof ROEPEN)[number]['id']
export const roepTekst = (id: string, club = 'onze club') => (ROEPEN.find((r) => r.id === id)?.tekst ?? '').replace('{club}', club)
export const isRoep = (v: unknown): v is RoepId => typeof v === 'string' && ROEPEN.some((r) => r.id === v)

/** Iets wat in het stadion gebeurt en dat iedereen van de club meteen ziet. */
export type Gebeurtenis =
  | { soort: 'roep'; id: string; t: number; van: string; vanNaam: string; roep: RoepId; aan?: string; aanNaam?: string }
  | { soort: 'geschenk'; id: string; t: number; van: string; vanNaam: string; aan: string; aanNaam: string; artikel: string }

/** Een gebeurtenis zonder id en tijd (die geeft het logboek). */
export type NieuweGebeurtenis = Gebeurtenis extends infer G ? (G extends Gebeurtenis ? Omit<G, 'id' | 't'> : never) : never

/** Hoe lang een gebeurtenis meegaat in de stream (ms). */
export const ONTHOUD = 30_000
/** Hoeveel gebeurtenissen we per club hoogstens bijhouden. */
export const MAX_GEBEURTENISSEN = 30

const logboek = new Map<string, Gebeurtenis[]>()
let teller = 0

/** Voeg een gebeurtenis toe aan het logboek van een club. */
export function meldGebeurtenis(club: string, g: NieuweGebeurtenis, nu = Date.now()): Gebeurtenis {
  const lijst = logboek.get(club) ?? []
  const volledig = { ...g, id: `${nu.toString(36)}-${(teller++).toString(36)}`, t: nu } as Gebeurtenis
  lijst.push(volledig)
  logboek.set(club, lijst.filter((x) => nu - x.t < ONTHOUD).slice(-MAX_GEBEURTENISSEN))
  return volledig
}

/** De gebeurtenissen van de laatste halve minuut (oudste eerst). */
export function gebeurtenissen(club: string, nu = Date.now()): Gebeurtenis[] {
  const lijst = (logboek.get(club) ?? []).filter((x) => nu - x.t < ONTHOUD)
  if (lijst.length) logboek.set(club, lijst)
  else logboek.delete(club)
  return lijst
}

/** Voor de tests: alles vergeten. */
export function vergeetPraat(): void {
  logboek.clear()
}

/** Wat de kijker van een gebeurtenis te zien krijgt (een regel in de praat-strook). */
export function gebeurtenisTekst(g: Gebeurtenis, ik: string | null, club: string): string {
  const van = g.van === ik ? 'Jij' : g.vanNaam
  if (g.soort === 'roep') {
    const aan = g.aan ? (g.aan === ik ? ' (aan jou)' : ` (aan ${g.aanNaam})`) : ''
    return `${van}${aan}: ${roepTekst(g.roep, club)}`
  }
  const aan = g.aan === ik ? 'jou' : g.aanNaam
  return `🎁 ${van} ${g.van === ik ? 'gaf' : 'geeft'} ${aan} een cadeau: ${g.artikel}`
}
