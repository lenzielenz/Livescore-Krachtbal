import Link from 'next/link'
import type { ReactNode } from 'react'

import { SiteHeader } from '@/components/SiteHeader'
import { SpelerOntwikkeling } from '@/components/SpelerOntwikkeling'
import { userPlayerId } from '@/lib/access'
import { competitionWhere } from '@/lib/analyse-access'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { buildPlayerDevelopment } from '@/lib/player-development'
import { resolveCompetitieReeks } from '@/lib/reeksen'
import { buildSeasonStats } from '@/lib/season-stats'
import './mijn-ontwikkeling.css'
import '../publieke-stats.css'

// PERSOONLIJK & PRIVÉ: enkel het ingelogde account ziet z'n eigen ontwikkeling (Skill + Fame + badges)
// en kerncijfers. Geen klassement, geen andere spelers — de speler-id komt uit de eigen accountkoppeling
// (users.player), dus er is geen IDOR mogelijk. Alles afgeleid uit de worp-events.
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Mijn ontwikkeling — Krachtbal Live' }

function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="mo">{children}</main>
    </>
  )
}

function Kpi({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="ps-kpi">
      <span className="ps-kpi-val">{value}</span>
      <span className="ps-kpi-lbl">{label}</span>
    </div>
  )
}

export default async function MijnOntwikkelingPage() {
  const me = await getAuthUser()
  if (!me) {
    return (
      <Shell>
        <header className="mo-head"><h1>📈 Mijn ontwikkeling</h1></header>
        <p className="mo-empty">
          <Link href="/inloggen" style={{ color: 'var(--accent)', fontWeight: 700 }}>Log in</Link> om je eigen
          ontwikkeling (Skill &amp; Fame en badges) te zien.
        </p>
      </Shell>
    )
  }

  const myPlayerId = userPlayerId(me)
  if (myPlayerId == null) {
    return (
      <Shell>
        <header className="mo-head"><h1>📈 Mijn ontwikkeling</h1></header>
        <p className="mo-empty">
          Je account is nog niet aan een speler-dossier gekoppeld. Vraag je club-beheerder om je te koppelen,
          dan zie je hier je eigen wedstrijden, doelpunten, rugworpen en badges.
        </p>
      </Shell>
    )
  }

  const payload = await getPayloadClient()
  const player = (await payload
    .findByID({ collection: 'players', id: Number(myPlayerId), depth: 1, overrideAccess: false })
    .catch(() => null)) as { name?: string; shirtNumber?: number; team?: unknown } | null

  const team = (player?.team && typeof player.team === 'object' ? player.team : null) as
    | { reeks?: string | null }
    | null
  const reeksCode = team?.reeks ? resolveCompetitieReeks(team.reeks) : null

  const [seasonPlayers, mvpVotesRes] = await Promise.all([
    reeksCode ? buildSeasonStats(payload, reeksCode, null, competitionWhere()).catch(() => []) : Promise.resolve([]),
    payload.count({ collection: 'match-mvp-votes', where: { player: { equals: Number(myPlayerId) } } }).catch(() => ({ totalDocs: 0 })),
  ])
  const stat = seasonPlayers.find((s) => s.playerId === Number(myPlayerId)) ?? null
  const mvpVotesReceived = (mvpVotesRes as { totalDocs?: number }).totalDocs ?? 0

  const dev = buildPlayerDevelopment({
    matches: stat?.matches ?? 0,
    throws: stat?.throws ?? 0,
    goals: stat?.goals ?? 0,
    rug: stat?.rug ?? 0,
    conversion: stat?.conversion ?? 0,
    goalAttempts: stat?.goalAttempts ?? 0,
    maxDistance: stat?.maxDistance ?? 0,
    zones: stat?.zones ?? { links: 0, midden: 0, rechts: 0 },
    mvpVotesReceived,
  })

  return (
    <Shell>
      <header className="mo-head">
        <h1>📈 Mijn ontwikkeling</h1>
        <p className="mo-sub">{player?.name ?? 'Mijn'} — je eigen Skill &amp; Fame, kerncijfers en badges.</p>
        <span className="mo-private">🔒 Alleen voor jou zichtbaar</span>
      </header>

      <section className="ps-kpis">
        <Kpi label="Wedstrijden" value={stat?.matches ?? 0} />
        <Kpi label="Doelpunten" value={stat?.goals ?? 0} />
        <Kpi label="Rugworp-goals" value={stat?.rug ?? 0} />
        <Kpi label="Worpen" value={stat?.throws ?? 0} />
        <Kpi label="Conversie" value={`${Math.round((stat?.conversion ?? 0) * 100)}%`} />
        <Kpi label="Verste worp" value={`${(stat?.maxDistance ?? 0).toFixed(1)} m`} />
      </section>

      <SpelerOntwikkeling dev={dev} />

      {!stat && (
        <p className="mo-empty">
          Nog geen wedstrijddata — zodra je meespeelt, lopen je Skill &amp; Fame en badges hier vanzelf op.
        </p>
      )}

      <div className="mo-links">
        <Link href="/beheer/training/progressie" className="mo-link">🏋️ Mijn training →</Link>
        <Link href="/profiel/scorecard" className="mo-link">🃏 Mijn scorecard →</Link>
      </div>
    </Shell>
  )
}
