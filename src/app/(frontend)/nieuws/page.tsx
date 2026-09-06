import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { getPayloadClient } from '@/lib/payload-client'
import './nieuws.css'
import { formatDateBE } from '@/lib/datetime'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Nieuws — Krachtbal Live',
  description: 'Clubnieuws en wedstrijdverslagen.',
}

const fmt = (v: unknown): string => {
  if (!v) return ''
  const d = new Date(String(v))
  return Number.isNaN(d.getTime()) ? '' : formatDateBE(d, { day: '2-digit', month: 'long', year: 'numeric' })
}
const imgUrl = (v: unknown): string | null => (v && typeof v === 'object' ? ((v as { url?: string }).url ?? null) : null)
const clubName = (v: unknown): string | null => (v && typeof v === 'object' ? ((v as { name?: string }).name ?? null) : null)

export default async function NieuwsPage() {
  const payload = await getPayloadClient()
  const res = await payload
    .find({ collection: 'news', where: { published: { equals: true } }, sort: '-publishedAt', depth: 1, limit: 50 })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))

  return (
    <>
      <SiteHeader />
      <div className="site">
        <h1 className="page-title">📰 <span className="brand">Nieuws</span></h1>
        {res.docs.length === 0 ? (
          <p className="empty">Nog geen nieuws. Kom snel terug! 👀</p>
        ) : (
          <div className="nw-grid">
            {res.docs.map((n) => {
              const id = n.id as number
              const url = imgUrl((n as { coverImage?: unknown }).coverImage)
              const club = clubName((n as { club?: unknown }).club)
              const date = fmt((n as { publishedAt?: unknown }).publishedAt) || fmt((n as { createdAt?: unknown }).createdAt)
              return (
                <Link key={id} href={`/nieuws/${id}`} className="nw-card">
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="nw-card-img" src={url} alt="" loading="lazy" />
                  ) : (
                    <div className="nw-card-img nw-card-noimg" aria-hidden>📰</div>
                  )}
                  <div className="nw-card-body">
                    <div className="nw-card-meta">{[club, date].filter(Boolean).join(' · ')}</div>
                    <h2 className="nw-card-title">{String((n as { title?: unknown }).title ?? '')}</h2>
                    {Boolean((n as { excerpt?: unknown }).excerpt) && <p className="nw-card-excerpt">{String((n as { excerpt?: unknown }).excerpt)}</p>}
                    <span className="nw-card-more">Lees meer →</span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
