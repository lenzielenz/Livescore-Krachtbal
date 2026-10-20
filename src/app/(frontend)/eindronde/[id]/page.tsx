import Link from 'next/link'
import { notFound } from 'next/navigation'

import { SiteHeader } from '@/components/SiteHeader'
import { formatDateTimeBE } from '@/lib/datetime'
import { getPayloadClient } from '@/lib/payload-client'
import { standingsUitWedstrijden } from '@/lib/reeks-standings'

export const dynamic = 'force-dynamic'

const relId = (v: unknown): number | null => {
  const id = v && typeof v === 'object' ? (v as { id?: unknown }).id : v
  return id == null || !Number.isFinite(Number(id)) ? null : Number(id)
}

// Een eindronde: ploegen die doorgingen, de stand en de wedstrijden. Aangemaakt uit een regel van
// het reglement (lib/competitieregels.ts).
export default async function EindrondePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const payload = await getPayloadClient()
  const er = await payload.findByID({ collection: 'eindrondes', id: Number(id), depth: 1 }).catch(() => null)
  if (!er) notFound()
  const regel = er.regel && typeof er.regel === 'object' ? er.regel : null
  const ploegen = (er.ploegen ?? []).filter((p): p is Exclude<typeof p, number> => typeof p === 'object')
  const naam = new Map(ploegen.map((p) => [Number(p.id), String(p.name ?? '')]))
  const wedstrijden = await payload.find({ collection: 'matches', where: { eindronde: { equals: er.id } }, sort: 'date', depth: 0, limit: 500, pagination: false })
  const gespeeld = wedstrijden.docs.filter((m) => m.status === 'finished')
  const { standings } = await standingsUitWedstrijden(payload, gespeeld as unknown as Record<string, unknown>[], [...naam.keys()])

  return (
    <>
      <SiteHeader active="stand" />
      <div className="site">
        <h1 className="page-title">🏁 {String(er.naam)}</h1>
        <p className="page-sub">
          Seizoen {String(er.seizoen)}
          {regel ? ` · volgens "${String(regel.naam)}" (${(regel.bronReeksen ?? []).join(', ')}, beste ${regel.topPerReeks} per reeks)` : ''} ·{' '}
          <Link href="/reglement">reglement</Link>
        </p>
        <section className="wb-card" style={{ marginBottom: 16 }}>
          <h2>Stand</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--dim)' }}>
                <th>#</th>
                <th>Ploeg</th>
                <th>G</th>
                <th>W</th>
                <th>D</th>
                <th>V</th>
                <th>Saldo</th>
                <th>Ptn</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((r, i) => (
                <tr key={r.teamId} style={{ borderTop: '1px solid var(--line)' }}>
                  <td>{i + 1}</td>
                  <td>
                    <Link href={`/ploegen/${r.teamId}`}>{naam.get(r.teamId) ?? r.teamId}</Link>
                  </td>
                  <td>{r.played}</td>
                  <td>{r.won}</td>
                  <td>{r.drawn}</td>
                  <td>{r.lost}</td>
                  <td>{r.diff}</td>
                  <td>
                    <strong>{r.points}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="wb-card">
          <h2>Wedstrijden</h2>
          <ul className="wb-rows">
            {wedstrijden.docs.map((m) => (
              <li key={m.id} className="wb-row" style={{ cursor: 'default' }}>
                <span className="nm">
                  <Link href={`/match/${m.id}`}>
                    {naam.get(relId(m.homeTeam) ?? -1) ?? '?'} – {naam.get(relId(m.awayTeam) ?? -1) ?? '?'}
                  </Link>
                </span>
                <span className="wb-sub">
                  {formatDateTimeBE(String(m.date))}
                  {m.status === 'finished' ? ' · gespeeld' : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  )
}
