'use client'

import { useMemo, useState } from 'react'

import { FieldSchema, type FieldMarker } from '@/components/FieldSchema'
import { naarNorm } from '@/lib/cv-naar-worp'
import { werperLabel, type Werpertoewijzing } from '@/lib/cv-werpers'
import { telWorpstats } from '@/lib/cv-worpstats'
import type { VeldkaartSpeler } from './Veldkaart'
import './veldkaart.css'

// ── Waar landen de worpen — rechtstreeks uit de video ─────────────────────────────────────────
// De gewone Veldkaart toont échte worpen en blijft dus leeg tot een wedstrijd overgezet is.
// Deze kaart toont de landingspunten van de CV-voorstellen zélf: zodra de analyse gedraaid
// heeft, zie je wie waar werpt en hoe vaak — als punten of als heatmap, per werper filterbaar
// via de werper-toewijzing. Met de afstand en de links/rechts-verdeling ernaast is dit het
// antwoord op "hoe ver werpt die speler, en werpt hij links of rechts".

export interface CvKaartVoorstel {
  id: number
  videoTimeS: number
  eventType: 'worp' | 'vangst' | 'doelpunt' | 'buitenspel'
  verdict: 'bevestigd' | 'afgewezen' | null
  xM: number | null
  yM: number | null
  inDoelgebied: boolean
  uitbal?: boolean | null
  afstandM: number | null
  richtingGraden?: number | null
  werper?: number | null
}

const KLEUR = {
  doelgebied: '#06d6a0',
  vangst: '#4cc9f0',
  uitbal: '#ef476f',
  veld: '#8fb3a1',
} as const

const first = (n: string) => n.split(/\s+/)[0]

/** Wie-chips: toegewezen werpers klonteren samen per speler, de rest blijft een los volgnummer. */
type WieChip = { sleutel: string; label: string; kant: 'home' | 'away' | null; werpers: number[] }

function bouwChips(
  werpers: number[],
  toewijzing: Werpertoewijzing,
  spelers: VeldkaartSpeler[],
): WieChip[] {
  const perSpeler = new Map<number, number[]>()
  const los: number[] = []
  for (const w of werpers) {
    const spelerId = toewijzing[String(w)]
    if (spelerId != null && spelers.some((p) => p.playerId === spelerId)) {
      const lijst = perSpeler.get(spelerId) ?? []
      lijst.push(w)
      perSpeler.set(spelerId, lijst)
    } else {
      los.push(w)
    }
  }
  const chips: WieChip[] = []
  for (const [spelerId, lijst] of perSpeler) {
    const p = spelers.find((s) => s.playerId === spelerId)!
    chips.push({
      sleutel: `s${spelerId}`,
      label: `#${p.shirtNumber} ${first(p.playerName)}`,
      kant: p.teamSide,
      werpers: lijst,
    })
  }
  chips.sort((a, b) => (a.kant === b.kant ? a.label.localeCompare(b.label) : a.kant === 'home' ? -1 : 1))
  for (const w of los.sort((a, b) => a - b)) {
    chips.push({ sleutel: `w${w}`, label: werperLabel(w), kant: null, werpers: [w] })
  }
  return chips
}

