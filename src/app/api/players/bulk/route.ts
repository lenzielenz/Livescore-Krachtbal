import { getPayloadClient } from '@/lib/payload-client'

// Meerdere spelers in één keer toevoegen aan een ploeg.
export async function POST(req: Request) {
  let body: { teamId?: number; players?: { shirtNumber?: number; name?: string }[] }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  const teamId = Number(body.teamId)
  if (!Number.isFinite(teamId)) {
    return Response.json({ error: 'Kies eerst een ploeg.' }, { status: 400 })
  }
  const rows = (body.players ?? [])
    .map((p) => ({ name: String(p.name ?? '').trim(), shirtNumber: Number(p.shirtNumber) }))
    .filter((p) => p.name.length > 0 && Number.isFinite(p.shirtNumber))

  if (rows.length === 0) {
    return Response.json({ error: 'Geen geldige spelers ingevoerd.' }, { status: 400 })
  }

  try {
    const payload = await getPayloadClient()
    let created = 0
    for (const row of rows) {
      await payload.create({
        collection: 'players',
        data: { team: teamId, name: row.name, shirtNumber: row.shirtNumber },
        overrideAccess: true,
      })
      created += 1
    }
    return Response.json({ created })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
