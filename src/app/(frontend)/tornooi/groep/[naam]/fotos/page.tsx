import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { SiteHeader } from '@/components/SiteHeader'
import { isFederationLevel } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import '../../../tornooi.css'

export const dynamic = 'force-dynamic'

const wanneer = (iso: string) =>
  new Date(iso).toLocaleString('nl-BE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Brussels' })

// Alle ingezonden supportersfoto's van een tornooidag op één plek — enkel voor de federatie.
// Supporters zien hun foto na het insturen nergens terug; hier komt alles samen.
export default async function TornooiFotosPage({ params }: { params: Promise<{ naam: string }> }) {
  const { naam: ruw } = await params
  const naam = decodeURIComponent(ruw).trim()
  if (!naam) notFound()

  const user = await getAuthUser()
  if (!isFederationLevel(user)) redirect(`/tornooi/groep/${encodeURIComponent(naam)}`)

  const payload = await getPayloadClient()
  const res = await payload
    .find({ collection: 'tornooi-fotos', where: { groep: { equals: naam } }, sort: '-createdAt', depth: 0, limit: 500 })
    .catch(() => ({ docs: [] as Record<string, unknown>[], totalDocs: 0 }))
  const fotos = res.docs as { id: number; url?: string | null; filename?: string | null; uploaderName?: string | null; opdracht?: string | null; createdAt: string }[]

  return (
    <>
      <SiteHeader active="tornooi" />
      <div className="trn-page">
        <div className="trn-hub-head">
          <h1 className="trn-hub-title">📷 Foto’s · {naam}</h1>
          <p className="trn-hub-intro">
            Alles wat supporters instuurden, op één plek — {fotos.length} foto{fotos.length === 1 ? '' : '’s'}. Enkel de federatie ziet deze pagina.
          </p>
        </div>
        <div className="trn-actions">
          <Link href={`/tornooi/groep/${encodeURIComponent(naam)}`} className="trn-btn">← Terug naar de tornooidag</Link>
        </div>
        {fotos.length === 0 ? (
          <p className="trn-empty">Nog geen foto’s ingestuurd.</p>
        ) : (
          <ul className="tf-raster">
            {fotos.map((f) => {
              const src = f.url || `/api/tornooi-fotos/file/${encodeURIComponent(f.filename ?? '')}`
              return (
                <li key={f.id} className="tf-kaart">
                  <a href={src} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`Foto van ${f.uploaderName || 'supporter'}`} loading="lazy" />
                  </a>
                  <span className="tf-meta">
                    <b>{f.uploaderName || 'Onbekend'}</b>
                    <span>{wanneer(f.createdAt)}</span>
                  </span>
                  {f.opdracht && <span className="tf-opdracht">{f.opdracht}</span>}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </>
  )
}
