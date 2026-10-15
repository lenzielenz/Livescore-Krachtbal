import { userClubId } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { HARTSLAG_MS } from '@/lib/sse-leven'
import { SSE_HEADERS, acquireConnection, clientIp, releaseConnection, subscribe } from '@/lib/sse-hub'
import { aanwezig } from '@/lib/virtueel-aanwezig'
import { gebeurtenissen } from '@/lib/virtueel-praat'

export const dynamic = 'force-dynamic'

// De supporters van je club die nu in het virtuele stadion rondlopen, en wat ze elkaar toeroepen
// of geven, live (SSE). Eén gedeelde
// poller per club (sse-hub.ts) leest de lijst uit het geheugen en stuurt hem naar iedereen die
// kijkt; enkel ingelogde leden van die club krijgen hem (de posities zijn niet publiek).

export async function GET(req: Request) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return new Response('Niet ingelogd.', { status: 401 })
  const club = userClubId(user)
  if (club == null) return new Response('Geen club.', { status: 403 })
  const ip = clientIp(req)
  if (!acquireConnection(ip)) return new Response('Te veel gelijktijdige verbindingen.', { status: 429 })

  const encoder = new TextEncoder()
  let opgeruimd = false
  let uit: (() => void) | null = null
  let hartslag: ReturnType<typeof setInterval> | null = null
  let ruimOp: () => void = () => {}
  const stream = new ReadableStream({
    start(controller) {
      const stuur = (s: string) => {
        if (opgeruimd) return
        try {
          controller.enqueue(encoder.encode(s))
        } catch {
          ruimOp()
        }
      }
      ruimOp = () => {
        if (opgeruimd) return
        opgeruimd = true
        uit?.()
        if (hartslag) clearInterval(hartslag)
        try {
          controller.close()
        } catch {
          /* al dicht */
        }
        releaseConnection(ip)
      }
      // Snel genoeg om vloeiend te wandelen (de client interpoleert); de lijst komt uit het geheugen.
      // Wie er is, en wat er de laatste halve minuut geroepen of gegeven werd (virtueel-praat.ts).
      uit = subscribe(
        `virtueel-aanwezig:${club}`,
        async () => ({ aanwezig: aanwezig(String(club)), gebeurtenissen: gebeurtenissen(String(club)) }),
        (f) => stuur(`event: aanwezig\ndata: ${JSON.stringify(f.data)}\n\n`),
        400,
      )
      hartslag = setInterval(() => stuur(`event: ping\ndata: {}\n\n`), HARTSLAG_MS)
      req.signal.addEventListener('abort', ruimOp)
    },
    cancel() {
      ruimOp()
    },
  })
  return new Response(stream, { headers: SSE_HEADERS })
}
