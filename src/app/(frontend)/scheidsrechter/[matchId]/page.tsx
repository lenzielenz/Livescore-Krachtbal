import Link from 'next/link'

import { FlowNietNodig } from '@/components/FlowNietNodig'
import { MatchDayNav } from '@/components/MatchDayNav'
import { SiteHeader } from '@/components/SiteHeader'
import { hasRole, isFederationLevel } from '@/lib/access'
import { BlessureMelden } from '@/components/BlessureMelden'
import { refereeMayHandleMatch, type AuthedUser } from '@/lib/api-auth'
import { afgelastingenLijst, magAfgelasten } from '@/lib/afgelasting'
import { blessureKanten } from '@/lib/blessure'
import { buildMatchState } from '@/lib/match-engine'
import { countLineup, SELECTIE_MIN } from '@/lib/match-readiness'
import { buildRoster, getOrCreateMatchSheet } from '@/lib/matchsheet-data'
import { isReleaseTime } from '@/lib/matchsheet-workflow'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { vereisteOfficialsTekst, type Reeks } from '@/lib/reeksen'
import { isSupportersMode } from '@/lib/score-mode'
import { DeelnameBevestigen, type DeelnameKant } from './DeelnameBevestigen'
import { Afgelasten } from './Afgelasten'
import { RefereePanel } from './RefereePanel'
import { SpelerControle, type ControleRij } from './SpelerControle'
import '../../wedstrijdblad.css'
import { formatDateTimeBE } from '@/lib/datetime'

