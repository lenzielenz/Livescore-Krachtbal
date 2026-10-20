import Link from 'next/link'
import type { Where } from 'payload'

import { SiteHeader } from '@/components/SiteHeader'
import { isFederationLevel } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { brusselsParts, formatDateTimeBE } from '@/lib/datetime'
import { relId } from '@/lib/federatie-api'
import { getPayloadClient } from '@/lib/payload-client'
import { FederatieAlleen } from '../FederatieAlleen'
import { Verplaatsen, type VerplaatsWedstrijd } from './Verplaatsen'
import '../federatie-tools.css'

export const dynamic = 'force-dynamic'

const DAG = 86_400_000
const twee = (n: number) => String(n).padStart(2, '0')
/** "YYYY-MM-DDTHH:MM" in Brusselse tijd: de waarde van een datetime-local-veld. */
const lokaal = (iso: string) => {
  const p = brusselsParts(new Date(iso))
  return `${p.year}-${twee(p.month)}-${twee(p.day)}T${twee(p.hour)}:${twee(p.minute)}`
}

const FILTERS = {
  komend: 'Komende wedstrijden',
  live: 'Vergeten af te sluiten',
  bladen: 'Wedstrijdblad niet ingediend',
} as const
type Filter = keyof typeof FILTERS

// Wedstrijden verplaatsen: de geplande wedstrijden in een tabel, datum en uur meteen aanpasbaar.
// Dezelfde pagina toont ook de lijsten uit het dashboard (live te lang, blad niet ingediend).
export default async function WedstrijdenPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const me = await getAuthUser()
  if (!isFederationLevel(me)) return <FederatieAlleen titel="Wedstrijden verplaatsen" />
  const sp = await searchParams
  const filter: Filter = sp.filter === 'live' || sp.filter === 'bladen' ? sp.filter : 'komend'

  const payload = await getPayloadClient()
  const nu = Date.now()
  const basis: Where[] = [{ analyseOnly: { not_equals: true } }, { isDemo: { not_equals: true } }]
  const waar: Where =
    filter === 'live'
      ? { and: [...basis, { status: { equals: 'live' } }, { date: { less_than: new Date(nu - 4 * 3600_000).toISOString() } }] }
      : filter === 'bladen'
        ? { and: [...basis, { status: { equals: 'finished' } }, { date: { greater_than_equal: new Date(nu - 30 * DAG).toISOString() } }] }
        : { and: [...basis, { status: { equals: 'scheduled' } }, { date: { greater_than_equal: new Date(nu - DAG).toISOString() } }, { date: { less_than: new Date(nu + 120 * DAG).toISOString() } }] }

  const matches = await payload.find({ collection: 'matches', where: waar, sort: filter === 'bladen' ? '-date' : 'date', depth: 1, limit: 1500, pagination: false, overrideAccess: true })
  let docs = matches.docs
  if (filter === 'bladen' && docs.length) {
    const sheets = await payload.find({ collection: 'matchsheets', where: { match: { in: docs.map((m) => m.id) } }, depth: 0, limit: docs.length, pagination: false, overrideAccess: true })
    const ingediend = new Set(sheets.docs.filter((s) => s.status === 'ingediend').map((s) => relId(s.match)))
    docs = docs.filter((m) => !ingediend.has(Number(m.id)))
  }

  const naam = (v: unknown) => (v && typeof v === 'object' ? String((v as { name?: unknown }).name ?? '?') : '?')
  const wedstrijden: VerplaatsWedstrijd[] = docs.map((m) => ({
    matchId: Number(m.id),
    titel: `${naam(m.homeTeam)} – ${naam(m.awayTeam)}`,
    reeks: String(m.reeks ?? ''),
    datumIso: String(m.date),
    lokaal: lokaal(String(m.date)),
    tijd: formatDateTimeBE(String(m.date)),
  }))

  return (
    <>
      <SiteHeader active="federatie" />
      <div className="site">
        <h1 className="page-title">{filter === 'komend' ? 'Wedstrijden verplaatsen' : FILTERS[filter]}</h1>
        <p className="ft-stat" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {(Object.keys(FILTERS) as Filter[]).map((f) => (
            <Link key={f} href={f === 'komend' ? '/beheer/wedstrijden' : `/beheer/wedstrijden?filter=${f}`} style={{ color: f === filter ? 'var(--accent)' : undefined, fontWeight: f === filter ? 700 : 400 }}>
              {FILTERS[f]}
            </Link>
          ))}
        </p>
        {wedstrijden.length === 0 ? (
          <p className="empty">Niets in deze lijst. 🎉</p>
        ) : filter === 'komend' ? (
          <Verplaatsen wedstrijden={wedstrijden} />
        ) : (
          <div className="ft-wrap">
            {wedstrijden.map((w) => (
              <div key={w.matchId} className="ft-rij">
                <div className="ft-wedstrijd">
                  <strong>{w.titel}</strong>
                  <small>
                    {w.tijd}
                    {w.reeks ? ` · ${w.reeks}` : ''}
                  </small>
                </div>
                <Link className="ft-btn" href={`/scheidsrechter/${w.matchId}`}>
                  {filter === 'live' ? 'Afsluiten →' : 'Blad openen →'}
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
