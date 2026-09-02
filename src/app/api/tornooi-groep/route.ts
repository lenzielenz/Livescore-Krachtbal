import { authUser, isFederationLevel } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { loadGroepData } from '@/lib/tornooi-groep'

export const dynamic = 'force-dynamic'

// Alles van één tornooidag (hoofdgroep) in één antwoord: reeksen, wedstrijden, clublogo's en de
// look van de organiserende club. Publiek en alleen-lezen — dit voedt de publieke groepspagina en
// het zelfaanpassende kantinescherm (dat elke paar seconden pollt, zoals het club-kantinescherm).
//
// Eén stuk is níét publiek: het foto-archief van de dag. Dat komt er enkel bij voor een
// ingelogde federatie-gebruiker — het kantinescherm draait daar na afloop zijn fotoshow mee.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const naam = url.searchParams.get('naam')?.trim() ?? ''
  if (!naam) return Response.json({ error: 'Geef een groepsnaam mee.' }, { status: 400 })

  try {
    const payload = await getPayloadClient()
    const archief = isFederationLevel(await authUser(payload, req))
    const data = await loadGroepData(payload, naam, { archief })
    if (!data) return Response.json({ error: 'Geen tornooidag met deze naam.' }, { status: 404 })
    return Response.json(data)
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}
