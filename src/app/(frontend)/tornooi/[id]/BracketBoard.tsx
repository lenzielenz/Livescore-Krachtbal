'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

import { TeamLogo } from '@/components/TeamLogo'
import { PRONOSTIEK_OP_CATEGORIE } from '@/lib/pronostiek-schakelaar'
import { tornooiBasisPad } from '@/lib/tornooi-paden'
import { TornooiPronostiek } from '../groep/[naam]/TornooiPronostiek'
import type { LogoFit } from '@/lib/logo-fit'
import type { TMatchState, TournamentState } from '@/lib/tournament-engine'
import { UITLEG_PAD } from '@/lib/aantekenen-uitleg'
import { opSpeeltijd } from '@/lib/tornooi-volgorde'
import { fmtClock, useTicking, useTournamentStream } from '../useTournament'
import { BracketZoom } from './BracketZoom'
import { MatchTrust } from './MatchTrust'

// Gepland uur/datum van een nog te spelen wedstrijd — beheerders passen het hier meteen aan (voedt
// het aftellen op het groep-kantinescherm). Bewaart direct bij het kiezen (op gsm sluit de native
// kiezer zonder blur, dus wachten op blur alleen is niet genoeg) en toont een ✔ als het vaststaat.
function PlanUur({ tournamentId, m }: { tournamentId: number; m: TMatchState }) {
  const naarLokaal = (iso: string | null) => {
    if (!iso) return ''
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
    return d.toISOString().slice(0, 16)
  }
  const [val, setVal] = useState(() => naarLokaal(m.plannedAt))
  const [status, setStatus] = useState<'idle' | 'ok' | 'fout'>('idle')
  const wacht = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bewaar = async (v: string) => {
    try {
      const res = await fetch(`/api/tournament/${tournamentId}/match/${m.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'plan', plannedAt: v ? new Date(v).toISOString() : null }),
      })
      setStatus(res.ok ? 'ok' : 'fout')
    } catch {
      setStatus('fout')
    }
  }
  // Kort na de laatste wijziging bewaren (typen op desktop vuurt per segment een change-event).
  const wijzig = (v: string) => {
    setVal(v)
    setStatus('idle')
    if (wacht.current) clearTimeout(wacht.current)
    wacht.current = setTimeout(() => void bewaar(v), 600)
  }
  return (
    <label className="trn-plan" onClick={(e) => e.stopPropagation()}>
      <span aria-hidden>🕐</span>
      <input
        type="datetime-local"
        value={val}
        onChange={(e) => wijzig(e.target.value)}
        onBlur={(e) => {
          if (wacht.current) clearTimeout(wacht.current)
          void bewaar(e.target.value)
        }}
        aria-label="Gepland aanvangsuur"
      />
      {status === 'ok' && <span className="trn-plan-ok" aria-label="Bewaard">✔</span>}
      {status === 'fout' && <span className="trn-plan-fout" aria-label="Bewaren mislukt">✕</span>}
    </label>
  )
}

// Thuis- en uitploeg van plaats wisselen — kan zolang de wedstrijd niet gestart is. Het antwoord
// draagt de verse state al mee: die passen we direct toe, zodat het bord meteen draait (de
// SSE-stream bevestigt daarna hetzelfde beeld voor alle andere kijkers).
function WisselKnop({ tournamentId, m, onState }: { tournamentId: number; m: TMatchState; onState?: (s: TournamentState) => void }) {
  const [busy, setBusy] = useState(false)
  const wissel = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/tournament/${tournamentId}/match/${m.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'wissel' }),
      })
      const data = (await res.json().catch(() => null)) as { state?: TournamentState } | null
      if (res.ok && data?.state) onState?.(data.state)
    } finally {
      setBusy(false)
    }
  }
  return (
    <button type="button" className="trn-mini" disabled={busy} onClick={() => void wissel()} title="Thuis- en uitploeg van plaats wisselen">
      ⇄ Wissel
    </button>
  )
}

const tijdBE = (iso: string) =>
  new Date(iso).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Brussels' })

// Veld toewijzen vanaf de wedstrijdkaart zelf (beheer): zelfde actie als op het dagprogramma;
// het antwoord draagt de verse state mee, dus de kaart toont het veld meteen.
function VeldKeuze({ tournamentId, m, veldCount, onState }: { tournamentId: number; m: TMatchState; veldCount: number; onState?: (s: TournamentState) => void }) {
  const kies = async (v: string) => {
    const res = await fetch(`/api/tournament/${tournamentId}/match/${m.id}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action: 'veld', veld: v || null }),
    }).catch(() => null)
    const data = res && res.ok ? ((await res.json().catch(() => null)) as { state?: TournamentState } | null) : null
    if (data?.state) onState?.(data.state)
  }
  return (
    <select
      className="trn-veldkeuze"
      value={m.veld ?? ''}
      onChange={(e) => void kies(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      aria-label="Veld toewijzen"
    >
      <option value="">veld —</option>
      {Array.from({ length: Math.max(veldCount, m.veld ?? 0) }, (_, i) => (
        <option key={i + 1} value={i + 1}>Veld {i + 1}</option>
      ))}
    </select>
  )
}

// Twee opeenvolgende wedstrijden vormen een paar dat naar één wedstrijd in de volgende ronde
// leidt — die paring tekent de verbindingslijnen (zie tornooi.css).
function pairUp(matches: TMatchState[]): TMatchState[][] {
  const out: TMatchState[][] = []
  for (let i = 0; i < matches.length; i += 2) out.push(matches.slice(i, i + 2))
  return out
}

function MatchCard({ id, m, canManage, magScoren = false, supportersModus = false, gebruikerId = null, logos, fits, veldCount = 0, neutral = false, onState, ingelogd = false, tip }: { id: number; m: TMatchState; canManage: boolean; magScoren?: boolean; supportersModus?: boolean; gebruikerId?: number | null; logos: Record<string, string>; fits: Record<string, LogoFit>; veldCount?: number; neutral?: boolean; onState?: (s: TournamentState) => void; ingelogd?: boolean; tip?: { home: number; away: number } | null }) {
  const clock = useTicking(m.clockSeconds, m.clockRunning)
  const bye = m.status === 'finished' && (!m.home || !m.away)
  const live = m.status === 'live'
  const done = m.status === 'finished'

  // Een gespeelde wedstrijd klapt dicht: uitslag en winnaar blijven staan, de rest (aantekenknop,
  // vertrouwensstrookje, bronvermelding) gaat weg. Zo zie je in één blik welke wedstrijden nog
  // moeten en welke verleden tijd zijn, zonder dat het schema iets verbergt — één tik opent ze.
  const [open, setOpen] = useState(false)
  const ingeklapt = done && !bye && !open

  const Row = ({ side }: { side: 'home' | 'away' }) => {
    const name = side === 'home' ? m.home : m.away
    const won = m.winner === side
    const lost = done && m.winner && m.winner !== side
    return (
      <div className={`trn-row ${won ? 'won' : ''} ${lost ? 'lost' : ''} ${side}`}>
        {name && <span className="trn-row-logo"><TeamLogo name={name} logoUrl={logos[name] ?? null} logoFit={fits[name] ?? null} size="xs" /></span>}
        <span className="trn-row-name">{name ?? '— te bepalen —'}</span>
        <span className="trn-row-score">{name && (live || done) ? m.score[side] : ''}</span>
      </div>
    )
  }

  return (
    <div
      className={`trn-match ${m.status}${ingeklapt ? ' ingeklapt' : ''}${done && !bye ? ' klapbaar' : ''}`}
      // Ingeklapt is de héle kaart de knop — dat is wat je aantikt. Staat ze open, dan blijft enkel
      // de kopregel klikbaar: anders zou een tik op "Aantekenen" de kaart onder je vinger dichtslaan.
      onClick={ingeklapt ? () => setOpen(true) : undefined}
      role={ingeklapt ? 'button' : undefined}
      tabIndex={ingeklapt ? 0 : undefined}
      aria-expanded={done && !bye ? open : undefined}
      onKeyDown={
        ingeklapt
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setOpen(true)
              }
            }
          : undefined
      }
    >
      <div
        className="trn-match-head"
        onClick={done && !bye && open ? () => setOpen(false) : undefined}
      >
        <span className="trn-match-label">{m.label}</span>
        <span className={`trn-match-badge ${m.status}`}>
          {live ? `LIVE · H${m.currentHalf} ${fmtClock(clock)}` : bye ? 'BYE' : done ? 'EINDE' : 'TE SPELEN'}
        </span>
        {/* Klein pijltje: zonder aanwijzing raadt niemand dat een afgelopen kaart open kan. */}
        {done && !bye && <span className="trn-match-klap" aria-hidden>{open ? '▴' : '▾'}</span>}
      </div>
      {neutral && !ingeklapt && <div className="trn-match-neutral">⚖️ neutraal terrein</div>}
      {/* Supporters zien hier wanneer én waar de wedstrijd gespeeld wordt. */}
      {!bye && !done && (m.plannedAt || m.veld != null) && (
        <div className="trn-match-plan">
          {m.plannedAt && <span>🕐 {tijdBE(m.plannedAt)}</span>}
          {m.veld != null && <span className="trn-match-veld">Veld {m.veld}</span>}
        </div>
      )}
      <Row side="home" />
      <Row side="away" />
      {/* Meetellen mag ruimer dan beheren: in supporters-modus komt élke ingelogde bezoeker aan de
          aantekentafel, maar het veldscherm, het wisselen van kanten en het plannen blijven bij wie
          aantekenrechten heeft. Vandaar twee vlaggen op één strookje. */}
      {!bye && !ingeklapt && (canManage || magScoren) && (
        <div className="trn-match-actions">
          <Link href={`/tornooi/${id}/aantekenen/${m.id}`} className="trn-mini">Aantekenen</Link>
          {canManage && <Link href={`/tornooi/${id}/veld/${m.id}`} className="trn-mini">Veld</Link>}
          {/* Thuis/uit omdraaien kan tot de eerste worp — daarna zou de score van kant wisselen. */}
          {canManage && m.status === 'pending' && m.home && m.away && <WisselKnop tournamentId={id} m={m} onState={onState} />}
        </div>
      )}
      {/* Telt een supporter deze wedstrijd mee, dan hoort erbij te staan wie dat is en of andere
          kijkers het beeld bevestigen. Bij een wedstrijd die de organisatie zelf aantekent staat
          hier niets — die stand komt van de tafel. */}
      {m.trust && !ingeklapt && (
        <MatchTrust
          tournamentId={id}
          m={m}
          ingelogd={ingelogd}
          supportersModus={supportersModus}
          gebruikerId={gebruikerId}
          onState={onState}
        />
      )}
      {/* Bij elke uitslag hoort te staan waar ze vandaan komt. Geldt óók voor een wedstrijd die de
          organisatie aantekende — juist dié moet de federatie kunnen natrekken als er achteraf
          discussie over de stand ontstaat. */}
      {m.aantekenaar && !ingeklapt && m.status !== 'pending' && (
        <p className="trn-aantekenaar">✏️ {m.aantekenaar.tekst}</p>
      )}
      {/* Meespelen kan tot de aftrap — óók hier, zodat een supporter zijn tip kwijt kan waar hij
          de wedstrijd ook tegenkomt. */}
      {PRONOSTIEK_OP_CATEGORIE && !bye && m.status === 'pending' && m.home && m.away && (
        <div className="trn-match-prono">
          <TornooiPronostiek
            matchId={m.id}
            home={m.home}
            away={m.away}
            ingelogd={ingelogd}
            terug={`/tornooi/${id}`}
            bestaand={tip ?? null}
          />
        </div>
      )}
      {/* Plannen kan zolang ze niet gespeeld is — het groep-kantinescherm telt hiernaar af. */}
      {!bye && !done && canManage && (
        <div className="trn-match-planning">
          <PlanUur tournamentId={id} m={m} />
          {veldCount >= 1 && <VeldKeuze tournamentId={id} m={m} veldCount={veldCount} onState={onState} />}
        </div>
      )}
    </div>
  )
}

