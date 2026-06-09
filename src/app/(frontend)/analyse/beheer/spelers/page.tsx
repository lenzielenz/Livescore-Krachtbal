import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { POSITION_OPTIONS } from '@/collections/Players'
import { canAnalyse } from '@/lib/access'
import { analyseOwnWhere } from '@/lib/analyse-access'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { reeksNaam } from '@/lib/reeksen'
import { AnalyseNav } from '../../AnalyseNav'
import { AnalyseSpelersManager, type AnalyseSpeler, type TeamOption } from './AnalyseSpelersManager'
import '../../analyse.css'
import '../beheer.css'

export const dynamic = 'force-dynamic'

const rel = (v: unknown): number | null =>
  v && typeof v === 'object' ? ((v as { id?: number }).id ?? null) : typeof v === 'number' ? v : null

export default async function AnalyseSpelersPage() {
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
  const scope = analyseOwnWhere(me)
  const [teamsRes, playersRes] = await Promise.all([
    payload.find({ collection: 'teams', where: scope, sort: 'name', depth: 0, limit: 2000 }).catch(() => ({ docs: [] as Record<string, unknown>[] })),
    payload.find({ collection: 'players', where: scope, sort: 'shirtNumber', depth: 0, limit: 8000 }).catch(() => ({ docs: [] as Record<string, unknown>[] })),
  ])

  const teams: TeamOption[] = teamsRes.docs.map((t) => ({
    id: (t as { id: number }).id,
    name: String((t as { name?: unknown }).name ?? ''),
    reeksLabel: reeksNaam((t as { reeks?: unknown }).reeks),
  }))
  const spelers: AnalyseSpeler[] = playersRes.docs.map((p) => ({
    id: (p as { id: number }).id,
    name: String((p as { name?: unknown }).name ?? ''),
    shirtNumber: Number((p as { shirtNumber?: unknown }).shirtNumber ?? 0),
    position: String((p as { position?: unknown }).position ?? ''),
    teamId: rel((p as { team?: unknown }).team),
  }))

  return (
    <>
      <SiteHeader active="analyse" />
      <div className="site">
        <AnalyseNav active="beheer" />
        <h1 className="page-title"><span className="brand">Analyse-spelers</span></h1>
        <p className="acc-page-intro">
          Kies een ploeg en bouw haar roster op. Elke speler heeft een <strong>rugnummer</strong> en een
          <strong> positie</strong> (die voedt de analyse). Een geboortedatum is niet nodig.
        </p>
        <AnalyseSpelersManager teams={teams} spelers={spelers} positionOptions={[...POSITION_OPTIONS]} />
      </div>
    </>
  )
}
