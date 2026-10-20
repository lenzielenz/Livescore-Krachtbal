import { NextResponse, type NextRequest } from 'next/server'

import { verborgenInDemo } from './lib/omgeving'
import { normaliseerPad } from './lib/pad-normaliseren'
import { PRIVE_HEADER, heeftSessie, isSchermPagina } from './lib/prive-pagina'

/**
 * Payload's eigen wachtwoord-endpoints, die met de REST-API meegemount worden.
 *
 * Ze staan publiek open en doen géén access-check — dat is Payload's ontwerp, maar het botst
 * met de weg die dit platform kiest:
 *
 *  • /api/users/forgot-password zou voor elk opgegeven adres een herstel-token aanmaken en de
 *    mail door de console-adapter laten schrijven: de token belandt dan in de serverlogs, en
 *    iedereen kan die lus ongelimiteerd aanroepen. Hier maakt een beheerder de herstellink
 *    (POST /api/admin/users/herstellink), niemand anders.
 *  • /api/users/reset-password werkt wél met een geldige token, maar mist wat onze eigen route
 *    er omheen zet: rate limiting, de minimumlengte van acht tekens (Payload eist er drie) en
 *    het intrekken van bestaande sessies. Eén achterdeur zonder die drie dingen maakt de
 *    voordeur zinloos.
 *
 * Vandaar dat ze hier dichtgaan. De vervanger staat in het antwoord, zodat wie ze toch
 * aanroept niet tegen een raadselachtige 404 loopt.
 *
 * LET OP bij het vergelijken: `nextUrl.pathname` is het RAUWE pad. Next decodeert de segmenten pas
 * bij het routeren en Payload bouwt het endpoint daarna opnieuw op uit die gedecodeerde delen, dus
 * `/api/users/forgot%2Dpassword` komt gewoon bij hetzelfde endpoint uit. Een vergelijking op de
 * letterlijke string laat dat door. Daarom normaliseren we eerst — zie lib/pad-normaliseren.ts.
 */
const DICHT: Record<string, string> = {
  '/api/users/forgot-password': 'Een herstellink vraag je aan bij je beheerder (zie /wachtwoord-vergeten).',
  '/api/users/reset-password': 'Gebruik de herstellink die je van je beheerder kreeg (/wachtwoord-herstellen).',
}

export function middleware(req: NextRequest) {
  const pad = normaliseerPad(req.nextUrl.pathname)
  const dicht = DICHT[pad]
  // Elke methode, niet enkel POST: een endpoint dat hier niet hoort te bestaan, bestaat ook niet
  // voor GET of PUT.
  if (dicht) {
    return NextResponse.json({ error: dicht }, { status: 404 })
  }
  // Payload's admin heeft een eigen "Wachtwoord vergeten"-scherm dat op datzelfde endpoint post.
  // Dat scherm laten staan zou een formulier zijn dat gegarandeerd faalt; stuur wie erop klikt
  // naar de uitleg die wél klopt.
  if (pad === '/admin/forgot') {
    return NextResponse.redirect(new URL('/wachtwoord-vergeten', req.url))
  }
  // Demoruimte: het virtuele stadion en het trainingsluik horen niet bij de voorstelling.
  if (verborgenInDemo(pad)) {
    return NextResponse.redirect(new URL('/demoruimte', req.url))
  }
  const res = NextResponse.next()
  // Een kantine- of tornooischerm blijft openbaar, ook wanneer de tv een sessiecookie draagt:
  // er staat niets persoonlijks op, en zó blijft de bewaarde kopie beschikbaar tijdens een
  // uitrol. Zonder deze uitzondering viel elke tv die ooit ingelogd was bij een merge terug op
  // de offline-pagina (zie isSchermPagina).
  //
  // Op `pad` en niet op de rauwe pathname, om dezelfde reden als hierboven: dat is de vorm
  // waarin de router de pagina uiteindelijk ziet.
  if (!isSchermPagina(pad) && heeftSessie(req.headers.get('cookie'))) {
    res.headers.set(PRIVE_HEADER, '1')
  }
  return res
}

export const config = {
  // Enkel echte pagina's en API-antwoorden; statische bestanden hebben geen sessie en zouden
  // deze middleware alleen maar werk geven.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon|manifest.webmanifest|sw.js).*)'],
}
