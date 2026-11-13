import { authUser } from '@/lib/api-auth'
import { dateStrBE } from '@/lib/datetime'
import { kaartGegevens, magKaartAfdrukken } from '@/lib/medische-kaart-server'
import { relId } from '@/lib/meldingen'
import { basisUrl } from '@/lib/oauth'
import { getPayloadClient } from '@/lib/payload-client'
import { generateMedischeKaartPdf } from '@/lib/submit/pdf-medische-kaart'

// De medische kaart met QR als PDF (lib/submit/pdf-medische-kaart.ts), één blad per lid.
//   GET ?ids=1,2,3 → die leden (federatie: iedereen; club: eigen leden; lid/ouder: na "verstuurd")
//   GET            → je eigen kaart
// Elk gevraagd lid moet mogen: anders 403 voor de hele vraag (geen half document zonder uitleg).
export async function GET(req: Request) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return Response.json({ error: 'Log in om de kaart af te drukken.' }, { status: 401 })
  const q = new URL(req.url).searchParams.get('ids')
  const ids = q
    ? [...new Set(q.split(',').map(Number).filter((n) => Number.isSafeInteger(n) && n > 0))].slice(0, 300)
    : [relId((user as { player?: unknown }).player)].filter((n): n is number => n != null)
  if (!ids.length) return Response.json({ error: 'Geen lid gekozen.' }, { status: 400 })
  for (const id of ids) {
    if (!(await magKaartAfdrukken(payload, user, id))) {
      return Response.json({ error: 'Je mag niet voor al deze leden een kaart afdrukken. Een lid of ouder krijgt de kaart nadat de federatie de aanvraag verstuurde.' }, { status: 403 })
    }
  }
  const kaarten = await kaartGegevens(payload, ids, basisUrl(req))
  if (!kaarten.length) return Response.json({ error: 'Lid niet gevonden.' }, { status: 404 })
  const pdf = await generateMedischeKaartPdf(kaarten)
  const naam = kaarten.length === 1 ? `medische-kaart-${kaarten[0]!.code}` : `medische-kaarten-${dateStrBE()}`
  return new Response(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${naam}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
