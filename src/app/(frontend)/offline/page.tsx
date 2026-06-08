import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'

export const metadata = { title: 'Offline — Krachtbal Live' }

// Terugvalpagina wanneer een nog niet bezochte pagina offline wordt geopend.
export default function OfflinePage() {
  return (
    <>
      <SiteHeader />
      <div className="site">
        <h1 className="page-title"><span className="brand">Offline</span></h1>
        <p className="empty">
          📴 Je bent even offline. Eerder bezochte pagina&apos;s blijven beschikbaar, en als je aan het
          aantekenen bent loopt de score gewoon door — alles wordt automatisch gesynct zodra je weer
          verbinding hebt.
        </p>
        <p style={{ marginTop: 12 }}>
          <Link href="/" className="hub-pill">↻ Opnieuw proberen</Link>
        </p>
      </div>
    </>
  )
}
