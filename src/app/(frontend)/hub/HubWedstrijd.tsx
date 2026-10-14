import Link from 'next/link'

import { TeamLogo } from '@/components/TeamLogo'
import { formatDateBE, formatTimeBE } from '@/lib/datetime'
import type { LogoFit } from '@/lib/logo-fit'

// Eén wedstrijdregel op "Mijn Krachtbal", zoals in een sport-app: links wanneer (of de uitslag
// voor je ploeg), in het midden beide ploegen met logo onder elkaar, rechts de score. Compact
// genoeg om drie ploegen met elk twee wedstrijden op één gsm-scherm te krijgen.

export type HubPloeg = { name: string; logoUrl: string | null; logoFit: LogoFit | null; eigen: boolean }
export type HubWedstrijdInfo = {
  id: number
  date?: string | null
  status: string
  home: HubPloeg
  away: HubPloeg
  score: { home: number; away: number } | null
}

/** Uitslag vanuit de eigen ploeg: W(inst), G(elijk), V(erlies) — of null als dat niet vaststaat. */
function uitslag(w: HubWedstrijdInfo): 'W' | 'G' | 'V' | null {
  if (!w.score || w.status !== 'finished') return null
  const eigenThuis = w.home.eigen && !w.away.eigen
  const eigenUit = w.away.eigen && !w.home.eigen
  if (!eigenThuis && !eigenUit) return null
  const voor = eigenThuis ? w.score.home : w.score.away
  const tegen = eigenThuis ? w.score.away : w.score.home
  return voor > tegen ? 'W' : voor < tegen ? 'V' : 'G'
}

const UITSLAG_LABEL = { W: 'Gewonnen', G: 'Gelijkspel', V: 'Verloren' } as const

function Ploeg({ p, score, winnaar }: { p: HubPloeg; score: number | null; winnaar: boolean | null }) {
  const cls = ['hubw-ploeg', p.eigen ? 'eigen' : '', winnaar === false ? 'verliest' : ''].filter(Boolean).join(' ')
  return (
    <span className={cls}>
      <TeamLogo name={p.name} logoUrl={p.logoUrl} logoFit={p.logoFit} size={22} lazy />
      <span className="hubw-naam">{p.name}</span>
      {score != null && <span className="hubw-score">{score}</span>}
    </span>
  )
}

export function HubWedstrijd({ w }: { w: HubWedstrijdInfo }) {
  const live = w.status === 'live'
  const gespeeld = w.status === 'finished'
  const r = uitslag(w)
  const s = (live || gespeeld) && w.score ? w.score : null
  const winnaar = (kant: 'home' | 'away') => (gespeeld && s ? (s.home === s.away ? null : kant === 'home' ? s.home > s.away : s.away > s.home) : null)
  const dag = w.date ? formatDateBE(w.date, { weekday: 'short' }).replace('.', '') : ''
  const datum = w.date ? formatDateBE(w.date, { day: 'numeric', month: 'numeric' }) : ''

  const label = `${w.home.name} tegen ${w.away.name}${s ? `, ${s.home}-${s.away}` : ''}${w.date ? `, ${dag} ${datum}` : ''}${r ? `, ${UITSLAG_LABEL[r].toLowerCase()}` : ''}`
  return (
    <Link href={`/match/${w.id}`} className={`hubw${live ? ' live' : ''}`} aria-label={label}>
      <span className="hubw-wanneer">
        {live ? (
          <span className="hubw-live">Live</span>
        ) : gespeeld ? (
          <>
            {r ? <span className={`hubw-uitslag u-${r}`} title={UITSLAG_LABEL[r]}>{r}</span> : <span className="hubw-dag">Uitslag</span>}
            <span className="hubw-datum">{datum}</span>
          </>
        ) : (
          <>
            <span className="hubw-dag">{dag} {datum}</span>
            {w.date && <span className="hubw-uur">{formatTimeBE(w.date)}</span>}
          </>
        )}
      </span>
      <span className="hubw-ploegen">
        <Ploeg p={w.home} score={s ? s.home : null} winnaar={winnaar('home')} />
        <Ploeg p={w.away} score={s ? s.away : null} winnaar={winnaar('away')} />
      </span>
      <span className="hubw-pijl" aria-hidden>›</span>
    </Link>
  )
}
