import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { hasRole, isClubStaff, isFederationLevel, userClubId, userFollowedClubIds, userPlayerId, userTeamId, userTeamIds } from '@/lib/access'
import { competitionWhere } from '@/lib/analyse-access'
import { getAuthUser } from '@/lib/auth-user'
import { formatDateTimeBE } from '@/lib/datetime'
import { buildMatchState } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { getProfile } from '@/lib/profiles'
import './hub.css'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Mijn Krachtbal — Krachtbal Live' }

const teamName = (v: unknown): string => (v && typeof v === 'object' ? String((v as { name?: unknown }).name ?? '—') : '—')
const scoreOf = async (payload: Awaited<ReturnType<typeof getPayloadClient>>, id: number) => {
  try {
    const st = await buildMatchState(payload, id)
    return { home: st.score.home, away: st.score.away }
  } catch {
    return null
  }
}

type HubMatchInfo = { id: number; date?: string; home: string; away: string }
type HubLastMatchInfo = { id: number; home: string; away: string; score: { home: number; away: number } | null }

// Volgende + laatste wedstrijd voor een set ploegen (club-breed = alle ploegen van de club, of
// net één specifieke ploeg voor een gepersonaliseerde kaart — zie "Mijn ploeg(en)" hieronder).
async function nextLastForTeamIds(
  payload: Awaited<ReturnType<typeof getPayloadClient>>,
  teamIds: number[],
): Promise<{ next: HubMatchInfo | null; last: HubLastMatchInfo | null }> {
  if (teamIds.length === 0) return { next: null, last: null }
  const ms = await payload
    .find({ collection: 'matches', where: { and: [{ or: [{ homeTeam: { in: teamIds } }, { awayTeam: { in: teamIds } }] }, competitionWhere()] }, sort: 'date', depth: 1, limit: 300 })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const up = ms.docs.find((m) => (m as { status?: string }).status !== 'finished')
  const next: HubMatchInfo | null = up
    ? { id: (up as { id: number }).id, date: (up as { date?: string }).date, home: teamName((up as { homeTeam?: unknown }).homeTeam), away: teamName((up as { awayTeam?: unknown }).awayTeam) }
    : null
  const fin = ms.docs
    .filter((m) => (m as { status?: string }).status === 'finished')
    .sort((a, b) => new Date(String((b as { date?: string }).date ?? 0)).getTime() - new Date(String((a as { date?: string }).date ?? 0)).getTime())[0]
  const last: HubLastMatchInfo | null = fin
    ? { id: (fin as { id: number }).id, home: teamName((fin as { homeTeam?: unknown }).homeTeam), away: teamName((fin as { awayTeam?: unknown }).awayTeam), score: await scoreOf(payload, (fin as { id: number }).id) }
    : null
  return { next, last }
}

