import { spawn } from 'child_process'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { mayEditMatchVideo } from '@/lib/video-access'
import { cvMap, pythonVoorSpawn, spawnOmgeving } from '@/lib/cv-analyse'

export const dynamic = 'force-dynamic'

// De veldkalibratie die de gebruiker op een videobeeld aanklikte. Zonder deze punten weet de
// analyse wél wanneer er geworpen wordt, maar niet waar de bal landt.
//
// We bewaren de PUNTEN, niet de matrix: de matrix hangt af van de terreinmaten (die later nog
// kunnen wijzigen) en wordt bij elke analyse opnieuw gefit. Wel controleren we hier meteen of
// er überhaupt een geldige matrix uit volgt — een kalibratie die pas een halfuur later blijkt
// te rammelen, is een kalibratie die je twee keer moet zetten.

/** De labels die calibrate.py kent (zie cv/veld.py). */
const LIJNEN = ['achterlijn', 'doellijn', 'vrijeworplijn', 'middellijn']
const KANTEN = ['thuis', 'uit']
const ZIJDEN = ['links', 'rechts']

function geldigLabel(label: unknown): boolean {
  if (typeof label !== 'string') return false
  const delen = label.split('_')
  if (delen[0] === 'middellijn') return delen.length === 2 && ZIJDEN.includes(delen[1])
  return delen.length === 3 && LIJNEN.includes(delen[0]) && KANTEN.includes(delen[1]) && ZIJDEN.includes(delen[2])
}

type Punt = { label: string; x: number; y: number }

function leesPunten(body: Record<string, unknown>): { punten: Punt[] } | { fout: string } {
  const ruw = body.punten
  if (!Array.isArray(ruw)) return { fout: 'punten ontbreekt.' }
  if (ruw.length < 4) return { fout: 'Minstens vier punten nodig om het veld vast te leggen.' }
  if (ruw.length > 14) return { fout: 'Meer dan veertien punten heeft geen zin (zoveel kruispunten zijn er).' }
  const punten: Punt[] = []
  const gezien = new Set<string>()
  for (const p of ruw as Record<string, unknown>[]) {
    if (!geldigLabel(p?.label)) return { fout: `Onbekend punt: ${String(p?.label)}` }
    const x = Number(p.x)
    const y = Number(p.y)
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) {
      return { fout: `Punt ${String(p.label)} heeft geen geldige beeldcoördinaten.` }
    }
    if (gezien.has(String(p.label))) return { fout: `Punt ${String(p.label)} staat er twee keer in.` }
    gezien.add(String(p.label))
    punten.push({ label: String(p.label), x: Math.round(x), y: Math.round(y) })
  }
  return { punten }
}

/** Fit de punten met calibrate.py: lukt dat, dan is de kalibratie bruikbaar. */
async function controleer(
  punten: Punt[],
  veld: { diepte: number; breedte: number | null; speelveld: number | null },
): Promise<{ ok: true; foutPx: number | null } | { ok: false; melding: string }> {
  const map = await fs.mkdtemp(path.join(os.tmpdir(), 'kal-'))
  const uit = path.join(map, 'kalibratie.json')
  const argv = [
    path.join(cvMap(), 'calibrate.py'),
    '--diepte', String(veld.diepte),
    ...(veld.breedte != null ? ['--breedte', String(veld.breedte)] : []),
    ...(veld.speelveld != null ? ['--speelveld', String(veld.speelveld)] : []),
    '--uit', uit,
    ...punten.flatMap((p) => ['--punt', `${p.x},${p.y}=${p.label}`]),
  ]
  try {
    const python = await pythonVoorSpawn()
    const resultaat = await new Promise<{ code: number; err: string }>((resolve) => {
      const kind = spawn(python.pad, argv, { stdio: ['ignore', 'ignore', 'pipe'], env: spawnOmgeving(python) })
      let err = ''
      kind.stderr?.on('data', (d) => {
        err += String(d)
      })
      kind.on('error', () => resolve({ code: -1, err: 'python-niet-gevonden' }))
      kind.on('close', (code) => resolve({ code: code ?? -1, err }))
    })
    if (resultaat.code === -1 && resultaat.err === 'python-niet-gevonden') {
      // Geen Python op deze server (bv. lokaal draaien): de punten bewaren mag, alleen
      // kunnen we ze nu niet narekenen.
      return { ok: true, foutPx: null }
    }
    if (resultaat.code !== 0) {
      const melding = resultaat.err.split('\n').find((r) => r.startsWith('FOUT:'))
      return { ok: false, melding: melding?.replace(/^FOUT:\s*/, '') ?? 'De punten vormen geen geldig veld.' }
    }
    // De reprojectiefout staat in het bestand niet, maar de fit slaagde: dat volstaat als
    // controle. (Het rapport per punt zit in calibrate.py --test.)
    return { ok: true, foutPx: null }
  } finally {
    await fs.rm(map, { recursive: true, force: true }).catch(() => undefined)
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isInteger(matchId)) return Response.json({ error: 'Ongeldig match-id.' }, { status: 400 })

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return Response.json({ error: 'Ongeldige JSON.' }, { status: 400 })
  }

  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)
  if (!match) return Response.json({ error: 'Wedstrijd niet gevonden.' }, { status: 404 })
  if (!mayEditMatchVideo(user, match as { analyseOnly?: boolean | null; analyseOwner?: unknown })) {
    return Response.json({ error: 'Geen rechten voor deze wedstrijd.' }, { status: 403 })
  }

  const gelezen = leesPunten(body)
  if ('fout' in gelezen) return Response.json({ error: gelezen.fout }, { status: 400 })

  const controle = await controleer(gelezen.punten, {
    diepte: (match.goalAreaDepth as number) ?? 10,
    breedte: (match.veldBreedte as number | null) ?? null,
    speelveld: (match.veldSpeelveld as number | null) ?? null,
  })
  if (!controle.ok) return Response.json({ error: controle.melding }, { status: 400 })

  await payload.update({
    collection: 'matches',
    id: matchId,
    data: {
      cvKalibratie: {
        punten: gelezen.punten,
        beeldBreedte: Number(body.beeldBreedte) || null,
        beeldHoogte: Number(body.beeldHoogte) || null,
        gezet: new Date().toISOString(),
      },
    },
    overrideAccess: true,
  })
  return Response.json({ ok: true, punten: gelezen.punten.length, fout_px: controle.foutPx })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isInteger(matchId)) return Response.json({ error: 'Ongeldig match-id.' }, { status: 400 })

  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)
  if (!match) return Response.json({ error: 'Wedstrijd niet gevonden.' }, { status: 404 })
  if (!mayEditMatchVideo(user, match as { analyseOnly?: boolean | null; analyseOwner?: unknown })) {
    return Response.json({ error: 'Geen rechten voor deze wedstrijd.' }, { status: 403 })
  }
  await payload.update({ collection: 'matches', id: matchId, data: { cvKalibratie: null }, overrideAccess: true })
  return Response.json({ ok: true })
}
