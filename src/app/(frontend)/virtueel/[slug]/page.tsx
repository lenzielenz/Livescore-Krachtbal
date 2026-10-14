import Link from 'next/link'
import { notFound } from 'next/navigation'

import { SiteHeader } from '@/components/SiteHeader'
import { userClubId } from '@/lib/access'
import { loadAds } from '@/lib/ads'
import { fetchErelijstData } from '@/lib/erelijst-data'
import { getAuthUser } from '@/lib/auth-user'
import { clubLogoUrl } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { dateStrBE, shiftDateStr } from '@/lib/datetime'
import { fragment, STANDAARD_THEMA, stadionThema, type StadionThema } from '@/lib/virtueel'
import { eregalerij } from '@/lib/virtueel-erelijst'
import { weekendZaal } from '@/lib/virtueel-weekend'
import { fotoKaders } from '@/lib/virtueel-fotos'
import { laadClubFotos } from '@/lib/virtueel-fotos-data'
import { loadLiveWeekend, weekendZaterdag } from '../../live/loadLiveDay'
import { VirtueelViewer } from './VirtueelViewer'
import '../virtueel.css'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const f = fragment((await params).slug)
  return { title: f ? `Je virtuele stadion · ${f.titel} — Virtueel krachtbal` : 'Virtueel krachtbal' }
}

export default async function VirtueelFragmentPage({ params }: { params: Promise<{ slug: string }> }) {
  const f = fragment((await params).slug)
  if (!f) notFound()

  // Het stadion kleurt mee met de club van wie kijkt: tribunes, borden, scorebord en het grote
  // ledscherm met het clublogo. De reclame op de borden is die van de veldschermen; in de gangen
  // hangt de erelijst van je club.
  let thema: StadionThema = STANDAARD_THEMA
  let clubNaam: string | null = null
  try {
    const payload = await getPayloadClient()
    // Het komende speelweekend (op za/zo: het lopende), met de afgeleide standen.
    const vandaag = dateStrBE()
    const zaterdag = weekendZaterdag(vandaag)
    const [me, ads, erelijst, weekend] = await Promise.all([
      getAuthUser(),
      loadAds(payload, 'veldscherm'),
      fetchErelijstData(payload).catch(() => null),
      loadLiveWeekend(zaterdag, vandaag).catch(() => null),
    ])
    const reclames = ads.map((a) => ({ url: a.url, naam: a.naam }))
    const clubId = userClubId(me)
    const club = clubId != null ? await payload.findByID({ collection: 'clubs', id: Number(clubId), depth: 1 }).catch(() => null) : null
    clubNaam = club ? String(club.name) : null
    thema = club
      ? stadionThema(
          { naam: String(club.name), primair: (club.colorPrimary as string | null) ?? null, secundair: (club.colorSecondary as string | null) ?? null, logoUrl: clubLogoUrl({ club }) },
          reclames,
        )
      : { ...STANDAARD_THEMA, reclames }
    // De hall of fame in de gangen: de erelijst van je club (of de recentste kampioenen).
    if (erelijst) thema = { ...thema, erezaal: eregalerij(club ? String(club.name) : null, erelijst) }
    // De weekendzaal: elke keer je komt kijken, de wedstrijden (en uitslagen) van dit weekend.
    if (weekend) {
      const bezig = vandaag >= zaterdag && vandaag <= shiftDateStr(zaterdag, 1)
      thema = { ...thema, weekend: weekendZaal(weekend, { clubId: clubId != null ? Number(clubId) : null, zaterdag, bezig }) }
    }
    // De fotogalerij: supportersfoto's van live wedstrijden van je club, elke dag anders geschikt.
    if (club) {
      const { fotos, wedstrijden } = await laadClubFotos(payload, Number(club.id)).catch(() => ({ fotos: [], wedstrijden: new Map() }))
      const zaad = Number(vandaag.replaceAll('-', ''))
      if (fotos.length) thema = { ...thema, fotos: fotoKaders(fotos, wedstrijden, { zaad }) }
    }
  } catch {
    // Geen databank of geen club: het standaardstadion volstaat.
  }
  return (
    <>
      <SiteHeader />
      <div className="site vk-pagina">
        <Link href="/virtueel" className="vk-terug">← Virtueel krachtbal</Link>
        <h1 className="vk-titel">{clubNaam ? `Het stadion van ${clubNaam}` : 'Je virtuele stadion'}</h1>
        <p className="vk-sub">Op het veld: {f.titel}</p>
        <VirtueelViewer slug={f.slug} thema={thema} />
        <p className="vk-noot">
          Het spel op het veld is gereconstrueerd uit één gsm-video: posities zijn schattingen en kunnen hier en daar
          verspringen. Spelers zijn genummerd per ploeg (S1, S2, …), niet op naam.
        </p>
      </div>
    </>
  )
}
