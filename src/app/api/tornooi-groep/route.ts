import { getPayloadClient } from '@/lib/payload-client'
import { loadGroepData } from '@/lib/tornooi-groep'

export const dynamic = 'force-dynamic'

// Alles van één tornooidag (hoofdgroep) in één antwoord: reeksen, wedstrijden, clublogo's en de
// look van de organiserende club. Publiek en alleen-lezen — dit voedt de publieke groepspagina en
// het zelfaanpassende kantinescherm (dat elke paar seconden pollt, zoals het club-kantinescherm).
export async function GET(req: Request) {
  const url = new URL(req.url)
  const naam = url.searchParams.get('naam')?.trim() ?? ''
  if (!naam) return Response.json({ error: 'Geef een groepsnaam mee.' }, { status: 400 })

  try {
    const payload = await getPayloadClient()
    const data = await loadGroepData(payload, naam)
    if (!data) return Response.json({ error: 'Geen tornooidag met deze naam.' }, { status: 404 })
    return Response.json(data)
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}
