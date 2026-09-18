'use client'

import { useState } from 'react'

import type { DayMatch } from '../../live/LiveBoard'
import type { Speeldag } from '@/lib/speeldagen'
import { Proposal1Omnibox } from './proposals/Proposal1Omnibox'
import { Proposal2Toolbar } from './proposals/Proposal2Toolbar'
import { Proposal3Drawer } from './proposals/Proposal3Drawer'

type ProposalId = 1 | 2 | 3

const TABS: { id: ProposalId; label: string; sub: string }[] = [
  { id: 1, label: '① Omnibox', sub: 'Eén grote zoekbalk + smalle snelfilterrij' },
  { id: 2, label: '② Werkbalk', sub: 'Sticky rij bovenaan, zoeken achter een icoon' },
  { id: 3, label: '③ Filterlade', sub: 'Enkel zoeken vast, rest achter één knop' },
]

/** Wisselt tussen de 3 voorstellen — elk voorstel bouwt zijn eigen filterstaat op, zodat
 *  overschakelen altijd met een schone lei begint. */
export function FilterProposalsDemo({
  date, today, matches, speeldagen, myClubId, userId,
}: {
  date: string
  today: string
  matches: DayMatch[]
  speeldagen: Speeldag[]
  myClubId: number | null
  userId: number | string | null
}) {
  const [tab, setTab] = useState<ProposalId>(1)

  return (
    <div className="fpd">
      <div className="fpd-tabs" role="tablist" aria-label="Kies een voorstel">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`fpd-tab ${tab === t.id ? 'on' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <span className="fpd-tab-label">{t.label}</span>
            <span className="fpd-tab-sub">{t.sub}</span>
          </button>
        ))}
      </div>

      <div className="fpd-body">
        {tab === 1 && <Proposal1Omnibox date={date} today={today} matches={matches} speeldagen={speeldagen} myClubId={myClubId} userId={userId} />}
        {tab === 2 && <Proposal2Toolbar date={date} today={today} matches={matches} speeldagen={speeldagen} myClubId={myClubId} userId={userId} />}
        {tab === 3 && <Proposal3Drawer date={date} today={today} matches={matches} speeldagen={speeldagen} myClubId={myClubId} userId={userId} />}
      </div>
    </div>
  )
}
