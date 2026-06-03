import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { TeamLogo } from '@/components/TeamLogo'
import { buildMatchState } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'

export const dynamic = 'force-dynamic'

type LiveCard = {
  id: number
  home: { name: string; logoUrl: string | null; colors?: { primary?: string } | null }
  away: { name: string; logoUrl: string | null; colors?: { primary?: string } | null }
  score: { home: number; away: number }
}

// De startpagina is een overzicht ("hub"): alles wat we gebouwd hebben, logisch gegroepeerd,
// met bovenaan een "Nu live"-strook voor directe waarde. Het pure live-bord leeft op /live.
export default async function HomePage() {
  const payload = await getPayloadClient()
  const liveRes = await payload
    .find({ collection: 'matches', where: { status: { equals: 'live' } }, depth: 0, limit: 8 })
    .catch(() => ({ docs: [] as { id: number }[] }))
  const live: LiveCard[] = []
  for (const m of liveRes.docs) {
    try {
      const s = await buildMatchState(payload, m.id)
      live.push({
        id: m.id,
        home: { name: s.teams.home.name, logoUrl: s.teams.home.logoUrl, colors: s.teams.home.colors },
        away: { name: s.teams.away.name, logoUrl: s.teams.away.logoUrl, colors: s.teams.away.colors },
        score: s.score,
      })
    } catch {
      // Wedstrijd met ontbrekende ploeg overslaan.
    }
  }

  return (
    <>
      <SiteHeader active={null} />
      <div className="site hub">
        <section className="hub-hero">
          <h1>
            <span className="brand">Krachtbal</span> Live
          </h1>
          <p>Volg wedstrijden, bedien de schermen aan het veld en regel het wedstrijdblad — alles op één plek.</p>
        </section>

        {/* Nu live — directe waarde bovenaan. */}
        {live.length > 0 && (
          <section className="hub-livewrap">
            <h2 className="hub-h"><span className="hub-livedot" />Nu live</h2>
            <div className="hub-live">
              {live.map((m) => (
                <Link key={m.id} href={`/match/${m.id}`} className="hub-livecard">
                  <span className="hub-live-team">
                    <TeamLogo name={m.home.name} logoUrl={m.home.logoUrl} side="home" size="sm" ringColor={m.home.colors?.primary} />
                    <span className="hub-live-nm">{m.home.name}</span>
                  </span>
                  <span className="hub-live-score">{m.score.home}<span className="hub-live-dash">–</span>{m.score.away}</span>
                  <span className="hub-live-team away">
                    <span className="hub-live-nm">{m.away.name}</span>
                    <TeamLogo name={m.away.name} logoUrl={m.away.logoUrl} side="away" size="sm" ringColor={m.away.colors?.primary} />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* De vier schermen van één wedstrijd, in logische volgorde: invoer → weergaven. */}
        <h2 className="hub-h">Eén wedstrijd, vier schermen</h2>
        <p className="hub-sub">
          Het <strong>aantekenbord</strong> voert in. De drie andere schermen tonen datzelfde verloop live,
          elk aan een eigen publiek.
        </p>
        <div className="hub-flow">
          <Link href="/scorekeeper" className="hub-screen input">
            <span className="hub-step">1 · invoer</span>
            <span className="hub-ico">📝</span>
            <h3>Aantekenbord</h3>
            <p>De aantekenaar voert de wedstrijd live in op een tablet, naast de scheidsrechter.</p>
          </Link>
          <span className="hub-arrow" aria-hidden="true">→</span>
          <Link href="/live" className="hub-screen">
            <span className="hub-step">2 · aan het veld</span>
            <span className="hub-ico">📺</span>
            <h3>Veldscherm</h3>
            <p>Groot scherm bij het terrein. Open een wedstrijd en kies “📺 Veldscherm”.</p>
          </Link>
          <Link href="/kantine" className="hub-screen">
            <span className="hub-step">3 · in de kantine</span>
            <span className="hub-ico">🍻</span>
            <h3>Kantinescherm</h3>
            <p>Scherm in de kantine: kies welke wedstrijden je daar wil tonen.</p>
          </Link>
          <Link href="/live" className="hub-screen">
            <span className="hub-step">4 · overal</span>
            <span className="hub-ico">📱</span>
            <h3>Live-score</h3>
            <p>Iedereen volgt mee op gsm of laptop, waar dan ook.</p>
          </Link>
        </div>

        <div className="hub-cols">
          <section className="hub-group">
            <h2 className="hub-h">Wedstrijddag — voorbereiding & blad</h2>
            <p className="hub-sub">In volgorde: opstelling → akkoord scheidsrechter → aantekenen → aftekenen.</p>
            <Link href="/scorekeeper" className="hub-card">
              <strong>Aantekenen-overzicht</strong>
              <span>Kies een wedstrijd. Per wedstrijd: opstelling, scheidsrechter en aftekenen.</span>
            </Link>
            <Link href="/tornooi" className="hub-card">
              <strong>Tornooien</strong>
              <span>Knock-out-schema’s met eigen aantekenbord, veld- en kantinescherm.</span>
            </Link>
            <Link href="/demo" className="hub-card">
              <strong>🎓 Demo spelen</strong>
              <span>Oefen het aantekenbord met 8 fictieve spelers per kant — altijd speelbaar.</span>
            </Link>
          </section>

          <section className="hub-group">
            <h2 className="hub-h">Info & beheer</h2>
            <p className="hub-sub">Naslag en administratie.</p>
            <div className="hub-links">
              <Link href="/reglement" className="hub-pill">Reglement</Link>
              <Link href="/knipjes" className="hub-pill">Knipjes</Link>
              <Link href="/vergoedingen" className="hub-pill">Vergoedingen</Link>
              <Link href="/bekerfinale" className="hub-pill">Bekerfinale</Link>
              <Link href="/beheer/spelers" className="hub-pill">Spelers toevoegen</Link>
              <Link href="/admin" className="hub-pill">Beheer (admin)</Link>
            </div>
          </section>
        </div>
      </div>
    </>
  )
}
