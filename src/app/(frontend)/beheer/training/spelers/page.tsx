import Link from 'next/link'
import type { Where } from 'payload'

import { SiteHeader } from '@/components/SiteHeader'
import { canTraining, hasRole, isFederationLevel, userClubId, userPlayerId } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { reeksNaam } from '@/lib/reeksen'
import { TrainingHero } from '../TrainingHero'
import './spelers.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Spelersoverzicht — Krachtbal Live' }

type PlayerRow = {
  id: number
  name: string
  shirtNumber: number | null
  team: string
  reeks: string
  reeksNaam: string
  metingen: number
  lastMeting: string | null
}

export default async function SpelersPage() {
  const me = await getAuthUser()
  const fed = isFederationLevel(me)
  const isClubBeheerder = hasRole(me, 'club-beheerder', 'club-medewerker')
  const canView = canTraining(me)

  if (!canView) {
    return (
      <>
        <SiteHeader active="training" />
        <div className="site">
          <h1 className="page-title">
            Training <span className="brand">·</span> spelers
          </h1>
          <p className="empty">
            Enkel voor admin/federatie of club-beheerders.{' '}
            <Link href="/inloggen" style={{ color: 'var(--accent)' }}>Inloggen →</Link>
          </p>
        </div>
      </>
    )
  }

  const payload = await getPayloadClient()
  const rawClubId = userClubId(me)
  const myClubId: number | null =
    rawClubId != null && Number.isFinite(Number(rawClubId)) ? Number(rawClubId) : null
  const playerWhere: Where = myClubId != null ? { 'team.club': { equals: myClubId } } : {}
  const lidOnly = hasRole(me, 'club-lid') && !fed && !isClubBeheerder
  const scopedWhere: Where = lidOnly
    ? { and: [playerWhere, { id: { equals: Number(userPlayerId(me) ?? -1) } }] }
    : playerWhere

  const [playersRes, metingenRes] = await Promise.all([
    payload.find({
      collection: 'players',
      where: scopedWhere,
      depth: 2,
      limit: 2000,
      sort: 'name',
    }),
    payload.find({
      collection: 'trainingmetingen',
      depth: 0,
      limit: 5000,
      sort: '-datum',
    }),
  ])

  // Tally metingen per speler
  const metingCount = new Map<number, number>()
  const lastMeting = new Map<number, string>()
  for (const m of metingenRes.docs) {
    const spelerId =
      m.speler && typeof m.speler === 'object'
        ? (m.speler as { id: number }).id
        : (m.speler as number)
    metingCount.set(spelerId, (metingCount.get(spelerId) ?? 0) + 1)
    if (!lastMeting.has(spelerId) && m.datum) {
      lastMeting.set(spelerId, String(m.datum))
    }
  }

  const players: PlayerRow[] = playersRes.docs.map((p) => {
    const team = typeof p.team === 'object' && p.team ? p.team : null
    const reeks = (team?.reeks as string | null | undefined) ?? ''
    return {
      id: p.id,
      name: p.name ?? '—',
      shirtNumber: (p.shirtNumber as number | null | undefined) ?? null,
      team: team?.name ?? '',
      reeks,
      reeksNaam: reeks ? reeksNaam(reeks) : 'Overig',
      metingen: metingCount.get(p.id) ?? 0,
      lastMeting: lastMeting.get(p.id) ?? null,
    }
  })

  return (
    <>
      <SiteHeader active="training" />
      <div className="site">
        <TrainingHero active="spelers" />
        <p className="wb-intro">
          Klik op een speler voor het volledige trainingsdossier: metingen, doelen en aanwezigheid.
        </p>

        {players.length === 0 ? (
          <p className="empty">Geen spelers gevonden.</p>
        ) : (
          <div className="spl-grid">
            {players.map((p) => {
              const initials = p.name
                .split(' ')
                .map((w) => w[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()
              const lastDate = p.lastMeting
                ? new Date(p.lastMeting).toLocaleDateString('nl-BE', {
                    day: 'numeric',
                    month: 'short',
                  })
                : null
              return (
                <Link
                  key={p.id}
                  href={`/beheer/training/spelers/${p.id}`}
                  className="spl-card"
                >
                  <span className="spl-avatar" aria-hidden>
                    {p.shirtNumber != null ? `#${p.shirtNumber}` : initials}
                  </span>
                  <span className="spl-info">
                    <span className="spl-name">{p.name}</span>
                    <span className="spl-meta">
                      {p.reeksNaam && <span>{p.reeksNaam}</span>}
                      {p.team && <span>{p.team}</span>}
                    </span>
                  </span>
                  <span
                    className={`spl-badge${p.metingen > 0 ? ' has-data' : ''}`}
                    title="Aantal metingen"
                  >
                    {p.metingen > 0
                      ? lastDate
                        ? lastDate
                        : `${p.metingen} met.`
                      : '—'}
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
