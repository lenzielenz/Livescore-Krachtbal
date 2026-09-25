import Link from 'next/link'
import { notFound } from 'next/navigation'

import { SiteHeader } from '@/components/SiteHeader'
import { TeamLogo } from '@/components/TeamLogo'
import { getPayloadClient } from '@/lib/payload-client'
import { isPlaceholder } from '@/lib/erelijst'
import { fetchErelijstData } from '@/lib/erelijst-data'
import { buildClubLogoLookup } from '@/lib/club-logo-lookup'
import { ClubNaam } from '../../EntityLinks'
import '../../erelijst.css'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ naam: string }> }) {
  const { naam: naamParam } = await params
  const naam = decodeURIComponent(naamParam)
  return { title: `${naam} — Erelijst — Krachtbal Live` }
}

// Gedetailleerd overzicht van alle referendumprijzen die één speler (zoals letterlijk genoteerd in
// het archief) door de jaren heen won — chronologisch, met telkens de club waarmee die prijs
// gewonnen werd (kan wisselen doorheen een carrière). Zelfde matchprincipe als de club-detailpagina:
// letterlijke naam, geen fuzzy-koppeling.
export default async function ErelijstSpelerPage({ params }: { params: Promise<{ naam: string }> }) {
  const { naam: naamParam } = await params
  const naam = decodeURIComponent(naamParam)
  if (isPlaceholder(naam)) notFound()

  const payload = await getPayloadClient()
  const { referendumPrijzen } = await fetchErelijstData(payload)

  const prijzen = referendumPrijzen
    .flatMap((p) => p.winnaars.filter((w) => w.naam === naam).map((w) => ({ prijs: p.prijs, jaar: w.jaar, club: w.club })))
    .sort((a, b) => Number(b.jaar) - Number(a.jaar))

  if (prijzen.length === 0) notFound()

  const clubLogos = await buildClubLogoLookup(payload, prijzen.map((p) => p.club))
  const laatsteClub = clubLogos[prijzen[0].club]
  const style = laatsteClub?.colorPrimary ? ({ ['--club' as string]: laatsteClub.colorPrimary } as React.CSSProperties) : undefined

  return (
    <>
      <SiteHeader />
      <div className="site erl-club-site" style={style}>
        <Link href="/erelijst" className="erl-terug">← Erelijst</Link>

        <header className="erl-club-hero">
          <TeamLogo
            name={naam}
            logoUrl={laatsteClub?.logoUrl ?? null}
            logoFit={laatsteClub?.logoFit ?? null}
            side="home"
            size="92px"
            ringColor={laatsteClub?.colorPrimary}
          />
          <div className="erl-club-hero-id">
            <h1 className="page-title">{naam}</h1>
            <p className="page-sub">{prijzen.length}× ⭐ referendumprijs</p>
          </div>
        </header>

        <section className="erl-club-sec">
          <h2 className="erl-section-title">⭐ Referendumprijzen ({prijzen.length})</h2>
          <ul className="erl-tijdlijn">
            {prijzen.map((p, i) => (
              <li key={i} className="erl-tijdlijn-item">
                <span className="erl-tijdlijn-jaar">{p.jaar}</span>
                <span className="erl-tijdlijn-detail">
                  {p.prijs} — <ClubNaam naam={p.club} logos={clubLogos} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  )
}
