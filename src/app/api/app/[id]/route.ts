import { readFile } from 'node:fs/promises'

import { appVoorId, bestandsPad, leesBereik } from '@/lib/app-downloads'

// Download van een Android-app (APK): GET /api/app/federatie of /api/app/aantekenaar. Zie lib/app-downloads.ts.
//
// Openbaar, zonder login: het zijn dezelfde apps die iedereen krijgt. Er komt enkel een bestand uit dat in het manifest
// staat (nooit een vrij pad). Het antwoord zegt dat het een APK is (anders probeert een telefoon het soms als tekst of
// zip te openen), geeft het bestand zijn versienummer mee in de naam, en kan hervat worden (Range) — handig bij slecht bereik.

const APK = 'application/vnd.android.package-archive'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const app = await appVoorId(id)
  const pad = app ? bestandsPad(app.bestand) : null
  if (!app || !pad) return Response.json({ error: 'Deze app bestaat niet.' }, { status: 404 })

  const etag = `"${app.sha256.slice(0, 32)}"`
  const koppen: Record<string, string> = {
    'Content-Type': APK,
    'Content-Disposition': `attachment; filename="${app.bestand}"`,
    'Accept-Ranges': 'bytes',
    ETag: etag,
    // Kort bewaren: een nieuwe versie moet snel zichtbaar zijn, en de ETag vangt de rest op.
    'Cache-Control': 'public, max-age=300, must-revalidate',
    'X-Content-Type-Options': 'nosniff',
  }

  // Een browser die het bestand al heeft (zelfde inhoud), krijgt geen 2 MB opnieuw.
  if (req.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers: koppen })

  const bereik = leesBereik(req.headers.get('range'), app.grootte)
  if (bereik === 'ongeldig') {
    return new Response(null, { status: 416, headers: { ...koppen, 'Content-Range': `bytes */${app.grootte}` } })
  }

  const alles = await readFile(pad)
  if (bereik) {
    const deel = alles.subarray(bereik.start, bereik.eind + 1)
    return new Response(new Uint8Array(deel), {
      status: 206,
      headers: { ...koppen, 'Content-Length': String(deel.length), 'Content-Range': `bytes ${bereik.start}-${bereik.eind}/${app.grootte}` },
    })
  }
  return new Response(new Uint8Array(alles), { status: 200, headers: { ...koppen, 'Content-Length': String(alles.length) } })
}
