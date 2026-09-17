'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'

import { TeamLogo } from '@/components/TeamLogo'
import type { LogoFit } from '@/lib/logo-fit'
import './kantine-viering.css'

// Schermvullende doelpunt-viering en fotoshow voor het kantinescherm — dezelfde spektakel-
// overlays als het tornooischerm (GroepKantine.tsx: VieringOverlay/FotoShow), hier herbouwd op de
// databronnen van de competitie (KantineBord/KantineLive) i.p.v. het tornooi-groepbord.

const VIERING_MS = 2400
const VIERING_RAKET_MS = 3400
const FOTO_TEL_VANAF = 3
const FOTO_TOON_MS = 6500
const FOTO_TOON_MAX_MS = 11000

/** Een doelpunt-viering: welke club scoorde, hoeveel punten, en tegen wie. */
export type Viering = {
  key: number
  kant: 'home' | 'away'
  team: string
  punten: number
  kleur: string | null
  logo: string | null
  fit: LogoFit | null
  reeks: string
  tegen: string
  tegenLogo: string | null
  tegenFit: LogoFit | null
  tegenKleur: string | null
}

/** Een rugworp (+2) toont een raketvlucht en mag daarom iets langer duren dan een nekworp. */
export const vieringDuur = (v: { punten: number }) => (v.punten === 2 ? VIERING_RAKET_MS : VIERING_MS)

export function GoalCelebrationOverlay({ v, ms }: { v: Viering; ms: number }) {
  const raket = v.punten === 2
  // Thuis staat links, uit rechts — zoals op het bord erboven. Scoort de uitploeg, dan vertrekt
  // de raket dus rechts en vliegt hij naar links; anders slaat hij op het verkeerde logo in.
  const naarLinks = raket && v.kant === 'away'
  const scorer = { naam: v.team, logo: v.logo, fit: v.fit, kleur: v.kleur }
  const doel = { naam: v.tegen, logo: v.tegenLogo, fit: v.tegenFit, kleur: v.tegenKleur }
  const links = naarLinks ? doel : scorer
  const rechts = naarLinks ? scorer : doel
  const zijde = (t: typeof scorer, isDoel: boolean, side: 'home' | 'away') => (
    <span className={isDoel ? 'ktc-raket-doel' : 'ktc-raket-af'}>
      {isDoel && (
        <span className="ktc-boem" aria-hidden>
          💥
        </span>
      )}
      <span className={isDoel ? 'ktc-raket-doel-logo' : undefined}>
        <TeamLogo name={t.naam} logoUrl={t.logo} logoFit={t.fit} side={side} size="clamp(110px, 24vmin, 260px)" ringColor={t.kleur ?? undefined} />
      </span>
    </span>
  )
  return (
    <div
      className={`ktc-viering${raket ? ' raket' : ''}`}
      style={{ ...(v.kleur ? { '--vc': v.kleur } : {}), '--vdur': `${ms}ms` } as CSSProperties}
      aria-live="polite"
    >
      <div className="ktc-viering-flits" aria-hidden />
      <div className="ktc-viering-golf" aria-hidden />
      <div className="ktc-viering-burst" aria-hidden />
      <div className="ktc-viering-inhoud">
        {raket ? (
          <div className={`ktc-raketbaan${naarLinks ? ' naarlinks' : ''}`}>
            {zijde(links, naarLinks, 'home')}
            <span className="ktc-raket" aria-hidden>
              🚀
            </span>
            {zijde(rechts, !naarLinks, 'away')}
          </div>
        ) : (
          <span className="ktc-viering-logo draai">
            <TeamLogo name={v.team} logoUrl={v.logo} logoFit={v.fit} side="home" size="clamp(140px, 34vmin, 380px)" ringColor={v.kleur ?? undefined} />
          </span>
        )}
        <span className="ktc-viering-punten">+{v.punten}</span>
        <span className="ktc-viering-titel">DOELPUNT!</span>
        <span className="ktc-viering-team">{v.team}</span>
        <span className="ktc-viering-reeks">{v.reeks}</span>
      </div>
    </div>
  )
}

