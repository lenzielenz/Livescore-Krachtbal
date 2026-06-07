import { getPayloadClient } from '@/lib/payload-client'
import { clientIp, rateLimit } from '@/lib/sse-hub'

// Publieke zelfregistratie voor supporters. Maakt een gewoon account aan met de
// rol 'viewer' (supporter) — die wordt server-side AFGEDWONGEN, zodat niemand
// zichzelf een hogere rol kan toekennen. Een admin promoot daarna in het beheer.
export async function POST(req: Request) {
  const ip = clientIp(req)
  if (!rateLimit(`register:${ip}`, 5, 60_000)) {
    return Response.json({ error: 'Te veel pogingen. Probeer straks opnieuw.' }, { status: 429 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige aanvraag.' }, { status: 400 })
  }

  const name = String(body.name ?? '').trim()
  const email = String(body.email ?? '').trim().toLowerCase()
  const password = String(body.password ?? '')

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return Response.json({ error: 'Geef een geldig e-mailadres.' }, { status: 400 })
  }
  if (password.length < 8) {
    return Response.json({ error: 'Kies een wachtwoord van minstens 8 tekens.' }, { status: 400 })
  }

  const payload = await getPayloadClient()

  // Optionele club: enkel bewaren als ze echt bestaat (anders gewoon negeren).
  let clubId: number | null = null
  const rawClub = Number(body.clubId)
  if (Number.isFinite(rawClub) && rawClub > 0) {
    const club = await payload.findByID({ collection: 'clubs', id: rawClub, depth: 0 }).catch(() => null)
    if (club) clubId = rawClub
  }

  try {
    await payload.create({
      collection: 'users',
      // Rol ALTIJD 'viewer' — body.roles wordt bewust genegeerd (geen privilege-escalatie).
      data: { name: name || undefined, email, password, roles: ['viewer'], ...(clubId ? { club: clubId } : {}) },
      overrideAccess: true,
    })
  } catch (err) {
    // We loggen de échte oorzaak server-side en geven enkel een bruikbare melding terug.
    const msg = (err as Error)?.message || ''
    console.error('register failed:', msg, err)
    // Bestaand e-mailadres (unieke auth-email) → vriendelijke 409.
    if (
      /e-?mail/i.test(msg) &&
      /(already|registered|taken|in use|uniek|unique|bestaat|duplicate)/i.test(msg)
    ) {
      return Response.json({ error: 'Dit e-mailadres is al in gebruik.' }, { status: 409 })
    }
    // Alle andere fouten: toon de werkelijke reden i.p.v. ze te verbergen.
    return Response.json(
      { error: `Registreren mislukt: ${msg || 'onbekende fout'}` },
      { status: 400 },
    )
  }

  return Response.json({ ok: true })
}
