import Link from 'next/link'
import { notFound } from 'next/navigation'

import { CastToTv } from '@/components/CastToTv'
import { Scoreboard } from '@/components/Scoreboard'
import { SiteHeader } from '@/components/SiteHeader'
import { canAnalyse } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { buildMatchState, buildTimeline } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { krachtbalKleur, reeksHalfDurationSeconds, reeksNaam, reeksType, type Reeks } from '@/lib/reeksen'
import { BASE_RATE_PER_MIN } from '@/lib/win-probability'

export const dynamic = 'force-dynamic'

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isFinite(matchId)) notFound()

  const payload = await getPayloadClient()
  let state, timeline
  try {
    ;[state, timeline] = await Promise.all([
      buildMatchState(payload, matchId),
      buildTimeline(payload, matchId),
    ])
  } catch {
    notFound()
  }

  // Extra context: reeks, datum/uur, locatie (terrein thuisclub) en toegewezen scheidsrechter.
  const matchDoc = await payload.findByID({ collection: 'matches', id: matchId, depth: 2 }).catch(() => null)
  const homeClub = (matchDoc?.homeTeam as { club?: { accommodatie?: string } } | null)?.club
  const accommodatie = homeClub?.accommodatie?.trim() || null
  // Toon de leesbare reeksnaam zonder de code-prefix ("1ste Nationale Dames" i.p.v. "1NAD — …").
  const reeks = matchDoc?.reeks ? reeksNaam(matchDoc.reeks) : null
  // Live winstkans: helftduur + verwacht scoretempo strikt uit de reeks (veilige defaults binnen reeksen.ts).
  const reeksRaw = matchDoc?.reeks as Reeks
  const halfSeconds = reeksHalfDurationSeconds(reeksRaw)
  const ratePerMin = BASE_RATE_PER_MIN[reeksType(reeksRaw)]
  // Balkleur volgt de categorie: dames rood, heren wit, U12/U14 geel, U16/U18 blauw.
  const ballKleur = krachtbalKleur(reeksRaw)
  // Enkel ingelogde bezoekers mogen shoutouts plaatsen in de live tribune.
  const me = await getAuthUser()
  const datum = matchDoc?.date
    ? new Date(matchDoc.date as string).toLocaleString('nl-BE', { dateStyle: 'long', timeStyle: 'short' })
    : null
  const sheetRes = await payload
    .find({ collection: 'matchsheets', where: { match: { equals: matchId } }, depth: 2, limit: 1 })
    .catch(() => null)
  const referee = (sheetRes?.docs[0]?.assignedReferee as { name?: string } | null)?.name || null

  // Kapiteins (één per ploeg) — bij depth 2 zijn dit speler-objecten met naam + rugnummer.
  const capName = (c: unknown): string | null => {
    if (!c || typeof c !== 'object') return null
    const p = c as { name?: string; shirtNumber?: number }
    if (!p.name) return null
    return p.shirtNumber != null ? `#${p.shirtNumber} ${p.name}` : p.name
  }
  const homeCaptain = capName(matchDoc?.homeCaptain)
  const awayCaptain = capName(matchDoc?.awayCaptain)

  return (
    <>
      <SiteHeader active="wedstrijden" />
      <div className="site">
      <Link href="/" className="back-link">
        ← Alle wedstrijden
      </Link>
      {/* Match-context als kop bovenaan (reeks · datum · locatie · scheidsrechter · kapiteins),
          zodat duidelijk is over welke wedstrijd dit gaat — i.p.v. een losse regel onderaan. */}
      {(reeks || datum || accommodatie || referee || homeCaptain || awayCaptain) && (
        <div className="match-info match-info-top">
          {(reeks || datum) && (
            <div className="match-info-row">
              {reeks && <span className="match-info-reeks">{reeks}</span>}
              {datum && <span>{datum}</span>}
            </div>
          )}
          {accommodatie && (
            <div className="match-info-row">
              <span aria-hidden>📍</span> <span>{accommodatie}</span>
            </div>
          )}
          {referee && (
            <div className="match-info-row">
              <span aria-hidden>🟡</span> <span>Scheidsrechter: {referee}</span>
            </div>
          )}
          {(homeCaptain || awayCaptain) && (
            <div className="match-info-row">
              <span aria-hidden>🅒</span>{' '}
              <span>
                Kapiteins: {state.teams.home.name} — {homeCaptain ?? '—'} · {state.teams.away.name} — {awayCaptain ?? '—'}
              </span>
            </div>
          )}
        </div>
      )}
      <Scoreboard matchId={matchId} initial={{ state, timeline }} halfSeconds={halfSeconds} ratePerMin={ratePerMin} ballKleur={ballKleur} canChat={Boolean(me)} />
      {/* Supporters duidelijk tonen dat ze de wedstrijd op hun tv kunnen volgen. */}
      <CastToTv matchId={matchId} />
      <p className="sheet-cta">
        {canAnalyse(me) && (
          <Link href={`/analyse/${matchId}`} className="back-link">
            📈 Analyse &amp; video
          </Link>
        )}
        <Link href="/kantine" className="back-link">
          🍺 Kantinescherm (groot scherm)
        </Link>
      </p>
      </div>
    </>
  )
}
