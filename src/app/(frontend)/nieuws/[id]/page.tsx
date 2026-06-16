import Link from 'next/link'
import { notFound } from 'next/navigation'

import { SiteHeader } from '@/components/SiteHeader'
import { getPayloadClient } from '@/lib/payload-client'
import '../nieuws.css'

export const dynamic = 'force-dynamic'

const fmt = (v: unknown): string => {
  if (!v) return ''
  const d = new Date(String(v))
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('nl-BE', { day: '2-digit', month: 'long', year: 'numeric' })
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const payload = await getPayloadClient()
  const n = await payload.findByID({ collection: 'news', id: Number(id), depth: 0 }).catch(() => null)
  const title = n?.title ? `${String(n.title)} — Krachtbal Live` : 'Nieuws — Krachtbal Live'
  return { title, description: n?.excerpt ? String(n.excerpt) : 'Clubnieuws en wedstrijdverslagen.' }
}

export default async function NieuwsArtikel({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const nid = Number(id)
  if (!Number.isFinite(nid)) notFound()

  const payload = await getPayloadClient()
  const n = await payload.findByID({ collection: 'news', id: nid, depth: 1 }).catch(() => null)
  if (!n || !n.published) notFound()

  const cover = (n as { coverImage?: unknown }).coverImage
  const coverUrl = cover && typeof cover === 'object' ? ((cover as { url?: string }).url ?? null) : null
  const club = (n as { club?: unknown }).club
  const clubNm = club && typeof club === 'object' ? ((club as { name?: string }).name ?? null) : null
  const date = fmt((n as { publishedAt?: unknown }).publishedAt) || fmt((n as { createdAt?: unknown }).createdAt)

  return (
    <>
      <SiteHeader />
      <div className="site">
        <Link href="/nieuws" className="nw-back">← Alle nieuws</Link>
        <article className="nw-article">
          {coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="nw-article-cover" src={coverUrl} alt="" />
          )}
          <div className="nw-article-meta">{[clubNm, date].filter(Boolean).join(' · ')}</div>
          <h1 className="nw-article-title">{String(n.title ?? '')}</h1>
          {Boolean(n.excerpt) && <p className="nw-article-lead">{String(n.excerpt)}</p>}
          <div className="nw-article-body">{String(n.body ?? '')}</div>
        </article>
      </div>
    </>
  )
}
