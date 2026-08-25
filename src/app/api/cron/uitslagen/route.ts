import { NextResponse } from 'next/server'

import { FEDERATIE_URL_DEFAULT, haalFederatiePagina } from '@/lib/federatie-fetch'
import { parseUitslagen } from '@/lib/federatie-uitslagen'
import { getPayloadClient } from '@/lib/payload-client'
import { parseResultsHtml } from '@/lib/results-import'
import { pasUitslagenToe } from '@/lib/uitslagen-toepassen'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Uitslagen van de federatie ophalen en toepassen — bedoeld voor een scheduler, bijvoorbeeld elk
// uur op een speeldag. Wedstrijden die wij zelf aantekenden blijven onaangeroerd; zie
// uitslagen-toepassen.ts voor die regels.
//
// Beveiliging identiek aan /api/cron/recap: enkel met het gedeelde geheim uit CRON_SECRET. Zonder
// ingesteld geheim doet het endpoint niets.
//
// Met ?preview=1 schrijft het niets weg — handig om het één keer te testen.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header = req.headers.get('authorization') ?? ''
  const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  const key = new URL(req.url).searchParams.get('key') ?? ''
  return bearer === secret || key === secret
}

async function run(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json(
      { error: process.env.CRON_SECRET ? 'Ongeldige sleutel.' : 'Geen CRON_SECRET ingesteld.' },
      { status: 401 },
    )
  }

  const preview = new URL(req.url).searchParams.get('preview') === '1'
  const url = (process.env.FEDERATIE_UITSLAGEN_URL ?? FEDERATIE_URL_DEFAULT).trim()

  try {
    const opgehaald = await haalFederatiePagina(url)
    if (opgehaald.status >= 400) {
      return NextResponse.json({ error: `Federatiesite antwoordde ${opgehaald.status}.`, url }, { status: 502 })
    }
    const payload = await getPayloadClient()
    const rijen = parseUitslagen(opgehaald.html, parseResultsHtml)
    const rapport = await pasUitslagenToe(payload, rijen, { commit: !preview })
    // Kort in het log: zo zie je in Railway of een run iets deed zonder de respons te bewaren.
    console.warn(
      `[uitslagen] ${preview ? 'preview' : 'toegepast'} — gelezen ${rijen.length}, gekoppeld ${rapport.gekoppeld}, bijgewerkt ${rapport.bijgewerkt}, zelf aangetekend ${rapport.zelfAangetekend.length}, onbekend ${rapport.onbekend.length}`,
    )
    return NextResponse.json({ ok: true, preview, url: opgehaald.url, gelezen: rijen.length, ...rapport })
  } catch (err) {
    console.error('[uitslagen] ophalen mislukt:', err)
    return NextResponse.json({ error: (err as Error).message, url }, { status: 502 })
  }
}

export const GET = run
export const POST = run
