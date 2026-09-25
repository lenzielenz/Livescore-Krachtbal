import { SiteHeader } from '@/components/SiteHeader'
import { getPayloadClient } from '@/lib/payload-client'
import { telClubTrofeeen, telLaureaten } from '@/lib/erelijst'
import type { KampioenenSeizoenInput, BekerwinnaarsSeizoenInput, ReferendumPrijsInput } from '@/lib/erelijst'
import { ErelijstBrowser } from './ErelijstBrowser'
import './erelijst.css'

export const dynamic = 'force-dynamic'

// Erelijst: alle kampioenen, bekerwinnaars en referendumlaureaten uit de geschiedenis van de
// federatie op één publieke pagina — met een zoekbalk (snel een club/speler terugvinden) en een
// samenvattend leaderboard (wie heeft de meeste prijzen gepakt). Puur leesvoer, geen auth nodig:
// alle drie de archiefcollections hebben `access.read: () => true`.
export default async function ErelijstPage() {
  const payload = await getPayloadClient()

  const [kampioenenRes, bekerwinnaarsRes, referendumRes] = await Promise.all([
    payload.find({ collection: 'kampioenen', sort: '-seizoenKey', limit: 100, depth: 0 }).catch(() => ({ docs: [] as Record<string, unknown>[] })),
    payload.find({ collection: 'bekerwinnaars', sort: '-seizoenKey', limit: 100, depth: 0 }).catch(() => ({ docs: [] as Record<string, unknown>[] })),
    payload.find({ collection: 'referendum-awards', limit: 20, depth: 0 }).catch(() => ({ docs: [] as Record<string, unknown>[] })),
  ])

  const kampioenenSeizoenen: KampioenenSeizoenInput[] = kampioenenRes.docs.map((d) => ({
    seizoen: String(d.seizoen ?? ''),
    reeksen: (d.reeksen as { reeksNaam: string; kampioen: string }[] | undefined) ?? [],
  }))
  const bekerwinnaarsSeizoenen: BekerwinnaarsSeizoenInput[] = bekerwinnaarsRes.docs.map((d) => ({
    seizoen: String(d.seizoen ?? ''),
    winnaars: (d.winnaars as { categorie: string; ploeg: string }[] | undefined) ?? [],
  }))
  const referendumPrijzen: ReferendumPrijsInput[] = referendumRes.docs.map((d) => ({
    prijs: String(d.prijs ?? ''),
    winnaars: (d.winnaars as { jaar: string; naam: string; club: string }[] | undefined) ?? [],
  }))

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
