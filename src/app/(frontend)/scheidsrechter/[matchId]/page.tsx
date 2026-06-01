import Link from 'next/link'

import { getOrCreateMatchSheet } from '@/lib/matchsheet-data'
import { isReleaseTime } from '@/lib/matchsheet-workflow'
import { getPayloadClient } from '@/lib/payload-client'
import { RefereePanel } from './RefereePanel'

export const dynamic = 'force-dynamic'

type LineupRow = { player?: { name?: string } | number; rugnummer?: number }

function names(rows: LineupRow[] | undefined): { rugnummer?: number; name: string }[] {
  return (rows ?? []).map((r) => ({
    rugnummer: r.rugnummer,
    name: typeof r.player === 'object' ? (r.player?.name ?? '—') : `#${r.player}`,
  }))
}

export default async function ScheidsrechterPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params
  const payload = await getPayloadClient()
  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)
  if (!match) {
    return (
      <div className="site">
        <p className="empty">Wedstrijd niet gevonden.</p>
        <Link href="/">← Terug</Link>
      </div>
    )
  }

  const settings = await payload.findGlobal({ slug: 'settings', depth: 0 }).catch(() => null)
  const releaseMinutes = (settings as { releaseMinutesBefore?: number } | null)?.releaseMinutesBefore ?? 60
  const released = isReleaseTime(match.date as string, releaseMinutes, new Date())

  await getOrCreateMatchSheet(payload, matchId)
  const sheetFull = await payload.find({
    collection: 'matchsheets',
    where: { match: { equals: matchId } },
    depth: 2,
    limit: 1,
  })
  const sheet = sheetFull.docs[0]

  const releaseAt = new Date(new Date(match.date as string).getTime() - releaseMinutes * 60_000)

  return (
    <div className="site">
      <header className="site-header">
        <h1>
          Scheidsrechter <span className="brand">·</span> {String(match.title ?? '')}
        </h1>
        <nav className="site-nav">
          <Link href={`/opstelling/${matchId}`}>Opstellingen</Link>
          <Link href={`/scorekeeper/${matchId}`}>Aantekenen</Link>
        </nav>
      </header>

      {!released ? (
        <p className="empty">
          De opstellingen worden zichtbaar vanaf{' '}
          {releaseAt.toLocaleString('nl-BE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}{' '}
          ({releaseMinutes} min vóór aanvang).
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', marginBottom: 24 }}>
          <LineupView title="Thuis" rows={names(sheet?.homeLineup as LineupRow[])} />
          <LineupView title="Uit" rows={names(sheet?.awayLineup as LineupRow[])} />
        </div>
      )}

      <RefereePanel
        matchId={matchId}
        initialStatus={(sheet?.status as string) ?? 'concept'}
        initialKeuring={(sheet?.keuring as Record<string, string>) ?? {}}
      />
    </div>
  )
}

function LineupView({ title, rows }: { title: string; rows: { rugnummer?: number; name: string }[] }) {
  return (
    <section style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, background: '#fff' }}>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      {rows.length === 0 ? (
        <p style={{ color: '#888' }}>Nog geen opstelling ingevuld.</p>
      ) : (
        <ol style={{ paddingLeft: 18, margin: 0 }}>
          {rows.map((r, i) => (
            <li key={i}>
              <strong>{r.rugnummer ?? '–'}</strong> {r.name}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
