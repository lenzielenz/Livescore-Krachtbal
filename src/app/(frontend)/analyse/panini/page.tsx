import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { canAnalyse } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { buildRadarStats } from '@/lib/radar-stats'
import { REEKS_OPTIONS, reeksNaam } from '@/lib/reeksen'
import { AnalyseNav } from '../AnalyseNav'
import { PaniniBuilder } from './PaniniBuilder'
import '../analyse.css'

export const dynamic = 'force-dynamic'

const COMPETITIE_REEKSEN = REEKS_OPTIONS.filter((o) => !['beker', 'recreatief', 'andere'].includes(o.value)).map((o) => ({
  value: o.value,
  label: reeksNaam(o.value),
}))

// Panini — verzamelkaart per speler (combineert rating, profiel, radar en kerncijfers).
export default async function PaniniPage({ searchParams }: { searchParams: Promise<{ reeks?: string }> }) {
  const me = await getAuthUser()
  if (!canAnalyse(me)) {
    return (
      <>
        <SiteHeader active="analyse" />
        <div className="site">
          <h1 className="page-title"><span className="brand">Panini</span></h1>
          <p className="empty">Je hebt geen toegang tot de analyse.{' '}<Link href="/inloggen" style={{ color: 'var(--accent)' }}>Inloggen →</Link></p>
        </div>
      </>
    )
  }

  const { reeks: reeksParam } = await searchParams
  const reeks =
    typeof reeksParam === 'string' && COMPETITIE_REEKSEN.some((o) => o.value === reeksParam)
      ? reeksParam
      : COMPETITIE_REEKSEN[0].value

  const payload = await getPayloadClient()
  const players = await buildRadarStats(payload, reeks)

  // Clubgegevens (logo + kleuren) per ploeg → de kaart krijgt het gevoel van hún club.
  const rel = (v: unknown): number | null =>
    v && typeof v === 'object' ? ((v as { id?: number }).id ?? null) : typeof v === 'number' ? v : null
  const teamIds = [...new Set(players.map((p) => p.teamId).filter((x): x is number => x != null))]
  const clubByTeam: Record<number, { name: string; logoUrl: string | null; primary: string | null; secondary: string | null }> = {}
  if (teamIds.length) {
    const teamsRes = await payload.find({ collection: 'teams', where: { id: { in: teamIds } }, depth: 0, limit: 500 }).catch(() => ({ docs: [] as Record<string, unknown>[] }))
    const teamClub = new Map<number, number>()
    for (const t of teamsRes.docs) {
      const cid = rel((t as { club?: unknown }).club)
      if (cid != null) teamClub.set((t as { id: number }).id, cid)
    }
    const clubIds = [...new Set([...teamClub.values()])]
    const clubsRes = clubIds.length
      ? await payload.find({ collection: 'clubs', where: { id: { in: clubIds } }, depth: 1, limit: 500 }).catch(() => ({ docs: [] as Record<string, unknown>[] }))
      : { docs: [] as Record<string, unknown>[] }
    const clubInfo = new Map<number, { name: string; logoUrl: string | null; primary: string | null; secondary: string | null }>()
    for (const c of clubsRes.docs) {
      const media = (c as { logo?: { url?: string } }).logo
      const logoUrl = String((c as { logoUrl?: unknown }).logoUrl ?? '') || (media && typeof media === 'object' ? media.url ?? '' : '') || null
      clubInfo.set((c as { id: number }).id, {
        name: String((c as { name?: unknown }).name ?? ''),
        logoUrl: logoUrl || null,
        primary: ((c as { colorPrimary?: unknown }).colorPrimary as string) || null,
        secondary: ((c as { colorSecondary?: unknown }).colorSecondary as string) || null,
      })
    }
    for (const [teamId, clubId] of teamClub) {
      const info = clubInfo.get(clubId)
      if (info) clubByTeam[teamId] = info
    }
  }

  return (
    <>
      <SiteHeader active="analyse" />
      <div className="site">
        <AnalyseNav active="panini" />
        <div className="an-head-bar">
          <h1 className="page-title"><span className="brand">Panini</span></h1>
        </div>
        <PaniniBuilder reeks={reeks} reeksLabel={reeksNaam(reeks)} options={[...COMPETITIE_REEKSEN]} players={players} clubs={clubByTeam} />
      </div>
    </>
  )
}
