import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { hasRole, isClubStaff, isFederationLevel, userClubId, userFollowedClubIds, userPlayerId } from '@/lib/access'
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

  // Mijn club: naam + volgende wedstrijd + laatste uitslag.
  let club: { id: number; name: string } | null = null
  let nextMatch: { id: number; date?: string; home: string; away: string } | null = null
  let lastMatch: { id: number; home: string; away: string; score: { home: number; away: number } | null } | null = null
  if (clubId != null) {
    const c = await payload.findByID({ collection: 'clubs', id: Number(clubId), depth: 0 }).catch(() => null)
    if (c) club = { id: c.id as number, name: String(c.name) }
    const teamsRes = await payload.find({ collection: 'teams', where: { club: { equals: clubId } }, depth: 0, limit: 60 }).catch(() => ({ docs: [] as { id: number }[] }))
    const teamIds = teamsRes.docs.map((t) => t.id)
    if (teamIds.length) {
      const ms = await payload
        .find({ collection: 'matches', where: { and: [{ or: [{ homeTeam: { in: teamIds } }, { awayTeam: { in: teamIds } }] }, competitionWhere()] }, sort: 'date', depth: 1, limit: 300 })
        .catch(() => ({ docs: [] as Record<string, unknown>[] }))
      const up = ms.docs.find((m) => (m as { status?: string }).status !== 'finished')
      if (up) nextMatch = { id: (up as { id: number }).id, date: (up as { date?: string }).date, home: teamName((up as { homeTeam?: unknown }).homeTeam), away: teamName((up as { awayTeam?: unknown }).awayTeam) }
      const fin = ms.docs.filter((m) => (m as { status?: string }).status === 'finished').sort((a, b) => new Date(String((b as { date?: string }).date ?? 0)).getTime() - new Date(String((a as { date?: string }).date ?? 0)).getTime())[0]
      if (fin) lastMatch = { id: (fin as { id: number }).id, home: teamName((fin as { homeTeam?: unknown }).homeTeam), away: teamName((fin as { awayTeam?: unknown }).awayTeam), score: await scoreOf(payload, (fin as { id: number }).id) }
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

        {/* Mijn club */}
        {club ? (
          <section className="hub-sec">
            <h2 className="hub-h2">Mijn club</h2>
            <div className="hub-club">
              <div className="hub-club-head">
                <Link href={`/clubs/${club.id}`} className="hub-club-name">{club.name}</Link>
                {isStaff && <Link href="/club" className="hub-club-manage">🛠️ Clubbeheer →</Link>}
              </div>
              <div className="hub-club-rows">
                {nextMatch && (
                  <Link href={`/match/${nextMatch.id}`} className="hub-club-row">
                    <span className="hub-club-lbl">Volgende</span>
                    <span className="hub-club-teams">{nextMatch.home} — {nextMatch.away}</span>
                    <span className="hub-club-date">{nextMatch.date ? formatDateTimeBE(String(nextMatch.date)) : ''}</span>
                  </Link>
                )}
                {lastMatch && (
                  <Link href={`/match/${lastMatch.id}`} className="hub-club-row">
                    <span className="hub-club-lbl">Laatste</span>
                    <span className="hub-club-teams">{lastMatch.home} — {lastMatch.away}</span>
                    {lastMatch.score && <span className="hub-club-score">{lastMatch.score.home}–{lastMatch.score.away}</span>}
                  </Link>
                )}
                {!nextMatch && !lastMatch && <p className="hub-empty">Nog geen wedstrijden voor je club.</p>}
              </div>
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
