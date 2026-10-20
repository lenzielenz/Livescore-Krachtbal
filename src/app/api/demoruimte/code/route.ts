import { codeHash, cookieRegel, codeNodig, TOEGANG_COOKIE } from '@/lib/demoruimte/toegang'
import { isDemoOmgeving } from '@/lib/omgeving'

// De toegangscode van de demoruimte (DEMO_TOEGANGSCODE) ingeven: juist → cookie voor 30 dagen.
export async function POST(req: Request) {
  if (!isDemoOmgeving()) return Response.json({ error: 'Enkel in de demo-omgeving.' }, { status: 404 })
  const body = (await req.json().catch(() => ({}))) as { code?: unknown }
  const juist = !codeNodig() || codeHash(String(body.code ?? '')) === codeHash(process.env.DEMO_TOEGANGSCODE ?? '')
  if (!juist) return Response.json({ error: 'Die code klopt niet.' }, { status: 403 })
  const res = Response.json({ ok: true })
  res.headers.append('Set-Cookie', cookieRegel(TOEGANG_COOKIE, codeHash(String(body.code ?? '')), 30 * 86_400))
  return res
}
