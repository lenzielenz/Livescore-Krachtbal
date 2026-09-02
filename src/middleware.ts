import { NextResponse, type NextRequest } from 'next/server'

import { PRIVE_HEADER, heeftSessie } from './lib/prive-pagina'

// Markeert pagina's die voor een ingelogde bezoeker gerenderd zijn.
//
// Meer doet deze middleware niet: één kopje op het antwoord, geen omleidingen, geen
// database. De service worker gebruikt het om zo'n pagina níét te bewaren — anders krijg je
// tijdens een uitrol (server even weg) een oude kopie te zien waarop je uitgelogd lijkt,
// terwijl je sessie gewoon nog geldig is. Zie `public/sw.js` en `lib/prive-pagina.ts`.
export function middleware(req: NextRequest) {
  const res = NextResponse.next()
  if (heeftSessie(req.headers.get('cookie'))) res.headers.set(PRIVE_HEADER, '1')
  return res
}

export const config = {
  // Enkel echte pagina's en API-antwoorden; statische bestanden hebben geen sessie en zouden
  // deze middleware alleen maar werk geven.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon|manifest.webmanifest|sw.js).*)'],
}
