import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { formatDateTimeBE } from '@/lib/datetime'
import { getPayloadClient } from '@/lib/payload-client'
import { buildWeeklyRecapData } from '@/lib/weekly-recap-data'
import './recap.css'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Weekoverzicht — Krachtbal Live',
  description: 'De voorbije speelweek in het kort: uitslagen, ploeg van de week, opvallende cijfers en wie klom.',
}

// De maandag-recap: het wekelijkse ritueel. Alles wordt live afgeleid uit de wedstrijddata, dus
// een gecorrigeerde uitslag verschijnt hier meteen mee.
export default async function RecapPage() {
  const payload = await getPayloadClient()
  const recap = await buildWeeklyRecapData(payload)

  const dag = (iso: string) => formatDateTimeBE(iso, { day: 'numeric', month: 'long' })
  // Het venster loopt tot maandagochtend; als periode toont dat beter als "tot en met zondag".
  const periode = `${dag(recap.startIso)} — ${dag(new Date(new Date(recap.endIso).getTime() - 86_400_000).toISOString())}`

  return (
    <>
      <SiteHeader active="wedstrijden" />
      <div className="site">
        <Link href="/" className="back-link">
          ← Alle wedstrijden
        </Link>

        <header className="recap-head">
          <div className="recap-head-top">
            <span className="recap-edition"><i aria-hidden /> WEEKEND RECAP</span>
            <span className="recap-period">{periode}</span>
          </div>
          <h1 className="recap-title">{recap.headline}</h1>
          {recap.matches > 0 && (
            <div className="recap-head-foot">
              <span>DE WEEK IN CIJFERS</span>
              <i aria-hidden />
            </div>
          )}
        </header>

        {recap.matches === 0 ? (
          <p className="recap-empty">
            Er werd de voorbije week niet gespeeld. Bekijk de <Link href="/">komende wedstrijden</Link> of doe je{' '}
            <Link href="/pronostiek">voorspelling</Link> voor het volgende weekend.
          </p>
        ) : (
          <>
            <section className="recap-stats" aria-label="Het weekend in cijfers">
              <div className="recap-stat recap-stat--blue"><span aria-hidden>🏟️</span><b>{recap.matches}</b><small>wedstrijden</small></div>
              <div className="recap-stat recap-stat--cyan"><span aria-hidden>👥</span><b>{recap.stats.visitors}</b><small>bezoekers</small></div>
              <div className="recap-stat recap-stat--violet"><span aria-hidden>🛡️</span><b>{recap.stats.clubs}</b><small>clubs</small></div>
              <div className="recap-stat recap-stat--red"><span aria-hidden>🎯</span><b>{recap.stats.goalThrows}</b><small>doelworpen</small></div>
              <div className="recap-stat recap-stat--orange"><span aria-hidden>💥</span><b>{recap.stats.backThrows}</b><small>rugworpen</small></div>
              <div className="recap-stat recap-stat--gold"><span aria-hidden>Σ</span><b>{recap.goals}</b><small>punten</small></div>
            </section>

            {recap.highlights.length > 0 && (
              <section className="recap-block recap-block--highlights" aria-label="Opvallend">
                <div className="recap-section-head">
                  <span>TOPPRESTATIES</span>
                  <h2 className="recap-h2">Dit viel op</h2>
                </div>
                <ul className="recap-highlights">
                  {recap.highlights.map((h) => (
                    <li key={h.key} className="recap-highlight">
                      <span className="recap-highlight-emoji" aria-hidden>
                        {h.emoji}
                      </span>
                      <span className="recap-highlight-txt">
                        <b>{h.title}</b>
                        <Link href={`/match/${h.matchId}`}>{h.text}</Link>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {recap.team && (
              <section className="recap-block recap-block--team" aria-label="Ploeg van de week">
                <div className="recap-team-trophy" aria-hidden>🏆</div>
                <div>
                  <span className="recap-eyebrow">PERFORMANCE VAN DE WEEK</span>
                  <h2 className="recap-h2">Ploeg van de week</h2>
                  <p className="recap-team">
                    <b>{recap.team.teamName}</b> won met <strong>{recap.team.goalsFor}–{recap.team.goalsAgainst}</strong>
                    {recap.team.reeks ? ` in ${recap.team.reeks}` : ''} — een doelsaldo van <em>+{recap.team.diff}</em>.
                  </p>
                </div>
              </section>
            )}

            {recap.players.length > 0 && (
              <section className="recap-block" aria-label="Selectie van de week">
                <h2 className="recap-h2">Selectie van de week</h2>
                <ol className="recap-players">
                  {recap.players.map((p, i) => (
                    <li key={p.playerId} className="recap-player">
                      <span className="recap-player-rank">{i + 1}</span>
                      <span className="recap-player-txt">
                        <b>
                          {p.shirtNumber != null ? `#${p.shirtNumber} ` : ''}
                          {p.name}
                        </b>
                        <i>
                          {p.teamName}
                          {p.reeks ? ` · ${p.reeks}` : ''}
                        </i>
                      </span>
                      <span className="recap-player-stat">
                        {p.points} {p.points === 1 ? 'punt' : 'punten'}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {recap.climbers.length > 0 && (
              <section className="recap-block" aria-label="Klimmers">
                <h2 className="recap-h2">Wie klom</h2>
                <ul className="recap-climbers">
                  {recap.climbers.slice(0, 8).map((c) => (
                    <li key={`${c.teamId}-${c.reeks}`} className="recap-climber">
                      <span className="recap-climber-delta">▲ {c.delta}</span>
                      <span>
                        <b>{c.teamName}</b> — van plaats {c.from} naar {c.to}
                        {c.reeks ? ` in ${c.reeks}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="recap-block" aria-label="Alle uitslagen">
              <h2 className="recap-h2">
                Alle uitslagen <span className="recap-count">({recap.matches})</span>
              </h2>
              <ul className="recap-results">
                {recap.results.map((m) => (
                  <li key={m.matchId} className="recap-result">
                    <Link href={`/match/${m.matchId}`} className="recap-result-link">
                      <span className="recap-result-teams">
                        {m.home} <b>{m.homeGoals}</b>–<b>{m.awayGoals}</b> {m.away}
                      </span>
                      {m.reeks && <span className="recap-result-reeks">{m.reeks}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </>
  )
}
