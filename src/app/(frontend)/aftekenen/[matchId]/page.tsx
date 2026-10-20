import Link from 'next/link'

import { FlowNietNodig } from '@/components/FlowNietNodig'
import { MatchDayNav } from '@/components/MatchDayNav'
import { SiteHeader } from '@/components/SiteHeader'
import { BlessureMelden } from '@/components/BlessureMelden'
import type { AuthedUser } from '@/lib/api-auth'
import { getAuthUser } from '@/lib/auth-user'
import { blessureKanten } from '@/lib/blessure'
import { buildMatchSheet } from '@/lib/match-engine'
import { getOrCreateMatchSheet } from '@/lib/matchsheet-data'
import { getPayloadClient } from '@/lib/payload-client'
import { isSupportersMode } from '@/lib/score-mode'
import { AftekenenPanel, type SignatureData } from './AftekenenPanel'
import '../../wedstrijdblad.css'

export const dynamic = 'force-dynamic'

export default async function AftekenenPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params
  const payload = await getPayloadClient()
  // depth 2 zodat de kapiteins (spelers) mee opgehaald worden voor de vooraf gekende namen.
  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 2 }).catch(() => null)
  // Analysewedstrijden horen niet in de competitie-wedstrijdbladflow (privé, eigen analyse-database).
  if (!match || match.analyseOnly) {
    return (
      <>
        <SiteHeader active="clubs" />
        <div className="site">
          <p className="empty">Wedstrijd niet gevonden.</p>
          <Link href="/">← Terug</Link>
        </div>
      </>
    )
  }

  // Supportersmodus: er is geen wedstrijdblad om af te tekenen en niets in te dienen. Stop hier,
  // vóór getOrCreateMatchSheet — anders maakt het openen van deze pagina alsnog een blad aan.
  if (await isSupportersMode(payload)) {
    return (
      <FlowNietNodig
        stap="Aftekenen"
        matchId={matchId}
        wedstrijd={String(match.title ?? '')}
        uitleg="Het platform staat op vrije livescore: er is geen wedstrijdblad om af te tekenen. De eindstand staat vast zodra de wedstrijd afgelopen is; andere supporters bevestigen of betwisten ze op de wedstrijdpagina."
      />
    )
  }

  const sheet = await getOrCreateMatchSheet(payload, matchId)
  const user = await getAuthUser()
  const blessureKantenLijst = await blessureKanten(payload, user as unknown as AuthedUser | null, Number(matchId))
  const forfait = ((sheet.forfait as { uitslag?: string } | undefined)?.uitslag ?? 'geen') !== 'geen'
  const afgelopen = match.status === 'finished' || forfait
  const built = await buildMatchSheet(payload, Number(matchId)).catch(() => null)

  // Vooraf gekende namen zodat niemand z'n naam hoeft te typen: kapiteins uit de wedstrijd, de
  // scheidsrechter uit het (toegewezen) wedstrijdblad.
  const naamVan = (c: unknown): string | undefined =>
    c && typeof c === 'object' ? (c as { name?: string }).name || undefined : undefined
  const refereeRes = await payload
    .find({ collection: 'matchsheets', where: { match: { equals: Number(matchId) } }, depth: 2, limit: 1 })
    .catch(() => null)
  const defaultNames = {
    kapiteinThuis: naamVan(match.homeCaptain),
    kapiteinUit: naamVan(match.awayCaptain),
    scheidsrechter: naamVan(refereeRes?.docs[0]?.assignedReferee),
  }

  return (
    <>
      <SiteHeader active="clubs" />
      <div className="site">
      <h1 className="page-title">
        Aftekenen <span className="brand">·</span> {String(match.title ?? '')}
      </h1>
      <MatchDayNav matchId={matchId} current="aftekenen" />

      {built && (
        <p className="wb-intro">
          Eindstand: <strong>{built.teams.home.name} {built.totals.home} – {built.totals.away} {built.teams.away.name}</strong>.
          Beide kapiteins tekenen af; daarna dient de scheidsrechter in.
        </p>
      )}

      {/* Kwetsuren horen op het blad: geef ze door vóór het aftekenen. */}
      {blessureKantenLijst.length > 0 && <BlessureMelden matchId={matchId} kanten={blessureKantenLijst} />}

      {!afgelopen && (
        <p className="wb-intro" style={{ color: '#e0a23d' }}>
          De wedstrijd is nog niet afgelopen. Aftekenen kan na het eindsignaal.
        </p>
      )}

      <AftekenenPanel
        matchId={matchId}
        initialStatus={(sheet.status as string) ?? 'concept'}
        afgelopen={afgelopen}
        homeTeam={built?.teams.home.name}
        awayTeam={built?.teams.away.name}
        defaultNames={defaultNames}
        signatures={{
          kapiteinThuis: sheet.kapiteinThuis as SignatureData | undefined,
          kapiteinUit: sheet.kapiteinUit as SignatureData | undefined,
          scheidsrechter: sheet.scheidsrechter as SignatureData | undefined,
        }}
      />
      </div>
    </>
  )
}
