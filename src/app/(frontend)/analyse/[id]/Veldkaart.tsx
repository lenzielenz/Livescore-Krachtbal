'use client'

import { useMemo, useRef, useState } from 'react'

import { FieldSchema, type FieldMarker } from '@/components/FieldSchema'
import { saveOrShareBlob, slugFilename, svgToPngBlob } from '@/lib/client-download'
import type { ShotPoint } from '@/lib/match-engine'
import './veldkaart.css'

// ── De veldkaart: hét scherm van de analyse ────────────────────────────────────────────────────
// Alles wat op het veld gebeurde op één kaart: waar elke bal viel en waar er gevangen werd.
// Twee vragen, twee filters: welke worp (1e/2e/laatste) en welke speler. De rest van de analyse
// is detail; dit is het beeld waar een coach mee begint.

const KLEUR: Record<string, string> = {
  goal: '#06d6a0',
  own_goal: '#b57bff',
  caught: '#4cc9f0',
  out_side: '#ef476f',
  out_back: '#f78c6b',
  in_field: '#8fb3a1',
}

export interface VeldkaartSpeler {
  playerId: number
  playerName: string
  shirtNumber: number
  teamSide: 'home' | 'away'
}

type Wat = 'alles' | 'gevallen' | 'gevangen' | 'heat'
type Worp = 'alle' | 1 | 2 | 'laatste'

const first = (n: string) => n.split(/\s+/)[0]

