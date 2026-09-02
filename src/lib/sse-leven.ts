// Blijft deze livestream nog leven?
//
// Het probleem dat dit oplost. Een gsm die in slaapstand gaat, verbreekt zijn verbindingen —
// maar niet netjes. De browser krijgt vaak géén foutmelding: de socket blijft "open" terwijl er
// niets meer door komt. Aan een aantekentafel is dat het gevaarlijkst wat er is: het scherm
// toont een stand die niet meer klopt, en niemand ziet dat er iets mis is.
//
// Daarom stuurt elke SSE-route een hartslag als een écht event (niet als een commentaarregel:
// die ziet de browser wel, maar JavaScript niet). Zo kan de client meten wanneer hij voor het
// laatst iets gehoord heeft, en opnieuw verbinden als het te lang stil blijft.

/** Hoe vaak de server een hartslag stuurt. */
export const HARTSLAG_MS = 15_000

/**
 * Te lang niets gehoord? Dan is de verbinding dood, ook al zegt de browser van niet.
 *
 * Drie hartslagen ruim: één gemiste hartslag is een hik op een 4G-verbinding, drie na elkaar is
 * een verbinding die niet meer bestaat. Te streng zetten kost een herverbinding bij elke hik, en
 * elke herverbinding is een nieuw verzoek naar de server — met honderd schermen op een tornooi
 * telt dat.
 */
export function verbindingDood(laatsteMs: number, nuMs: number, hartslagMs: number = HARTSLAG_MS): boolean {
  if (!Number.isFinite(laatsteMs) || laatsteMs <= 0) return false
  return nuMs - laatsteMs > hartslagMs * 3
}

/**
 * Net wakker geworden: moet de verbinding meteen opnieuw?
 *
 * Ja, tenzij we zonet nog iets gehoord hebben. Een scherm dat een halve minuut in de zak zat,
 * heeft mogelijk een halve wedstrijd gemist; opnieuw verbinden kost één verzoek en levert
 * meteen de huidige stand op (de server stuurt die bij het aansluiten mee).
 */
export function moetHerverbindenNaWake(laatsteMs: number, nuMs: number, marge = 10_000): boolean {
  if (!Number.isFinite(laatsteMs) || laatsteMs <= 0) return true
  return nuMs - laatsteMs > marge
}
