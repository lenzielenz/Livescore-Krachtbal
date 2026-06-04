import Link from 'next/link'
import { notFound } from 'next/navigation'

import { MatchStats } from '@/components/MatchStats'
import { Scoreboard } from '@/components/Scoreboard'
import { SiteHeader } from '@/components/SiteHeader'
import { isFederationLevel } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { buildMatchState, buildMatchStats, buildTimeline } from '@/lib/match-engine'
import { effectiveMatchPackage, readPackagePreview } from '@/lib/package-preview'
import { getPayloadClient } from '@/lib/payload-client'
import { REEKS_OPTIONS } from '@/lib/reeksen'

export const dynamic = 'force-dynamic'

const reeksLabel = (v: unknown) => REEKS_OPTIONS.find((o) => o.value === v)?.label ?? (typeof v === 'string' ? v : null)

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isFinite(matchId)) notFound()

  const payload = await getPayloadClient()
  let state, timeline, stats
  try {
    ;[state, timeline, stats] = await Promise.all([
      buildMatchState(payload, matchId),
      buildTimeline(payload, matchId),
      buildMatchStats(payload, matchId),
    ])
  } catch {
    notFound()
  }

  // Extra context: reeks, datum/uur, locatie (terrein thuisclub) en toegewezen scheidsrechter.
  const matchDoc = await payload.findByID({ collection: 'matches', id: matchId, depth: 2 }).catch(() => null)
  const homeClub = (matchDoc?.homeTeam as { club?: { accommodatie?: string } } | null)?.club
  const accommodatie = homeClub?.accommodatie?.trim() || null
  // Pakket van de thuisclub bepaalt welke statistieken publiek zichtbaar zijn.
  // Een ingelogde admin kan een ander pakketniveau previewen (eigen weergave).
  const previewer = await getAuthUser()
  const pkg = effectiveMatchPackage(matchDoc, await readPackagePreview(isFederationLevel(previewer)))
  const reeks = reeksLabel(matchDoc?.reeks)
  const datum = matchDoc?.date
    ? new Date(matchDoc.date as string).toLocaleString('nl-BE', { dateStyle: 'long', timeStyle: 'short' })
    : null
  const sheetRes = await payload
    .find({ collection: 'matchsheets', where: { match: { equals: matchId } }, depth: 2, limit: 1 })
    .catch(() => null)
  const referee = (sheetRes?.docs[0]?.assignedReferee as { name?: string } | null)?.name || null

  return (
    <>
      <SiteHeader active="wedstrijden" />
      <div className="site">
      <Link href="/" className="back-link">
        ← Alle wedstrijden
      </Link>
      <Scoreboard matchId={matchId} initial={{ state, timeline }} />
      {(reeks || datum || accommodatie || referee) && (
        <div className="match-info">
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
        </div>
      )}
      <p className="sheet-cta">
        <Link href={`/veld/${matchId}`} className="back-link">
          📺 Veldscherm (groot scherm)
        </Link>
        {' · '}
        <Link href={`/match/${matchId}/sheet`} className="back-link">
          📋 Wedstrijdblad (print / PDF / JSON)
        </Link>
      </p>
      <MatchStats stats={stats.stats} shots={stats.shots} teams={{ home: state.teams.home.name, away: state.teams.away.name }} goalAreaDepth={state.match.goalAreaDepth} visibility={pkg.stats} packageName={pkg.name} />
      </div>
    </>
  )
}
