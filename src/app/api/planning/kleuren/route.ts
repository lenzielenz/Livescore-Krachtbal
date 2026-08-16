import { NextResponse } from 'next/server'

import { authUser, isFederationLevel } from '@/lib/api-auth'
import { colorsToHex, matchClubColors, parseReeksenKleuren } from '@/lib/club-colors-import'
import { normalizeHex } from '@/lib/club-colors'
import { getPayloadClient } from '@/lib/payload-client'
import { extractPdfText } from '@/lib/reeksindeling-import'

export const dynamic = 'force-dynamic'

// Clubkleuren aanvullen uit de officiële Reeksen-PDF (KVKBF): per ploeg staat er ook de truikleur
// bij. We vullen dit ENKEL in als startwaarde voor clubs die nog geen kleur hebben — een club met
// een logo (of een handmatig gekozen kleur) wordt nooit overschreven. Twee stappen (proef/commit),
// zoals de seizoensimport. Enkel federatie/admin.

const MAX_BYTES = 5 * 1024 * 1024

export async function POST(req: Request) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })
  if (!isFederationLevel(user)) {
    return NextResponse.json({ error: 'Enkel de federatie kan clubkleuren aanvullen.' }, { status: 403 })
  }

  const url = new URL(req.url)
  const commit = url.searchParams.get('commit') === '1'

  let text = ''
  let bron = ''
  try {
    const ct = req.headers.get('content-type') || ''
    if (!ct.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Verwacht een PDF-bestand (multipart/form-data).' }, { status: 400 })
    }
    const form = await req.formData()
    const file = form.get('pdf')
    if (!file || typeof file === 'string') return NextResponse.json({ error: 'Geen PDF meegestuurd.' }, { status: 400 })
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Bestand is te groot (max. 5 MB).' }, { status: 400 })
    text = extractPdfText(Buffer.from(await file.arrayBuffer()))
    bron = file.name
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }

  const entries = parseReeksenKleuren(text)
  if (entries.length === 0) {
    return NextResponse.json({ error: 'Geen clubkleuren herkend in deze PDF.' }, { status: 400 })
  }

  const clubsRes = await payload.find({ collection: 'clubs', depth: 0, limit: 2000 })
  const clubs = clubsRes.docs as { id: number; name: string; colorPrimary?: string | null }[]
  const matched = matchClubColors(clubs.map((c) => c.name), entries)

  const voorstel: { clubId: number; naam: string; primary: string; secondary: string }[] = []
  for (const club of clubs) {
    if (normalizeHex(club.colorPrimary)) continue // al ingesteld — nooit overschrijven
    const colors = matched.get(club.name)
    if (!colors) continue
    const hex = colorsToHex(colors)
    if (!hex) continue
    voorstel.push({ clubId: club.id, naam: club.name, primary: hex.primary, secondary: hex.secondary })
  }

  let bijgewerkt = 0
  const errors: string[] = []
  if (commit) {
    for (const v of voorstel) {
      try {
        await payload.update({
          collection: 'clubs',
          id: v.clubId,
          data: { colorPrimary: v.primary, colorSecondary: v.secondary },
          overrideAccess: true,
        })
        bijgewerkt++
      } catch (e) {
        if (errors.length < 10) errors.push((e as Error).message)
      }
    }
  }

  return NextResponse.json({
    ok: true,
    commit,
    bron,
    clubsInPdf: matched.size,
    clubsTotaal: clubs.length,
    teVullen: voorstel.length,
    bijgewerkt,
    voorstel,
    errors,
  })
}
