import Link from 'next/link'

import { FlowNietNodig } from '@/components/FlowNietNodig'
import { MatchDayNav } from '@/components/MatchDayNav'
import { SiteHeader } from '@/components/SiteHeader'
import { BlessureMelden } from '@/components/BlessureMelden'
import type { AuthedUser } from '@/lib/api-auth'
import { getAuthUser } from '@/lib/auth-user'
import { blessureKanten } from '@/lib/blessure'
import { buildMatchSheet, clubLogoFit, clubLogoUrl } from '@/lib/match-engine'
import { getOrCreateMatchSheet } from '@/lib/matchsheet-data'
import { getPayloadClient } from '@/lib/payload-client'
import { isSupportersMode } from '@/lib/score-mode'
import { AftekenenPanel, type SignatureData } from './AftekenenPanel'
import { KlachtIndienen, type KlachtInfo } from './KlachtIndienen'
import { hasRole, isFederationLevel, userClubId } from '@/lib/access'
import { klachtWeigering } from '@/lib/klacht'
import { TeamLogo } from '@/components/TeamLogo'
import { validateOfficials } from '@/lib/officials-rules'
import type { Reeks } from '@/lib/reeksen'
import { buildMatchSheetPdfData } from '@/lib/submit'
import { scorersVan } from '@/lib/submit/pdf'
import { magWedstrijdbladZien } from '@/lib/wedstrijdblad-toegang'
import '../../wedstrijdblad.css'
import './aftekenen.css'

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

  // Klachten over dit blad (federatie en de staf van beide clubs zien ze; lib/klacht.ts).
  const relIdK = (v: unknown) => (v && typeof v === 'object' ? Number((v as { id?: unknown }).id) : v == null ? null : Number(v))
  const homeClubId = match.homeTeam && typeof match.homeTeam === 'object' ? relIdK((match.homeTeam as { club?: unknown }).club) : null
  const awayClubId = match.awayTeam && typeof match.awayTeam === 'object' ? relIdK((match.awayTeam as { club?: unknown }).club) : null
  const klachtenRes = await payload.find({ collection: 'klachten', where: { match: { equals: Number(matchId) } }, depth: 1, sort: '-createdAt', limit: 20, overrideAccess: true }).catch(() => ({ docs: [] }))
  const eigenClub = userClubId(user)
  const zietKlachten = isFederationLevel(user) || (hasRole(user, 'club-beheerder', 'club-medewerker') && [homeClubId, awayClubId].some((c) => c != null && String(c) === String(eigenClub)))
  const klachtLijst: KlachtInfo[] = zietKlachten
    ? klachtenRes.docs.map((k) => ({
        id: Number(k.id),
        club: k.club && typeof k.club === 'object' ? String(k.club.name ?? '') : '',
        reden: String(k.reden ?? ''),
        status: String(k.status ?? 'open'),
        beslissing: k.beslissing ? String(k.beslissing) : null,
        op: String(k.createdAt),
      }))
    : []
  const klachtReden = klachtWeigering(user, {
    bladStatus: String(sheet.status ?? ''),
    homeClub: homeClubId,
    awayClub: awayClubId,
    openKlachtVanClub: klachtenRes.docs.some((k) => k.status === 'open' && relIdK(k.club) === Number(eigenClub)),
  })
  const klachtMag = klachtReden == null

  // Dezelfde gegevens als de PDF: wat de kapitein hier ziet, is exact wat er op het blad staat.
  const blad = await buildMatchSheetPdfData(payload, matchId).catch(() => null)
  const magPdf = await magWedstrijdbladZien(payload, user, matchId)
  const ff = String((sheet.forfait as { uitslag?: string } | undefined)?.uitslag ?? 'geen')
  const nietNodig = [...(ff === 'thuis' || ff === 'dubbel' ? ['kapiteinThuis' as const] : []), ...(ff === 'uit' || ff === 'dubbel' ? ['kapiteinUit' as const] : [])]
  // Wat de scheidsrechter vóór het indienen nog moet doen (dezelfde controles als bij het indienen,
  // lib/submit/index.ts): vooraf tonen, met een knop ernaartoe, i.p.v. een fout na het klikken.
  const voorwaarden: { tekst: string; href: string }[] = []
  if (ff === 'geen' && ![sheet.homeLineup, sheet.awayLineup].every((rows) => (Array.isArray(rows) ? rows : []).some((r) => (r as { deelgenomen?: boolean }).deelgenomen))) {
    voorwaarden.push({ tekst: 'De scheidsrechter bevestigt wie er speelde.', href: `/scheidsrechter/${matchId}#deelname` })
  }
  if (match.reeks) {
    const check = validateOfficials(match.reeks as Reeks, (sheet.officials ?? {}) as Record<string, string>)
    if (!check.ok) voorwaarden.push({ tekst: `Officials aanvullen: ${check.errors.join(' ')}`, href: `/scheidsrechter/${matchId}#officials` })
  }
  const thuis = built?.teams.home.name ?? blad?.homeTeam ?? 'Thuis'
  const uit = built?.teams.away.name ?? blad?.awayTeam ?? 'Uit'
  const score = blad?.score ?? built?.totals
  const uitslag = score ? `${thuis} ${score.home} – ${score.away} ${uit}` : `${thuis} – ${uit}`
  const ploegBlok = (side: 'home' | 'away') => {
    const lineup = side === 'home' ? (blad?.homeLineup ?? []) : (blad?.awayLineup ?? [])
    const scorers = blad?.goals ? scorersVan(blad.goals, side) : []
    return (
      <div className="aft-ploegblok">
        <h4>{side === 'home' ? thuis : uit}</h4>
        {lineup.length === 0 ? (
          <p className="aft-dim">Geen opstelling{blad?.forfait ? ' (forfait)' : ''}.</p>
        ) : (
          <ul className="aft-lijst">
            {lineup.map((r) => (
              <li key={`${r.rugnummer}-${r.name}`}>
                <span className="aft-rug">{r.rugnummer ?? '–'}</span>
                <span className="aft-speler">
                  {r.name}
                  {r.kapitein && <span className="aft-k" title="Kapitein">K</span>}
                </span>
                {scorers.find((sc) => sc.naam === r.name)?.punten ? <span className="aft-ptn">{scorers.find((sc) => sc.naam === r.name)?.punten} ptn</span> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <>
      <SiteHeader active="clubs" />
      <div className="site aft">
        <MatchDayNav matchId={matchId} current="aftekenen" />

        <section className="aft-hero" aria-label="Uitslag">
          <div className="aft-hero-kop">
            <span>Wedstrijdblad · aftekenen</span>
            {blad?.status && <span className="aft-status">{blad.status.label}</span>}
          </div>
          <div className="aft-hero-score">
            <div className="aft-hero-ploeg">
              <TeamLogo name={thuis} logoUrl={clubLogoUrl(match.homeTeam)} logoFit={clubLogoFit(match.homeTeam)} size={44} />
              <strong>{thuis}</strong>
            </div>
            <div className="aft-hero-uitslag">
              <span className="aft-hero-cijfers">{score ? `${score.home} – ${score.away}` : '–'}</span>
              {blad?.forfait ? <small>Forfait: {blad.forfait}</small> : blad?.halfScores ? <small>Rust {blad.halfScores.home[0]}–{blad.halfScores.away[0]}</small> : null}
            </div>
            <div className="aft-hero-ploeg">
              <TeamLogo name={uit} logoUrl={clubLogoUrl(match.awayTeam)} logoFit={clubLogoFit(match.awayTeam)} size={44} />
              <strong>{uit}</strong>
            </div>
          </div>
          {blad && (
            <p className="aft-hero-meta">
              {blad.datum}
              {blad.terrein ? ` · ${blad.terrein}` : ''}
              {blad.scheidsrechter ? ` · SR ${blad.scheidsrechter}` : ''}
            </p>
          )}
          {magPdf && (
            <div className="aft-hero-pdf">
              <a className="wb-btn" href={`/api/matchsheet/${matchId}/pdf`} target="_blank" rel="noreferrer">📄 Wedstrijdblad bekijken (PDF)</a>
              <a className="wb-btn" href={`/api/matchsheet/${matchId}/pdf?download=1`}>⬇ Downloaden om te printen</a>
            </div>
          )}
        </section>

        {!afgelopen && <p className="aft-melding fout">De wedstrijd is nog niet afgelopen. Aftekenen kan na het eindsignaal.</p>}

        {blad && (
          <details className="aft-samenvatting" open>
            <summary>
              <span>Wat je tekent</span>
              <small>opstellingen, doelpunten, kruisjes en time-outs</small>
            </summary>
            <div className="aft-ploegen">
              {ploegBlok('home')}
              {ploegBlok('away')}
            </div>
            {!blad.forfait && (
              <dl className="aft-tellers">
                <div><dt>Kruisjes</dt><dd>{blad.crosses ? `${blad.crosses.home} – ${blad.crosses.away}` : '–'}</dd></div>
                <div><dt>Time-outs</dt><dd>{blad.timeouts ? `${blad.timeouts.home[0] + blad.timeouts.home[1]} – ${blad.timeouts.away[0] + blad.timeouts.away[1]}` : '–'}</dd></div>
                <div><dt>Wissels</dt><dd>{blad.substitutions?.length ?? 0}</dd></div>
              </dl>
            )}
            {blad.opmerkingen && <p className="aft-opm"><strong>Opmerkingen en kwetsuren:</strong> {blad.opmerkingen}</p>}
          </details>
        )}

        {/* Kwetsuren horen op het blad: geef ze door vóór het aftekenen. */}
        {blessureKantenLijst.length > 0 && afgelopen && sheet.status !== 'ingediend' && (
          <details className="aft-blessure">
            <summary>🚑 Blessure doorgeven (vóór het aftekenen)</summary>
            <BlessureMelden matchId={matchId} kanten={blessureKantenLijst} />
          </details>
        )}

        <AftekenenPanel
          matchId={matchId}
          initialStatus={(sheet.status as string) ?? 'concept'}
          afgelopen={afgelopen}
          homeTeam={thuis}
          awayTeam={uit}
          uitslag={uitslag}
          nietNodig={nietNodig}
          voorwaarden={voorwaarden}
          defaultNames={defaultNames}
          signatures={{
            kapiteinThuis: sheet.kapiteinThuis as SignatureData | undefined,
            kapiteinUit: sheet.kapiteinUit as SignatureData | undefined,
            scheidsrechter: sheet.scheidsrechter as SignatureData | undefined,
          }}
        />

        {sheet.status === 'ingediend' || klachtLijst.length > 0 ? (
          <KlachtIndienen matchId={matchId} klachten={klachtLijst} magIndienen={klachtMag} weigering={klachtReden} />
        ) : null}
      </div>
    </>
  )
}
