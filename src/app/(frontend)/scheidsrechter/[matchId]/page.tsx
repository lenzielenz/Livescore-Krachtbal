import Link from 'next/link'

import { FlowNietNodig } from '@/components/FlowNietNodig'
import { MatchDayNav } from '@/components/MatchDayNav'
import { SiteHeader } from '@/components/SiteHeader'
import { isFederationLevel } from '@/lib/access'
import { buildMatchState } from '@/lib/match-engine'
import { countLineup, LINEUP_MIN } from '@/lib/match-readiness'
import { getOrCreateMatchSheet } from '@/lib/matchsheet-data'
import { isReleaseTime } from '@/lib/matchsheet-workflow'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { vereisteOfficialsTekst, type Reeks } from '@/lib/reeksen'
import { isSupportersMode } from '@/lib/score-mode'
import { RefereePanel } from './RefereePanel'
import '../../wedstrijdblad.css'
import { formatDateTimeBE } from '@/lib/datetime'

export const dynamic = 'force-dynamic'

type LineupRow = { player?: { name?: string; vergunningsstatus?: string } | number; rugnummer?: number }

// Naam + vergunningsstatus per speler, zodat de scheidsrechter in één oogopslag ziet dat
// iedereen die speelt gekeurd is (geldige vergunning).
function names(rows: LineupRow[] | undefined): { rugnummer?: number; name: string; vergunning: string | null }[] {
  return (rows ?? []).map((r) => ({
    rugnummer: r.rugnummer,
    name: typeof r.player === 'object' ? (r.player?.name ?? '—') : `#${r.player}`,
    vergunning: typeof r.player === 'object' ? (r.player?.vergunningsstatus ?? null) : null,
  }))
}

