import { basisUrl, dienstActief, gebruiktFormPost, isDienst, startPoging } from '@/lib/oauth'
import { clientIp, rateLimit } from '@/lib/sse-hub'

// Stap 1 van "Inloggen met Google / Microsoft / Apple" (lib/oauth.ts): onthoud state, nonce en de
// PKCE-sleutel in een kortlevend, enkel-server cookie en stuur de gebruiker naar de dienst.
export async function GET(req: Request, { params }: { params: Promise<{ dienst: string }> }) {
  const { dienst } = await params
  if (!isDienst(dienst) || !dienstActief(dienst)) return Response.redirect(`${basisUrl(req)}/inloggen?fout=dienst`, 303)
  if (!rateLimit(`oauth:${clientIp(req)}`, 20, 60_000)) return Response.redirect(`${basisUrl(req)}/inloggen?fout=te-snel`, 303)
  const { url, poging } = await startPoging(req, dienst, new URL(req.url).searchParams.get('next'))
  // Apple stuurt het antwoord als POST vanaf zijn eigen domein: dan moet het cookie SameSite=None zijn.
  const sameSite = gebruiktFormPost(dienst) ? 'None' : 'Lax'
  const waarde = Buffer.from(JSON.stringify(poging)).toString('base64url')
  return new Response(null, {
    status: 303,
    headers: {
      Location: url,
      'Set-Cookie': `kb-oauth-${dienst}=${waarde}; Path=/api/auth/oauth; Max-Age=600; HttpOnly; Secure; SameSite=${sameSite}`,
      'Cache-Control': 'no-store',
    },
  })
}
