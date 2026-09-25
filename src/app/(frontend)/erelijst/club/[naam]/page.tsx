import Link from 'next/link'
import { notFound } from 'next/navigation'

import { SiteHeader } from '@/components/SiteHeader'
import { TeamLogo } from '@/components/TeamLogo'
import { getPayloadClient } from '@/lib/payload-client'
import { isPlaceholder, telPrijzenPerJaar, telPerGroep, canoniekeClubNaam } from '@/lib/erelijst'
import { fetchErelijstData } from '@/lib/erelijst-data'
import { naamSleutel } from '@/lib/season-import'
import { kiesBesteClubMatch } from '@/lib/club-logo-lookup'
import { normalizeLogoFit, hasLogoAdjustment } from '@/lib/logo-fit'
import { SpelerNaam } from '../../EntityLinks'
import { PrijzenPerJaarChart } from '../../PrijzenPerJaarChart'
import '../../erelijst.css'

export const dynamic = 'force-dynamic'

// Groepeert een lijst per seizoen (volgorde blijft behouden — de bron is al chronologisch
// gesorteerd), zodat meerdere titels/bekers in hetzelfde seizoen (bv. 4 reeksen in één jaar) als
// één visueel blok verschijnen i.p.v. als op zichzelf staande rijen die toevallig hetzelfde
// seizoen tonen.
function groepeerPerSeizoen<T extends { seizoen: string }>(items: T[], naam: (item: T) => string): { seizoen: string; namen: string[] }[] {
  const volgorde: string[] = []
  const perSeizoen = new Map<string, string[]>()
  for (const item of items) {
    if (!perSeizoen.has(item.seizoen)) {
      perSeizoen.set(item.seizoen, [])
      volgorde.push(item.seizoen)
    }
    perSeizoen.get(item.seizoen)!.push(naam(item))
  }
  return volgorde.map((seizoen) => ({ seizoen, namen: perSeizoen.get(seizoen)! }))
}

export async function generateMetadata({ params }: { params: Promise<{ naam: string }> }) {
  const { naam: naamParam } = await params
  const naam = canoniekeClubNaam(decodeURIComponent(naamParam))
  return { title: `${naam} — Erelijst — Krachtbal Live` }
}

