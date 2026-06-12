import { SiteHeader } from '@/components/SiteHeader'
import { buildScoreboards } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { reeksNaam } from '@/lib/reeksen'
import { LiveLookLab, type SampleMatch } from './LiveLookLab'
import './looks.css'

export const dynamic = 'force-dynamic'

// Ontwerp-speeltuin: dezelfde (echte) wedstrijden in verschillende live-rij-looks, zodat we kunnen
// kiezen welke we uitrollen. Niet gelinkt in de navigatie — tijdelijk, enkel via de URL.
export default async function OntwerpLivePage() {
  const payload = await getPayloadClient()
  const res = await payload
    .find({
      collection: 'matches',
      where: { and: [{ analyseOnly: { not_equals: true } }, { isDemo: { not_equals: true } }] },
      sort: '-date',
      depth: 0,
      limit: 60,
    })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const cards = await buildScoreboards(payload, res.docs as Parameters<typeof buildScoreboards>[1])

  // Kies enkele realistische voorbeelden: liefst met logo's, en met een mix van korte én lange
  // ploegnamen (om afkapping te kunnen beoordelen).
  const withLogo: SampleMatch[] = []
  const rest: SampleMatch[] = []
  for (const m of res.docs as { id: number; reeks?: unknown }[]) {
    const c = cards.get(m.id)
    if (!c) continue
    const s: SampleMatch = {
      reeks: reeksNaam(m.reeks),
      home: { name: c.teams.home.name, logoUrl: c.teams.home.logoUrl, logoFit: c.teams.home.logoFit, color: c.teams.home.colors?.primary ?? null },
      away: { name: c.teams.away.name, logoUrl: c.teams.away.logoUrl, logoFit: c.teams.away.logoFit, color: c.teams.away.colors?.primary ?? null },
      score: c.score,
      crosses: c.crosses,
      timeouts: c.timeouts,
    }
    if (s.home.logoUrl && s.away.logoUrl) withLogo.push(s)
    else rest.push(s)
  }
  // Voorkeur voor wedstrijden met logo's; vul aan met de rest. Neem er 2 (kort + lang waar mogelijk).
  const pool = [...withLogo, ...rest]
  const longest = [...pool].sort((a, b) => b.home.name.length + b.away.name.length - (a.home.name.length + a.away.name.length))[0]
  const samples = [pool[0], longest].filter((s, i, arr): s is SampleMatch => Boolean(s) && arr.indexOf(s) === i).slice(0, 2)

  return (
    <>
      <SiteHeader active={null} />
      <div className="site">
        <h1 className="page-title">
          <span className="brand">Glas</span> · finale
        </h1>
        <p className="ll-intro">
          De gekozen look (B · Glas), nu met <strong>beweging in de achtergrond</strong> (driftende
          kleur + zwevende glow-blobs) en een <strong>glans-veeg</strong> over de kop. Bekijk het op je
          gsm; als dit goed zit, rol ik het uit naar het echte live-bord.
        </p>
        {samples.length === 0 ? (
          <p className="empty">Geen wedstrijden gevonden om te tonen.</p>
        ) : (
          <LiveLookLab samples={samples} />
        )}
      </div>
    </>
  )
}
