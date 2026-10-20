import { SiteHeader } from '@/components/SiteHeader'
import { MeldingenLijst } from './MeldingenLijst'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Meldingen — Krachtbal Live' }

export default function MeldingenPage() {
  return (
    <>
      <SiteHeader />
      <div className="site">
        <h1 className="page-title">🔔 Meldingen</h1>
        <MeldingenLijst />
      </div>
    </>
  )
}