export default async function ScheidsrechterPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params
  const payload = await getPayloadClient()
  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)
  // Analysewedstrijden horen niet in de competitie-wedstrijdbladflow (privé, eigen analyse-database).
  if (!match || match.analyseOnly) {
    return (
      <>
        <SiteHeader active="scheidsrechters" />
        <div className="site">
          <p className="empty">Wedstrijd niet gevonden.</p>
          <Link href="/">← Terug</Link>
        </div>
      </>
    )
  }

  // Supportersmodus: er is geen akkoord te geven. Dit paneel liep daar zelfs vast — de startknop
  // wachtte op opstellingen en een keuring die nooit komen, en de doorlink naar het aantekenen
  // hing achter een wedstrijdbladstatus die op 'concept' bleef staan. Stop hier, vóór
  // getOrCreateMatchSheet: anders maakt het openen van deze pagina een blad aan voor een
  // wedstrijd die er geen hoort te hebben.
  if (await isSupportersMode(payload)) {
    return (
      <FlowNietNodig
        stap="Scheidsrechter"
        matchId={matchId}
        wedstrijd={String(match.title ?? '')}
        uitleg="Het platform staat op vrije livescore: er is geen wedstrijdblad vrij te geven en geen akkoord nodig om te starten."
        sectie="scheidsrechters"
      />
    )
  }

  const settings = await payload.findGlobal({ slug: 'settings', depth: 0 }).catch(() => null)
  const releaseMinutes = (settings as { releaseMinutesBefore?: number } | null)?.releaseMinutesBefore ?? 60
  const released = isReleaseTime(match.date as string, releaseMinutes, new Date())

  await getOrCreateMatchSheet(payload, matchId)
  const sheetFull = await payload.find({
    collection: 'matchsheets',
    where: { match: { equals: matchId } },
    depth: 2,
    limit: 1,
  })
  const sheet = sheetFull.docs[0]

  // Afgeleide eindstand voor de SR-eindscore-bevestiging (null als de opbouw faalt).
  const liveState = await buildMatchState(payload, Number(matchId)).catch(() => null)

  // Rol bepalen: enkel de federatie ziet de vrijgavecode (om ze door te geven aan de SR).
  const user = await getAuthUser()
  const isFederation = isFederationLevel(user)
  const backupRef = sheet?.backupReferee as { name?: string } | number | null | undefined
  const backupRefereeName = backupRef && typeof backupRef === 'object' ? (backupRef.name ?? null) : null

  const releaseAt = new Date(new Date(match.date as string).getTime() - releaseMinutes * 60_000)

  return (
    <>
      <SiteHeader active="scheidsrechters" />
      <div className="site">
      <h1 className="page-title">
        Scheidsrechter <span className="brand">·</span> {String(match.title ?? '')}
      </h1>
      <MatchDayNav matchId={matchId} current="scheidsrechter" />

      {!released ? (
        <p className="wb-intro">
          De opstellingen worden zichtbaar vanaf{' '}
          {formatDateTimeBE(releaseAt, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}{' '}
          ({releaseMinutes} min vóór aanvang).
        </p>
      ) : (
        <div className="wb-grid" style={{ marginBottom: 16 }}>
          <LineupView title="Thuis" rows={names(sheet?.homeLineup as LineupRow[])} />
          <LineupView title="Uit" rows={names(sheet?.awayLineup as LineupRow[])} />
        </div>
      )}

      <RefereePanel
        matchId={matchId}
        reeks={(match.reeks as Reeks) ?? null}
        assignedRefereeId={
          typeof sheet?.assignedReferee === 'object'
            ? (sheet?.assignedReferee?.id ?? null)
            : ((sheet?.assignedReferee as number | null) ?? null)
        }
        initialStatus={(sheet?.status as string) ?? 'concept'}
        initialKeuring={(sheet?.keuring as Record<string, string>) ?? {}}
        initialKeuringBevestigd={Boolean(sheet?.keuringBevestigd)}
        initialOfficials={(sheet?.officials as Record<string, string>) ?? {}}
        initialVergoeding={{
          refereeKm: (sheet?.refereeKm as number) ?? '',
          vanToepassing: Boolean((sheet?.forfait as { vanToepassing?: boolean } | undefined)?.vanToepassing),
          gemeldThuis: Boolean((sheet?.forfait as { gemeldThuis?: boolean } | undefined)?.gemeldThuis),
          gemeldUit: Boolean((sheet?.forfait as { gemeldUit?: boolean } | undefined)?.gemeldUit),
          aantalAutos: (sheet?.forfait as { aantalAutos?: number } | undefined)?.aantalAutos ?? '',
          km: (sheet?.forfait as { km?: number } | undefined)?.km ?? '',
        }}
        initialForfaitUitslag={(sheet?.forfait as { uitslag?: string } | undefined)?.uitslag ?? 'geen'}
        initialStartAkkoord={Boolean((sheet?.wedstrijdstart as { akkoord?: boolean } | undefined)?.akkoord)}
        initialStartNaam={(sheet?.wedstrijdstart as { naam?: string } | undefined)?.naam ?? ''}
        initialEindeAkkoord={Boolean((sheet?.wedstrijdeinde as { akkoord?: boolean } | undefined)?.akkoord)}
        initialEindeNaam={(sheet?.wedstrijdeinde as { naam?: string } | undefined)?.naam ?? ''}
        matchFinished={liveState?.match.status === 'finished'}
        homeScore={liveState?.score.home ?? 0}
        awayScore={liveState?.score.away ?? 0}
        homeTeam={liveState?.teams.home.name ?? 'Thuis'}
        awayTeam={liveState?.teams.away.name ?? 'Uit'}
        lineupReady={{
          homeOk: countLineup(sheet?.homeLineup) >= LINEUP_MIN,
          awayOk: countLineup(sheet?.awayLineup) >= LINEUP_MIN,
        }}
        officialsHint={match.reeks ? vereisteOfficialsTekst(match.reeks as Reeks) : null}
        isFederation={isFederation}
        vrijgaveCode={isFederation ? ((sheet?.vrijgaveCode as string | undefined) ?? null) : null}
        backupRefereeName={backupRefereeName}
      />
      </div>
    </>
  )
}

function LineupView({
  title,
  rows,
}: {
  title: string
  rows: { rugnummer?: number; name: string; vergunning: string | null }[]
}) {
  const allesGekeurd = rows.length > 0 && rows.every((r) => r.vergunning === 'geldig')
  return (
    <section className="wb-card">
      <h2>{title}</h2>
      {rows.length === 0 ? (
        <p className="wb-sub">Nog geen opstelling ingevuld.</p>
      ) : (
        <>
          {/* In één oogopslag: alle opgestelde spelers gekeurd (geldige vergunning) of niet. */}
          {allesGekeurd ? (
            <div className="ops-ready ok">✓ Alle spelers gekeurd</div>
          ) : (
            <div className="ops-ready todo">Niet alle spelers hebben een geldige vergunning.</div>
          )}
          <ul className="wb-rows">
            {rows.map((r, i) => (
              <li key={i} className="wb-row" style={{ cursor: 'default' }}>
                <strong className="num">{r.rugnummer ?? '–'}</strong>
                <span className="nm">{r.name}</span>
                {r.vergunning === 'geldig' ? (
                  <span className="off-st ok">✓ gekeurd</span>
                ) : (
                  <span className="off-st bad">⚠ {r.vergunning === 'aangevraagd' ? 'vergunning aangevraagd' : 'geen vergunning'}</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