// Gedetailleerd overzicht van wat één club (zoals letterlijk genoteerd in het archief) al bereikt
// heeft: elk kampioenschap, elke beker en — via het `club`-veld van elke referendumwinnaar — elke
// speler van deze club die een referendumprijs won. Historische naamvarianten (fusies, sponsor-
// namen, "Royal"-titel — zie club-aliases-data.ts) tellen samen onder de canonieke naam: een
// bezoek via eender welke alias-URL toont dezelfde, samengevoegde pagina. Matcht best-effort tegen
// een échte Clubs-record (via dezelfde naamSleutel-normalisatie als de club-enrichment) voor het
// logo en de link naar de echte clubpagina; zonder match valt TeamLogo vanzelf terug op initialen.
export default async function ErelijstClubPage({ params }: { params: Promise<{ naam: string }> }) {
  const { naam: naamParam } = await params
  const naam = canoniekeClubNaam(decodeURIComponent(naamParam))
  if (isPlaceholder(naam)) notFound()

  const payload = await getPayloadClient()
  const { kampioenenSeizoenen, bekerwinnaarsSeizoenen, referendumPrijzen } = await fetchErelijstData(payload)

  const titels = kampioenenSeizoenen.flatMap((s) =>
    s.reeksen.filter((r) => canoniekeClubNaam(r.kampioen) === naam).map((r) => ({ seizoen: s.seizoen, reeksNaam: r.reeksNaam })),
  )
  const bekers = bekerwinnaarsSeizoenen.flatMap((s) =>
    s.winnaars.filter((w) => canoniekeClubNaam(w.ploeg) === naam).map((w) => ({ seizoen: s.seizoen, categorie: w.categorie })),
  )
  const referendumLaureaten = referendumPrijzen
    .flatMap((p) => p.winnaars.filter((w) => canoniekeClubNaam(w.club) === naam).map((w) => ({ prijs: p.prijs, jaar: w.jaar, naam: w.naam })))
    .sort((a, b) => Number(b.jaar) - Number(a.jaar))

  if (titels.length === 0 && bekers.length === 0 && referendumLaureaten.length === 0) notFound()

  const titelGroepen = groepeerPerSeizoen(titels, (t) => t.reeksNaam)
  const bekerGroepen = groepeerPerSeizoen(bekers, (b) => b.categorie)
  const prijzenPerJaar = telPrijzenPerJaar(titels, bekers, referendumLaureaten)
  const titelsPerReeks = telPerGroep(titels.map((t) => t.reeksNaam))
  const bekersPerCategorie = telPerGroep(bekers.map((b) => b.categorie))

  // Best-effort matchen tegen een échte Club-record — puur voor het logo/kleur/link, verandert
  // niets aan welke archiefrijen getoond worden (die matchen altijd letterlijk op `naam`). Bij
  // meerdere gelijknamige clubs (competitie + analyse-only, zie kiesBesteClubMatch) kiezen we de
  // echte competitieclub, anders 404't "Bekijk clubpagina" op een analyse-only schaduwrecord.
  const clubsRes = await payload.find({ collection: 'clubs', limit: 1000, overrideAccess: true, depth: 0 }).catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const kandidaten = clubsRes.docs.filter((c) => naamSleutel(String(c.name ?? '')) === naamSleutel(naam))
  const match = kiesBesteClubMatch(kandidaten)

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
            {Boolean(match) && !(match as { analyseOnly?: boolean }).analyseOnly && (
              <Link href={`/clubs/${(match as { id: number }).id}`} className="erl-club-hero-link">
                Bekijk clubpagina →
              </Link>
            )}
          </div>
        </header>

        {prijzenPerJaar.length > 1 && (
          <section className="erl-club-sec">
            <h2 className="erl-section-title">📈 Prijzen per jaar</h2>
            <PrijzenPerJaarChart data={prijzenPerJaar} />
          </section>
        )}

        {titels.length > 0 && (
          <section className="erl-club-sec">
            <h2 className="erl-section-title">🥇 Kampioenschappen ({titels.length})</h2>
            {titelsPerReeks.length > 1 && (
              <div className="erl-kaart erl-reeks-totaal">
                <h3 className="erl-kaart-titel">Totaal per reeks</h3>
                <ul className="erl-kaart-rijen erl-kaart-rijen-grid">
                  {titelsPerReeks.map((r) => (
                    <li key={r.naam} className="erl-kaart-rij">
                      <span className="erl-kaart-label">{r.naam}</span>
                      <span className="erl-kaart-waarde">{r.aantal}×</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <ul className="erl-tijdlijn erl-tijdlijn-groepen">
              {titelGroepen.map((g) => (
                <li key={g.seizoen} className="erl-tijdlijn-groep">
                  <div className="erl-tijdlijn-groep-kop">
                    <span className="erl-tijdlijn-jaar">{g.seizoen}</span>
                    {g.namen.length > 1 && <span className="erl-tijdlijn-badge">{g.namen.length}×</span>}
                  </div>
                  <ul className="erl-tijdlijn-sub">
                    {g.namen.map((reeksNaam, i) => (
                      <li key={i}>{reeksNaam}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        )}

        {bekers.length > 0 && (
          <section className="erl-club-sec">
            <h2 className="erl-section-title">🏆 Bekers ({bekers.length})</h2>
            {bekersPerCategorie.length > 1 && (
              <div className="erl-kaart erl-reeks-totaal">
                <h3 className="erl-kaart-titel">Totaal per categorie</h3>
                <ul className="erl-kaart-rijen erl-kaart-rijen-grid">
                  {bekersPerCategorie.map((r) => (
                    <li key={r.naam} className="erl-kaart-rij">
                      <span className="erl-kaart-label">{r.naam}</span>
                      <span className="erl-kaart-waarde">{r.aantal}×</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <ul className="erl-tijdlijn erl-tijdlijn-groepen">
              {bekerGroepen.map((g) => (
                <li key={g.seizoen} className="erl-tijdlijn-groep">
                  <div className="erl-tijdlijn-groep-kop">
                    <span className="erl-tijdlijn-jaar">{g.seizoen}</span>
                    {g.namen.length > 1 && <span className="erl-tijdlijn-badge">{g.namen.length}×</span>}
                  </div>
                  <ul className="erl-tijdlijn-sub">
                    {g.namen.map((categorie, i) => (
                      <li key={i}>{categorie}</li>
                    ))}
                  </ul>
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
                  <span className="erl-tijdlijn-detail"><SpelerNaam naam={r.naam} /> — {r.prijs}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  )
}
