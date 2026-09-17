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

  // Bestaat het adres al? Expliciet controleren i.p.v. de foutmelding van de database te
  // interpreteren: Payload meldt een dubbele auth-e-mail als "The following field is invalid:
  // email", wat niemand begrijpt. Wie zich opnieuw inschrijft, hoort te lezen dat hij al een
  // account heeft (en dus kan inloggen).
  const bestaat = await payload
    .count({ collection: 'users', where: { email: { equals: email } }, overrideAccess: true })
    .catch(() => ({ totalDocs: 0 }))
  if (bestaat.totalDocs > 0) {
    return Response.json({ error: 'Dit e-mailadres is al in gebruik — log gewoon in.' }, { status: 409 })
  }

  // Optionele club: enkel bewaren als ze echt bestaat (anders gewoon negeren).
  let clubId: number | null = null
  const rawClub = Number(body.clubId)
  if (Number.isFinite(rawClub) && rawClub > 0) {
    const club = await payload.findByID({ collection: 'clubs', id: rawClub, depth: 0 }).catch(() => null)
    if (club) clubId = rawClub
  }

  // "Alleen supporter" (geen eigen club): welke club(s) wil hij toch volgen? Enkel relevant zonder
  // eigen club — met een club gekozen negeren we dit gewoon (die club leidt dan de weergave).
  // Bestaan checken met één query i.p.v. per id, en begrensd tegen misbruik (niemand volgt 50 clubs).
  let followedClubIds: number[] = []
  if (!clubId && Array.isArray(body.followedClubIds)) {
    const raw = [...new Set(body.followedClubIds.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0))].slice(0, 20)
    if (raw.length > 0) {
      const found = await payload
        .find({ collection: 'clubs', where: { id: { in: raw } }, depth: 0, limit: raw.length, pagination: false })
        .catch(() => ({ docs: [] as { id: number }[] }))
      followedClubIds = found.docs.map((c) => c.id)
    }
  }

  try {
    await payload.create({
      collection: 'users',
      // Rol ALTIJD 'viewer' — body.roles wordt bewust genegeerd (geen privilege-escalatie).
      data: {
        name: name || undefined,
        email,
        password,
        roles: ['viewer'],
        ...(clubId ? { club: clubId } : {}),
        ...(followedClubIds.length > 0 ? { followedClubs: followedClubIds } : {}),
      },
      overrideAccess: true,
    })
  } catch (err) {
    // We loggen de échte oorzaak server-side en geven enkel een bruikbare melding terug.
    const msg = (err as Error)?.message || ''
    console.error('register failed:', msg, err)
    // Race: tussen de controle hierboven en het aanmaken raakte het adres toch bezet.
    if (/e-?mail/i.test(msg)) {
      return Response.json({ error: 'Dit e-mailadres is al in gebruik — log gewoon in.' }, { status: 409 })
    }
    // Alle andere fouten: toon de werkelijke reden i.p.v. ze te verbergen.
    return Response.json(
      { error: `Registreren mislukt: ${msg || 'onbekende fout'}` },
      { status: 400 },
    )
  }

  return Response.json({ ok: true })
}
