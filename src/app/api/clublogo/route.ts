import type { NextRequest } from 'next/server'

import { clubLogo } from '@/lib/clublogo-cache'
import { isBewaardLogo } from '@/lib/logo-bron'

// Serveert een extern clublogo vanaf onze eigen origin, uit de bewaarde kopie of (eenmalig)
// opgehaald bij de bron of in het webarchief. Enkel voor de vaste lijst hosts in lib/logo-bron.ts:
// geen open proxy. Zie lib/clublogo-cache.ts.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('u') ?? ''
  if (!isBewaardLogo(url)) return new Response('Onbekend logo-adres.', { status: 400 })

  const logo = await clubLogo(url)
  if (!logo) {
    // Kort cachen: komt het logo later terug (of uploadt de club er een), dan zien we dat snel.
    return new Response('Logo niet gevonden.', { status: 404, headers: { 'cache-control': 'public, max-age=600' } })
  }
  return new Response(new Uint8Array(logo.data), {
    status: 200,
    headers: {
      'content-type': logo.type,
      'cache-control': 'public, max-age=604800, stale-while-revalidate=2592000',
      'x-content-type-options': 'nosniff',
      // Een SVG van buitenaf mag als afbeelding getoond worden, maar nooit scripts draaien.
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'x-logo-bron': logo.bron,
    },
  })
}