// Wat de kantine te horen krijgt, afhankelijk van hoeveel foto's tegelijk binnenvallen.
const FOTO_TEKSTEN: { titel: string; sub: string }[] = [
  { titel: '📸 OH OHHH…', sub: 'hier komt ’m!' },
  { titel: '📸📸 OH OH OHHH!', sub: 'DUBBELSLAG — twee foto’s tegelijk!' },
  { titel: '🔥 OHHH DRIEDUBBEL!', sub: 'een hattrick van foto’s!' },
  { titel: '🎉 VIERKLAPPER!!', sub: 'vier in één keer — wie doet beter?' },
]
const fotoTekst = (n: number) =>
  n <= FOTO_TEKSTEN.length
    ? FOTO_TEKSTEN[n - 1]
    : { titel: '🌪️ FOTOSTORM!!!', sub: `${n} foto’s in één klap — de kantine ontploft!` }

/** Eén foto zoals de fotoshow ze toont — url is al relatief-af (zie match-channel.ts Instant). */
export type KantineFotoInstant = { id: number; url: string; authorName: string }

/**
 * "📸 OH OHHH… hier komt 'm!" met een 3-2-1-aftelklok, dan popt de foto als polaroid in beeld en
 * lost weer op. De foto zelf blijft daarna gewoon bij de wedstrijd staan (foto-tribune); dit is
 * enkel de korte schermvullende aankondiging.
 */
export function PhotoCelebration({ fotos, klaar }: { fotos: KantineFotoInstant[]; klaar: () => void }) {
  const [tel, setTel] = useState(FOTO_TEL_VANAF)
  const sleutel = fotos.map((f) => f.id).join(',')

  // Welke foto's zijn effectief bruikbaar? Eentje die niet laadt slaan we stilletjes over.
  const [ok, setOk] = useState<number[] | null>(null)

  useEffect(() => {
    let actief = true
    let open = fotos.length
    const goed: number[] = []
    const af = () => {
      if (--open === 0 && actief) setOk(goed)
    }
    for (const f of fotos) {
      const img = new Image()
      img.onload = () => {
        goed.push(f.id)
        af()
      }
      img.onerror = af
      img.src = f.url
    }
    return () => {
      actief = false
    }
    // eslint-disable-next-line
  }, [sleutel])

  useEffect(() => {
    setTel(FOTO_TEL_VANAF)
    const iv = setInterval(() => setTel((t) => Math.max(0, t - 1)), 1000)
    return () => clearInterval(iv)
  }, [sleutel])

  const toonbaar = ok ?? fotos.map((f) => f.id)
  const toonMs = Math.min(FOTO_TOON_MAX_MS, FOTO_TOON_MS + Math.max(0, toonbaar.length - 1) * 900)
  useEffect(() => {
    if (tel > 0) return
    if (ok != null && ok.length === 0) {
      klaar()
      return
    }
    const t = setTimeout(klaar, toonMs)
    return () => clearTimeout(t)
    // eslint-disable-next-line
  }, [tel, ok])

  const zichtbaar = useMemo(() => fotos.filter((f) => (ok == null ? true : ok.includes(f.id))), [fotos, ok])
  const n = zichtbaar.length
  const tekst = fotoTekst(Math.max(1, n))
  const heftig = n >= 3 ? ' heftig' : n >= 2 ? ' dubbel' : ''

  return (
    <div className={`ktc-fotoshow${heftig}`} aria-live="polite">
      {tel > 0 ? (
        <div className="ktc-fs-tease">
          <span className="ktc-fs-titel">{tekst.titel}</span>
          <span className="ktc-fs-sub">{tekst.sub}</span>
          <span key={tel} className="ktc-fs-tel">
            <i className="ktc-fs-ring" aria-hidden />
            {tel}
          </span>
        </div>
      ) : (
        <div className="ktc-fs-reveal">
          <div className={`ktc-fs-stapel n${Math.min(n, 6)}`} style={{ '--n': n } as CSSProperties}>
            {zichtbaar.map((f, i) => (
              <span key={f.id} className="ktc-fs-kaart" style={{ '--i': i } as CSSProperties}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt={f.authorName ? `Foto van ${f.authorName}` : 'Supportersfoto'} />
                <span className="ktc-fs-wie">📸 {f.authorName || 'Supporter'}</span>
              </span>
            ))}
          </div>
          <span className="ktc-fs-onder">
            {n > 1 ? `📷 ${n} supportersfoto’s tegelijk!` : '📷 Supportersfoto'}
          </span>
        </div>
      )}
    </div>
  )
}
