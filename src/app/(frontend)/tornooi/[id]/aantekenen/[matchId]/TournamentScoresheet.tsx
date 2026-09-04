'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  EINDE_HELFT_BEVESTIGING,
  EINDE_HELFT_KNOP,
  inRust,
  klokKnopLabel,
  magHelftAfsluiten,
  type HelftStand,
} from '@/lib/helft-overgang'
import type { Side } from '@/lib/tournament'
import type { TMatchState, TournamentState } from '@/lib/tournament-engine'
import { useLiveStream } from '@/lib/use-live-stream'
import { fmtClock, useTicking } from '../../../useTournament'

function findMatch(state: TournamentState, matchId: number): TMatchState | null {
  for (const r of state.rounds) {
    const hit = r.matches.find((m) => m.id === matchId)
    if (hit) return hit
  }
  return state.thirdPlace?.id === matchId ? state.thirdPlace : null
}

export function TournamentScoresheet({
  id,
  matchId,
  initial,
  halfDurationSeconds,
  viaSupporters = false,
}: {
  id: number
  matchId: number
  initial: TournamentState
  halfDurationSeconds: number
  /**
   * Telt hier een supporter mee (supporters-modus) in plaats van de organisatie? Dan blijven de
   * correctieknoppen weg: terugzetten en heropenen zijn ingrepen op andermans wedstrijd, en de
   * server weigert ze ook. Meetellen zelf — starten, scoren, helft, einde — kan gewoon.
   */
  viaSupporters?: boolean
}) {
  const [state, setState] = useState<TournamentState>(initial)
  // Eén bevestigingsstap voor alles wat je niet per ongeluk wil doen: starten, beëindigen,
  // heropenen en terugzetten naar niet-gestart.
  const [bevestig, setBevestig] = useState<
    | null
    | { titel: string; tekst: string; knop: string; gevaar?: boolean; doe: () => void | Promise<unknown> }
  >(null)
  const [error, setError] = useState<string | null>(null)
  const [askWinner, setAskWinner] = useState(false)
  const busy = useRef(false)
  // Volledig scherm: de browserbalk verdwijnt en de hele tafel past op één scherm.
  const [fullscreen, setFullscreen] = useState(false)
  useEffect(() => {
    const bijwerken = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', bijwerken)
    return () => document.removeEventListener('fullscreenchange', bijwerken)
  }, [])
  const wisselFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    else void document.documentElement.requestFullscreen().catch(() => undefined)
  }

  // SSE: vang wijzigingen op die elders gemaakt worden (negeer terwijl een eigen actie loopt).
  useLiveStream<TournamentState>(`/api/tournament/${id}/stream`, (data) => {
    if (busy.current) return
    setState(data)
  })

  const m = findMatch(state, matchId)
  const clock = useTicking(m?.clockSeconds ?? 0, m?.clockRunning ?? false)

  const act = useCallback(
    async (body: Record<string, unknown>) => {
      if (busy.current) return
      busy.current = true
      setError(null)
      try {
        const res = await fetch(`/api/tournament/${id}/match/${matchId}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = (await res.json()) as { state?: TournamentState; error?: string }
        if (!res.ok) throw new Error(data.error ?? 'Actie mislukt.')
        if (data.state) setState(data.state)
        if (body.action === 'finish') setAskWinner(false)
        return true
      } catch (e) {
        const msg = (e as Error).message
        if (body.action === 'finish' && /gelijkspel/i.test(msg)) setAskWinner(true)
        else setError(msg)
        return false
      } finally {
        busy.current = false
      }
    },
    [id, matchId],
  )

  const half = m?.currentHalf ?? 1
  const overtime = useMemo(() => clock >= halfDurationSeconds, [clock, halfDurationSeconds])

  if (!m) return <p className="trn-error">Wedstrijd niet gevonden.</p>

  const ready = Boolean(m.home && m.away)
  const finished = m.status === 'finished'
  // Wat de tafel over de helften toont, komt uit één gedeelde module — zodat de tornooitafel,
  // de competitietafel en het oefenscherm precies hetzelfde zeggen (lib/helft-overgang.ts).
  const helftStand: HelftStand = {
    status: m.status,
    helft: half,
    klokLoopt: Boolean(m.clockRunning),
    klokSeconden: m.clockSeconds ?? 0,
  }
  const rust = inRust(helftStand)

  return (
    <div className="trn-page sheet">
      <header className="trn-top">
        <Link href={`/tornooi/${id}`} className="trn-home">
          <span className="brand">Krachtbal</span> · Aantekentafel
        </Link>
        <nav className="trn-topnav">
          {/* Eén tik en alles staat op één scherm (geen browserbalk meer). */}
          <button type="button" className="trn-toplink" onClick={wisselFullscreen}>
            {fullscreen ? '✕ Verlaten' : '⛶ Volledig scherm'}
          </button>
          <Link href={`/tornooi/${id}/veld/${matchId}`} className="trn-toplink">Veldscherm →</Link>
        </nav>
      </header>

      {/* Een supporter die meetelt, moet weten wat dat betekent: jouw naam staat bij de stand en
          andere kijkers kunnen ze bevestigen of betwisten. Zonder die regel erbij lijkt dit scherm
          een officiële tafel, en dat is het niet. */}
      {viaSupporters && (
        <p className="ts-supporter">
          👋 Je telt deze wedstrijd mee als supporter. Je naam komt bij de stand te staan en andere
          kijkers kunnen ze bevestigen. Tel enkel mee wat je zelf ziet gebeuren.
        </p>
      )}

      <div className="ts-meta">
        <span className="ts-round">{m.label}</span>
        <span className={`ts-status ${m.status}`}>
          {finished ? 'AFGELOPEN' : m.status === 'live' ? `LIVE · H${half}` : 'NOG NIET GESTART'}
        </span>
      </div>

      <div className={`ts-clock ${overtime ? 'over' : ''}${rust ? ' rust' : ''}`}>
        <span className="ts-clock-time">{fmtClock(clock)}</span>
        <span className="ts-clock-half">Helft {half} · doel {Math.round(halfDurationSeconds / 60)} min</span>
        {/* Zonder deze regel is de rust niet van een storing te onderscheiden: een klok die op
            nul staat en niet loopt, terwijl er niets uitlegt waarom. */}
        {rust && <span className="ts-clock-rust">⏸ Rust · eerste helft afgesloten, de tweede moet nog beginnen</span>}
      </div>

      {!ready ? (
        <p className="trn-empty">Wacht tot beide ploegen gekend zijn (winnaars van de vorige ronde).</p>
      ) : (
        <>
          <div className="ts-board">
            {(['home', 'away'] as Side[]).map((side) => (
              <div key={side} className={`ts-team ${m.winner === side ? 'won' : ''}`}>
                <div className="ts-team-name">{side === 'home' ? m.home : m.away}</div>
                {/* key op de stand: elke wijziging triggert de flits opnieuw — zo VOELT een tik
                    meteen geregistreerd, ook op een traag netwerk aan het veld. */}
                <div key={`${side}-${m.score[side]}`} className="ts-score flash">{m.score[side]}</div>
                {!finished && (
                  <div className="ts-goalbtns">
                    <button type="button" className="ts-goal nek" onClick={() => act({ action: 'goal', side, points: 1 })}>
                      +1 <small>nekworp</small>
                    </button>
                    <button type="button" className="ts-goal rug" onClick={() => act({ action: 'goal', side, points: 2 })}>
                      +2 <small>rugworp</small>
                    </button>
                  </div>
                )}
                <div className="ts-stats">
                  <div className="ts-stat">
                    <span className="ts-stat-lbl">✖ Kruisjes</span>
                    <span className="ts-stat-ctrl">
                      {!finished && <button type="button" className="ts-stat-btn" onClick={() => act({ action: 'cross', side, delta: -1 })} aria-label="Kruisje min">−</button>}
                      <span className="ts-stat-n">{m.crosses[side]}</span>
                      {!finished && <button type="button" className="ts-stat-btn" onClick={() => act({ action: 'cross', side, delta: 1 })} aria-label="Kruisje plus">+</button>}
                    </span>
                  </div>
                  <div className="ts-stat">
                    <span className="ts-stat-lbl">⏱ Minuten</span>
                    <span className="ts-stat-ctrl">
                      {!finished && <button type="button" className="ts-stat-btn" onClick={() => act({ action: 'timeout', side, delta: -1 })} aria-label="Minuut min">−</button>}
                      <span className="ts-stat-n">{m.timeouts[side]}</span>
                      {!finished && <button type="button" className="ts-stat-btn" onClick={() => act({ action: 'timeout', side, delta: 1 })} aria-label="Minuut plus">+</button>}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {!finished && (
            <div className="ts-controls">
              {/* De undo zegt wát ze wegneemt — geen blinde gok meer of je de juiste tik terugdraait. */}
              <button type="button" className="trn-btn" disabled={!m.lastGoal} onClick={() => act({ action: 'undo' })}>
                {m.lastGoal
                  ? `↶ Ondoen: +${m.lastGoal.points} ${m.lastGoal.side === 'home' ? m.home : m.away}`
                  : '↶ Niets te ondoen'}
              </button>
              {m.status === 'pending' ? (
                <button
                  type="button"
                  className="trn-btn primary"
                  onClick={() =>
                    setBevestig({
                      titel: 'Wedstrijd nu starten?',
                      tekst: `${m.home} – ${m.away} gaat live en de klok begint te lopen. Start dit pas wanneer er echt gespeeld wordt.`,
                      knop: '▶ Ja, starten',
                      doe: () => act({ action: 'start' }),
                    })
                  }
                >▶ Start</button>
              ) : (
                <button
                  type="button"
                  className={`trn-btn${rust ? ' primary' : ''}`}
                  onClick={() => act({ action: 'clock', running: !m.clockRunning })}
                >
                  {klokKnopLabel(helftStand)}
                </button>
              )}
              {/* De knop heet naar wát hij doet: hij sluit de eerste helft af. Hij heette
                  "2e helft", en dan lijkt een klok die op nul springt op een fout in plaats van
                  op de rust. De bevestiging zegt dat vooraf, want die nul is niet terug te
                  draaien. */}
              {magHelftAfsluiten(helftStand) && (
                <button
                  type="button"
                  className="trn-btn"
                  onClick={() => setBevestig({ ...EINDE_HELFT_BEVESTIGING, doe: () => act({ action: 'half' }) })}
                >{EINDE_HELFT_KNOP}</button>
              )}
              {/* Bevestiging tegen een verdwaalde tik: einde legt de uitslag vast en schuift de
                  winnaar door in het schema. */}
              {m.status === 'live' && (
              <button
                type="button"
                className="trn-btn danger"
                onClick={() =>
                  setBevestig({
                    titel: 'Wedstrijd beëindigen?',
                    tekst:
                      'De eindstand wordt vastgelegd en de winnaar schuift door in het schema. Ging het per ongeluk, dan kan je nadien nog heropenen zolang de volgende ronde niet bezig is.',
                    knop: '⏹ Ja, de wedstrijd is gedaan',
                    gevaar: true,
                    doe: () => act({ action: 'finish' }),
                  })
                }
              >
                ⏹ Einde
              </button>
              )}
              {/* Te vroeg gestart terwijl deze reeks nog moest beginnen? Terug naar niet-gestart. */}
              {m.status === 'live' && !viaSupporters && (
                <button
                  type="button"
                  className="trn-btn zacht"
                  onClick={() =>
                    setBevestig({
                      titel: 'Terugzetten naar niet-gestart?',
                      tekst:
                        'Gebruik dit als deze wedstrijd per ongeluk gestart is. De ingevoerde doelpunten, kruisjes en de klok verdwijnen; de affiche en het uur blijven staan, zodat ze later gewoon gespeeld kan worden. Dit kan niet ongedaan gemaakt worden.',
                      knop: '↺ Ja, terugzetten',
                      gevaar: true,
                      doe: () => act({ action: 'reset' }),
                    })
                  }
                >
                  ↺ Nog niet bezig
                </button>
              )}
            </div>
          )}

          {bevestig && (
            <div className="ts-bevestig">
              <h4>{bevestig.titel}</h4>
              <p>{bevestig.tekst}</p>
              <div className="ts-bevestig-btns">
                <button type="button" className="trn-btn" onClick={() => setBevestig(null)}>Nee, terug</button>
                <button
                  type="button"
                  className={`trn-btn ${bevestig.gevaar ? 'danger' : 'primary'}`}
                  onClick={() => {
                    const doe = bevestig.doe
                    setBevestig(null)
                    void doe()
                  }}
                >
                  {bevestig.knop}
                </button>
              </div>
            </div>
          )}

          {askWinner && (
            <div className="ts-tie">
              <p>Gelijkspel — wie gaat door?</p>
              <div className="ts-tie-btns">
                <button type="button" className="trn-btn primary" onClick={() => act({ action: 'finish', winner: 'home' })}>
                  {m.home}
                </button>
                <button type="button" className="trn-btn primary" onClick={() => act({ action: 'finish', winner: 'away' })}>
                  {m.away}
                </button>
              </div>
            </div>
          )}

          {finished && (
            <div className="trn-champion small">
              ✅ Afgelopen — winnaar: <strong>{m.winner === 'home' ? m.home : m.away}</strong>
              <div className="ts-after">
                <Link href={`/tornooi/${id}`} className="trn-btn">Terug naar schema</Link>
                {/* Score toch fout genoteerd? Heropen kan zolang de volgende ronde niet bezig is
                    (de server bewaakt dat en trekt de doorgeschoven winnaar terug). */}
                {!viaSupporters && (
                <button
                  type="button"
                  className="trn-btn"
                  onClick={() =>
                    setBevestig({
                      titel: 'Wedstrijd heropenen?',
                      tekst:
                        'De wedstrijd gaat terug live zodat je de score kan aanpassen of verder aantekenen. De doorgeschoven winnaar wordt uit de volgende ronde teruggetrokken — dat lukt enkel zolang daar nog niet gespeeld is.',
                      knop: '🔓 Ja, heropenen',
                      doe: () => act({ action: 'reopen' }),
                    })
                  }
                >
                  🔓 Score aanpassen
                </button>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {error && <p className="trn-error">{error}</p>}
    </div>
  )
}
