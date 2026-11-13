import { afronden, basisUrl, isDienst, type Poging, veiligPad } from '@/lib/oauth'
import { aanmelden } from '@/lib/oauth-login'
import { getPayloadClient } from '@/lib/payload-client'
import { clientIp, rateLimit } from '@/lib/sse-hub'

// Stap 2: de dienst stuurt de gebruiker terug met een code (Google en Microsoft met GET, Apple met een
// POST-formulier). Controleer state tegen het cookie, ruil de code in, controleer het id-token, vind of
// maak het account (lib/oauth-login.ts) en zet dezelfde sessie als het gewone inloggen.

const terug = (req: Request, pad: string, cookies: string[] = []) => {
  // Achter de proxy is req.url het interne adres: de publieke basis-URL gebruiken.
  const h = new Headers({ Location: `${basisUrl(req)}${pad}`, 'Cache-Control': 'no-store' })
  for (const c of cookies) h.append('Set-Cookie', c)
  return new Response(null, { status: 303, headers: h })
}
// Na het inloggen niet rechtstreeks met een 303 naar de bestemming: die navigatie komt dan van de dienst
// (Sec-Fetch-Site: cross-site), en Payload aanvaardt het sessiecookie daar niet (CSRF-regel). Een korte
// pagina op ons eigen domein stuurt door; die navigatie is same-origin, en de eerste pagina toont je
// meteen ingelogd.
const doorsturen = (pad: string, cookies: string[]) => {
  const html = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
  const h = new Headers({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
  for (const c of cookies) h.append('Set-Cookie', c)
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${html(pad)}"><title>Ingelogd</title><p>Je bent ingelogd. <a href="${html(pad)}">Verder</a></p><script>location.replace(${JSON.stringify(pad)})</script>`,
    { status: 200, headers: h },
  )
}
const fout = (req: Request, dienst: string, tekst: string) =>
  terug(req, `/inloggen?fout=${encodeURIComponent(tekst.slice(0, 200))}`, [`kb-oauth-${dienst}=; Path=/api/auth/oauth; Max-Age=0; HttpOnly; Secure; SameSite=Lax`])

function leesPoging(req: Request, dienst: string): Poging | null {
  const cookie = req.headers.get('cookie') ?? ''
  const m = cookie.match(new RegExp(`(?:^|;\\s*)kb-oauth-${dienst}=([^;]+)`))
  if (!m) return null
  try {
    const p = JSON.parse(Buffer.from(m[1]!, 'base64url').toString('utf8')) as Poging
    return p && p.dienst === dienst && typeof p.state === 'string' ? p : null
  } catch {
    return null
  }
}

async function verwerk(req: Request, dienst: string, velden: URLSearchParams) {
  if (!isDienst(dienst)) return fout(req, dienst, 'Onbekende dienst.')
  if (!rateLimit(`oauth-terug:${clientIp(req)}`, 20, 60_000)) return fout(req, dienst, 'Te veel pogingen, probeer zo dadelijk opnieuw.')
  if (velden.get('error')) return fout(req, dienst, velden.get('error') === 'access_denied' || velden.get('error') === 'user_cancelled_authorize' ? 'Aanmelden geannuleerd.' : 'De dienst weigerde de aanmelding.')
  const poging = leesPoging(req, dienst)
  const code = velden.get('code')
  if (!poging || !code || velden.get('state') !== poging.state) return fout(req, dienst, 'De aanmelding is verlopen of ongeldig. Probeer opnieuw.')
  try {
    const identiteit = await afronden(req, poging, code)
    // Apple geeft de naam enkel de allereerste keer mee, los van het token.
    if (dienst === 'apple' && !identiteit.naam && velden.get('user')) {
      try {
        const n = (JSON.parse(String(velden.get('user'))) as { name?: { firstName?: string; lastName?: string } }).name
        const naam = `${n?.firstName ?? ''} ${n?.lastName ?? ''}`.trim()
        if (naam) identiteit.naam = naam
      } catch {
        /* geen naam, geen probleem */
      }
    }
    const payload = await getPayloadClient()
    const r = await aanmelden(payload, identiteit)
    if (!r.ok) return fout(req, dienst, r.error)
    return doorsturen(veiligPad(poging.next), [r.cookie, `kb-oauth-${dienst}=; Path=/api/auth/oauth; Max-Age=0; HttpOnly; Secure; SameSite=Lax`])
  } catch (err) {
    console.error(`oauth ${dienst}:`, (err as Error).message)
    return fout(req, dienst, (err as Error).message.startsWith('De aanmelding') ? (err as Error).message : 'Aanmelden lukte niet. Probeer opnieuw of log in met je wachtwoord.')
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ dienst: string }> }) {
  return verwerk(req, (await params).dienst, new URL(req.url).searchParams)
}

export async function POST(req: Request, { params }: { params: Promise<{ dienst: string }> }) {
  const form = await req.formData().catch(() => null)
  const velden = new URLSearchParams()
  if (form) for (const [k, v] of form.entries()) if (typeof v === 'string') velden.set(k, v)
  return verwerk(req, (await params).dienst, velden)
}