export const dynamic = 'force-dynamic'

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
  // De controle per speler: wie staat op de lijst, is hij volgens het reglement in orde (dezelfde
  // controle als bij het opstellen), en heeft de scheidsrechter hem gecontroleerd?
  const magControleren = isFederation || (hasRole(user, 'scheidsrechter') && (await refereeMayHandleMatch(payload, user as unknown as AuthedUser, Number(matchId))))
  const controleVan = async (side: 'home' | 'away'): Promise<ControleRij[]> => {
    const roster = await buildRoster(payload, matchId, side).catch(() => null)
    const perId = new Map((roster?.players ?? []).map((p) => [p.id, p]))
    const rijen = ((side === 'home' ? sheet?.homeLineup : sheet?.awayLineup) ?? []) as { player?: unknown; rugnummer?: number | null; ibGecontroleerd?: boolean | null }[]
    return rijen.map((r) => {
      const id = Number(r.player && typeof r.player === 'object' ? (r.player as { id: number }).id : r.player)
      const p = perId.get(id)
      const naam = r.player && typeof r.player === 'object' ? String((r.player as { name?: unknown }).name ?? '') : (p?.name ?? `#${id}`)
      return {
        id,
        rugnummer: r.rugnummer ?? null,
        naam,
        blokkade: !p ? 'hoort niet (meer) bij deze ploeg' : p.selectability.level === 'block' ? p.selectability.reasons.join(' ') : null,
        gecontroleerd: Boolean(r.ibGecontroleerd),
      }
    })
  }
  const controle = { home: await controleVan('home'), away: await controleVan('away') }
  const magAfgelastenHier = await magAfgelasten(payload, user as unknown as AuthedUser | null, Number(matchId))
  // De laatste afgelasting die nog speelt (gemeld), of anders de jongste — enkel zolang de wedstrijd afgelast is
  // of net herpland werd.
  const afgelastingen = await afgelastingenLijst(payload, { match: { equals: Number(matchId) } }, 1)
  const afgelasting = afgelastingen[0] && (match.afgelast || afgelastingen[0].status === 'herpland') ? afgelastingen[0] : null
  const blessureKantenLijst = await blessureKanten(payload, user as unknown as AuthedUser | null, Number(matchId))
  const backupRef = sheet?.backupReferee as { name?: string } | number | null | undefined
  const backupRefereeName = backupRef && typeof backupRef === 'object' ? (backupRef.name ?? null) : null

  const deelnameKanten: DeelnameKant[] = [
    { side: 'home', teamNaam: liveState?.teams.home.name ?? 'Thuis', spelers: deelnameSpelers(sheet?.homeLineup as DeelnameRij[]) },
    { side: 'away', teamNaam: liveState?.teams.away.name ?? 'Uit', spelers: deelnameSpelers(sheet?.awayLineup as DeelnameRij[]) },
  ]

  const releaseAt = new Date(new Date(match.date as string).getTime() - releaseMinutes * 60_000)

  return (
    <>
      <SiteHeader active="scheidsrechters" />
      <div className="site">
      <h1 className="page-title">
        Scheidsrechter <span className="brand">·</span> {String(match.title ?? '')}
      </h1>
      <MatchDayNav matchId={matchId} current="scheidsrechter" />

      {/* Afgelast (terrein, weer)? Dan ligt de wedstrijd stil tot de federatie herplant. */}
      {afgelasting ? (
        <section className="wb-card" style={{ marginBottom: 16, borderColor: '#e0a23d' }}>
          <h2>⛈️ Afgelast — {afgelasting.reden}</h2>
          <p className="wb-sub">
            {afgelasting.status === 'gemeld'
              ? 'De federatie plant een nieuwe datum. Tot dan kan de wedstrijd niet starten.'
              : afgelasting.status === 'herpland' && afgelasting.nieuweDatum
                ? `Herpland op ${formatDateTimeBE(new Date(afgelasting.nieuweDatum))}.`
                : 'De afgelasting werd ingetrokken.'}
            {afgelasting.toelichting ? ` ${afgelasting.toelichting}` : ''}
          </p>
          {afgelasting.fotos.length > 0 && (
            <div className="af-fotos">
              {afgelasting.fotos.map((f) => (
                <a key={f} href={f} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f} alt="Omstandigheden" />
                </a>
              ))}
            </div>
          )}
        </section>
      ) : (
        match.status === 'scheduled' &&
        magAfgelastenHier && (
          <section className="wb-card" style={{ marginBottom: 16 }}>
            <h2>Terrein of weer niet in orde?</h2>
            <p className="wb-sub">Gelast af met een paar foto&apos;s van de omstandigheden. De federatie plant een nieuwe datum.</p>
            <Afgelasten matchId={matchId} />
          </section>
        )
      )}

      {!released && !magControleren ? (
        <p className="wb-intro">
          De opstellingen worden zichtbaar vanaf{' '}
          {formatDateTimeBE(releaseAt, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}{' '}
          ({releaseMinutes} min vóór aanvang).
        </p>
      ) : (
        <div className="wb-grid" style={{ marginBottom: 16 }}>
          <SpelerControle matchId={matchId} side="home" titel={`Thuis — ${liveState?.teams.home.name ?? ''}`} rijen={controle.home} vergrendeld={!magControleren || sheet?.status === 'ingediend'} />
          <SpelerControle matchId={matchId} side="away" titel={`Uit — ${liveState?.teams.away.name ?? ''}`} rijen={controle.away} vergrendeld={!magControleren || sheet?.status === 'ingediend'} />
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
        spelersNietInOrde={[...controle.home, ...controle.away].filter((r) => !r.gecontroleerd || r.blokkade).length}
        lineupReady={{
          homeOk: countLineup(sheet?.homeLineup) >= SELECTIE_MIN,
          awayOk: countLineup(sheet?.awayLineup) >= SELECTIE_MIN,
        }}
        officialsHint={match.reeks ? vereisteOfficialsTekst(match.reeks as Reeks) : null}
        isFederation={isFederation}
        vrijgaveCode={isFederation ? ((sheet?.vrijgaveCode as string | undefined) ?? null) : null}
        backupRefereeName={backupRefereeName}
        andereTafel={
          // Tekent een clubtafel deze lopende wedstrijd al aan? Dan geen knop "Naar aantekenen"
          // voor de scheidsrechter (er kan maar één aantekenaar zijn, zie claimHeld); de
          // federatie blijft er als noodrem wel door.
          liveState?.trust.claimActive &&
          liveState.trust.scorerId != null &&
          Number(liveState.trust.scorerId) !== Number((user as { id?: number } | null)?.id) &&
          !isFederation
            ? (liveState.trust.scorerName ?? 'Iemand anders')
            : null
        }
      />

      {liveState?.match.status === 'finished' && (isFederation || hasRole(user, 'scheidsrechter')) && (
        <DeelnameBevestigen matchId={matchId} kanten={deelnameKanten} vergrendeld={sheet?.status === 'ingediend'} />
      )}

      {blessureKantenLijst.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <BlessureMelden matchId={matchId} kanten={blessureKantenLijst} />
        </div>
      )}
      </div>
    </>
  )
}

type DeelnameRij = { player?: { id?: number; name?: string } | number; rugnummer?: number | null; deelgenomen?: boolean | null }
function deelnameSpelers(rows: DeelnameRij[] | undefined): DeelnameKant['spelers'] {
  return (rows ?? [])
    .map((r) => ({
      id: typeof r.player === 'object' ? Number(r.player?.id) : Number(r.player),
      naam: typeof r.player === 'object' ? (r.player?.name ?? '—') : `#${r.player}`,
      rugnummer: r.rugnummer ?? null,
      deelgenomen: Boolean(r.deelgenomen),
    }))
    .filter((s) => Number.isFinite(s.id))
}
