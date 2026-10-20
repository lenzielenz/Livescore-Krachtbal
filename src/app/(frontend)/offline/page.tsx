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
          📴 Je bent even offline. Eerder bezochte pagina&apos;s blijven beschikbaar. Was je aan het
          aantekenen? Ga dan terug naar het aantekenscherm: tikken worden op dit toestel bewaard en
          vanzelf verstuurd zodra er weer verbinding is.
        </p>
        {/* Dit scherm verschijnt ook tijdens een update van de site, en dan is dít de vraag die
            iedereen zich stelt. Zonder dat zinnetje lijkt een halve minuut onderhoud op een
            afmelding, en gaan mensen onnodig opnieuw inloggen. */}
        <p className="empty">
          {/* De {' '} is nodig: JSX knipt de spatie aan het begin van een tekstblok dat over
              meerdere regels loopt, en dan stond er "ingelogd.Word". */}
          🔐 <strong>Je blijft ingelogd.</strong>{' '}
          Word je dit tijdens een update van de site getoond, tik dan zo meteen gewoon op
          &laquo;Opnieuw proberen&raquo; — je sessie blijft staan.
        </p>
        <p style={{ marginTop: 12 }}>
          <Link href="/" className="hub-pill">↻ Opnieuw proberen</Link>
        </p>
      </div>
    </>
  )
}
