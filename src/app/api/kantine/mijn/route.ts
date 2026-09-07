import { authUser } from '@/lib/api-auth'
import {
  bewaarVorm,
  MAX_PROFIELEN,
  nieuwProfielId,
  sanitizeProfielen,
  veiligeProfielnaam,
} from '@/lib/kantine-profielen'
import { sanitizeKantineSelectie } from '@/lib/kantine-selectie'
import { getPayloadClient } from '@/lib/payload-client'

export const dynamic = 'force-dynamic'

// Jouw eigen kantineschermen lezen en bewaren. Login verplicht: dit schrijft op je profiel.
// De schermen zelf (de tv's) lezen via /api/kantine/scherm/<id> en hebben géén login nodig.
//
// Een gebruiker heeft er meerdere: één voor de kantine, één voor de bestuurszaal, één bij de
// jeugdterreinen. Elk met een naam en een eigen vaste link. De oude, enkelvoudige keuze wordt bij
// het lezen omgezet naar één profiel (zie kantine-profielen.ts), zodat een tv die al hangt niet
// plots leeg loopt.

export async function GET(req: Request) {
  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    return Response.json({
      id: user.id,
      profielen: sanitizeProfielen((user as { kantineScherm?: unknown }).kantineScherm),
    })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }
  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })

    // Altijd opschonen vóór het opslaan: wat hier binnenkomt komt van een browser, en het scherm
    // dat het straks leest hangt in een kantine waar niemand een foutmelding gaat oplossen.
    // De browser stuurt de volledige lijst — bewaren gebeurt bij elke wijziging, dus een deel
    // opsturen zou een half bewaarde toestand kunnen achterlaten.
    const ruw = (body ?? {}) as { profielen?: unknown }
    // Eerst afkappen, dán opschonen. Opschonen kost per profiel werk dat over de al verwerkte
    // profielen loopt (een uniek id zoeken), dus over een lijst van tienduizend zou dat kwadratisch
    // uitdraaien — synchroon werk dat de hele server stilzet, inclusief elke live-stream. Er worden
    // er hoe dan ook maar MAX_PROFIELEN bewaard, dus de rest hoeft niet eens bekeken te worden.
    const lijst = (Array.isArray(ruw.profielen) ? ruw.profielen : [])
      .filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === 'object')
      .slice(0, MAX_PROFIELEN)
    // Ids opnieuw vaststellen zodat een browser geen twee schermen op dezelfde link kan zetten.
    const genormaliseerd: { id: string; naam: string }[] = []
    const profielen = lijst
      .map((p) => {
        const naam = veiligeProfielnaam(p.naam)
        const ruweId = p.id
        const id =
          typeof ruweId === 'string' && /^[a-z0-9-]{1,32}$/.test(ruweId) && !genormaliseerd.some((q) => q.id === ruweId)
            ? ruweId
            : nieuwProfielId(genormaliseerd, naam)
        genormaliseerd.push({ id, naam })
        return { id, naam, ...sanitizeKantineSelectie(p) }
      })

    const opslag = bewaarVorm(sanitizeProfielen({ profielen }))
    await payload.update({
      collection: 'users',
      id: user.id,
      data: { kantineScherm: opslag },
      overrideAccess: true,
    })
    return Response.json({ ok: true, profielen: opslag.profielen })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}
