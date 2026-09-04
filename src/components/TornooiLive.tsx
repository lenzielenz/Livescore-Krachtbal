'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { TeamLogo } from '@/components/TeamLogo'
import { fmtClock, useTicking } from '@/app/(frontend)/tornooi/useTournament'
import type { LogoFit } from '@/lib/logo-fit'
import type { GroepMatch } from '@/lib/tornooi-groep'
import './tornooi-live.css'

// Hoe vaak we de tornooidag opnieuw ophalen. Zelfde ritme als het kantinescherm: snel genoeg dat
// een doelpunt binnen een paar tellen op de startpagina staat, traag genoeg om een dag met
// honderden kijkers niet in een polling-storm te veranderen (de route is publiek en leest de hele
// dag in één keer, dus dit is geen per-wedstrijd-stream).
const VERVERS_MS = 8000

export interface TornooiLiveData {
  /** Naam van de tornooidag — de sleutel waarmee we bijwerken. */
  groep: string
  matches: GroepMatch[]
  logos: Record<string, string>
  fits: Record<string, LogoFit>
}

/**
 * De wedstrijden die op dit moment op het tornooi bezig zijn, op de startpagina.
 *
 * Zelfde gedachte als het live-bord van de competitie: wat nu speelt hoort op de voorpagina, met
 * dezelfde uitnodiging voor supporters om mee te tellen. Zodra een wedstrijd afgelopen is valt ze
 * uit de lijst — de startpagina toont het heden, het schema toont de rest.
 */
export function TornooiLive({
  initieel,
  magScoren,
  href,
}: {
  initieel: TornooiLiveData
  /** Mag deze bezoeker meetellen? Dan verschijnt dezelfde aantekenknop als bij de competitie. */
  magScoren: boolean
  /** Waar "alles bekijken" naartoe gaat: de tornooidag zelf. */
  href: string
}) {
  const [data, setData] = useState<TornooiLiveData>(initieel)

  // Bijwerken via de publieke dag-route (dezelfde die het kantinescherm voedt). Geen SSE: dit zijn
  // meerdere reeksen tegelijk, en één stream per reeks openen vanaf de startpagina zou de
  // SSE-laag onnodig belasten voor iets dat een paar seconden vertraging best verdraagt.
  useEffect(() => {
    let gestopt = false
    const haal = async () => {
      try {
        const res = await fetch(`/api/tornooi-groep?naam=${encodeURIComponent(initieel.groep)}`, { cache: 'no-store' })
        if (!res.ok) return
        const verse = (await res.json()) as Partial<TornooiLiveData> | null
        if (gestopt || !verse || !Array.isArray(verse.matches)) return
        setData({
          groep: initieel.groep,
          matches: verse.matches.filter((m) => m.status === 'live'),
          logos: verse.logos ?? {},
          fits: verse.fits ?? {},
        })
      } catch {
        // Even geen verbinding: laat staan wat er staat en probeer het straks opnieuw.
      }
    }
    const t = setInterval(() => void haal(), VERVERS_MS)
    return () => {
      gestopt = true
      clearInterval(t)
    }
  }, [initieel.groep])

  if (data.matches.length === 0) return null

  return (
    <section className="tlive" aria-label="Nu bezig op het tornooi">
      <div className="tlive-kop">
        <h2>
          <span className="tlive-punt" aria-hidden /> Nu bezig op het tornooi
        </h2>
        <Link href={href} className="tlive-alles">
          Alles bekijken →
        </Link>
      </div>
      <div className="tlive-lijst">
        {data.matches.map((m) => (
          <TornooiLiveKaart key={`${m.tournamentId}-${m.id}`} m={m} logos={data.logos} fits={data.fits} magScoren={magScoren} />
        ))}
      </div>
    </section>
  )
}

function TornooiLiveKaart({
  m,
  logos,
  fits,
  magScoren,
}: {
  m: GroepMatch
  logos: Record<string, string>
  fits: Record<string, LogoFit>
  magScoren: boolean
}) {
  // De klok tikt lokaal door tussen twee ophaalrondes — anders zou hij met horten en stoten lopen.
  const clock = useTicking(m.clockSeconds, m.clockRunning)
  return (
    <article className="tlive-kaart">
      <div className="tlive-meta">
        <span className="tlive-reeks">{m.reeksNaam}</span>
        {m.veld != null && <span className="tlive-veld">Veld {m.veld}</span>}
        <span className="tlive-klok">H{m.currentHalf} · {fmtClock(clock)}</span>
      </div>
      <div className="tlive-body">
        <span className="tlive-ploeg">
          {m.home && <TeamLogo name={m.home} logoUrl={logos[m.home] ?? null} logoFit={fits[m.home] ?? null} side="home" size="2.2em" />}
          <span className="tlive-naam">{m.home ?? '—'}</span>
        </span>
        <span className="tlive-score">{m.score.home} – {m.score.away}</span>
        <span className="tlive-ploeg uit">
          {m.away && <TeamLogo name={m.away} logoUrl={logos[m.away] ?? null} logoFit={fits[m.away] ?? null} side="away" size="2.2em" />}
          <span className="tlive-naam">{m.away ?? '—'}</span>
        </span>
      </div>
      {/* Dezelfde uitnodiging als op het live-bord van de competitie. */}
      {magScoren && (
        <Link href={`/tornooi/${m.tournamentId}/aantekenen/${m.id}`} className="tlive-cta">
          <span aria-hidden>✏️</span>
          <span className="tlive-cta-txt">Aantekenen — verder scoren</span>
          <span aria-hidden>→</span>
        </Link>
      )}
    </article>
  )
}
