// Wanneer nodigen we iemand uit om de app te installeren?
//
// De site ís al een PWA: manifest, service worker, iconen, push. Alleen wéét niemand dat. Android
// vuurt `beforeinstallprompt` af en wacht tot wij er iets mee doen; doen we niets, dan gebeurt er
// ook niets. Op iOS bestaat die uitnodiging niet eens — daar moet je zelf uitleggen dat het via
// Deel → "Zet op beginscherm" gaat.
//
// Waarom het de moeite is om dat wél te doen:
//   • een geïnstalleerde app opent zonder browserbalk — op een gsm scheelt dat een halve
//     scorebordhoogte;
//   • ze staat tussen de andere apps, dus je vindt ze terug op een tornooidag;
//   • en op iOS werkt PUSH enkel in een geïnstalleerde app. Zolang iemand de site in Safari
//     bezoekt, kan hij geen enkele melding krijgen — dat is geen detail maar de reden waarom
//     supporters denken dat meldingen kapot zijn.
//
// Wat hier NIET gebeurt: zeuren. Wie de uitnodiging wegklikt, is er een tijd van af. En wie de app
// al geïnstalleerd heeft, ziet ze nooit.

/** Hoelang een weggeklikte uitnodiging weg blijft. Lang genoeg om niet te zeuren. */
export const RUST_MS = 30 * 24 * 3600_000

/** De sleutel waaronder het wegklikken bewaard wordt. */
export const RUST_SLEUTEL = 'kb-installatie-weg'

export type InstallatieStand = {
  /** Draait de app al als geïnstalleerde app (standalone)? */
  standalone: boolean
  /** Is dit iOS? Daar bestaat geen installatie-uitnodiging; het gaat via het deelmenu. */
  ios: boolean
  /** Heeft de browser ons een installatie-uitnodiging aangeboden (beforeinstallprompt)? */
  aangeboden: boolean
  /** Wanneer klikte deze bezoeker de uitnodiging weg (ms sinds 1970), of null. */
  weggeklikt: number | null
  nu: number
}

export type Uitnodiging = 'geen' | 'knop' | 'ios-uitleg'

/**
 * Welke uitnodiging tonen we?
 *
 * - `knop` — de browser bood zelf een installatie aan; één tik volstaat.
 * - `ios-uitleg` — iOS kent die uitnodiging niet, dus leggen we de twee stappen uit.
 * - `geen` — al geïnstalleerd, recent weggeklikt, of er valt niets aan te bieden.
 */
export function welkeUitnodiging(s: InstallatieStand): Uitnodiging {
  // Al geïnstalleerd: nooit iets tonen. Dit is de belangrijkste tak — een app die je vraagt zich
  // te installeren terwijl je ín die app zit, voelt kapot.
  if (s.standalone) return 'geen'
  if (s.weggeklikt != null && s.nu - s.weggeklikt < RUST_MS) return 'geen'
  if (s.aangeboden) return 'knop'
  if (s.ios) return 'ios-uitleg'
  return 'geen'
}

/** Leest het tijdstip van het wegklikken uit de opslag; rommel telt als "nooit weggeklikt". */
export function leesWeggeklikt(ruw: string | null): number | null {
  if (!ruw) return null
  const n = Number(ruw)
  return Number.isFinite(n) && n > 0 ? n : null
}
