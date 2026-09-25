import Link from 'next/link'
import { notFound } from 'next/navigation'

import { SiteHeader } from '@/components/SiteHeader'
import { TeamLogo } from '@/components/TeamLogo'
import { getPayloadClient } from '@/lib/payload-client'
import { isPlaceholder } from '@/lib/erelijst'
import { fetchErelijstData } from '@/lib/erelijst-data'
import { naamSleutel } from '@/lib/season-import'
import { normalizeLogoFit, hasLogoAdjustment } from '@/lib/logo-fit'
import '../../erelijst.css'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ naam: string }> }) {
  const { naam: naamParam } = await params
  const naam = decodeURIComponent(naamParam)
  return { title: `${naam} — Erelijst — Krachtbal Live` }
}

// Gedetailleerd overzicht van wat één club (zoals letterlijk genoteerd in het archief) al bereikt
// heeft: elk kampioenschap, elke beker en — via het `club`-veld van elke referendumwinnaar — elke
// speler van deze club die een referendumprijs won. Matcht best-effort tegen een échte Clubs-record
// (via dezelfde naamSleutel-normalisatie als de club-enrichment) voor het logo en de link naar de
// echte clubpagina; zonder match valt TeamLogo vanzelf terug op initialen.
export default async function ErelijstClubPage({ params }: { params: Promise<{ naam: string }> }) {
  const { naam: naamParam } = await params
  const naam = decodeURIComponent(naamParam)
  if (isPlaceholder(naam)) notFound()

  const payload = await getPayloadClient()
  const { kampioenenSeizoenen, bekerwinnaarsSeizoenen, referendumPrijzen } = await fetchErelijstData(payload)

  const titels = kampioenenSeizoenen.flatMap((s) =>
    s.reeksen.filter((r) => r.kampioen === naam).map((r) => ({ seizoen: s.seizoen, reeksNaam: r.reeksNaam })),
  )
  const bekers = bekerwinnaarsSeizoenen.flatMap((s) =>
    s.winnaars.filter((w) => w.ploeg === naam).map((w) => ({ seizoen: s.seizoen, categorie: w.categorie })),
  )
  const referendumLaureaten = referendumPrijzen
    .flatMap((p) => p.winnaars.filter((w) => w.club === naam).map((w) => ({ prijs: p.prijs, jaar: w.jaar, naam: w.naam })))
    .sort((a, b) => Number(b.jaar) - Number(a.jaar))

  if (titels.length === 0 && bekers.length === 0 && referendumLaureaten.length === 0) notFound()

  // Best-effort matchen tegen een échte Club-record — puur voor het logo/kleur/link, verandert
  // niets aan welke archiefrijen getoond worden (die matchen altijd letterlijk op `naam`).
  const clubsRes = await payload.find({ collection: 'clubs', limit: 1000, overrideAccess: true, depth: 0 }).catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const match = clubsRes.docs.find((c) => naamSleutel(String(c.name ?? '')) === naamSleutel(naam))

  const logoUrl = match
    ? match.logo && typeof match.logo === 'object'
      ? ((match.logo as { url?: string }).url ?? null)
      : (match.logoUrl as string) || null
    : null
  const primary = match ? (match.colorPrimary as string) || null : null
  const logoFitRaw = match ? normalizeLogoFit({ zoom: match.logoZoom as number, offsetX: match.logoOffsetX as number, offsetY: match.logoOffsetY as number }) : null
  const logoFit = logoFitRaw && hasLogoAdjustment(logoFitRaw) ? logoFitRaw : null

  const totaal = titels.length + bekers.length
  const style = primary ? ({ ['--club' as string]: primary } as React.CSSProperties) : undefined

  return (
    <>
      <SiteHeader />
      <div className="site erl-club-site" style={style}>
        <Link href="/erelijst" className="erl-terug">← Erelijst</Link>

        <header className="erl-club-hero">
          <TeamLogo name={naam} logoUrl={logoUrl} logoFit={logoFit} side="home" size="92px" ringColor={primary} />
          <div className="erl-club-hero-id">
            <h1 className="page-title">{naam}</h1>
            <p className="page-sub">
              {totaal > 0 && <>{titels.length}× 🥇 kampioen · {bekers.length}× 🏆 beker</>}
              {referendumLaureaten.length > 0 && <> · {referendumLaureaten.length}× ⭐ referendumprijs</>}
            </p>
            {Boolean(match) && (
              <Link href={`/clubs/${(match as { id: number }).id}`} className="erl-club-hero-link">
                Bekijk clubpagina →
              </Link>
            )}
          </div>
        </header>

        {titels.length > 0 && (
          <section className="erl-club-sec">
            <h2 className="erl-section-title">🥇 Kampioenschappen ({titels.length})</h2>
            <ul className="erl-tijdlijn">
              {titels.map((t, i) => (
                <li key={i} className="erl-tijdlijn-item">
                  <span className="erl-tijdlijn-jaar">{t.seizoen}</span>
                  <span className="erl-tijdlijn-detail">{t.reeksNaam}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {bekers.length > 0 && (
          <section className="erl-club-sec">
            <h2 className="erl-section-title">🏆 Bekers ({bekers.length})</h2>
            <ul className="erl-tijdlijn">
              {bekers.map((b, i) => (
                <li key={i} className="erl-tijdlijn-item">
                  <span className="erl-tijdlijn-jaar">{b.seizoen}</span>
                  <span className="erl-tijdlijn-detail">{b.categorie}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {referendumLaureaten.length > 0 && (
          <section className="erl-club-sec">
            <h2 className="erl-section-title">⭐ Referendumlaureaten van deze club ({referendumLaureaten.length})</h2>
            <ul className="erl-tijdlijn">
              {referendumLaureaten.map((r, i) => (
                <li key={i} className="erl-tijdlijn-item">
                  <span className="erl-tijdlijn-jaar">{r.jaar}</span>
                  <span className="erl-tijdlijn-detail">{r.naam} — {r.prijs}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  )
}
