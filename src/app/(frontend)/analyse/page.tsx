import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { TeamLogo } from '@/components/TeamLogo'
import { canAnalyse, userClubId } from '@/lib/access'
import { analyseOwnWhere } from '@/lib/analyse-access'
import { leesAppJson, leesManifest, ondertekendeUrl } from '@/lib/app-analyse'
import { score, type AppData } from '@/lib/app-analyse-veld'
import { getAuthUser } from '@/lib/auth-user'
import { formatDateBE } from '@/lib/datetime'
import { clubLogoUrl } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { reeksNaam } from '@/lib/reeksen'
import type { Club, Match, Team } from '@/payload-types'
import './analyse.css'
import './hub-app.css'

export const dynamic = 'force-dynamic'

// De analyse-hub: je wedstrijden zoals de krachtbal-analyse-app ze analyseerde. Elke kaart opent
// de volledige, interactieve analyse (video en notities, 3D, tactiekbord, spelers, worpen, passen,
// tactiek). Analyses komen hier door ze vanuit de app door te sturen; de oude tools en manuele
// opnames staan niet meer op de hub.

type Kaart = {
  id: number
  datum: string | null
  reeks: string
  thuis: { naam: string; logo: string | null; logoFit: unknown; kleur: string | null }
  uit: { naam: string; logo: string | null; logoFit: unknown; kleur: string | null }
  score: { thuis: number; uit: number } | null
  worpen: number
  duur: number | null
  beeld: string | null
  video: boolean
  gemaakt: string | null
}

function ploegInfo(t: unknown): Kaart['thuis'] {
  const team = t && typeof t === 'object' ? (t as Team) : null
  const club = team?.club && typeof team.club === 'object' ? (team.club as Club) : null
  return {
    naam: String(team?.name ?? 'Ploeg'),
    logo: club ? clubLogoUrl({ club }) : null,
    logoFit: (club as { logoFit?: unknown } | null)?.logoFit ?? null,
    kleur: (club?.colorPrimary as string | undefined) ?? null,
  }
}

export default async function AnalysePage() {
  const me = await getAuthUser()
  if (!canAnalyse(me)) {
    return (
      <>
        <SiteHeader active="analyse" />
        <div className="site">
          <h1 className="page-title"><span className="brand">Analyse</span></h1>
          <p className="empty">
            Je hebt geen toegang tot de analyse. Vraag een admin om je toegang te geven.{' '}
            <Link href="/inloggen" style={{ color: 'var(--accent)' }}>Inloggen →</Link>
          </p>
        </div>
      </>
    )
  }

  const payload = await getPayloadClient()

  // Clubhuis-identiteit: het echte logo + de naam van de eigen club.
  const myClubId = userClubId(me)
  let heroClubName = 'Sint-Michiels'
  let heroLogo: string | null = null
  if (myClubId != null) {
    const club = await payload.findByID({ collection: 'clubs', id: myClubId, depth: 1 }).catch(() => null)
    if (club) {
      const c = club as { displayTitle?: unknown; name?: unknown }
      const nm = (typeof c.displayTitle === 'string' && c.displayTitle.trim()) || (typeof c.name === 'string' && c.name.trim())
      if (nm) heroClubName = nm
      heroLogo = clubLogoUrl({ club })
    }
  }

  // Je eigen analysewedstrijden (en die met jou gedeeld zijn); enkel die met een analyse uit de app.
  const res = await payload
    .find({ collection: 'matches', where: analyseOwnWhere(me), sort: '-date', depth: 2, limit: 300 })
    .catch(() => ({ docs: [] as Match[] }))
  const kaarten: Kaart[] = []
  for (const m of res.docs as Match[]) {
    const manifest = await leesManifest(Number(m.id))
    if (!manifest) continue
    const data = await leesAppJson<AppData>(Number(m.id), 'wedstrijd_data.json')
    const namen = new Set(manifest.bestanden.map((b) => b.naam))
    kaarten.push({
      id: Number(m.id),
      datum: m.date ? formatDateBE(new Date(m.date), { dateStyle: 'long' }) : null,
      reeks: reeksNaam(m.reeks ?? undefined),
      thuis: ploegInfo(m.homeTeam),
      uit: ploegInfo(m.awayTeam),
      score: data?.veld ? score(data) : null,
      worpen: data?.worpen?.length ?? 0,
      duur: data?.duur_s ?? null,
      beeld: namen.has('veldbeeld.png') ? ondertekendeUrl(Number(m.id), 'veldbeeld.png') : null,
      video: namen.has('video.mp4'),
      gemaakt: manifest.gemaakt || null,
    })
  }

  const duur = (s: number | null) => (s == null ? null : s >= 90 ? `${Math.round(s / 60)} min beeld` : `${Math.round(s)} s beeld`)

  return (
    <>
      <SiteHeader active="analyse" />
      <div className="site">
        <header className="an-hero">
          <span className="an-hero-badge">
            <span className={`an-hero-plate ${heroLogo ? 'is-photo' : 'is-crest'}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="an-hero-crest" src={heroLogo ?? '/sint-michiels.svg'} alt={`${heroClubName} clublogo`} width={84} height={84} />
            </span>
          </span>
          <div className="an-hero-txt">
            <span className="an-hero-eyebrow">Clubhuis · Analyse</span>
            <h1 className="an-hero-title">{heroClubName}</h1>
            <p className="an-hero-motto">Oltegoare</p>
            <p className="an-hero-tag">Elke wedstrijd zoals de analyse-app hem zag: in 3D, op het veld, per speler en op video.</p>
          </div>
        </header>

        <section className="hub-app">
          <h2 className="section-title">Wedstrijden <span className="an-chart-hint">{kaarten.length || ''}</span></h2>
          {kaarten.length === 0 ? (
            <div className="hub-leeg">
              <b>Nog geen analyses.</b>
              <p>
                Analyseer een wedstrijd in de krachtbal-analyse-app en stuur ze door via Resultaten → Naar krachtbal.live.
                Ze verschijnt hier meteen, met video, 3D, heatmaps en notities.
              </p>
            </div>
          ) : (
            <div className="hub-raster">
              {kaarten.map((k) => (
                <Link key={k.id} href={`/analyse/${k.id}`} className="hub-kaart">
                  <span className="hub-beeld">
                    {k.beeld ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={k.beeld} alt="" loading="lazy" />
                    ) : (
                      <span className="hub-gras" />
                    )}
                    {k.video && <span className="hub-video">▶ video</span>}
                  </span>
                  <span className="hub-affiche">
                    <span className="hub-ploeg">
                      <TeamLogo name={k.thuis.naam} logoUrl={k.thuis.logo} logoFit={k.thuis.logoFit as never} side="home" size="sm" ringColor={k.thuis.kleur ?? undefined} />
                      <span>{k.thuis.naam}</span>
                    </span>
                    <span className="hub-score">
                      {k.score ? k.score.thuis : '–'}
                      <i>–</i>
                      {k.score ? k.score.uit : '–'}
                    </span>
                    <span className="hub-ploeg uit">
                      <span>{k.uit.naam}</span>
                      <TeamLogo name={k.uit.naam} logoUrl={k.uit.logo} logoFit={k.uit.logoFit as never} side="away" size="sm" ringColor={k.uit.kleur ?? undefined} />
                    </span>
                  </span>
                  <span className="hub-meta">
                    {[k.datum, k.reeks, `${k.worpen} worpen`, duur(k.duur)].filter(Boolean).join(' · ')}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  )
}
