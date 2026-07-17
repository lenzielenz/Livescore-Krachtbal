import Link from 'next/link'
import { notFound } from 'next/navigation'

import { SiteHeader } from '@/components/SiteHeader'
import { POSITION_OPTIONS } from '@/collections/Players'
import { hasRole } from '@/lib/access'
import { canViewAnalyseMatch } from '@/lib/analyse-access'
import { getAuthUser } from '@/lib/auth-user'
import { buildMatchState } from '@/lib/match-engine'
import { getMatchReadiness } from '@/lib/matchsheet-data'
import { getPayloadClient } from '@/lib/payload-client'
import { reeksNaam } from '@/lib/reeksen'
import { isSupportersMode } from '@/lib/score-mode'
import { Scorekeeper } from './Scorekeeper'
import { SimpleScorekeeper } from './SimpleScorekeeper'
import './scorekeeper.css'

export const dynamic = 'force-dynamic'

export default async function ScorekeeperPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ expert?: string }>
}) {
  const { id } = await params
  const { expert } = await searchParams
  const matchId = Number(id)
  if (!Number.isFinite(matchId)) notFound()

  const payload = await getPayloadClient()

  let state
  try {
    state = await buildMatchState(payload, matchId)
  } catch {
    notFound()
  }

  const matchDoc = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)

  // Aantekenmodel volgt de rol: enkel een admin krijgt de volledige scoreopnemer
  // (3-staps veldschema). Iedereen anders tekent aan met de basis snelscoremodus.
  const user = await getAuthUser()
  const isAdmin = hasRole(user, 'admin')

  // Analysewedstrijden zijn privé: enkel de eigenaar (of federatie/admin) mag het aantekenscherm en de
  // roster zien. Zo lekt deze opname-route geen andermans analyse-spelers, ook niet via een gegokt id.
  if (matchDoc?.analyseOnly && !canViewAnalyseMatch(user, matchDoc)) notFound()

  const players = await payload.find({
    collection: 'players',
    where: { team: { in: [state.teams.home.id, state.teams.away.id] } },
    sort: 'shirtNumber',
    depth: 0,
    limit: 200,
  })

  const roster = players.docs.map((p) => ({
    id: p.id,
    name: p.name,
    shirtNumber: p.shirtNumber,
    teamId: typeof p.team === 'object' ? p.team.id : p.team,
    position: (p.position as string | null) ?? null,
  }))

  const reeks = reeksNaam(matchDoc?.reeks)
  const isDemo = Boolean((matchDoc as { isDemo?: boolean } | null)?.isDemo)
  const isAnalyse = Boolean((matchDoc as { analyseOnly?: boolean } | null)?.analyseOnly)
  // Globale supporters-modus (één knop voor alle wedstrijden) — geldt niet voor privé-analyse.
  const supportersMode = !isAnalyse && (await isSupportersMode(payload))

  // Supporters-modus: iedereen mag aantekenen, maar je moet wél ingelogd zijn om de score te
  // veranderen. Toon een nette inlog-uitnodiging i.p.v. een 401 verderop in de flow.
  if (supportersMode && !user) {
    return (
      <>
        <SiteHeader active="wedstrijden" />
        <div className="site">
          <h1 className="page-title">Aantekenen</h1>
          <p className="empty">
            Log in om de score van deze wedstrijd door te geven. Aantekenen kan door elke ingelogde
            supporter — een account maken is gratis.
          </p>
          <p className="sk-login-actions">
            <Link href={`/inloggen?next=/scorekeeper/${matchId}`} className="match-score-cta">
              <span aria-hidden>🔑</span>
              <span>Inloggen om aan te tekenen</span>
              <span className="match-score-cta-arrow" aria-hidden>→</span>
            </Link>
            <Link href="/registreren" className="back-link">Nog geen account? Registreren →</Link>
          </p>
        </div>
      </>
    )
  }

  // De basis snelscoremodus (+1/+2) is de standaard voor élke gewone wedstrijd — ook voor een admin.
  // De volledige scoreopnemer (3-staps veldschema) is enkel voor ANALYSEWEDSTRIJDEN: wedstrijden die
  // je zelf onder "Analyse" toevoegt om detaildata te verzamelen. De demo blijft de basisversie voor
  // iedereen — behalve via "Demo expert" (?expert=1), waarmee een admin het veldschema kan oefenen.
  const advanced = isDemo ? isAdmin && expert === '1' : isAnalyse

  if (!advanced) {
    // Eruit gaan brengt je terug naar "Mijn club" (daar start je de tijdopname zodra de
    // scheidsrechter alles goedkeurde) — enkel de demo blijft naar de kieslijst gaan.
    return (
      <SimpleScorekeeper
        matchId={matchId}
        initialState={state}
        roster={roster}
        reeks={reeks}
        exitHref={isDemo || supportersMode ? '/scorekeeper' : '/club'}
        supportersMode={supportersMode}
      />
    )
  }

  const readiness = await getMatchReadiness(payload, matchId)

  // Posities voor een nieuw toegevoegde speler. De legacy "kant onbekend" laten we weg: een
  // nieuwe speler kiest meteen links/rechts zodat de analyse meteen klopt.
  const positionOptions = POSITION_OPTIONS.filter((o) => o.value !== 'vleugel').map((o) => ({ value: o.value, label: o.label }))

  return (
    <Scorekeeper
      matchId={matchId}
      initialState={state}
      roster={roster}
      readiness={readiness}
      isAdmin={isAdmin}
      positionOptions={positionOptions}
    />
  )
}
