import { demoReferendumKlaarzetten } from '@/lib/demoruimte/referendum'
import { cookieUitVerzoek, demoToegang, TOEGANG_COOKIE } from '@/lib/demoruimte/toegang'
import { getPayloadClient } from '@/lib/payload-client'

// Referendum resetten in de demoruimte: stemmen en bekendgemaakte prijzen van het demoseizoen weg,
// een verse open ronde met de stemmen van andere spelers (lib/demoruimte/referendum.ts). Enkel in de
// demo-omgeving; de rest van de demowereld blijft staan.
export async function POST(req: Request) {
  if (!demoToegang(cookieUitVerzoek(req, TOEGANG_COOKIE))) return Response.json({ error: 'Geen toegang tot de demoruimte.' }, { status: 404 })
  try {
    const payload = await getPayloadClient()
    return Response.json({ ok: true, melding: await demoReferendumKlaarzetten(payload) })
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : 'Resetten mislukt.' }, { status: 409 })
  }
}
