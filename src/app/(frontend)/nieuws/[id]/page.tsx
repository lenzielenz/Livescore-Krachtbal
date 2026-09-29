import Link from 'next/link'
import { notFound } from 'next/navigation'

import { NewsPhotoWall } from '@/components/NewsPhotoWall'
import { SiteHeader } from '@/components/SiteHeader'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import '../nieuws.css'
import { formatDateBE } from '@/lib/datetime'

export const dynamic = 'force-dynamic'

const fmt = (v: unknown): string => {
  if (!v) return ''
  const d = new Date(String(v))
  return Number.isNaN(d.getTime()) ? '' : formatDateBE(d, { day: '2-digit', month: 'long', year: 'numeric' })
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

  const photosEnabled = Boolean((n as { photosEnabled?: boolean }).photosEnabled)
  const photosExpireAt = (n as { photosExpireAt?: string | null }).photosExpireAt ?? null
  const photosOpen = photosEnabled && Boolean(photosExpireAt) && new Date(photosExpireAt as string).getTime() > Date.now()
  let photos: { id: number; url: string; uploaderName: string; caption: string | null }[] = []
  let mineIds = new Set<number>()
  const me = photosEnabled ? await getAuthUser() : null
  if (photosEnabled) {
    const res = await payload
      .find({ collection: 'news-photos', where: { news: { equals: nid } }, sort: '-createdAt', depth: 0, limit: 200 })
      .catch(() => ({ docs: [] }))
    photos = res.docs.map((p) => {
      const fname = (p as { filename?: string }).filename
      const url = fname ? `/api/news-photos/file/${encodeURIComponent(fname)}` : ((p as { url?: string | null }).url ?? '')
      return { id: p.id as number, url, uploaderName: String((p as { uploaderName?: string }).uploaderName ?? 'Supporter'), caption: ((p as { caption?: string | null }).caption ?? null) }
    })
    if (me) {
      mineIds = new Set(
        res.docs
          .filter((p) => {
            const uploaderId = typeof (p as { uploader?: unknown }).uploader === 'object' && (p as { uploader?: unknown }).uploader
              ? ((p as { uploader?: { id?: number } }).uploader?.id)
              : (p as { uploader?: number }).uploader
            return uploaderId != null && Number(uploaderId) === Number(me.id)
          })
          .map((p) => p.id as number),
      )
    }
  }

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
          {photosEnabled && (photosOpen || photos.length > 0) && (
            <NewsPhotoWall newsId={nid} photos={photos} canPost={photosOpen && Boolean(me)} showButton={photosOpen} mineIds={mineIds} />
          )}
        </article>
      </div>
    </>
  )
}
