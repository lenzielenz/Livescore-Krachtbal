import type { Metadata } from 'next'
import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { leesManifest, wedstrijdVanDeelToken } from '@/lib/app-analyse'
import { getPayloadClient } from '@/lib/payload-client'

import { AppPagina } from '../../[id]/AppPagina'
import '../../analyse.css'

export const dynamic = 'force-dynamic'

// Een gedeelde analyse (zoals een Veo-link): zonder account te bekijken, alleen-lezen, met de
// gedeelde notities. Werkt zolang de eigenaar de link niet intrekt.
export const metadata: Metadata = { title: 'Gedeelde analyse', robots: { index: false, follow: false } }

export default async function GedeeldePagina({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const matchId = await wedstrijdVanDeelToken(token)
  const manifest = matchId != null ? await leesManifest(matchId) : null
  const payload = await getPayloadClient()
  const match =
    matchId != null && manifest
      ? await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)
      : null

  if (matchId == null || !manifest || !match?.analyseOnly) {
    return (
      <>
        <SiteHeader active="analyse" />
        <div className="site">
          <h1 className="page-title">
            <span className="brand">Analyse</span>
          </h1>
          <p className="empty">
            Deze link werkt niet (meer). Vraag wie hem stuurde om een nieuwe.{' '}
            <Link href="/" style={{ color: 'var(--accent)' }}>
              Naar krachtbal.live
            </Link>
          </p>
        </div>
      </>
    )
  }

  return (
    <>
      <SiteHeader active="analyse" />
      <div className="site">
        <AppPagina
          matchId={matchId}
          manifest={manifest}
          matchDoc={match as unknown as Record<string, unknown>}
          beheert={false}
          deel={token}
          centrumHref={`/analyse/gedeeld/${token}/centrum`}
          terug={null}
        />
      </div>
    </>
  )
}
