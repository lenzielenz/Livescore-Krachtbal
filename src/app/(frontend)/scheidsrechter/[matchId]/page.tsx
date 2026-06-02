import Link from 'next/link'

import { getOrCreateMatchSheet } from '@/lib/matchsheet-data'
import { isReleaseTime } from '@/lib/matchsheet-workflow'
import { getPayloadClient } from '@/lib/payload-client'
import { vereisteOfficialsTekst, type Reeks } from '@/lib/reeksen'
import { RefereePanel } from './RefereePanel'
import '../../wedstrijdblad.css'

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
        <p className="wb-intro">
          De opstellingen worden zichtbaar vanaf{' '}
          {releaseAt.toLocaleString('nl-BE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}{' '}
          ({releaseMinutes} min vóór aanvang).
        </p>
      ) : (
        <div className="wb-grid" style={{ marginBottom: 16 }}>
          <LineupView title="Thuis" rows={names(sheet?.homeLineup as LineupRow[])} />
          <LineupView title="Uit" rows={names(sheet?.awayLineup as LineupRow[])} />
        </div>
      )}

      <RefereePanel
        matchId={matchId}
        reeks={(match.reeks as Reeks) ?? null}
        assignedRefereeId={
          typeof sheet?.assignedReferee === 'object'
            ? (sheet?.assignedReferee?.id ?? null)
            : ((sheet?.assignedReferee as number | null) ?? null)
        }
        initialStatus={(sheet?.status as string) ?? 'concept'}
        initialKeuring={(sheet?.keuring as Record<string, string>) ?? {}}
        initialOfficials={(sheet?.officials as Record<string, string>) ?? {}}
        initialVergoeding={{
          refereeKm: (sheet?.refereeKm as number) ?? '',
          vanToepassing: Boolean((sheet?.forfait as { vanToepassing?: boolean } | undefined)?.vanToepassing),
          gemeldThuis: Boolean((sheet?.forfait as { gemeldThuis?: boolean } | undefined)?.gemeldThuis),
          gemeldUit: Boolean((sheet?.forfait as { gemeldUit?: boolean } | undefined)?.gemeldUit),
          aantalAutos: (sheet?.forfait as { aantalAutos?: number } | undefined)?.aantalAutos ?? '',
          km: (sheet?.forfait as { km?: number } | undefined)?.km ?? '',
        }}
        officialsHint={match.reeks ? vereisteOfficialsTekst(match.reeks as Reeks) : null}
      />
    </div>
  )
}

function LineupView({ title, rows }: { title: string; rows: { rugnummer?: number; name: string }[] }) {
  return (
    <section className="wb-card">
      <h2>{title}</h2>
      {rows.length === 0 ? (
        <p className="wb-sub">Nog geen opstelling ingevuld.</p>
      ) : (
        <ul className="wb-rows">
          {rows.map((r, i) => (
            <li key={i} className="wb-row" style={{ cursor: 'default' }}>
              <strong className="num">{r.rugnummer ?? '–'}</strong>
              <span className="nm">{r.name}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
