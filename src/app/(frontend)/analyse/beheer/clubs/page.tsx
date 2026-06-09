import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { canAnalyse } from '@/lib/access'
import { analyseOwnWhere } from '@/lib/analyse-access'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { AnalyseNav } from '../../AnalyseNav'
import { AnalyseClubsManager, type AnalyseClub } from './AnalyseClubsManager'
import '../../analyse.css'
import '../beheer.css'

export const dynamic = 'force-dynamic'

export default async function AnalyseClubsPage() {
  const me = await getAuthUser()
  if (!canAnalyse(me)) {
    return (
      <>
        <SiteHeader active="analyse" />
        <div className="site">
          <h1 className="page-title"><span className="brand">Analyse</span></h1>
          <p className="empty">Geen toegang tot de analyse. <Link href="/inloggen" style={{ color: 'var(--accent)' }}>Inloggen →</Link></p>
        </div>
      </>
    )
  }

  const payload = await getPayloadClient()
  const res = await payload
    .find({ collection: 'clubs', where: analyseOwnWhere(me), sort: 'name', depth: 0, limit: 1000 })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const clubs: AnalyseClub[] = res.docs.map((c) => ({
    id: (c as { id: number }).id,
    name: String((c as { name?: unknown }).name ?? ''),
    logoUrl: String((c as { logoUrl?: unknown }).logoUrl ?? ''),
    colorPrimary: String((c as { colorPrimary?: unknown }).colorPrimary ?? ''),
  }))

  return (
    <>
      <SiteHeader active="analyse" />
      <div className="site">
        <AnalyseNav active="beheer" />
        <h1 className="page-title"><span className="brand">Analyse-clubs</span></h1>
        <p className="acc-page-intro">
          Je eigen clubs voor analyse. Ze staan volledig los van de competitie. Maak hier clubs aan, en koppel er
          daarna <Link href="/analyse/beheer/ploegen" style={{ color: 'var(--accent)' }}>ploegen</Link> onder.
        </p>
        <AnalyseClubsManager clubs={clubs} />
      </div>
    </>
  )
}
