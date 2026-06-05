import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { canAnalyse } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { clubColors, clubLogoUrl } from '@/lib/match-engine'
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

  // Clubgegevens (logo + kleuren) per ploeg via dezelfde bron als de rest van de app
  // (geüpload logo heeft voorrang) → de kaart krijgt het gevoel van hún club.
  const teamIds = [...new Set(players.map((p) => p.teamId).filter((x): x is number => x != null))]
  const clubByTeam: Record<number, { name: string; logoUrl: string | null; primary: string | null; secondary: string | null }> = {}
  if (teamIds.length) {
    const teamsRes = await payload.find({ collection: 'teams', where: { id: { in: teamIds } }, depth: 2, limit: 500 }).catch(() => ({ docs: [] as Record<string, unknown>[] }))
    for (const t of teamsRes.docs) {
      const club = (t as { club?: unknown }).club
      const colors = clubColors(t)
      clubByTeam[(t as { id: number }).id] = {
        name: club && typeof club === 'object' ? String((club as { name?: unknown }).name ?? '') : '',
        logoUrl: clubLogoUrl(t),
        primary: colors?.primary ?? null,
        secondary: colors?.secondary ?? null,
      }
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
