import { demoKlaarzetten } from '@/lib/demoruimte/klaarzetten'
import { cookieRegel, cookieUitVerzoek, demoToegang, TOEGANG_COOKIE } from '@/lib/demoruimte/toegang'
import { getPayloadClient } from '@/lib/payload-client'

export const maxDuration = 300

// De demowereld (opnieuw) klaarzetten: alles gewist en vers opgebouwd (lib/demoruimte/klaarzetten.ts).
// Enkel in de demo-omgeving. Daarna ben je uitgelogd (de vorige demo-accounts bestaan niet meer).
export async function POST(req: Request) {
  if (!demoToegang(cookieUitVerzoek(req, TOEGANG_COOKIE))) return Response.json({ error: 'Geen toegang tot de demoruimte.' }, { status: 404 })
  const payload = await getPayloadClient()
  const verslag = await demoKlaarzetten(payload)
  const res = Response.json(verslag, { status: verslag.ok ? 200 : 409 })
  res.headers.append('Set-Cookie', cookieRegel('payload-token', '', 0))
  return res
}
