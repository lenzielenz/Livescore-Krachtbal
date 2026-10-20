import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { SiteHeader } from '@/components/SiteHeader'
import { POSITION_OPTIONS } from '@/collections/Players'
import { hasRole } from '@/lib/access'
import { canViewAnalyseMatch } from '@/lib/analyse-access'
import { getAuthUser } from '@/lib/auth-user'
import { buildMatchState } from '@/lib/match-engine'
import { getMatchReadiness } from '@/lib/matchsheet-data'
import { missingSteps } from '@/lib/match-readiness'
import { mayScoreMatch, refereeMayHandleMatch, type AuthedUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { reeksNaam } from '@/lib/reeksen'
import { isSupportersMode } from '@/lib/score-mode'
import { wedstrijdSelectie } from '@/lib/wedstrijd-selectie'
import { Overnemen } from './Overnemen'
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

  // Federatieflow: de aantekentafel kiest uit de selectie van de coach (het wedstrijdblad), met het
  // rugnummer van dat blad — ook spelers uit een lagere ploeg. Zonder selectie (supporters, analyse,
  // geen blad) blijven het de spelers van beide ploegen (lib/wedstrijd-selectie.ts).
  const selectie = await wedstrijdSelectie(payload, matchId)
  const selectieIds = [...selectie.home, ...selectie.away].map((r) => r.id)
  const players = await payload.find({
    collection: 'players',
    where: {
      or: [
        { team: { in: [state.teams.home.id, state.teams.away.id] } },
        ...(selectieIds.length ? [{ id: { in: selectieIds } }] : []),
      ],
    },
    sort: 'shirtNumber',
    depth: 0,
    limit: 300,
  })

  const kantVan = (side: 'home' | 'away') => {
    const teamId = state.teams[side].id
    const sel = selectie[side]
    const byId = new Map(players.docs.map((p) => [Number(p.id), p]))
    const bron = sel.length
      ? sel.map((r) => ({ p: byId.get(r.id), nr: r.rugnummer })).filter((x) => x.p)
      : players.docs.filter((p) => (typeof p.team === 'object' ? p.team.id : p.team) === teamId).map((p) => ({ p, nr: null }))
    return bron.map(({ p, nr }) => ({
      id: p!.id,
      name: p!.name,
      shirtNumber: nr ?? p!.shirtNumber,
      teamId,
      position: (p!.position as string | null) ?? null,
    }))
  }
  const roster = [...kantVan('home'), ...kantVan('away')]

  const reeks = reeksNaam(matchDoc?.reeks)
  const isDemo = Boolean((matchDoc as { isDemo?: boolean } | null)?.isDemo)
  const isAnalyse = Boolean((matchDoc as { analyseOnly?: boolean } | null)?.analyseOnly)
  // Globale supporters-modus (één knop voor alle wedstrijden) — geldt niet voor privé-analyse.
  const supportersMode = !isAnalyse && (await isSupportersMode(payload))
  // In supportersmodus staat de demo uit (zie demo/page.tsx) — ook via een oude link.
  if (isDemo && supportersMode) redirect('/')

  // Niet ingelogd: aantekenen vraagt altijd een account (api-auth.ts weigert een anonieme
  // mutatie). Toon een nette inlog-uitnodiging i.p.v. een scorebord waarvan elke tik mislukt.
  if (!isDemo && !user) {
    return (
      <>
        <SiteHeader active="wedstrijden" />
        <div className="site">
          <h1 className="page-title">Aantekenen</h1>
          <p className="empty">
            {supportersMode
              ? 'Log in om de score van deze wedstrijd door te geven. Aantekenen kan door elke ingelogde supporter — een account maken is gratis.'
              : 'Log in om deze wedstrijd aan te tekenen. In de federatieflow tekent de aangeduide tafel aan: de clubverantwoordelijke, de aantekenaar of de scheidsrechter van dienst.'}
          </p>
          <p className="sk-login-actions">
            <Link href={`/inloggen?next=/scorekeeper/${matchId}`} className="match-score-cta">
              <span aria-hidden>🔑</span>
              <span>Inloggen om aan te tekenen</span>
              <span className="match-score-cta-arrow" aria-hidden>→</span>
            </Link>
            {supportersMode && <Link href="/registreren" className="back-link">Nog geen account? Registreren →</Link>}
          </p>
        </div>
      </>
    )
  }

  // Federatieflow: enkel wie deze wedstrijd mag aantekenen (zie mayScoreMatch) krijgt het scherm.
  // Anders zag je een volledig werkend ogend scorebord waarvan elke tik op 403 eindigde.
  if (!isDemo && !supportersMode && !isAnalyse && !(await mayScoreMatch(payload, user as unknown as AuthedUser | null, matchId))) {
    return (
      <>
        <SiteHeader active="wedstrijden" />
        <div className="site">
          <h1 className="page-title">Aantekenen</h1>
          <p className="empty">
            Je kan deze wedstrijd niet aantekenen. In de federatieflow doet de aangeduide tafel dat:
            de verantwoordelijke van een van beide clubs, een aantekenaar of de scheidsrechter van dienst.
          </p>
          <p className="sk-login-actions">
            <Link href={`/match/${matchId}`} className="match-score-cta">
              <span aria-hidden>📺</span>
              <span>Volg de wedstrijd</span>
              <span className="match-score-cta-arrow" aria-hidden>→</span>
            </Link>
          </p>
        </div>
      </>
    )
  }

  // Vertrouwenslaag: tekent een ándere persoon deze wedstrijd al aan, dan mag jij niet muteren
  // (zie claimHeld: op een lopende wedstrijd vervalt die claim niet, de actie-route dwingt dat af). Zeg dat hier meteen, i.p.v. een volledig werkend ogend scorebord te tonen
  // waarvan elke tik met een foutmelding eindigt. Bevestigen of betwisten kan wél — op de
  // wedstrijdpagina. Federatie/aantekenaars gaan altijd voor op de crowd.
  //
  // Dezelfde claim geldt ook in federatiemodus: daar bestaat geen confirm/dispute-laag, maar de
  // claim/lastActiveAt wordt sinds kort ook daar bijgehouden (zie noteContribution in
  // score-trust-store.ts), precies om te vermijden dat twee aangeduide aantekenaars tegelijk
  // beginnen. De knop verdwijnt hiervoor al op /club (wedstrijddag-acties.ts); dit is de
  // server-kant die iemand die toch rechtstreeks naar deze url gaat tegenhoudt.
  const trust = state.trust
  const someoneElseScores =
    !isDemo &&
    trust.claimActive &&
    trust.scorerId != null &&
    Number(trust.scorerId) !== Number((user as { id?: number } | null)?.id) &&
    !hasRole(user, 'admin', 'federatie')
  if (someoneElseScores) {
    return (
      <>
        <SiteHeader active="wedstrijden" />
        <div className="site">
          <h1 className="page-title">Aantekenen</h1>
          <p className="empty">
            <b>{trust.scorerName ?? 'Iemand anders'}</b> tekent deze wedstrijd al aan. Om te vermijden
            dat twee mensen door elkaar scoren, kan er maar één tegelijk aantekenen.
            {state.match.status === 'live' ? '' : ' Valt die stil vóór de aftrap, dan kan jij het na een tijdje overnemen.'}
            {supportersMode ? ' Volg intussen mee en bevestig of betwist de stand op de wedstrijdpagina.' : ' Volg intussen mee op de wedstrijdpagina.'}
          </p>
          {state.match.status === 'live' && (
            <Overnemen
              matchId={matchId}
              scorerName={trust.scorerName ?? 'de aantekenaar'}
              laatstActief={trust.laatstActief}
              direct={await refereeMayHandleMatch(payload, user as AuthedUser | null, matchId)}
            />
          )}
          <p className="sk-login-actions">
            <Link href={`/match/${matchId}`} className="match-score-cta">
              <span aria-hidden>📺</span>
              <span>Naar de wedstrijd</span>
              <span className="match-score-cta-arrow" aria-hidden>→</span>
            </Link>
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

  // Eruit gaan: terug naar waar je vandaan kwam. Clubstaf → Mijn club (daar start je de
  // tijdopname), de scheidsrechter → zijn wedstrijdscherm, de rest (aantekenaar, federatie, demo,
  // supporters) → de lijst om aan te tekenen. Iemand zonder club kwam anders op "niet gekoppeld".
  const exitHref =
    isDemo || supportersMode
      ? '/scorekeeper'
      : hasRole(user, 'club-beheerder', 'club-medewerker')
        ? '/club'
        : hasRole(user, 'scheidsrechter')
          ? `/scheidsrechter/${matchId}`
          : '/scorekeeper'
  // Federatieflow vóór de aftrap: wat ontbreekt er nog om te mogen starten? Het snelscorescherm
  // toont het i.p.v. een starttik die de server toch weigert (zie startControle in de actie-route).
  const startReadiness = !supportersMode && !isDemo && state.match.status === 'scheduled' ? await getMatchReadiness(payload, matchId) : null
  const startKlaar = startReadiness && !startReadiness.ready ? { ontbreekt: missingSteps(startReadiness) } : null

  if (!advanced) {
    // Eruit gaan brengt je terug naar "Mijn club" (daar start je de tijdopname zodra de
    // scheidsrechter alles goedkeurde) — enkel de demo blijft naar de kieslijst gaan.
    return (
      <SimpleScorekeeper
        matchId={matchId}
        initialState={state}
        roster={roster}
        reeks={reeks}
        exitHref={exitHref}
        supportersMode={supportersMode}
        startKlaar={startKlaar}
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