export function CvVeldkaart({
  voorstellen,
  toewijzing,
  spelers,
  goalAreaDepth,
  veldBreedte,
  speelveldM,
}: {
  voorstellen: CvKaartVoorstel[]
  toewijzing: Werpertoewijzing
  spelers: VeldkaartSpeler[]
  goalAreaDepth: number
  /** Echte terreinmaten (m); leeg = reglementair. Nodig om meters juist op het veld te leggen. */
  veldBreedte?: number | null
  speelveldM?: number | null
}) {
  const [modus, setModus] = useState<'punten' | 'heat'>('punten')
  const [enkelBevestigd, setEnkelBevestigd] = useState(false)
  const [wie, setWie] = useState<'alle' | string>('alle')

  const maten = useMemo(
    () => ({ breedteM: veldBreedte ?? undefined, speelveldM: speelveldM ?? undefined }),
    [veldBreedte, speelveldM],
  )

  // Enkel voorstellen mét een landingspunt kunnen op de kaart; afgewezen doen nooit mee.
  const metPunt = useMemo(
    () =>
      voorstellen.filter(
        (v) => v.verdict !== 'afgewezen' && typeof v.xM === 'number' && typeof v.yM === 'number',
      ),
    [voorstellen],
  )

  const chips = useMemo(() => {
    const werpers = [...new Set(metPunt.map((v) => v.werper).filter((w): w is number => typeof w === 'number'))]
    return bouwChips(werpers, toewijzing, spelers)
  }, [metPunt, toewijzing, spelers])

  const zonderWerper = useMemo(() => metPunt.some((v) => typeof v.werper !== 'number'), [metPunt])

  const gefilterd = useMemo(() => {
    const chip = wie === 'alle' ? null : (chips.find((c) => c.sleutel === wie) ?? null)
    return metPunt.filter((v) => {
      if (enkelBevestigd && v.verdict !== 'bevestigd') return false
      if (chip) {
        if (typeof v.werper !== 'number') return false
        if (!chip.werpers.includes(v.werper)) return false
      }
      if (wie === 'zonder' && typeof v.werper === 'number') return false
      return true
    })
  }, [metPunt, chips, wie, enkelBevestigd])

  const punten = useMemo(
    () =>
      gefilterd.map((v) => ({
        v,
        punt: naarNorm(v.xM as number, v.yM as number, goalAreaDepth, maten),
      })),
    [gefilterd, goalAreaDepth, maten],
  )

  const markers: FieldMarker[] = punten.map(({ v, punt }) => ({
    x: punt.x,
    y: punt.y,
    color:
      v.uitbal === true
        ? KLEUR.uitbal
        : v.eventType === 'vangst'
          ? KLEUR.vangst
          : v.inDoelgebied
            ? KLEUR.doelgebied
            : KLEUR.veld,
    r: v.inDoelgebied ? 7 : 6,
  }))

  // De heatmap toont dichtheid óp het veld; een uitbal-punt ligt bewust buiten [0,1] en hoort
  // daar niet in (hij telt wél mee in de strook hieronder).
  const heat = punten
    .filter(({ punt }) => punt.x >= 0 && punt.x <= 1 && punt.y >= 0 && punt.y <= 1)
    .map(({ punt }) => punt)

  const stats = useMemo(() => telWorpstats(gefilterd), [gefilterd])

  if (!metPunt.length) return null

  return (
    <section className="vk" id="cv-veldkaart" aria-label="Landingen uit de video">
      <header className="vk-head">
        <h2 className="vk-titel">Landingen uit de video</h2>
        <p className="vk-sub">
          Waar de analyse de bal zag vallen — nog vóór het overzetten. Wijs de werpers toe om per
          speler te filteren.
        </p>
      </header>

      <div className="vk-filters" role="tablist" aria-label="Wat toont het veld">
        <button type="button" className={`vk-chip${modus === 'punten' ? ' on' : ''}`} onClick={() => setModus('punten')}>
          Punten
        </button>
        <button type="button" className={`vk-chip${modus === 'heat' ? ' on' : ''}`} onClick={() => setModus('heat')}>
          Heatmap
        </button>
        <button
          type="button"
          className={`vk-chip${enkelBevestigd ? ' on' : ''}`}
          onClick={() => setEnkelBevestigd((b) => !b)}
          title="Enkel voorstellen die je al bevestigd hebt"
        >
          ✓ Enkel bevestigde
        </button>
      </div>

      {(chips.length > 0 || zonderWerper) && (
        <div className="vk-spelers" role="tablist" aria-label="Welke werper">
          <button type="button" className={`vk-chip${wie === 'alle' ? ' on' : ''}`} onClick={() => setWie('alle')}>
            Iedereen
          </button>
          {chips.map((c) => (
            <button
              key={c.sleutel}
              type="button"
              className={`vk-chip${c.kant ? ` side-${c.kant}` : ''}${wie === c.sleutel ? ' on' : ''}`}
              onClick={() => setWie(wie === c.sleutel ? 'alle' : c.sleutel)}
            >
              {c.label}
            </button>
          ))}
          {zonderWerper && (
            <button
              type="button"
              className={`vk-chip${wie === 'zonder' ? ' on' : ''}`}
              onClick={() => setWie(wie === 'zonder' ? 'alle' : 'zonder')}
              title="Voorstellen waar het model niemand kon volgen"
            >
              zonder werper
            </button>
          )}
        </div>
      )}

      <div className="vk-veldwrap">
        <FieldSchema
          className="vk-veld"
          markers={modus === 'heat' ? [] : markers}
          heatPoints={modus === 'heat' ? heat : undefined}
          goalAreaDepthM={goalAreaDepth}
          speelveldM={speelveldM ?? undefined}
        />
      </div>

      {/* Hoe ver en waarheen — de twee vragen die de metingen per worp beantwoorden. */}
      <div className="vk-telling" aria-live="polite">
        <span className="vk-tel"><b>{stats.worpen}</b> worpen</span>
        {stats.gemAfstandM != null && (
          <span className="vk-tel"><b>{stats.gemAfstandM.toFixed(1)} m</b> gem. afstand</span>
        )}
        {stats.maxAfstandM != null && (
          <span className="vk-tel"><b>{stats.maxAfstandM.toFixed(1)} m</b> verste</span>
        )}
        {stats.links + stats.midden + stats.rechts > 0 && (
          <span className="vk-tel" title="Vanuit de werper gezien">
            <b>{stats.links}</b> links · <b>{stats.midden}</b> midden · <b>{stats.rechts}</b> rechts
          </span>
        )}
        {stats.uitballen > 0 && <span className="vk-tel uit"><b>{stats.uitballen}</b> uitballen</span>}
      </div>

      {modus === 'punten' ? (
        <div className="vk-legende">
          <span><i style={{ background: KLEUR.doelgebied }} /> in het doelgebied</span>
          <span><i style={{ background: KLEUR.vangst }} /> gevangen</span>
          <span><i style={{ background: KLEUR.uitbal }} /> uitbal</span>
          <span><i style={{ background: KLEUR.veld }} /> in het veld</span>
        </div>
      ) : (
        <div className="vk-legende">
          <span className="vk-heat-scale" /> <span>weinig → veel</span>
        </div>
      )}
    </section>
  )
}
