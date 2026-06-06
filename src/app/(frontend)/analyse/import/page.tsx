import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { hasRole, isFederationLevel } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { reeksNaam } from '@/lib/reeksen'
import { AnalyseNav } from '../AnalyseNav'
import { DedupeTool } from './DedupeTool'
import { ReeksindelingImport } from './ReeksindelingImport'
import { ResultsImport } from './ResultsImport'
import { TeamCleanup, type CleanupTeam } from './TeamCleanup'
import '../analyse.css'

const relId = (v: unknown): number | null =>
  v && typeof v === 'object' ? ((v as { id?: number }).id ?? null) : typeof v === 'number' ? v : null

export const dynamic = 'force-dynamic'

// Uitslagen importeren (federatie/admin): officiële export → afgewerkte wedstrijden met eindstand.
export default async function ResultsImportPage() {
  const me = await getAuthUser()
  const allowed = isFederationLevel(me) || hasRole(me, 'federatie')
  if (!allowed) {
    return (
      <>
        <SiteHeader active="analyse" />
        <div className="site">
          <h1 className="page-title"><span className="brand">Uitslagen importeren</span></h1>
          <p className="empty">Enkel federatie/admin kan uitslagen importeren.{' '}<Link href="/inloggen" style={{ color: 'var(--accent)' }}>Inloggen →</Link></p>
        </div>
      </>
    )
  }

  // Ploegen met hun speler-/wedstrijdaantallen, voor de opkuis-tool.
  const payload = await getPayloadClient()
  const [teamsRes, playersRes, matchesRes] = await Promise.all([
    payload.find({ collection: 'teams', depth: 1, limit: 8000, sort: 'name' }).catch(() => ({ docs: [] as Record<string, unknown>[] })),
    payload.find({ collection: 'players', depth: 0, limit: 15000 }).catch(() => ({ docs: [] as Record<string, unknown>[] })),
    payload.find({ collection: 'matches', depth: 0, limit: 15000 }).catch(() => ({ docs: [] as Record<string, unknown>[] })),
  ])
  const playerCount = new Map<number, number>()
  for (const p of playersRes.docs) {
    const tid = relId((p as { team?: unknown }).team)
    if (tid != null) playerCount.set(tid, (playerCount.get(tid) ?? 0) + 1)
  }
  const matchCount = new Map<number, number>()
  for (const m of matchesRes.docs) {
    for (const tid of [relId((m as { homeTeam?: unknown }).homeTeam), relId((m as { awayTeam?: unknown }).awayTeam)]) {
      if (tid != null) matchCount.set(tid, (matchCount.get(tid) ?? 0) + 1)
    }
  }
  const cleanupTeams: CleanupTeam[] = teamsRes.docs.map((t) => {
    const id = (t as { id: number }).id
    const club = (t as { club?: unknown }).club
    return {
      id,
      name: String((t as { name?: unknown }).name ?? '—'),
      reeks: reeksNaam((t as { reeks?: unknown }).reeks),
      club: club && typeof club === 'object' ? String((club as { name?: unknown }).name ?? '') : '',
      players: playerCount.get(id) ?? 0,
      matches: matchCount.get(id) ?? 0,
    }
  })

  return (
    <>
      <SiteHeader active="analyse" />
      <div className="site">
        <AnalyseNav active="overzicht" />
        <div className="an-head-bar">
          <h1 className="page-title"><span className="brand">Uitslagen importeren</span></h1>
        </div>
        <p className="an-intro">Wedstrijden-export (.xls). Eerst <em>Voorbeeld</em>, dan <em>Importeren</em>.</p>

        <ResultsImport />

        <h2 className="an-sub">🕑 Thuisuren uit de reeksindeling</h2>
        <p className="an-intro">Reeksindeling-PDF. Eerst <em>Voorbeeld</em>, dan <em>Thuisuren instellen</em>.</p>
        <ReeksindelingImport />

        <h2 className="an-sub">🧹 Dubbele ploegen opkuisen</h2>
        <p className="an-intro">Voegt ploegen/clubs samen die dezelfde zijn maar net anders geschreven (per reeks). Eerst <em>Voorbeeld</em>.</p>
        <DedupeTool />

        <h2 className="an-sub">🗑 Ploeg verwijderen</h2>
        <p className="an-intro">Verwijder een dubbele of test-ploeg samen met haar spelers. Handig wanneer twee ploegen eigenlijk dezelfde zijn (bv. verschillend geschreven) en samenvoegen niet lukt.</p>
        <TeamCleanup teams={cleanupTeams} />
      </div>
    </>
  )
}
