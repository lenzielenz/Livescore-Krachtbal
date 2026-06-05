import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { hasRole, isFederationLevel } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { AnalyseNav } from '../AnalyseNav'
import { DedupeTool } from './DedupeTool'
import { ReeksindelingImport } from './ReeksindelingImport'
import { ResultsImport } from './ResultsImport'
import '../analyse.css'

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
      </div>
    </>
  )
}
