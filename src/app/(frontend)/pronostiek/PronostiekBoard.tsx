'use client'

import { useMemo, useState } from 'react'

import { Avatar } from '@/components/Avatar'
import { catchUpWeekends, rankLeaderboard, type LeaderRow } from '@/lib/prediction-score'

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

// Klassement met een "waar sta ik?"-zoekbalk en een sprong-naar-mij-knop — onmisbaar zodra er
// honderden deelnemers zijn. Toont je achterstand tot de leider én hoeveel sterke weekends dat
// ongeveer is, zodat je de hoop op de eerste plaats niet verliest.
export function PronostiekBoard({
  rows,
  myUserId,
  swingPerWeekend,
  totalPlayers,
  winnerUserIds,
  photoByUserId,
}: {
  rows: LeaderRow[]
  myUserId: number | null
  /** Realistische voorsprong die je per weekend op een rivaal kan pakken. */
  swingPerWeekend: number
  totalPlayers: number
  /** Wie deze speelweek aan het bonusrad mag draaien (vorig weekend top-N, zie loadRadState) —
   *  krijgt een "Draai deze week!"-badge naast de naam. */
  winnerUserIds?: ReadonlySet<number>
  /** Profielfoto per userId — ontbreekt die, dan valt Avatar terug op initialen. */
  photoByUserId?: Readonly<Record<number, string | null>>
}) {
  const [q, setQ] = useState('')
  const [flash, setFlash] = useState(false)

  // Vaste rang op basis van het volledige (gesorteerde) klassement — zoeken hernummert dus niet.
  // Gelijke punten delen dezelfde rang (sportranking, zie rankLeaderboard) — anders leek een
  // gedeelde stand toch willekeurig anders genummerd.
  const ranked = useMemo(() => rankLeaderboard(rows), [rows])
  const me = myUserId != null ? ranked.find((r) => r.userId === myUserId) : undefined
  const leaderPoints = ranked[0]?.points ?? 0
  const deficit = me ? leaderPoints - me.points : 0
  const weekends = catchUpWeekends(deficit, swingPerWeekend)

  const filtered = q.trim() ? ranked.filter((r) => norm(r.name).includes(norm(q))) : ranked

  const jumpToMe = () => {
    if (myUserId == null) return
    const el = document.getElementById(`vs-${myUserId}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setFlash(true)
      window.setTimeout(() => setFlash(false), 1600)
    }
  }

  return (
    <>
      <div className="vs-panel">
        <div className="vs-panel-meta">{totalPlayers} {totalPlayers === 1 ? 'deelnemer' : 'deelnemers'}</div>
        {me && (
          <div className="vs-hope">
            {me.rank === 1 ? (
              <span>🥇 Je staat op kop — knap! Verdedig je plek dit weekend.</span>
            ) : (
              <span>
                Je staat <b>#{me.rank}</b> · <b>{deficit}</b> ptn achter de leider — ongeveer{' '}
                <b>{weekends}</b> sterk{weekends === 1 ? '' : 'e'} weekend{weekends === 1 ? '' : 's'} en je knokt terug naar de top. 💪
              </span>
            )}
          </div>
        )}

        <div className="vs-search">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Zoek een naam… (waar sta ik?)"
            aria-label="Zoek een naam in het klassement"
          />
          {q && (
            <button type="button" className="vs-search-clear" onClick={() => setQ('')} aria-label="Wis zoekopdracht">
              ✕
            </button>
          )}
          {me && (
            <button type="button" className="vs-jump" onClick={jumpToMe}>
              📍 Spring naar mij
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="empty">Geen deelnemer gevonden voor “{q.trim()}”.</p>
      ) : (
        <div className="vs-board vs-board-search">
          {filtered.map((r) => {
            const medal = r.rank === 1 ? ' leader' : r.rank === 2 ? ' silver' : r.rank === 3 ? ' bronze' : ''
            const isWinner = winnerUserIds?.has(r.userId) ?? false
            return (
              <div
                key={r.userId}
                id={`vs-${r.userId}`}
                className={`vs-row${r.userId === myUserId ? ' me' : ''}${medal}${flash && r.userId === myUserId ? ' flash' : ''}`}
              >
                <div className="vs-row-top">
                  <span className="vs-rank">{r.rank}</span>
                  <span className="vs-who">
                    <Avatar name={r.name} photoUrl={photoByUserId?.[r.userId] ?? null} size={26} />
                    <span className="vs-name">{r.name}{r.userId === myUserId ? ' (jij)' : ''}</span>
                    {isWinner && (
                      <span className="vs-spin-badge" title="Je won vorig weekend een plekje op het bonusrad">
                        🎡 Draai deze week!
                      </span>
                    )}
                  </span>
                  <span className="vs-pts">{r.points}</span>
                </div>
                <div className="vs-stats">
                  <span className="vs-stat-badge exact" title="Exacte uitslagen">🎯 {r.exact} exact</span>
                  {r.closest > 0 && (
                    <span className="vs-stat-badge closest" title="Hoe vaak je het dichtst bij de uitslag zat">
                      🔥 {r.closest}× dichtst bij
                    </span>
                  )}
                  <span className="vs-stat-badge" title="Aantal wedstrijden voorspeld">
                    {r.predictions} voorspelling{r.predictions === 1 ? '' : 'en'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {filtered.length > 0 && (
        <p className="vs-legend">🥇🥈🥉 podium · 🎯 exacte uitslagen · 🔥 vaakst dichtst bij · 🎡 mag deze week aan het bonusrad draaien</p>
      )}
    </>
  )
}