// Round-robin: live rangschikking (4/3/2 punten) + alle wedstrijden.
function RoundRobin({ id, state, canManage, magScoren = false, supportersModus = false, gebruikerId = null, logos, fits, veldCount = 0, onState, ingelogd = false, tips = {} }: { id: number; state: TournamentState; canManage: boolean; magScoren?: boolean; supportersModus?: boolean; gebruikerId?: number | null; logos: Record<string, string>; fits: Record<string, LogoFit>; veldCount?: number; onState?: (s: TournamentState) => void; ingelogd?: boolean; tips?: Record<number, { home: number; away: number }> }) {
  // Op speeltijd, niet op schemavolgorde: aan een tornooi zoek je een wedstrijd op haar uur.
  const matches = opSpeeltijd(state.rounds.flatMap((r) => r.matches))
  const standings = state.standings ?? []
  return (
    <div className="trn-rr">
      <section className="trn-rr-stand">
        <h2 className="trn-col-title">Rangschikking</h2>
        <table className="trn-table">
          <thead>
            <tr><th>#</th><th className="l">Ploeg</th><th>G</th><th>W</th><th>GL</th><th>V</th><th>Saldo</th><th>Ptn</th></tr>
          </thead>
          <tbody>
            {standings.map((s, i) => (
              <tr key={s.team} className={i === 0 && state.status === 'finished' ? 'leader' : ''}>
                <td>{i + 1}</td>
                <td className="l"><span className="trn-rr-team">{logos[s.team] && <TeamLogo name={s.team} logoUrl={logos[s.team]} logoFit={fits[s.team] ?? null} size="xs" />}{s.team}</span></td>
                <td>{s.played}</td>
                <td>{s.won}</td>
                <td>{s.drawn}</td>
                <td>{s.lost}</td>
                <td>{s.gf}–{s.ga}</td>
                <td className="pts">{s.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="trn-rr-legend">Winst 4 · gelijkspel 3 · verlies 2 punten</p>
      </section>
      <section className="trn-rr-matches">
        <h2 className="trn-col-title">Wedstrijden</h2>
        <div className="trn-rr-grid">
          {matches.map((m) => (
            <MatchCard key={m.id} id={id} m={m} canManage={canManage} magScoren={magScoren} supportersModus={supportersModus} gebruikerId={gebruikerId} logos={logos} fits={fits} veldCount={veldCount} onState={onState} ingelogd={ingelogd} tip={tips[m.id] ?? null} />
          ))}
        </div>
      </section>
    </div>
  )
}

export function BracketBoard({ id, initial, canManage = false, magScoren = false, supportersModus = false, gebruikerId = null, logos = {}, fits = {}, veldCount = 0, ingelogd = false, kantinePad, groep = '' }: { id: number; initial: TournamentState; canManage?: boolean; magScoren?: boolean; supportersModus?: boolean; gebruikerId?: number | null; logos?: Record<string, string>; fits?: Record<string, LogoFit>; veldCount?: number; ingelogd?: boolean; kantinePad: string; groep?: string }) {
  const [stream, setStream] = useTournamentStream(id, initial)
  const state = stream ?? initial
  // Eigen pronostiek-tips van deze supporter (andermans tips blijven verborgen tot na de match).
  const [tips, setTips] = useState<Record<number, { home: number; away: number }>>({})
  useEffect(() => {
    if (!ingelogd || !PRONOSTIEK_OP_CATEGORIE) return
    void fetch(`/api/tornooi-pronostiek?tournament=${id}`, { credentials: 'include', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.picks) setTips(d.picks as Record<number, { home: number; away: number }>)
      })
      .catch(() => undefined)
  }, [id, ingelogd])

  // Tweezijdige boom: de finale (laatste ronde) staat centraal; elke eerdere ronde wordt in een
  // linker- en rechterhelft gesplitst die naar het midden toe groeien. Standaard-seeding zorgt dat
  // de eerste helft van een ronde uit de eerste helft van de vorige voortkomt, dus de splitsing op
  // index is consistent over de rondes heen.
  const R = state.rounds.length
  const finalRound = R > 0 ? state.rounds[R - 1] : null
  const sideRounds = R > 1 ? state.rounds.slice(0, R - 1) : []
  const halfOf = (n: number) => Math.ceil(n / 2)
  const leftCols = sideRounds
    .map((r) => ({ round: r.round, label: r.label, matches: r.matches.slice(0, halfOf(r.matches.length)) }))
    .filter((c) => c.matches.length > 0)
  const rightCols = sideRounds
    .map((r) => ({ round: r.round, label: r.label, matches: r.matches.slice(halfOf(r.matches.length)) }))
    .filter((c) => c.matches.length > 0)

  // Vanaf de halve finale (ronde R-1) speelt men op neutraal terrein.
  const isNeutralRound = (round: number) => round >= R - 1
  const renderColumn = (c: { round: number; label: string; matches: TMatchState[] }, prefix: string) => (
    <section key={`${prefix}${c.round}`} className="trn-col">
      <h2 className="trn-col-title">{c.label}</h2>
      <div className="trn-col-body">
        {pairUp(c.matches).map((pair, pi) => (
          <div className="trn-pair" key={pi}>
            {pair.map((m) => (
              <MatchCard key={m.id} id={id} m={m} canManage={canManage} magScoren={magScoren} supportersModus={supportersModus} gebruikerId={gebruikerId} logos={logos} fits={fits} veldCount={veldCount} neutral={isNeutralRound(c.round)} onState={setStream} ingelogd={ingelogd} tip={tips[m.id] ?? null} />
            ))}
          </div>
        ))}
      </div>
    </section>
  )

  return (
    <div className="trn-page">
      <header className="trn-top">
        {/* Het vertrekpunt van de dag, altijd binnen handbereik. Wie hier zit, koos een
            tornooidag en daarna één categorie; de weg terug ging naar álle bekers van het
            seizoen — een heel eind om de rest van je eigen tornooi terug te vinden. */}
        {groep && (
          <Link href={tornooiBasisPad(groep)} className="trn-basis">
            ← <span className="trn-basis-naam">{groep}</span>
          </Link>
        )}
        <Link href={tornooiBasisPad(groep)} className="trn-home">
          <span className="brand">Krachtbal</span> Live · {state.name}
        </Link>
        <nav className="trn-topnav">
          {/* Uitleg vóór de andere links: aan een tornooitafel zit vaak iemand die dit voor het
              eerst doet, en die moet niet eerst door het schema hoeven te zoeken. Enkel voor wie
              ook echt mag aantekenen — een supporter volgt hier gewoon het schema. */}
          {(canManage || magScoren) && <Link href={UITLEG_PAD} className="trn-btn">📖 Hoe aantekenen?</Link>}
          {/* Het kantinescherm is de tv-link van de organisator — supporters volgen hier. Hoort
              deze reeks bij een tornooidag, dan wijst hij naar het scherm van de héle dag; een
              losse beker houdt zijn eigen scherm (zie lib/tornooi-paden.ts). */}
          {canManage && <Link href={kantinePad} className="trn-btn">Kantinescherm</Link>}
          <Link href="/tornooi" className="trn-toplink">Alle bekers</Link>
        </nav>
      </header>

      {state.champion && (
        <div className="trn-champion">🏆 Winnaar: {logos[state.champion] && <TeamLogo name={state.champion} logoUrl={logos[state.champion]} size="sm" />}<strong>{state.champion}</strong></div>
      )}

      {state.format === 'roundrobin' ? (
        <RoundRobin id={id} state={state} canManage={canManage} magScoren={magScoren} supportersModus={supportersModus} gebruikerId={gebruikerId} logos={logos} fits={fits} veldCount={veldCount} onState={setStream} ingelogd={ingelogd} tips={tips} />
      ) : (
        <BracketZoom>
          <main className="trn-bracket2">
            {leftCols.length > 0 && <div className="trn-side trn-side-left">{leftCols.map((c) => renderColumn(c, 'l'))}</div>}
            {finalRound && finalRound.matches.length > 0 && (
              <div className="trn-center">
                <h2 className="trn-col-title trn-final-title">{finalRound.label}</h2>
                <div className="trn-center-body">
                  {finalRound.matches.map((m) => (
                    <MatchCard key={m.id} id={id} m={m} canManage={canManage} magScoren={magScoren} supportersModus={supportersModus} gebruikerId={gebruikerId} logos={logos} fits={fits} veldCount={veldCount} neutral onState={setStream} ingelogd={ingelogd} tip={tips[m.id] ?? null} />
                  ))}
                </div>
              </div>
            )}
            {rightCols.length > 0 && <div className="trn-side trn-side-right">{rightCols.map((c) => renderColumn(c, 'r'))}</div>}
          </main>
        </BracketZoom>
      )}

      {state.format !== 'roundrobin' && state.thirdPlace && (
        <section className="trn-third">
          <h2 className="trn-col-title">Kleine finale (3e plaats)</h2>
          <div className="trn-third-card">
            <MatchCard id={id} m={state.thirdPlace} canManage={canManage} magScoren={magScoren} supportersModus={supportersModus} gebruikerId={gebruikerId} logos={logos} fits={fits} veldCount={veldCount} neutral onState={setStream} ingelogd={ingelogd} tip={tips[state.thirdPlace.id] ?? null} />
          </div>
        </section>
      )}
    </div>
  )
}