export function Veldkaart({
  shots,
  spelers,
  teams,
  goalAreaDepth,
  speelveldM,
  matchLabel,
}: {
  shots: ShotPoint[]
  spelers: VeldkaartSpeler[]
  teams: { home: string; away: string }
  goalAreaDepth: number
  /** Echte speelveldlengte (m); leeg = reglementair 26 m. */
  speelveldM?: number | null
  matchLabel?: string
}) {
  const [wat, setWat] = useState<Wat>('alles')
  const [worp, setWorp] = useState<Worp>('alle')
  const [wie, setWie] = useState<'alle' | number>('alle')
  const wrapRef = useRef<HTMLDivElement>(null)
  const [imgBusy, setImgBusy] = useState(false)

  const gefilterd = useMemo(
    () =>
      shots.filter((s) => {
        if (wie !== 'alle' && s.playerId !== wie) return false
        if (worp === 1 && s.throwNumber !== 1) return false
        if (worp === 2 && s.throwNumber !== 2) return false
        if (worp === 'laatste' && !s.isLastThrow) return false
        if (wat === 'gevangen' && s.outcome !== 'caught') return false
        if (wat === 'gevallen' && s.outcome === 'caught') return false
        return true
      }),
    [shots, wie, worp, wat],
  )

  // Vangsten springen eruit met een ring: "waar wordt er gevangen" is een aparte vraag dan
  // "waar valt de bal", ook wanneer beide samen op het veld staan.
  const markers: FieldMarker[] = gefilterd.map((s) => ({
    x: s.x,
    y: s.y,
    color: KLEUR[s.outcome] ?? '#ffd166',
    r: s.outcome === 'goal' ? 8 : s.outcome === 'caught' ? 7 : 6,
    label: String(s.throwNumber),
  }))

  const telling = useMemo(() => {
    const t = { worpen: gefilterd.length, goals: 0, eigen: 0, gevangen: 0, buiten: 0, afstSom: 0, afstN: 0 }
    for (const s of gefilterd) {
      if (s.outcome === 'goal') t.goals += 1
      else if (s.outcome === 'own_goal') t.eigen += 1
      else if (s.outcome === 'caught') t.gevangen += 1
      else if (s.outcome === 'out_side' || s.outcome === 'out_back') t.buiten += 1
      if (s.distance != null && s.distance > 0) {
        t.afstSom += s.distance
        t.afstN += 1
      }
    }
    return t
  }, [gefilterd])

  const download = async () => {
    const svg = wrapRef.current?.querySelector('svg')
    if (!svg || imgBusy) return
    setImgBusy(true)
    try {
      // Hoge resolutie (ook voor de heatmap): schaal 6 ≈ 1100×3000 px — scherp genoeg om in
      // WhatsApp op in te zoomen of af te drukken.
      const blob = await svgToPngBlob(svg as SVGSVGElement, { scale: 6, background: '#0b1c14' })
      const name = slugFilename('krachtbal', wat === 'heat' ? 'heatmap' : 'veldkaart', teams.home, 'vs', teams.away, matchLabel) + '.png'
      await saveOrShareBlob(blob, name, matchLabel ?? 'Krachtbal')
    } catch {
      // stil: gebruiker kan opnieuw proberen
    } finally {
      setImgBusy(false)
    }
  }

  const thuis = spelers.filter((p) => p.teamSide === 'home')
  const uit = spelers.filter((p) => p.teamSide === 'away')

  return (
    <section className="vk" aria-label="Veldkaart">
      <header className="vk-head">
        <h2 className="vk-titel">Veldkaart</h2>
        <p className="vk-sub">Waar valt de bal, waar wordt er gevangen — per worp en per speler.</p>
      </header>

      {/* Rij 1: wát je bekijkt. */}
      <div className="vk-filters" role="tablist" aria-label="Wat toont het veld">
        {(
          [
            ['alles', 'Alles'],
            ['gevallen', 'Gevallen'],
            ['gevangen', 'Gevangen'],
            ['heat', 'Heatmap'],
          ] as [Wat, string][]
        ).map(([k, lbl]) => (
          <button key={k} type="button" className={`vk-chip${wat === k ? ' on' : ''}`} onClick={() => setWat(k)}>
            {lbl}
          </button>
        ))}
      </div>

      {/* Rij 2: welke worp. */}
      <div className="vk-filters" role="tablist" aria-label="Welke worp">
        {(
          [
            ['alle', 'Alle worpen'],
            [1, '1e worp'],
            [2, '2e worp'],
            ['laatste', 'Doelworp'],
          ] as [Worp, string][]
        ).map(([k, lbl]) => (
          <button key={String(k)} type="button" className={`vk-chip${worp === k ? ' on' : ''}`} onClick={() => setWorp(k)}>
            {lbl}
          </button>
        ))}
      </div>

      {/* Rij 3: welke speler, gegroepeerd per ploeg. */}
      {spelers.length > 0 && (
        <div className="vk-spelers" role="tablist" aria-label="Welke speler">
          <button type="button" className={`vk-chip${wie === 'alle' ? ' on' : ''}`} onClick={() => setWie('alle')}>
            Iedereen
          </button>
          {[...thuis, ...uit].map((p) => (
            <button
              key={p.playerId}
              type="button"
              className={`vk-chip side-${p.teamSide}${wie === p.playerId ? ' on' : ''}`}
              onClick={() => setWie(wie === p.playerId ? 'alle' : p.playerId)}
              title={p.playerName}
            >
              #{p.shirtNumber} {first(p.playerName)}
            </button>
          ))}
        </div>
      )}

      <div className="vk-veldwrap" ref={wrapRef}>
        {/* Bewust géén ploeglabels op de uiteinden: de ploegen wisselen per helft van kant, dus
            een vast label zou voor de helft van de punten fout zijn. */}
        <FieldSchema
          className="vk-veld"
          markers={wat === 'heat' ? [] : markers}
          heatPoints={wat === 'heat' ? gefilterd.map((s) => ({ x: s.x, y: s.y })) : undefined}
          goalAreaDepthM={goalAreaDepth}
          speelveldM={speelveldM ?? undefined}
        />
      </div>

      {/* Telstrook: wat je nu op het veld ziet, in cijfers. */}
      <div className="vk-telling" aria-live="polite">
        <span className="vk-tel"><b>{telling.worpen}</b> worpen</span>
        <span className="vk-tel goal"><b>{telling.goals}</b> doelpunten</span>
        {telling.eigen > 0 && <span className="vk-tel"><b>{telling.eigen}</b> eigen doelpunt{telling.eigen === 1 ? '' : 'en'}</span>}
        <span className="vk-tel vang"><b>{telling.gevangen}</b> gevangen</span>
        <span className="vk-tel uit"><b>{telling.buiten}</b> buiten</span>
        {telling.afstN > 0 && (
          <span className="vk-tel"><b>{(telling.afstSom / telling.afstN).toFixed(1)} m</b> gem. afstand</span>
        )}
      </div>

      {wat !== 'heat' ? (
        <div className="vk-legende">
          <span><i style={{ background: KLEUR.goal }} /> doelpunt</span>
          {telling.eigen > 0 && <span><i style={{ background: KLEUR.own_goal }} /> eigen doelpunt</span>}
          <span><i style={{ background: KLEUR.caught }} /> gevangen</span>
          <span><i style={{ background: KLEUR.out_side }} /> buiten</span>
          <span><i style={{ background: KLEUR.in_field }} /> in het veld</span>
          <span className="vk-note">cijfer = worpnummer</span>
        </div>
      ) : (
        <div className="vk-legende">
          <span className="vk-heat-scale" /> <span>weinig → veel</span>
        </div>
      )}

      <div className="vk-acties">
        <button type="button" className="vk-dl" onClick={download} disabled={imgBusy || gefilterd.length === 0}>
          {imgBusy ? '⏳ Bezig…' : '⬇ Bewaar als afbeelding'}
        </button>
      </div>
    </section>
  )
}
