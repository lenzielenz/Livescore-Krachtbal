'use client'

import { useEffect, useState, type CSSProperties } from 'react'

import type { Ad } from '@/lib/ads'
import { balkOpstelling } from '@/lib/reclame-balk'
import { uitsnedeStijl } from '@/lib/reclame'

import './reclame.css'

// De reclamebalk onderaan het kantinescherm.
//
// Wat deze balk moeilijk maakt is niet het schuiven maar de inhoud: reclame komt van overal
// vandaan, in alle formaten en kleuren. Een donkere banner naast een wit logo naast een felgele
// flyer wordt vanzelf rommelig, en een kantinescherm dat er rommelig uitziet doet de sponsors
// eerder kwaad dan goed.
//
// Drie regels houden het rustig:
//   • Elke reclame krijgt een TEGEL van dezelfde maat, met dezelfde marge en hoeken. Wat erin
//     staat mag verschillen; het raster niet.
//   • Het beeld staat CONTAIN in die tegel — nooit uitgerekt, nooit afgesneden — met de uitsnede
//     die de beheerder instelde (zoom, verschuiving, draaiing).
//   • De achtergrond van de tegel is per reclame te kiezen: donker als standaard, wit voor een
//     logo dat op wit hoort te staan.
//
// De lengte en de snelheid komen uit `lib/reclame-balk.ts`, zodat de balk klopt met drie sponsors
// én met dertig.

export function ReclameBalk({ ads }: { ads: Ad[] }) {
  // De echte schermbreedte pas na het mounten: op de server bestaat ze niet, en met de verkeerde
  // breedte klopt het aantal kopieën niet en zie je de lus terugspringen.
  const [breedte, setBreedte] = useState(1920)
  useEffect(() => {
    const meet = () => setBreedte(window.innerWidth || 1920)
    meet()
    window.addEventListener('resize', meet)
    return () => window.removeEventListener('resize', meet)
  }, [])

  if (ads.length === 0) return null

  const opstelling = balkOpstelling(ads.length, breedte)
  const strook = Array.from({ length: opstelling.herhalingen }, () => ads).flat()

  const helft = (verborgen: boolean) => (
    <span className="rb-helft" aria-hidden={verborgen}>
      {strook.map((a, i) => (
        <span className={`rb-tegel achter-${a.achtergrond}`} key={`${a.id}-${i}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- eigen media, geen optimalisatie nodig */}
          <img src={a.url} alt={a.naam} draggable={false} style={uitsnedeStijl(a.uitsnede)} />
        </span>
      ))}
    </span>
  )

  return (
    <div className="rb" aria-label="Sponsors">
      <div
        className={`rb-strook${opstelling.loop ? ' loop' : ''}`}
        style={{ '--rb-duur': `${opstelling.duurSec}s` } as CSSProperties}
      >
        {helft(false)}
        {/* Tweede identieke helft maakt de lus naadloos: -50% verschuiven = exact één helft. */}
        {opstelling.loop && helft(true)}
      </div>
    </div>
  )
}
