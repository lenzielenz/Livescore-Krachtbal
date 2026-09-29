import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { formatDateTimeBE } from '@/lib/datetime'
import { getPayloadClient } from '@/lib/payload-client'
import { weekendRange } from '@/lib/pronostiek-weekend'
import { buildSeasonRecapData } from '@/lib/season-recap-data'
import { previousWeekRange } from '@/lib/weekly-recap'
import { buildWeeklyRecapData } from '@/lib/weekly-recap-data'
import { RecapFieldBackdrop } from './RecapFieldBackdrop'
import './recap.css'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Weekoverzicht — Krachtbal Live',
  description: 'De voorbije speelweek in het kort: uitslagen, ploeg van de week, opvallende cijfers en wie klom.',
}

const dag = (iso: string) => formatDateTimeBE(iso, { day: 'numeric', month: 'long' })
// Het venster loopt tot maandagochtend; als periode toont dat beter als "tot en met zondag".
const periodeVan = (startIso: string, endIso: string) =>
  `${dag(startIso)} — ${dag(new Date(new Date(endIso).getTime() - 86_400_000).toISOString())}`

// De maandag-recap: het wekelijkse ritueel. Alles wordt live afgeleid uit de wedstrijddata, dus
// een gecorrigeerde uitslag verschijnt hier meteen mee. Een `week`-parameter (de starttijd van een
// speelweek) laat toe om via het archief onderaan naar een voorbije speelweek terug te keren —
// zonder parameter toont de pagina gewoon de meest recente.
export default async function RecapPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { week: weekParam } = await searchParams
  const payload = await getPayloadClient()
  const now = new Date()
  const latest = previousWeekRange(now)
  const range = weekParam ? weekendRange(weekParam) : latest
  const bekijktLatest = range.startIso === latest.startIso

  const [recap, season] = await Promise.all([
    buildWeeklyRecapData(payload, { range }),
    buildSeasonRecapData(payload, now),
  ])

  const periode = periodeVan(recap.startIso, recap.endIso)

  const trend = (() => {
    if (recap.previousMatches == null) return null
    const delta = recap.matches - recap.previousMatches
    if (delta > 0) return { dir: 'up', text: `${delta} meer dan vorige week` }
    if (delta < 0) return { dir: 'down', text: `${Math.abs(delta)} minder dan vorige week` }
    return { dir: 'flat', text: 'evenveel als vorige week' }
  })()

  return (
    <>
      <SiteHeader active="wedstrijden" />
      <div className="site">
        <Link href="/" className="back-link">
          ← Alle wedstrijden
        </Link>

        <header className="recap-hero">
          <div className="recap-head-top">
            <span className="recap-edition"><i aria-hidden /> {bekijktLatest ? 'WEEKEND RECAP' : 'UIT HET ARCHIEF'}</span>
            <span className="recap-period">{periode}</span>
          </div>
          <h1 className="recap-title">{recap.headline}</h1>
          {!bekijktLatest && (
            <Link href="/recap" className="recap-latest-link">← Terug naar het huidige weekend</Link>
          )}
          {recap.matches > 0 && (
            <>
              <div className="recap-head-foot">
                <span>DE WEEK IN CIJFERS</span>
                <i aria-hidden />
              </div>
              <div className="recap-figures">
                <div className="recap-feature">
                  <RecapFieldBackdrop />
                  <div className="recap-feature-body">
                    <b className="recap-feature-num">{recap.matches}</b>
                    <small>{recap.matches === 1 ? 'wedstrijd gedekt deze week' : 'wedstrijden gedekt deze week'}</small>
                    {/* Onderscheid tonen i.p.v. alles op naam van de supporters te schrijven: wat
                        zij zelf invulden (veldschema, wedstrijdblad, of een doorgegeven eindstand)
                        blijft het pronkstuk; de rest kwam automatisch binnen via de federatie. */}
                    <span className="recap-coverage">
                      💪 <b>{recap.matchesManual}</b> {recap.matchesManual === 1 ? 'wedstrijd' : 'wedstrijden'} zelf ingevoerd door supporters
                      {recap.matches > recap.matchesManual && (
                        <> · <b>{recap.matches - recap.matchesManual}</b> aangevuld via de federatie — samen zo goed als de volledige competitie gedekt</>
                      )}
                    </span>
                  </div>
                  {trend && (
                    <span className={`recap-trend recap-trend--${trend.dir}`}>
                      {trend.dir === 'up' ? '▲' : trend.dir === 'down' ? '▼' : '●'} {trend.text}
                    </span>
                  )}
                </div>
                <section className="recap-stats" aria-label="Het weekend in cijfers">
                  <div className="recap-stat recap-stat--cyan"><span aria-hidden>🎟️</span><b>{recap.stats.visitors}</b><small>&ldquo;ik was erbij&rdquo;</small></div>
                  <div className="recap-stat recap-stat--violet"><span aria-hidden>🤝</span><b>{recap.stats.clubs}</b><small>clubs</small></div>
                  <div className="recap-stat recap-stat--red"><span aria-hidden>🎯</span><b>{recap.stats.goalThrows}</b><small>doelworpen</small></div>
                  <div className="recap-stat recap-stat--orange"><span aria-hidden>💪</span><b>{recap.stats.backThrows}</b><small>rugworpen</small></div>
                  <div className="recap-stat recap-stat--gold"><span aria-hidden>🏆</span><b>{recap.goals}</b><small>punten</small></div>
                  <div className="recap-stat recap-stat--pink"><span aria-hidden>📸</span><b>{recap.stats.photos}</b><small>supportersfoto&rsquo;s</small></div>
                  {recap.stats.forfaits > 0 && (
                    <div className="recap-stat recap-stat--grey"><span aria-hidden>🚫</span><b>{recap.stats.forfaits}</b><small>{recap.stats.forfaits === 1 ? 'forfait' : 'forfaits'}</small></div>
                  )}
                </section>
              </div>
            </>
          )}
        </header>

        {recap.matches === 0 ? (
          <p className="recap-empty">
            Er werd de voorbije week niet gespeeld. Bekijk de <Link href="/">komende wedstrijden</Link> of doe je{' '}
            <Link href="/pronostiek">voorspelling</Link> voor het volgende weekend.
          </p>
        ) : (
          <>
            {recap.highlights.length > 0 && (
              <section className="recap-block recap-block--highlights" aria-label="Opvallend">
                <div className="recap-section-head">
                  <span>TOPPRESTATIES</span>
                  <h2 className="recap-h2">Dit viel op</h2>
                </div>
                <ul className="recap-highlights">
                  {recap.highlights.map((h, index) => (
                    <li key={h.key} className="recap-highlight">
                      <span className="recap-highlight-emoji" aria-hidden>{String(index + 1).padStart(2, '0')}</span>
                      <span className="recap-highlight-txt"><b>{h.title}</b><Link href={`/match/${h.matchId}`}>{h.text}</Link></span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {recap.team && (
              <section className="recap-block recap-block--team" aria-label="Ploeg van de week">
                <div className="recap-team-trophy" aria-hidden>#1</div>
                <div>
                  <span className="recap-eyebrow">PERFORMANCE VAN DE WEEK</span>
                  <h2 className="recap-h2">Ploeg van de week</h2>
                  <p className="recap-team"><b>{recap.team.teamName}</b> won met <strong>{recap.team.goalsFor}–{recap.team.goalsAgainst}</strong>{recap.team.reeks ? ` in ${recap.team.reeks}` : ''} — een doelsaldo van <em>+{recap.team.diff}</em>.</p>
                </div>
              </section>
            )}

            {recap.players.length > 0 && (
              <section className="recap-block" aria-label="Selectie van de week">
                <h2 className="recap-h2">Selectie van de week</h2>
                <ol className="recap-players">{recap.players.map((p, i) => <li key={p.playerId} className="recap-player"><span className="recap-player-rank">{i + 1}</span><span className="recap-player-txt"><b>{p.shirtNumber != null ? `#${p.shirtNumber} ` : ''}{p.name}</b><i>{p.teamName}{p.reeks ? ` · ${p.reeks}` : ''}</i></span><span className="recap-player-stat">{p.points} {p.points === 1 ? 'punt' : 'punten'}</span></li>)}</ol>
              </section>
            )}

            {recap.climbers.length > 0 && (
              <section className="recap-block" aria-label="Klimmers">
                <h2 className="recap-h2">Wie klom</h2>
                <ul className="recap-climbers">{recap.climbers.slice(0, 8).map((c) => <li key={`${c.teamId}-${c.reeks}`} className="recap-climber"><span className="recap-climber-delta">▲ {c.delta}</span><span><b>{c.teamName}</b> — van plaats {c.from} naar {c.to}{c.reeks ? ` in ${c.reeks}` : ''}</span></li>)}</ul>
              </section>
            )}

            <details className="recap-block recap-results-fold"><summary><span><small>WEDSTRIJDARCHIEF</small><b>Alle uitslagen <i>({recap.matches})</i></b></span><span className="recap-fold-action">Bekijken <i aria-hidden>⌄</i></span></summary><ul className="recap-results">{recap.results.map((m) => <li key={m.matchId} className="recap-result"><Link href={`/match/${m.matchId}`} className="recap-result-link"><span className="recap-result-teams">{m.home} <b>{m.homeGoals}</b>–<b>{m.awayGoals}</b> {m.away}</span>{m.reeks && <span className="recap-result-reeks">{m.reeks}</span>}</Link></li>)}</ul></details>
          </>
        )}

        {season && (
          <section className="recap-season" aria-label="Seizoenstotaal">
            <header className="recap-season-hero">
              <div className="recap-head-top">
                <span className="recap-edition recap-edition--gold"><i aria-hidden /> SEIZOEN {season.seizoen}</span>
              </div>
              <h2 className="recap-title recap-title--season">{season.headline}</h2>
              <div className="recap-figures">
                <div className="recap-feature recap-feature--gold">
                  <RecapFieldBackdrop variant="gold" />
                  <div className="recap-feature-body">
                    <b className="recap-feature-num">{season.matches}</b>
                    <small>{season.matches === 1 ? 'wedstrijd dit seizoen' : 'wedstrijden dit seizoen'}</small>
                    <span className="recap-coverage">
                      💪 <b>{season.matchesManual}</b> {season.matchesManual === 1 ? 'wedstrijd' : 'wedstrijden'} zelf ingevoerd door supporters
                      {season.matches > season.matchesManual && (
                        <> · <b>{season.matches - season.matchesManual}</b> aangevuld via de federatie</>
                      )}
                    </span>
                  </div>
                  <span className="recap-trend recap-trend--flat">🗓 {season.weekends} {season.weekends === 1 ? 'speelweek' : 'speelweken'}</span>
                </div>
                <section className="recap-stats" aria-label="Het seizoen in cijfers">
                  <div className="recap-stat recap-stat--cyan"><span aria-hidden>🎟️</span><b>{season.stats.visitors}</b><small>&ldquo;ik was erbij&rdquo;</small></div>
                  <div className="recap-stat recap-stat--violet"><span aria-hidden>🤝</span><b>{season.stats.clubs}</b><small>clubs</small></div>
                  <div className="recap-stat recap-stat--red"><span aria-hidden>🎯</span><b>{season.stats.goalThrows}</b><small>doelworpen</small></div>
                  <div className="recap-stat recap-stat--orange"><span aria-hidden>💪</span><b>{season.stats.backThrows}</b><small>rugworpen</small></div>
                  <div className="recap-stat recap-stat--gold"><span aria-hidden>🏆</span><b>{season.goals}</b><small>punten</small></div>
                  <div className="recap-stat recap-stat--pink"><span aria-hidden>📸</span><b>{season.stats.photos}</b><small>supportersfoto&rsquo;s</small></div>
                  {season.stats.forfaits > 0 && (
                    <div className="recap-stat recap-stat--grey"><span aria-hidden>🚫</span><b>{season.stats.forfaits}</b><small>{season.stats.forfaits === 1 ? 'forfait' : 'forfaits'}</small></div>
                  )}
                </section>
              </div>
            </header>

            {season.highlights.length > 0 && (
              <section className="recap-block recap-block--highlights recap-block--season" aria-label="Seizoenstoppers">
                <div className="recap-section-head">
                  <span>SEIZOENSTOPPERS</span>
                  <h2 className="recap-h2">Het beste van {season.seizoen}</h2>
                </div>
                <ul className="recap-highlights">
                  {season.highlights.map((h, index) => (
                    <li key={h.key} className="recap-highlight">
                      <span className="recap-highlight-emoji" aria-hidden>{String(index + 1).padStart(2, '0')}</span>
                      <span className="recap-highlight-txt"><b>{h.title}</b><Link href={`/match/${h.matchId}`}>{h.text}</Link></span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {season.archive.length > 0 && (
              <section className="recap-block recap-archive" aria-label="Archief van voorbije speelweken">
                <div className="recap-section-head">
                  <span>ARCHIEF</span>
                  <h2 className="recap-h2">Elke speelweek van {season.seizoen}</h2>
                </div>
                <ul className="recap-archive-list">
                  {season.archive.map((w) => {
                    const active = w.startIso === recap.startIso
                    return (
                      <li key={w.startIso}>
                        <Link
                          href={active ? '/recap' : `/recap?week=${encodeURIComponent(w.startIso)}`}
                          className={`recap-archive-item${active ? ' recap-archive-item--active' : ''}`}
                        >
                          <span className="recap-archive-period">{periodeVan(w.startIso, w.endIso)}</span>
                          <span className="recap-archive-figures">
                            <b>{w.matches}</b> {w.matches === 1 ? 'wedstrijd' : 'wedstrijden'} · <b>{w.goals}</b> punten
                          </span>
                          {w.team && (
                            <span className="recap-archive-team"><span aria-hidden>🏆</span> {w.team.teamName} won met {w.team.goalsFor}–{w.team.goalsAgainst}</span>
                          )}
                          {active && <span className="recap-archive-badge">Nu bekeken</span>}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}
          </section>
        )}
      </div>
    </>
  )
}
