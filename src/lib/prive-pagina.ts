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

/**
 * Is dit een schermpagina — een tv die ergens aan de muur hangt?
 *
 * Zulke pagina's tonen nooit iets persoonlijks: ze halen hun wedstrijden uit een openbare feed
 * met een id in de URL. Ze mogen dus NIET als persoonlijk gemarkeerd worden, ook niet wanneer de
 * browser toevallig een sessiecookie draagt — en dat is precies wat er misging. Wie zijn scherm
 * op de kantine-tv instelt, doet dat ingelogd, dus die tv draagt een sessie. Gevolg: de pagina
 * kreeg het privé-kopje, de service worker weigerde ze te bewaren, en bij elke uitrol (de server
 * is dan een halve minuut weg) viel de tv terug op de offline-pagina in plaats van op de stand.
 *
 * Robin, 2026-09-06: "ik wil dat de link van het kantinescherm actief blijft, zelfs nadat ik een
 * nieuwe merge heb doorgevoerd."
 *
 * Let op bij uitbreiden: enkel paden waar écht niets persoonlijks op staat. Een pagina die wél
 * per bezoeker verschilt en hier zou belanden, wordt bewaard en straks aan iemand anders getoond.
 * De kiespagina /kantine hoort er daarom NIET bij: die toont jouw eigen keuze.
 */
export function isSchermPagina(pathname: string): boolean {
  if (pathname === '/kantine/scherm' || pathname.startsWith('/kantine/scherm/')) return true
  if (pathname.startsWith('/kantine/club/')) return true
  // Tornooi-kantineschermen: dezelfde tv, andere dag.
  if (/^\/tornooi\/[^/]+\/kantine\/?$/.test(pathname)) return true
  if (/^\/tornooi\/groep\/[^/]+\/kantine\/?$/.test(pathname)) return true
  // De Chromecast-ontvanger laadt zélf een scherm; die is per definitie onpersoonlijk.
  if (pathname === '/cast-tv' || pathname.startsWith('/cast-tv/')) return true
  return false
}
