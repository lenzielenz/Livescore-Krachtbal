import { createWriteStream } from 'fs'
import { randomBytes } from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import { Readable, Transform } from 'stream'
import { pipeline } from 'stream/promises'

import { appMap, geldigBestand } from '@/lib/app-analyse'
import { getPayloadClient } from '@/lib/payload-client'

import { cvAuthorizedForMatch } from '../../../cv-auth'

export const dynamic = 'force-dynamic'

// Het analysepakket van de krachtbal-analyse-app op een eigen analysewedstrijd zetten (zie
// src/lib/app-analyse.ts). Eén bestand per verzoek, gestreamd naar schijf:
//   PUT    ?bestand=<naam>   body = de bytes (vervangt een bestaand bestand met die naam)
//   DELETE                   het hele pakket weg (een nieuwe analyse begint met een lege map)
// manifest.json komt als laatste: zolang dat er niet is, toont de pagina het pakket niet.
//
// Auth: Bearer CV_BRIDGE_TOKEN, federatie-login of de beheerder van de opname
// (cvAuthorizedForMatch). Enkel op analysewedstrijden — een officiële wedstrijd krijgt nooit een
// pakket.

const MAX_MB = Number(process.env.MAX_APP_BESTAND_MB) || 300
const MAX_BYTES = MAX_MB * 1024 * 1024

async function toegang(req: Request, id: string): Promise<{ fout: Response } | { matchId: number }> {
  const matchId = Number(id)
  if (!Number.isInteger(matchId)) return { fout: Response.json({ error: 'Ongeldig match-id.' }, { status: 400 }) }
  const payload = await getPayloadClient()
  if (!(await cvAuthorizedForMatch(payload, req, matchId))) {
    return { fout: Response.json({ error: 'Geen toegang.' }, { status: 401 }) }
  }
  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)
  if (!match) return { fout: Response.json({ error: 'Wedstrijd niet gevonden.' }, { status: 404 }) }
  if (!(match as { analyseOnly?: boolean | null }).analyseOnly) {
    return { fout: Response.json({ error: 'Een analysepakket hoort op een analysewedstrijd, niet op de kalender.' }, { status: 400 }) }
  }
  return { matchId }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const t = await toegang(req, (await params).id)
  if ('fout' in t) return t.fout
  const naam = new URL(req.url).searchParams.get('bestand') ?? ''
  if (!geldigBestand(naam)) return Response.json({ error: `Ongeldige bestandsnaam '${naam}'.` }, { status: 400 })
  if (!req.body) return Response.json({ error: 'Leeg bestand.' }, { status: 400 })
  const opgegeven = Number(req.headers.get('content-length') || 0)
  if (opgegeven > MAX_BYTES) return Response.json({ error: `Bestand te groot (max. ${MAX_MB} MB).` }, { status: 413 })

  const map = appMap(t.matchId)
  await fs.mkdir(map, { recursive: true })
  const tijdelijk = path.join(map, `.${randomBytes(6).toString('hex')}.deel`)
  let geschreven = 0
  const teller = new Transform({
    transform(stuk: Buffer, _enc, klaar) {
      geschreven += stuk.length
      if (geschreven > MAX_BYTES) klaar(new Error('te groot'))
      else klaar(null, stuk)
    },
  })
  try {
    await pipeline(Readable.fromWeb(req.body as never), teller, createWriteStream(tijdelijk))
    await fs.rename(tijdelijk, path.join(map, naam))
  } catch (err) {
    await fs.rm(tijdelijk, { force: true }).catch(() => undefined)
    if (geschreven > MAX_BYTES) return Response.json({ error: `Bestand te groot (max. ${MAX_MB} MB).` }, { status: 413 })
    return Response.json({ error: `Opslaan mislukt: ${(err as Error).message}` }, { status: 500 })
  }
  return Response.json({ ok: true, bestand: naam, bytes: geschreven })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const t = await toegang(req, (await params).id)
  if ('fout' in t) return t.fout
  const map = appMap(t.matchId)
  const bestanden = await fs.readdir(map).catch(() => [] as string[])
  await fs.rm(map, { recursive: true, force: true })
  return Response.json({ ok: true, verwijderd: bestanden.length })
}
