import Link from 'next/link'

import { TeamLogo } from '@/components/TeamLogo'
import { leesAppJson, leesAppTekst, type AppManifest } from '@/lib/app-analyse'
import { formatDateBE } from '@/lib/datetime'
import { buildMatchState } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { reeksNaam } from '@/lib/reeksen'

import { AppAnalyse, appScore, type AppData } from './AppAnalyse'

// De volledige analysepagina van een wedstrijd uit de krachtbal-analyse-app: kop met de ploegen en
// de score volgens de app, daaronder alles uit het pakket. Gebruikt door de eigen analysepagina
// (/analyse/[id]) en door de deelpagina (/analyse/gedeeld/[token]).

export async function AppPagina({
  matchId,
  manifest,
  matchDoc,
  beheert,
  deel,
  centrumHref,
  terug,
}: {
  matchId: number
  manifest: AppManifest
  matchDoc: Record<string, unknown>
  beheert: boolean
  deel?: string
  centrumHref: string
  terug: { href: string; label: string } | null
}) {
  const payload = await getPayloadClient()
  const [state, data, coachtekst] = await Promise.all([
    buildMatchState(payload, matchId).catch(() => null),
    leesAppJson<AppData>(matchId, 'wedstrijd_data.json'),
    leesAppTekst(matchId, 'coachtekst.txt'),
  ])
  const thuis = state?.teams.home
  const uit = state?.teams.away
  const namen = { thuis: thuis?.name ?? 'Thuis', uit: uit?.name ?? 'Uit' }
  const score = data ? appScore(data) : null
  const reeks = reeksNaam(matchDoc.reeks as string | undefined)
  const datum = matchDoc.date ? formatDateBE(new Date(matchDoc.date as string), { dateStyle: 'long' }) : null
  const titel = `${namen.thuis} – ${namen.uit}${datum ? `, ${datum}` : ''}`

  return (
    <>
      {terug && (
        <Link href={terug.href} className="back-link">
          ← {terug.label}
        </Link>
      )}
      <div className="an-head">
        <div className="an-head-team">
          {thuis && (
            <TeamLogo name={thuis.name} logoUrl={thuis.logoUrl} logoFit={thuis.logoFit} side="home" size="md" ringColor={thuis.colors?.primary} />
          )}
          <span>{namen.thuis}</span>
        </div>
        <div className="an-head-score">
          {score ? score.thuis : '–'}
          <span className="an-dash">–</span>
          {score ? score.uit : '–'}
        </div>
        <div className="an-head-team away">
          <span>{namen.uit}</span>
          {uit && <TeamLogo name={uit.name} logoUrl={uit.logoUrl} logoFit={uit.logoFit} side="away" size="md" ringColor={uit.colors?.primary} />}
        </div>
      </div>
      <p className="an-head-meta">
        {reeks}
        {datum ? ` · ${datum}` : ''} · videoanalyse
      </p>
      <AppAnalyse
        matchId={matchId}
        manifest={manifest}
        data={data}
        coachtekst={coachtekst?.trim() || null}
        namen={namen}
        centrumHref={centrumHref}
        beheert={beheert}
        deel={deel}
        titel={titel}
      />
    </>
  )
}
