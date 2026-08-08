import { NextResponse } from 'next/server'

import { brusselsParts } from '@/lib/datetime'
import { getPayloadClient } from '@/lib/payload-client'
import { pushConfigured, sendPushToAll } from '@/lib/push'
import { settleFinishedMatches } from '@/lib/score-trust-store'
import { buildWeeklyRecapData } from '@/lib/weekly-recap-data'

export const dynamic = 'force-dynamic'

// Wekelijks onderhoud, bedoeld om ELKE DAG door een scheduler aangeroepen te worden:
//
//   1. de vertrouwenslaag afsluiten: wedstrijden waarvan het bevestigingsvenster dicht is, boeken
//      hun oordeel op de trust-historiek van de aantekenaar (score-trust.ts);
//   2. op MAANDAG de recap van de voorbije speelweek pushen — het wekelijkse ritueel.
//
// Beveiliging: er gebeurt hier werk namens iedereen, dus enkel met het gedeelde geheim uit
// CRON_SECRET (header `Authorization: Bearer …` of `?key=`). Zonder ingesteld geheim doet het
// endpoint niets — beter stil dan publiek aanroepbaar.

const RECAP_WEEKDAY = 0 // maandag (weekdayMon0)

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

  const url = new URL(req.url)
  const force = url.searchParams.get('force') === '1'
  const dry = url.searchParams.get('dry') === '1'

  const payload = await getPayloadClient()

  // 1. Afgelopen wedstrijden afsluiten (buiten het bevestigingsvenster).
  const settled = await settleFinishedMatches(payload).catch(() => 0)

  // 2. De recap — enkel op maandag versturen, tenzij expliciet geforceerd.
  const now = new Date()
  const isRecapDay = brusselsParts(now).weekdayMon0 === RECAP_WEEKDAY
  if (!isRecapDay && !force) {
    return NextResponse.json({ ok: true, settled, recap: 'overgeslagen (niet maandag)' })
  }

  const recap = await buildWeeklyRecapData(payload, { now })
  if (recap.matches === 0) {
    return NextResponse.json({ ok: true, settled, recap: 'geen wedstrijden — niets verstuurd' })
  }
  if (dry || !pushConfigured()) {
    return NextResponse.json({
      ok: true,
      settled,
      recap: dry ? 'proefdraai' : 'push niet geconfigureerd',
      headline: recap.headline,
      push: recap.push,
      matches: recap.matches,
    })
  }

  const sent = await sendPushToAll(payload, {
    title: recap.push.title,
    body: recap.push.body,
    url: '/recap',
    tag: 'weekly-recap', // één recap-melding tegelijk, geen stapel
  })
  return NextResponse.json({ ok: true, settled, matches: recap.matches, ...sent })
}

// Zowel GET als POST: schedulers (Railway cron, uptime-pingers) doen doorgaans een GET.
export async function GET(req: Request) {
  return run(req)
}

export async function POST(req: Request) {
  return run(req)
}