export default async function HubPage() {
  const me = await getAuthUser()
  const payload = await getPayloadClient()
  const clubId = userClubId(me)
  // Account gekoppeld aan een speler-dossier? Dan tonen we de eigen ontwikkeling.
  const myPlayerId = userPlayerId(me)
  // Rol-gebonden werkschermen (los van "Mijn club" hieronder, dat elk clublid al ziet): een
  // scheidsrechter of federatielid heeft hier geen club nodig om toch meteen bij zijn eigen
  // portaal te raken.
  const isStaff = isClubStaff(me)
  const isReferee = hasRole(me, 'scheidsrechter')
  const isFed = isFederationLevel(me)

  // Mijn club: naam + volgende wedstrijd + laatste uitslag. Koos je in je profiel één ploeg (of als
  // coach meteen meerdere, zie /profiel), dan personaliseren we dit naar precies die ploeg(en) i.p.v.
  // eender welke ploeg van de club te tonen — dezelfde ploegkeuze die ook het live-bord highlight.
  let club: { id: number; name: string } | null = null
  let nextMatch: HubMatchInfo | null = null
  let lastMatch: HubLastMatchInfo | null = null
  let selectedTeams: { id: number; name: string; next: HubMatchInfo | null; last: HubLastMatchInfo | null }[] = []
  if (clubId != null) {
    const c = await payload.findByID({ collection: 'clubs', id: Number(clubId), depth: 0 }).catch(() => null)
    if (c) club = { id: c.id as number, name: String(c.name) }

    const soloTeamId = userTeamId(me)
    const multiTeamIds = userTeamIds(me)
    const selectedTeamIds = multiTeamIds.length > 0 ? multiTeamIds : soloTeamId != null && Number.isFinite(Number(soloTeamId)) ? [Number(soloTeamId)] : []

    if (selectedTeamIds.length > 0) {
      const teamsRes = await payload
        .find({ collection: 'teams', where: { id: { in: selectedTeamIds } }, sort: 'displayTitle', depth: 0, limit: selectedTeamIds.length, select: { displayTitle: true } })
        .catch(() => ({ docs: [] as { id: number; displayTitle?: string | null }[] }))
      selectedTeams = await Promise.all(
        teamsRes.docs.map(async (t) => {
          const { next, last } = await nextLastForTeamIds(payload, [t.id as number])
          return { id: t.id as number, name: String(t.displayTitle ?? 'Ploeg'), next, last }
        }),
      )
    } else {
      const teamsRes = await payload.find({ collection: 'teams', where: { club: { equals: clubId } }, depth: 0, limit: 60 }).catch(() => ({ docs: [] as { id: number }[] }))
      const teamIds = teamsRes.docs.map((t) => t.id)
      const { next, last } = await nextLastForTeamIds(payload, teamIds)
      nextMatch = next
      lastMatch = last
    }
  }

  // Geen eigen club? Dan tonen we de club(s) die deze supporter koos te volgen (zie /registreren
  // "Alleen supporter" en /profiel) — snelle links i.p.v. de kale "stel je club in"-melding.
  let followedClubs: { id: number; name: string }[] = []
  if (clubId == null) {
    const followedIds = userFollowedClubIds(me)
    if (followedIds.length > 0) {
      const res = await payload
        .find({ collection: 'clubs', where: { id: { in: followedIds } }, depth: 0, sort: 'name', limit: followedIds.length, pagination: false })
        .catch(() => ({ docs: [] as { id: number; name: string }[] }))
      followedClubs = res.docs.map((c) => ({ id: c.id as number, name: String(c.name) }))
    }
  }

  // Laatste nieuws.
  const news = await payload
    .find({ collection: 'news', where: { published: { equals: true } }, sort: '-publishedAt', depth: 0, limit: 3 })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))

  return (
    <>
      <SiteHeader />
      <div className="site hub">
        <h1 className="page-title">🏠 <span className="brand">Mijn Krachtbal</span></h1>

        {/* Mijn club — gepersonaliseerd naar de ploeg(en) uit je profiel (zie /profiel "Mijn functie"
            / "Mijn ploeg(en)"); zonder gekozen ploeg valt dit terug op de club-brede wedstrijden. Elke
            rij springt bij een klik meteen naar de live wedstrijdpagina (/match/[id]). */}
        {club ? (
          <section className="hub-sec">
            <h2 className="hub-h2">Mijn club</h2>
            <div className="hub-club">
              <div className="hub-club-head">
                <Link href={`/clubs/${club.id}`} className="hub-club-name">{club.name}</Link>
                {isStaff && <Link href="/club" className="hub-club-manage">🛠️ Clubbeheer →</Link>}
              </div>
              {selectedTeams.length > 0 ? (
                <div className="hub-team-groups">
                  {selectedTeams.map((t) => (
                    <div key={t.id} className="hub-team-group">
                      {selectedTeams.length > 1 && <span className="hub-team-label">{t.name}</span>}
                      <div className="hub-club-rows">
                        {t.next && (
                          <Link
                            href={`/match/${t.next.id}`}
                            className="hub-club-row"
                            aria-label={`Volgende wedstrijd van ${t.name}: ${t.next.home} tegen ${t.next.away}${t.next.date ? ', ' + formatDateTimeBE(String(t.next.date)) : ''}`}
                          >
                            <span className="hub-club-row-top">
                              <span className="hub-club-lbl">Volgende</span>
                              {t.next.date && <span className="hub-club-date">{formatDateTimeBE(String(t.next.date))}</span>}
                            </span>
                            <span className="hub-club-teams">{t.next.home} — {t.next.away}</span>
                          </Link>
                        )}
                        {t.last && (
                          <Link
                            href={`/match/${t.last.id}`}
                            className="hub-club-row"
                            aria-label={`Laatste wedstrijd van ${t.name}: ${t.last.home} tegen ${t.last.away}${t.last.score ? `, eindstand ${t.last.score.home}-${t.last.score.away}` : ''}`}
                          >
                            <span className="hub-club-row-top">
                              <span className="hub-club-lbl">Laatste</span>
                              {t.last.score && <span className="hub-club-score">{t.last.score.home}–{t.last.score.away}</span>}
                            </span>
                            <span className="hub-club-teams">{t.last.home} — {t.last.away}</span>
                          </Link>
                        )}
                        {!t.next && !t.last && <p className="hub-empty">Nog geen wedstrijden voor {t.name}.</p>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="hub-club-rows">
                  {nextMatch && (
                    <Link
                      href={`/match/${nextMatch.id}`}
                      className="hub-club-row"
                      aria-label={`Volgende wedstrijd: ${nextMatch.home} tegen ${nextMatch.away}${nextMatch.date ? ', ' + formatDateTimeBE(String(nextMatch.date)) : ''}`}
                    >
                      <span className="hub-club-row-top">
                        <span className="hub-club-lbl">Volgende</span>
                        {nextMatch.date && <span className="hub-club-date">{formatDateTimeBE(String(nextMatch.date))}</span>}
                      </span>
                      <span className="hub-club-teams">{nextMatch.home} — {nextMatch.away}</span>
                    </Link>
                  )}
                  {lastMatch && (
                    <Link
                      href={`/match/${lastMatch.id}`}
                      className="hub-club-row"
                      aria-label={`Laatste wedstrijd: ${lastMatch.home} tegen ${lastMatch.away}${lastMatch.score ? `, eindstand ${lastMatch.score.home}-${lastMatch.score.away}` : ''}`}
                    >
                      <span className="hub-club-row-top">
                        <span className="hub-club-lbl">Laatste</span>
                        {lastMatch.score && <span className="hub-club-score">{lastMatch.score.home}–{lastMatch.score.away}</span>}
                      </span>
                      <span className="hub-club-teams">{lastMatch.home} — {lastMatch.away}</span>
                    </Link>
                  )}
                  {!nextMatch && !lastMatch && <p className="hub-empty">Nog geen wedstrijden voor je club.</p>}
                </div>
              )}
            </div>
          </section>
        ) : followedClubs.length > 0 ? (
          <section className="hub-sec">
            <h2 className="hub-h2">Gevolgde clubs</h2>
            <div className="hub-tiles">
              {followedClubs.map((c) => (
                <Link key={c.id} href={`/clubs/${c.id}`} className="hub-tile">🛡️<span>{c.name}</span></Link>
              ))}
            </div>
            <p className="hub-empty">Geen eigen club? Pas je gevolgde clubs aan op <Link href="/profiel">je profiel</Link>.</p>
          </section>
        ) : (
          <section className="hub-sec">
            <h2 className="hub-h2">Mijn club</h2>
            <p className="hub-empty">
              {me ? <>Stel je club in — of volg er een paar zonder lid te zijn — op <Link href="/profiel">je profiel</Link>.</> : <><Link href="/inloggen">Log in</Link> en kies je club om alles op maat te zien.</>}
            </p>
          </section>
        )}

        {/* Kantinescherm, Ideeënbus en Zo werkt het — verhuisd van de menubalk naartoe hier: het
            zijn geen "leesvoer" zoals Weekoverzicht/Nieuws (die staan bij Ontdekken), maar directe
            hulpmiddelen die bij je eigen startpagina horen. Altijd zichtbaar, ook uitgelogd, want
            deze pagina zelf blokkeert niet op een account. */}
        <section className="hub-sec">
          <h2 className="hub-h2">Krachtbal-tools</h2>
          <div className="hub-tiles">
            <Link href="/kantine" className="hub-tile">📺<span>Kantinescherm</span></Link>
            <Link href="/ideeenbus" className="hub-tile">💡<span>Ideeënbus</span></Link>
            <Link href="/uitleg" className="hub-tile">🎓<span>Zo werkt het</span></Link>
          </div>
        </section>

        {/* Beheer — rol-gebonden werkschermen. Club-staf heeft al "Clubbeheer" hierboven bij "Mijn
            club"; scheidsrechter/federatie hebben geen eigen club nodig om hier meteen bij hun
            portaal te raken (voorheen enkel bereikbaar via het "Meer"-menu). */}
        {(isReferee || isFed) && (
          <section className="hub-sec">
            <h2 className="hub-h2">Beheer</h2>
            <div className="hub-role-grid">
              {isReferee && (
                <Link href={getProfile('scheidsrechters').hubHref} className="hub-role-card">
                  <span className="hub-role-badge" aria-hidden>{getProfile('scheidsrechters').badge}</span>
                  <span className="hub-role-title">{getProfile('scheidsrechters').title}</span>
                  <span className="hub-role-intro">{getProfile('scheidsrechters').intro}</span>
                </Link>
              )}
              {isFed && (
                <Link href={getProfile('federatie').hubHref} className="hub-role-card">
                  <span className="hub-role-badge" aria-hidden>{getProfile('federatie').badge}</span>
                  <span className="hub-role-title">{getProfile('federatie').title}</span>
                  <span className="hub-role-intro">{getProfile('federatie').intro}</span>
                </Link>
              )}
            </div>
          </section>
        )}

        {/* Mijn ontwikkeling — enkel als het account aan een speler gekoppeld is. */}
        {myPlayerId != null && (
          <section className="hub-sec">
            <h2 className="hub-h2">Mijn ontwikkeling</h2>
            <div className="hub-tiles">
              <Link href="/ontwikkeling" className="hub-tile">📈<span>Skill &amp; Fame</span></Link>
              <Link href="/beheer/training/progressie" className="hub-tile">🏋️<span>Mijn training</span></Link>
            </div>
          </section>
        )}

        {/* Mijn profiel & seizoen — alles wat persoonlijk aan dit account hangt: instellingen,
            gamification en de eigen seizoensverhalen. Wat al via de hoofdnavigatie bereikbaar is
            (stand, tornooien, nieuws, ...) staat daar en wordt hier niet gedupliceerd. */}
        {me && (
          <section className="hub-sec">
            <h2 className="hub-h2">Mijn profiel &amp; seizoen</h2>
            <div className="hub-tiles">
              <Link href="/profiel" className="hub-tile">👤<span>Mijn profiel</span></Link>
              <Link href="/profiel/paspoort" className="hub-tile">🎟️<span>Paspoort</span></Link>
              <Link href="/profiel/badges" className="hub-tile">🏅<span>Badges</span></Link>
              <Link href="/profiel/scorecard" className="hub-tile">🃏<span>Scorecard</span></Link>
              <Link href="/pronostiek" className="hub-tile">🔮<span>Pronostiek</span></Link>
              <Link href="/fans" className="hub-tile">📣<span>Supporters</span></Link>
              <Link href="/wrapped" className="hub-tile">🎁<span>Wrapped</span></Link>
              <Link href="/weekendplan" className="hub-tile">📲<span>Weekendplan</span></Link>
            </div>
          </section>
        )}

        {/* Laatste nieuws */}
        {news.docs.length > 0 && (
          <section className="hub-sec">
            <h2 className="hub-h2">Laatste nieuws</h2>
            <div className="hub-news">
              {news.docs.map((n) => (
                <Link key={(n as { id: number }).id} href={`/nieuws/${(n as { id: number }).id}`} className="hub-news-item">
                  <span className="hub-news-title">{String((n as { title?: unknown }).title ?? '')}</span>
                  {Boolean((n as { excerpt?: unknown }).excerpt) && <span className="hub-news-ex">{String((n as { excerpt?: unknown }).excerpt)}</span>}
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  )
}
