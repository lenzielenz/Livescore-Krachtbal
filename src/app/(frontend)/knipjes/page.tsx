import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { getPayloadClient } from '@/lib/payload-client'
import { openKnipjes } from '@/lib/sanctions'
import '../wedstrijdblad.css'

export const dynamic = 'force-dynamic'

type Row = { club: string; team: string; player: string; knipjes: number }

// Knipjes-dashboard per club / team / speler (WEDSTRIJDBLAD-PROMPT §Knipjes B — expliciet gevraagd).
export default async function KnipjesDashboard() {
  const payload = await getPayloadClient()
  const [sanctions, settings] = await Promise.all([
    payload.find({ collection: 'sanctions', depth: 2, limit: 2000 }),
    payload.findGlobal({ slug: 'settings', depth: 0 }).catch(() => null),
  ])
  const drempel = (settings as { knipjesDrempel?: number } | null)?.knipjesDrempel ?? 3
  const now = new Date()

  // Aggregeer per speler.
  const perPlayer = new Map<number, { records: { aantal?: number; vervallenOp?: string }[]; meta: Row }>()
  for (const s of sanctions.docs) {
    const player = s.player as { id?: number; name?: string; team?: { name?: string; club?: { name?: string } } } | number | null
    if (!player || typeof player === 'number') continue
    const id = player.id as number
    const meta: Row = {
      club: player.team?.club?.name ?? '—',
      team: player.team?.name ?? '—',
      player: player.name ?? '—',
      knipjes: 0,
    }
    const entry = perPlayer.get(id) ?? { records: [], meta }
    entry.records.push({ aantal: s.aantal as number, vervallenOp: s.vervallenOp as string })
    perPlayer.set(id, entry)
  }

  const rows: Row[] = [...perPlayer.values()]
    .map((e) => ({ ...e.meta, knipjes: openKnipjes(e.records, now) }))
    .filter((r) => r.knipjes > 0)
    .sort((a, b) => b.knipjes - a.knipjes)

  const byKey = (key: 'club' | 'team') => {
    const m = new Map<string, number>()
    for (const r of rows) m.set(r[key], (m.get(r[key]) ?? 0) + r.knipjes)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }
  const perClub = byKey('club')
  const perTeam = byKey('team')

  return (
    <>
      <SiteHeader active="meer" />
      <div className="site">
      <h1 className="page-title">
        Knipjes <span className="brand">·</span> overzicht
      </h1>
      <p className="wb-intro">
        Selectieblokkade vanaf <strong>{drempel}</strong> openstaande knipjes (configureerbaar via Federatie-instellingen).
      </p>

      <div className="wb-grid">
        <Aggregate title="Per club" data={perClub} drempel={drempel} />
        <Aggregate title="Per team" data={perTeam} drempel={drempel} />
      </div>

      <h2 className="section-title" style={{ marginTop: 24 }}>Per speler</h2>
      {rows.length === 0 ? (
        <p className="wb-intro">Geen openstaande knipjes.</p>
      ) : (
        <div className="wb-card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="wb-table">
            <thead>
              <tr>
                <th>Speler</th>
                <th>Team</th>
                <th>Club</th>
                <th>Knipjes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={r.knipjes >= drempel ? 'warn' : undefined}>
                  <td>{r.player}</td>
                  <td>{r.team}</td>
                  <td>{r.club}</td>
                  <td>
                    <strong>{r.knipjes}</strong>
                    {r.knipjes >= drempel && <span style={{ color: '#ef476f' }}> · geblokkeerd</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </>
  )
}

function Aggregate({ title, data, drempel }: { title: string; data: [string, number][]; drempel: number }) {
  return (
    <section className="wb-card">
      <h2>{title}</h2>
      {data.length === 0 ? (
        <p className="wb-sub">Geen knipjes.</p>
      ) : (
        <ul className="wb-rows">
          {data.map(([name, total]) => (
            <li key={name} className="wb-row" style={{ cursor: 'default', justifyContent: 'space-between' }}>
              <span className="nm">{name}</span>
              <strong style={{ color: total >= drempel ? '#ef476f' : undefined }}>{total}</strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
