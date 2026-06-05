import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { hasRole, isFederationLevel } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { AnalyseNav } from '../AnalyseNav'
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
        <p className="an-intro">
          Laad het officiële <strong>wedstrijden-bestand</strong> (de .xls-export, eigenlijk een HTML-tabel met kolom
          E = thuisploeg en F = bezoeker). De gespeelde wedstrijden worden als <strong>afgewerkt met eindstand</strong>
          klaargezet, zodat de rangschikking en alle analyses (ploegvorm, onderlinge duels, toppers) de echte resultaten
          tonen. Klik eerst op <em>Voorbeeld</em> om te controleren; pas <em>Importeren</em> schrijft weg.
        </p>

        <ResultsImport />
      </div>
    </>
  )
}
