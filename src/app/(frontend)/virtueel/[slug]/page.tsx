import Link from 'next/link'
import { notFound } from 'next/navigation'

import { SiteHeader } from '@/components/SiteHeader'
import { formatDateBE } from '@/lib/datetime'
import { fragment } from '@/lib/virtueel'
import { VirtueelViewer } from './VirtueelViewer'
import '../virtueel.css'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const f = fragment((await params).slug)
  return { title: f ? `${f.titel} — Virtueel krachtbal` : 'Virtueel krachtbal' }
}

export default async function VirtueelFragmentPage({ params }: { params: Promise<{ slug: string }> }) {
  const f = fragment((await params).slug)
  if (!f) notFound()
  return (
    <>
      <SiteHeader />
      <div className="site vk-pagina">
        <Link href="/virtueel" className="vk-terug">← Virtueel krachtbal</Link>
        <h1 className="vk-titel">{f.titel}</h1>
        <p className="vk-sub">{formatDateBE(f.datum, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · {f.plaats}</p>
        <VirtueelViewer slug={f.slug} />
        <p className="vk-noot">
          Gereconstrueerd uit één gsm-video: posities zijn schattingen en kunnen hier en daar verspringen. Spelers zijn
          genummerd per ploeg (S1, S2, …), niet op naam.
        </p>
      </div>
    </>
  )
}
