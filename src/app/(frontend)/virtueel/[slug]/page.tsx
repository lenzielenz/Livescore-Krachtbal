import Link from 'next/link'
import { notFound } from 'next/navigation'

import { SiteHeader } from '@/components/SiteHeader'
import { userClubId } from '@/lib/access'
import { loadAds } from '@/lib/ads'
import { getAuthUser } from '@/lib/auth-user'
import { clubLogoUrl } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { formatDateBE } from '@/lib/datetime'
import { fragment, STANDAARD_THEMA, stadionThema, type StadionThema } from '@/lib/virtueel'
import { VirtueelViewer } from './VirtueelViewer'
import '../virtueel.css'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const f = fragment((await params).slug)
  return { title: f ? `${f.titel} — Virtueel krachtbal` : 'Virtueel krachtbal' }
}

export default async function VirtueelFragmentPage({ params }: { params: Promise<{ slug: string }> }) {
  const f = fragment((await params).slug)
  if (!f) notFound()

  // Het stadion kleurt mee met de club van wie kijkt: tribunes, borden, scorebord en het grote
  // ledscherm met het clublogo. De reclame op de borden is die van de veldschermen.
  let thema: StadionThema = STANDAARD_THEMA
  try {
    const payload = await getPayloadClient()
    const [me, ads] = await Promise.all([getAuthUser(), loadAds(payload, 'veldscherm')])
    const reclames = ads.map((a) => ({ url: a.url, naam: a.naam }))
    const clubId = userClubId(me)
    const club = clubId != null ? await payload.findByID({ collection: 'clubs', id: Number(clubId), depth: 1 }).catch(() => null) : null
    thema = club
      ? stadionThema(
          { naam: String(club.name), primair: (club.colorPrimary as string | null) ?? null, secundair: (club.colorSecondary as string | null) ?? null, logoUrl: clubLogoUrl({ club }) },
          reclames,
        )
      : { ...STANDAARD_THEMA, reclames }
  } catch {
    // Geen databank of geen club: het standaardstadion volstaat.
  }
  return (
    <>
      <SiteHeader />
      <div className="site vk-pagina">
        <Link href="/virtueel" className="vk-terug">← Virtueel krachtbal</Link>
        <h1 className="vk-titel">{f.titel}</h1>
        <p className="vk-sub">{formatDateBE(f.datum, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · {f.plaats}</p>
        <VirtueelViewer slug={f.slug} thema={thema} />
        <p className="vk-noot">
          Gereconstrueerd uit één gsm-video: posities zijn schattingen en kunnen hier en daar verspringen. Spelers zijn
          genummerd per ploeg (S1, S2, …), niet op naam.
        </p>
      </div>
    </>
  )
}
