import { SiteHeader } from '@/components/SiteHeader'
import { getPayloadClient } from '@/lib/payload-client'
import { telClubTrofeeen, telLaureaten } from '@/lib/erelijst'
import { fetchErelijstData } from '@/lib/erelijst-data'
import { ErelijstBrowser } from './ErelijstBrowser'
import './erelijst.css'

export const dynamic = 'force-dynamic'

// Erelijst: alle kampioenen, bekerwinnaars en referendumlaureaten uit de geschiedenis van de
// federatie op één publieke pagina — met een zoekbalk (snel een club/speler terugvinden) en een
// samenvattend leaderboard (wie heeft de meeste prijzen gepakt). Puur leesvoer, geen auth nodig:
// alle drie de archiefcollections hebben `access.read: () => true`.
export default async function ErelijstPage() {
  const payload = await getPayloadClient()
  const { kampioenenSeizoenen, bekerwinnaarsSeizoenen, referendumPrijzen } = await fetchErelijstData(payload)

  const clubTrofeeen = telClubTrofeeen(kampioenenSeizoenen, bekerwinnaarsSeizoenen)
  const laureaten = telLaureaten(referendumPrijzen)

  return (
    <>
      <SiteHeader />
      <div className="site">
        <h1 className="page-title">🏆 Erelijst</h1>
        <p className="page-sub">
          Alle kampioenen, bekerwinnaars en referendumlaureaten uit de geschiedenis van de federatie — zoek een club
          of speler, of blader door het volledige archief.
        </p>
        <ErelijstBrowser
          kampioenenSeizoenen={kampioenenSeizoenen}
          bekerwinnaarsSeizoenen={bekerwinnaarsSeizoenen}
          referendumPrijzen={referendumPrijzen}
          clubTrofeeen={clubTrofeeen}
          laureaten={laureaten}
        />
      </div>
    </>
  )
}
