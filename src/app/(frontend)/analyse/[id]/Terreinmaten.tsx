'use client'

import { useState } from 'react'

// Het terrein waarop deze wedstrijd gespeeld is, in échte meters. Niet elk veld is exact
// reglementair uitgezet (jeugdvelden, krappe zalen), en zodra de maten hier ingevuld staan
// rekent het hele platform ermee: worpafstand, landingszone, de passregels én het getekende
// veld. Leeg laten = reglementair (14 × 26 m). Zonder dit scherm was dit alleen in het
// admin-paneel in te vullen — precies de plek waar een coach nooit komt.

type Maten = { veldBreedte: number | null; veldSpeelveld: number | null; goalAreaDepth: number }

const REGLEMENTAIR = { breedte: 14, speelveld: 26 }

export function Terreinmaten({ matchId, initieel }: { matchId: number; initieel: Maten }) {
  const [maten, setMaten] = useState<Maten>(initieel)
  const [breedte, setBreedte] = useState(initieel.veldBreedte?.toString() ?? '')
  const [speelveld, setSpeelveld] = useState(initieel.veldSpeelveld?.toString() ?? '')
  const [diepte, setDiepte] = useState(initieel.goalAreaDepth.toString())
  const [busy, setBusy] = useState(false)
  const [melding, setMelding] = useState<string | null>(null)
  const [fout, setFout] = useState<string | null>(null)

  const opgemeten = maten.veldBreedte != null || maten.veldSpeelveld != null
  const totaal = (maten.veldSpeelveld ?? REGLEMENTAIR.speelveld) + 2 * maten.goalAreaDepth

  const bewaar = async () => {
    setBusy(true)
    setFout(null)
    setMelding(null)
    try {
      const res = await fetch(`/api/match/${matchId}/veldmaten`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          veldBreedte: breedte.trim() === '' ? null : breedte.trim(),
          veldSpeelveld: speelveld.trim() === '' ? null : speelveld.trim(),
          goalAreaDepth: diepte.trim() === '' ? null : diepte.trim(),
        }),
      })
      const data = (await res.json()) as Partial<Maten> & { error?: string }
      if (!res.ok) {
        setFout(data.error ?? 'Opslaan mislukt.')
        return
      }
      const nieuw: Maten = {
        veldBreedte: data.veldBreedte ?? null,
        veldSpeelveld: data.veldSpeelveld ?? null,
        goalAreaDepth: data.goalAreaDepth ?? maten.goalAreaDepth,
      }
      setMaten(nieuw)
      setBreedte(nieuw.veldBreedte?.toString() ?? '')
      setSpeelveld(nieuw.veldSpeelveld?.toString() ?? '')
      setDiepte(nieuw.goalAreaDepth.toString())
      setMelding('Opgeslagen — herlaad de pagina om de nieuwe meters overal te zien.')
    } catch {
      setFout('Netwerkfout — probeer opnieuw.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="an-fold tm">
      <summary>
        📐 Terreinmaten{' '}
        <span className="tm-sum">
          {opgemeten
            ? `opgemeten: ${maten.veldBreedte ?? REGLEMENTAIR.breedte} × ${maten.veldSpeelveld ?? REGLEMENTAIR.speelveld} m`
            : 'reglementair (14 × 26 m)'}
          {` · doelgebied ${maten.goalAreaDepth} m · totaal ${totaal} m lang`}
        </span>
      </summary>
      <div className="tm-body">
        <p className="tm-lead">
          Is dit terrein opgemeten en wijkt het af van het reglement? Vul de échte afstanden in —
          dan kloppen de worpafstanden, de landingszones en het getekende veld met de werkelijkheid.
          Laat leeg voor een reglementair veld.
        </p>
        <div className="tm-velden">
          <label className="tm-veld">
            <span>Breedte (m)</span>
            <input
              type="number" inputMode="decimal" step="0.1" min={6} max={20}
              placeholder="14" value={breedte} onChange={(e) => setBreedte(e.target.value)}
            />
          </label>
          <label className="tm-veld">
            <span>Tussen de doellijnen (m)</span>
            <input
              type="number" inputMode="decimal" step="0.1" min={10} max={30}
              placeholder="26" value={speelveld} onChange={(e) => setSpeelveld(e.target.value)}
            />
          </label>
          <label className="tm-veld">
            <span>Doelgebied diep (m)</span>
            <input
              type="number" inputMode="decimal" step="0.1" min={5} max={25}
              placeholder="10" value={diepte} onChange={(e) => setDiepte(e.target.value)}
            />
          </label>
        </div>
        <div className="tm-acties">
          <button type="button" className="va-btn primary" onClick={() => void bewaar()} disabled={busy}>
            {busy ? 'Bewaren…' : 'Maten bewaren'}
          </button>
          {melding && <span className="tm-ok">{melding}</span>}
          {fout && <span className="tm-fout">{fout}</span>}
        </div>
      </div>
    </details>
  )
}
