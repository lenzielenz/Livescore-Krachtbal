'use client'

import { useState } from 'react'

import { ARTIKELEN, GRATIS, type Kast } from '@/lib/virtueel-fanshop'
import { roepTekst, ROEPEN, type RoepId } from '@/lib/virtueel-praat'

// Praten met de andere supporters van je club die nu in het stadion zijn: roep een van de vaste
// supportersberichten (aan iedereen, of aan één supporter), of geef iemand een stuk uit je kast.
// Geen vrije tekst: het stadion is er vooral voor de jeugd (zie lib/virtueel-praat.ts).

export type Supporter = { id: string; naam: string }

export function Praat({
  open,
  onSluit,
  clubNaam,
  supporters,
  kast,
  onRoep,
  onGeef,
}: {
  open: boolean
  onSluit: () => void
  clubNaam: string
  supporters: Supporter[]
  kast: Kast
  onRoep: (roep: RoepId, aan: string | null) => Promise<boolean>
  onGeef: (artikel: string, aan: Supporter) => Promise<boolean>
}) {
  const [tab, setTab] = useState<'roep' | 'geef'>('roep')
  const [aan, setAan] = useState<string | null>(null)
  const [bezig, setBezig] = useState<string | null>(null)
  if (!open) return null
  const ontvanger = supporters.find((s) => s.id === aan) ?? null
  const teGeven = ARTIKELEN.filter((a) => kast.gekocht.includes(a.id) && !GRATIS.includes(a.id))
  return (
    <div className="vk-praat" role="dialog" aria-label="Praten met de supporters">
      <div className="vk-praat-kop">
        <div className="vk-praat-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'roep'} className={tab === 'roep' ? 'aan' : ''} onClick={() => setTab('roep')}>
            📣 Roepen
          </button>
          <button role="tab" aria-selected={tab === 'geef'} className={tab === 'geef' ? 'aan' : ''} onClick={() => setTab('geef')}>
            🎁 Cadeau geven
          </button>
        </div>
        <button className="vk-graf-sluit" onClick={onSluit} aria-label="Sluiten">
          ✕
        </button>
      </div>
      {supporters.length === 0 ? (
        <p className="vk-praat-leeg">Er is nu niemand anders van je club in het stadion. Kom later terug, of nodig je ploegmaats uit!</p>
      ) : (
        <>
          <div className="vk-praat-aan" aria-label={tab === 'roep' ? 'Aan wie?' : 'Voor wie?'}>
            <span>{tab === 'roep' ? 'Aan:' : 'Voor:'}</span>
            {tab === 'roep' && (
              <button className={aan == null ? 'aan' : ''} onClick={() => setAan(null)}>
                👥 Iedereen
              </button>
            )}
            {supporters.map((s) => (
              <button key={s.id} className={aan === s.id ? 'aan' : ''} onClick={() => setAan(s.id)}>
                {s.naam}
              </button>
            ))}
          </div>
          {tab === 'roep' ? (
            <div className="vk-praat-roepen">
              {ROEPEN.map((r) => (
                <button
                  key={r.id}
                  disabled={bezig != null}
                  onClick={async () => {
                    setBezig(r.id)
                    const ok = await onRoep(r.id, aan)
                    setBezig(null)
                    if (ok) onSluit()
                  }}
                >
                  {roepTekst(r.id, clubNaam)}
                </button>
              ))}
            </div>
          ) : !ontvanger ? (
            <p className="vk-praat-leeg">Kies eerst aan wie je iets wil geven.</p>
          ) : teGeven.length === 0 ? (
            <p className="vk-praat-leeg">Je kast is nog leeg: koop eerst iets in de fanshop (met de muntjes van je gouden ballen).</p>
          ) : (
            <>
              <ul className="vk-praat-kast">
                {teGeven.map((a) => (
                  <li key={a.id}>
                    <button
                      disabled={bezig != null}
                      onClick={async () => {
                        setBezig(a.id)
                        await onGeef(a.id, ontvanger)
                        setBezig(null)
                      }}
                    >
                      <i>{a.icoon}</i>
                      <b>{a.naam}</b>
                      <small>{bezig === a.id ? 'Inpakken…' : `🎁 Geef aan ${ontvanger.naam}`}</small>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="vk-graf-tip">Wat je geeft, ben je kwijt en krijg je niet terug betaald. Ruilen? Geef elkaar iets!</p>
            </>
          )}
        </>
      )}
    </div>
  )
}
