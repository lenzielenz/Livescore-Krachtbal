import Link from 'next/link'

import { getPayloadClient } from '@/lib/payload-client'
import { openKnipjes } from '@/lib/sanctions'

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
    <div className="site">
      <header className="site-header">
        <h1>
          Knipjes <span className="brand">·</span> overzicht
        </h1>
        <nav className="site-nav">
          <Link href="/">Live-site</Link>
          <Link href="/admin">Beheer</Link>
        </nav>
      </header>
      <p className="empty">
        Selectieblokkade vanaf <strong>{drempel}</strong> openstaande knipjes (configureerbaar via Federatie-instellingen).
      </p>

      <div style={{ display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        <Aggregate title="Per club" data={perClub} drempel={drempel} />
        <Aggregate title="Per team" data={perTeam} drempel={drempel} />
      </div>

      <h2 className="section-title" style={{ marginTop: 24 }}>Per speler</h2>
      {rows.length === 0 ? (
        <p className="empty">Geen openstaande knipjes.</p>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <Th>Speler</Th>
              <Th>Team</Th>
              <Th>Club</Th>
              <Th>Knipjes</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ background: r.knipjes >= drempel ? '#fef2f2' : undefined }}>
                <Td>{r.player}</Td>
                <Td>{r.team}</Td>
                <Td>{r.club}</Td>
                <Td>
                  <strong>{r.knipjes}</strong>
                  {r.knipjes >= drempel && <span style={{ color: '#ef4444' }}> · geblokkeerd</span>}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function Aggregate({ title, data, drempel }: { title: string; data: [string, number][]; drempel: number }) {
  return (
    <section style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, background: '#fff' }}>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      {data.length === 0 ? (
        <p style={{ color: '#888' }}>Geen knipjes.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {data.map(([name, total]) => (
            <li key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
              <span>{name}</span>
              <strong style={{ color: total >= drempel ? '#ef4444' : undefined }}>{total}</strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', background: '#fff' }
const Th = ({ children }: { children: React.ReactNode }) => (
  <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #e5e7eb' }}>{children}</th>
)
const Td = ({ children }: { children: React.ReactNode }) => (
  <td style={{ padding: '8px 10px', borderBottom: '1px solid #f0f0f0' }}>{children}</td>
)
