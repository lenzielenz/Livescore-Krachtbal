import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { canAnalyse } from '@/lib/access'
import { analyseOwnWhere } from '@/lib/analyse-access'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { REEKS_OPTIONS, reeksNaam } from '@/lib/reeksen'
import { AnalyseNav } from '../../AnalyseNav'
import { AnalysePloegenManager, type AnalysePloeg, type ClubOption } from './AnalysePloegenManager'
import '../../analyse.css'
import '../beheer.css'

export const dynamic = 'force-dynamic'

// Analyse hergebruikt de KVKBF-reekslijst, maar zonder beker/recreatief/andere (die de analyse-tools
// ook niet tonen) — zo verschijnen je analyse-ploegen meteen in de seizoens-/ploegtools.
const REEKS_KEUZE = REEKS_OPTIONS.filter((o) => !['beker', 'recreatief', 'andere'].includes(o.value)).map((o) => ({
  value: o.value,
  label: reeksNaam(o.value),
}))

const rel = (v: unknown): number | null =>
  v && typeof v === 'object' ? ((v as { id?: number }).id ?? null) : typeof v === 'number' ? v : null

export default async function AnalysePloegenPage() {
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
  const [clubsRes, teamsRes] = await Promise.all([
    payload.find({ collection: 'clubs', where: scope, sort: 'name', depth: 0, limit: 1000 }).catch(() => ({ docs: [] as Record<string, unknown>[] })),
    payload.find({ collection: 'teams', where: scope, sort: 'name', depth: 0, limit: 2000 }).catch(() => ({ docs: [] as Record<string, unknown>[] })),
  ])

  const clubs: ClubOption[] = clubsRes.docs.map((c) => ({ id: (c as { id: number }).id, name: String((c as { name?: unknown }).name ?? '') }))
  const clubName = new Map(clubs.map((c) => [c.id, c.name]))
  const ploegen: AnalysePloeg[] = teamsRes.docs.map((t) => {
    const reeks = String((t as { reeks?: unknown }).reeks ?? '')
    const clubId = rel((t as { club?: unknown }).club)
    return {
      id: (t as { id: number }).id,
      name: String((t as { name?: unknown }).name ?? ''),
      reeks,
      reeksLabel: reeksNaam(reeks),
      clubId,
      clubName: clubId != null ? (clubName.get(clubId) ?? '—') : '—',
    }
  })

  return (
    <>
      <SiteHeader active="analyse" />
      <div className="site">
        <AnalyseNav active="beheer" />
        <h1 className="page-title"><span className="brand">Analyse-ploegen</span></h1>
        <p className="acc-page-intro">
          Je eigen ploegen, per reeks en gekoppeld aan een van je <Link href="/analyse/beheer/clubs" style={{ color: 'var(--accent)' }}>clubs</Link>.
          Vul ze daarna met <Link href="/analyse/beheer/spelers" style={{ color: 'var(--accent)' }}>spelers</Link>.
        </p>
        <AnalysePloegenManager ploegen={ploegen} clubs={clubs} reeksOptions={REEKS_KEUZE} />
      </div>
    </>
  )
}
