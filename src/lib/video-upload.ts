// Een wedstrijdvideo in stukken uploaden.
//
// Waarom dit bestaat. Een volledige wedstrijd is honderden megabytes, en die gingen in één
// verzoek naar de server. Eén verzoek betekent één verbinding die van de eerste tot de laatste
// byte moet houden — minutenlang, vanaf een telefoon, over wifi of mobiele data. Valt die weg,
// dan is álles weg en staat er "Uploaden mislukt (verbinding)" zonder dat iemand weet hoever hij
// geraakt was.
//
// In stukken van een paar megabyte kost een weggevallen verbinding hoogstens dat ene stuk: het
// wordt opnieuw geprobeerd, en de rest van wat al op de server staat blijft staan. Kiest de
// gebruiker later opnieuw hetzelfde bestand, dan pikt de upload de draad op waar hij stopte.
//
// De maten hieronder zijn een afweging. Kleinere stukken herstellen sneller van een hapering maar
// kosten meer verzoeken (en dus meer overhead); grotere stukken zijn efficiënter maar gooien bij
// een val meer weg. Vier megabyte is ongeveer twee seconden op een matige verbinding.

/** Grootte van één stuk. */
export const STUK_BYTES = 4 * 1024 * 1024

/** Hoe vaak één stuk opnieuw geprobeerd wordt vóór de upload opgeeft. */
export const POGINGEN_PER_STUK = 4

/** Een upload-id is enkel hex: het wordt een bestandsnaam op de server. */
export const UPLOAD_ID = /^[0-9a-f]{8,64}$/

/** Klopt dit id, en is het veilig als bestandsnaam? */
export function geldigUploadId(id: unknown): id is string {
  return typeof id === 'string' && UPLOAD_ID.test(id)
}

/** In hoeveel stukken valt dit bestand uiteen? */
export function aantalStukken(bytes: number, stuk = STUK_BYTES): number {
  if (bytes <= 0) return 0
  return Math.ceil(bytes / stuk)
}

/** Het bereik van stuk `i` (begin tot einde, einde niet inbegrepen). */
export function stukBereik(i: number, bytes: number, stuk = STUK_BYTES): { van: number; tot: number } {
  const van = Math.min(i * stuk, bytes)
  return { van, tot: Math.min(van + stuk, bytes) }
}

/**
 * Vanaf welk stuk moet er nog geüpload worden, gegeven wat de server al heeft?
 *
 * De server telt bytes, de client denkt in stukken. Alleen een compleet stuk telt: staat er 6 MB
 * van 4 MB-stukken, dan is stuk 0 rond en zit stuk 1 halverwege — dat halve stuk gaat opnieuw,
 * want de server plakt stukken aan elkaar en kan niet halverwege beginnen.
 */
export function hervatVanafStuk(alGeschreven: number, stuk = STUK_BYTES): number {
  if (!Number.isFinite(alGeschreven) || alGeschreven <= 0) return 0
  return Math.floor(alGeschreven / stuk)
}

/** Hoeveel bytes de server mag houden bij het hervatten: enkel hele stukken. */
export function hervatBytes(alGeschreven: number, stuk = STUK_BYTES): number {
  return hervatVanafStuk(alGeschreven, stuk) * stuk
}

/**
 * Wachttijd vóór een nieuwe poging op hetzelfde stuk (ms).
 *
 * Oplopend, want een verbinding die net wegviel is er een seconde later meestal nog niet. Niet
 * eindeloos oplopend: na een halve minuut heeft wachten geen zin meer en moet de gebruiker het
 * gewoon te horen krijgen.
 */
export function wachtNaPoging(poging: number): number {
  return Math.min(8000, 500 * 2 ** Math.max(0, poging))
}

/**
 * Een vaste sleutel voor dít bestand bij déze wedstrijd.
 *
 * Hierop hangt het hervatten: kiest iemand later hetzelfde bestand opnieuw, dan komt hij op
 * dezelfde sleutel uit en gaat de upload verder. Naam, grootte én wijzigingsdatum zitten erin,
 * zodat een ánder bestand (of een opnieuw geëxporteerde versie) een verse upload begint in plaats
 * van achter de vorige geplakt te worden — dat zou een onspeelbare video geven.
 *
 * Het match-id zit er ook in: twee mensen die toevallig hetzelfde bestand naar een verschillende
 * wedstrijd sturen, mogen elkaars halve upload niet erven.
 */
export async function bestandsSleutel(
  bestand: { name: string; size: number; lastModified?: number },
  matchId: number,
): Promise<string> {
  const bron = `${matchId}|${bestand.name}|${bestand.size}|${bestand.lastModified ?? 0}`
  const subtle = globalThis.crypto?.subtle
  if (subtle) {
    const hash = await subtle.digest('SHA-256', new TextEncoder().encode(bron))
    return [...new Uint8Array(hash)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('')
  }
  // Zonder Web Crypto (een oude browser, of buiten een beveiligde context): een eenvoudige hash.
  // Ze hoeft niet geheim te zijn, enkel stabiel en botsingsarm genoeg voor een bestandsnaam.
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < bron.length; i++) {
    h1 = Math.imul(h1 ^ bron.charCodeAt(i), 0x01000193) >>> 0
    h2 = Math.imul(h2 + bron.charCodeAt(i), 0x85ebca6b) >>> 0
  }
  return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).padStart(16, '0')
}

/** Leesbare stand tijdens het uploaden. */
export function uploadTekst(gedaan: number, totaal: number): string {
  const pct = totaal > 0 ? Math.round((gedaan / totaal) * 100) : 0
  const mb = (n: number) => (n / (1024 * 1024)).toFixed(0)
  return `${pct}% — ${mb(gedaan)} van ${mb(totaal)} MB`
}

/**
 * Wat de gebruiker te lezen krijgt als het misgaat, mét hoever hij geraakt was.
 *
 * "Uploaden mislukt (verbinding)" was letterlijk alles wat er stond. Of het verzoek nooit vertrok
 * of pas op 90% sneuvelde, maakt voor wat je eraan doet alle verschil — en of het zin heeft om
 * gewoon opnieuw te klikken ook.
 */
export function uploadFout(gedaan: number, totaal: number): string {
  if (gedaan <= 0) {
    return 'De upload is niet vertrokken. Controleer je verbinding en probeer opnieuw — '
      + 'er is nog niets naar de server gegaan.'
  }
  const pct = totaal > 0 ? Math.round((gedaan / totaal) * 100) : 0
  return `De verbinding viel weg op ${pct}%. Wat al geüpload was blijft bewaard: kies hetzelfde `
    + 'bestand opnieuw en de upload gaat verder waar hij stopte.'
}
