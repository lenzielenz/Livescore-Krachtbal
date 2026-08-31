import { spawn } from 'child_process'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { mayEditMatchVideo } from '@/lib/video-access'
import { cvMap, pythonVoorSpawn, spawnOmgeving } from '@/lib/cv-analyse'
import { geldigLabel } from '@/lib/kalibratie-punten'

export const dynamic = 'force-dynamic'

// De veldkalibratie die de gebruiker op een videobeeld aanklikte. Zonder deze punten weet de
// analyse wél wanneer er geworpen wordt, maar niet waar de bal landt.
//
// We bewaren de PUNTEN, niet de matrix: de matrix hangt af van de terreinmaten (die later nog
// kunnen wijzigen) en wordt bij elke analyse opnieuw gefit. Wel controleren we hier meteen of
// er überhaupt een geldige matrix uit volgt — een kalibratie die pas een halfuur later blijkt
// te rammelen, is een kalibratie die je twee keer moet zetten.

type Punt = { label: string; x: number; y: number }
type Beeld = { tijd: number; beeldBreedte: number | null; beeldHoogte: number | null; punten: Punt[] }

function leesPunten(ruw: unknown, waar: string): { punten: Punt[] } | { fout: string } {
  if (!Array.isArray(ruw)) return { fout: `${waar}: punten ontbreekt.` }
  if (ruw.length < 1) return { fout: `${waar}: geen punten.` }
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

/**
 * De ijkbeelden uit het verzoek.
 *
 * Nieuw: `beelden` — meerdere beelden, elk met hun tijdstip in de video. Nodig zodra de camera
 * pant: dan toont geen enkel beeld alle veertien kruispunten. De oude vorm (één losse
 * `punten`-lijst) blijft werken en telt als één beeld op seconde 0.
 */
function leesBeelden(body: Record<string, unknown>): { beelden: Beeld[] } | { fout: string } {
  const ruw = body.beelden
  if (!Array.isArray(ruw)) {
    const gelezen = leesPunten(body.punten, 'kalibratie')
    if ('fout' in gelezen) return gelezen
    if (gelezen.punten.length < 4) return { fout: 'Minstens vier punten nodig om het veld vast te leggen.' }
    return {
      beelden: [
        {
          tijd: 0,
          beeldBreedte: Number(body.beeldBreedte) || null,
          beeldHoogte: Number(body.beeldHoogte) || null,
          punten: gelezen.punten,
        },
      ],
    }
  }
  if (ruw.length === 0) return { fout: 'Geen enkel beeld aangeduid.' }
  if (ruw.length > 12) return { fout: 'Meer dan twaalf ijkbeelden is niet nodig.' }

  const beelden: Beeld[] = []
  for (const [i, b] of (ruw as Record<string, unknown>[]).entries()) {
    const gelezen = leesPunten(b?.punten, `beeld ${i + 1}`)
    if ('fout' in gelezen) return gelezen
    const tijd = Number(b?.tijd)
    if (!Number.isFinite(tijd) || tijd < 0) return { fout: `Beeld ${i + 1} heeft geen geldig tijdstip.` }
    beelden.push({
      tijd: Math.round(tijd * 10) / 10,
      beeldBreedte: Number(b?.beeldBreedte) || null,
      beeldHoogte: Number(b?.beeldHoogte) || null,
      punten: gelezen.punten,
    })
  }
  // Eén beeld met vier punten volstaat om te kunnen meten; de rest verrijkt de dekking.
  if (!beelden.some((b) => b.punten.length >= 4)) {
    return { fout: 'Minstens één beeld heeft vier punten nodig om het veld vast te leggen.' }
  }
  return { beelden: beelden.sort((a, b) => a.tijd - b.tijd) }
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

  const gelezen = leesBeelden(body)
  if ('fout' in gelezen) return Response.json({ error: gelezen.fout }, { status: 400 })

  const veldmaten = {
    diepte: (match.goalAreaDepth as number) ?? 10,
    breedte: (match.veldBreedte as number | null) ?? null,
    speelveld: (match.veldSpeelveld as number | null) ?? null,
  }

  // Elk beeld met vier of meer punten moet op zichzelf een geldig veld opleveren. Een beeld
  // met minder punten bewaren we wel (het vult het overzicht aan) maar dient niet als ijkbeeld.
  let bruikbaar = 0
  for (const [i, beeld] of gelezen.beelden.entries()) {
    if (beeld.punten.length < 4) continue
    const controle = await controleer(beeld.punten, veldmaten)
    if (!controle.ok) {
      const waar = gelezen.beelden.length > 1 ? `Beeld ${i + 1}: ` : ''
      return Response.json({ error: `${waar}${controle.melding}` }, { status: 400 })
    }
    bruikbaar++
  }

  // Tel de verschíllende kruispunten: hetzelfde punt op twee beelden is één punt van het veld,
  // en dat is ook wat het overzicht in de app toont.
  const punten = new Set(gelezen.beelden.flatMap((b) => b.punten.map((p) => p.label))).size
  await payload.update({
    collection: 'matches',
    id: matchId,
    data: {
      cvKalibratie: {
        beelden: gelezen.beelden,
        // Het eerste bruikbare beeld blijft ook los staan: gereedschap dat één vaste
        // kalibratie verwacht (calibrate.py, landing.py bij een stilstaande camera) hoeft
        // niets van ijkbeelden te weten.
        punten: gelezen.beelden.find((b) => b.punten.length >= 4)?.punten ?? [],
        gezet: new Date().toISOString(),
      },
    },
    overrideAccess: true,
  })
  return Response.json({ ok: true, beelden: gelezen.beelden.length, punten, bruikbaar })
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
