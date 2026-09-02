// Is deze pagina persoonlijk (voor een ingelogde bezoeker gerenderd)?
//
// Waarom dat uitmaakt. De service worker bewaart elke bezochte pagina, zodat je offline nog
// iets ziet. Tijdens een uitrol is de server een halve minuut weg — en dan valt een pagina die
// je opent terug op die opgeslagen kopie. Was die kopie ooit gemaakt vóór je inlogde, dan sta
// je plots weer als uitgelogd op het scherm, terwijl je sessie gewoon nog geldig is. Precies
// het effect dat "een update logt me af" heet.
//
// De service worker kan de sessiecookie zelf niet lezen (die is httpOnly, en dat hoort zo). De
// server weet het wél, en zet daarom een kopje op het antwoord. Zo hoeft de worker alleen nog
// te kijken of dat kopje er staat.

/** Het kopje waarmee de server een persoonlijke pagina markeert. */
export const PRIVE_HEADER = 'x-kb-prive'

/** De naam van Payload's sessiecookie. */
export const SESSIE_COOKIE = 'payload-token'

/**
 * Draagt deze cookie-header een sessie?
 *
 * Puur en losstaand, zodat de randgevallen te testen zijn: een cookie die alleen maar zó heet
 * (`niet-payload-token`), een lege waarde (dat is een uitgelogde bezoeker — Payload wist de
 * cookie door hem leeg te zetten), en meerdere cookies achter elkaar.
 */
export function heeftSessie(cookieHeader: string | null | undefined): boolean {
  if (!cookieHeader) return false
  for (const stuk of cookieHeader.split(';')) {
    const [naam, ...rest] = stuk.trim().split('=')
    if (naam !== SESSIE_COOKIE) continue
    if (rest.join('=').trim() !== '') return true
  }
  return false
}
