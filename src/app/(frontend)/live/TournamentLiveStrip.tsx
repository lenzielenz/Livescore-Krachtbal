import Link from 'next/link'

import { getPayloadClient } from '@/lib/payload-client'
import './tournament-strip.css'

type Goal = { side?: 'home' | 'away'; points?: number }
type TMatch = { id: number; label?: string; home?: string; away?: string; status?: string; goals?: Goal[] }

function scoreOf(goals: Goal[] | undefined, side: 'home' | 'away'): number {
  return Array.isArray(goals) ? goals.filter((g) => g?.side === side).reduce((a, g) => a + (Number(g?.points) || 0), 0) : 0
}

// Compacte strip bovenaan de live-pagina met de lopende bekers die als "tonen op live" gemarkeerd
// zijn. Toont per beker de live wedstrijden (en de eerstvolgende klaar-om-te-spelen), met een link
// naar het tornooischema. Rendert niets als er niets te tonen valt.
export async function TournamentLiveStrip() {
  const payload = await getPayloadClient()
  const tourRes = await payload
    .find({ collection: 'tournaments', where: { and: [{ toonOpLive: { equals: true } }, { status: { equals: 'live' } }] }, depth: 0, limit: 20, sort: '-createdAt' })
    .catch(() => ({ docs: [] as { id: number; name: string }[] }))
  if (tourRes.docs.length === 0) return null

  const tours: { id: number; name: string; matches: TMatch[] }[] = []
  for (const t of tourRes.docs) {
    const mRes = await payload
      .find({ collection: 'tournament-matches', where: { tournament: { equals: t.id } }, depth: 0, limit: 200 })
      .catch(() => ({ docs: [] as Record<string, unknown>[] }))
    const all = mRes.docs as unknown as TMatch[]
    // Toon live wedstrijden eerst, dan klaar-om-te-spelen (beide ploegen gekend). Geen lege slots.
    const live = all.filter((m) => m.status === 'live')
    const ready = all.filter((m) => m.status === 'pending' && m.home && m.away)
    const matches = [...live, ...ready].slice(0, 6)
    if (matches.length > 0) tours.push({ id: t.id as number, name: (t as { name?: string }).name ?? 'Beker', matches })
  }
  if (tours.length === 0) return null

  return (
    <section className="tstrip">
      <h2 className="tstrip-h">🏆 Bekerwedstrijden</h2>
      {tours.map((t) => (
        <div className="tstrip-tour" key={t.id}>
          <Link href={`/tornooi/${t.id}`} className="tstrip-name">{t.name} <span className="tstrip-arrow" aria-hidden>›</span></Link>
          <div className="tstrip-matches">
            {t.matches.map((m) => {
              const live = m.status === 'live'
              const played = m.status === 'live' || m.status === 'finished'
              return (
                <Link href={`/tornooi/${t.id}`} key={m.id} className={`tstrip-m${live ? ' live' : ''}`}>
                  <span className="tstrip-team">{m.home || '—'}</span>
                  <span className="tstrip-score">
                    {live && <span className="tstrip-livedot" />}
                    {played ? `${scoreOf(m.goals, 'home')}–${scoreOf(m.goals, 'away')}` : 'vs'}
                  </span>
                  <span className="tstrip-team away">{m.away || '—'}</span>
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </section>
  )
}
