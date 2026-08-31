'use client'

import { useEffect, useState } from 'react'

import './video-tijdlijn.css'

// Het model bijstellen op onze eigen wedstrijden — zonder commandolijn.
//
// De meting van elke AI-analyse blijft bewaard, en de worpen die tijdens de wedstrijd
// ingevoerd zijn zeggen wat er écht gebeurd is. Deze knop legt die twee naast elkaar en zoekt
// de drempels waarmee het model de meeste worpen vindt zonder de reviewlaan te overspoelen.
//
// Bewust met alle cijfers erbij, ook de lelijke: een holdout-recall van 60% moet je zién.

type Cijfers = Record<string, number | null>

type Model = {
  drempel: number
  min_afstand_s: number
  getraind_op: string[]
  holdout_wedstrijden: string[]
  training: Cijfers
  holdout: Cijfers | null
  gemaakt: string
}

type Stand = {
  model: Model | null
  kandidaten: { matchId: number; worpen: number; metingen: number; bron?: 'reviews' | 'worpen' | 'beide' }[]
  overgeslagen: { matchId: number; reden: string }[]
}

const pct = (w: number | null | undefined) => (w == null ? '—' : `${Math.round(w * 100)}%`)

function Cijferrij({ kop, c }: { kop: string; c: Cijfers }) {
  return (
    <p className="sa-hint">
      <strong>{kop}:</strong> {c.gevonden ?? 0} van de {c.labels ?? 0} worpen gevonden (
      {pct(c.recall)}), {c.vals ?? 0} valse van de {c.detecties ?? 0} voorstellen (precisie{' '}
      {pct(c.precisie)}) · F1 {c.f1 == null ? '—' : c.f1.toFixed(3)}
    </p>
  )
}

export function ModelBijstellen() {
  const [stand, setStand] = useState<Stand | null>(null)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  useEffect(() => {
    let levend = true
    fetch('/api/cv/model')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (levend && d) setStand(d as Stand)
      })
      .catch(() => undefined)
    return () => {
      levend = false
    }
  }, [])

  async function train() {
    setBezig(true)
    setFout(null)
    try {
      const r = await fetch('/api/cv/model', { method: 'POST' })
      const d = await r.json()
      if (!r.ok) {
        setFout(String(d?.error ?? 'Het bijstellen is niet gelukt.'))
        if (Array.isArray(d?.overgeslagen)) {
          setStand((s) => (s ? { ...s, overgeslagen: d.overgeslagen } : s))
        }
        return
      }
      setStand({ model: d.model, kandidaten: d.kandidaten ?? [], overgeslagen: d.overgeslagen ?? [] })
    } catch {
      setFout('De server antwoordde niet.')
    } finally {
      setBezig(false)
    }
  }

  if (!stand) return null
  const { model, kandidaten, overgeslagen } = stand

  return (
    <section className="sa" id="model-bijstellen">
      <h3 className="sa-h3">🎛️ Het model bijstellen op onze wedstrijden</h3>
      <p className="sa-lead">
        Het houdingsmodel beslist met twee drempels wanneer iets een worp is. Die waren geschat.
        Hier worden ze geleerd uit de wedstrijden die al geanalyseerd zijn: de meting van het
        model naast wat er écht gebeurde — de voorstellen die jij op de video bevestigd hebt
        (daar komt geen ijking aan te pas), aangevuld met de ingevoerde worpen wanneer de video
        wél geijkt is.
      </p>

      {model ? (
        <>
          <p className="sa-klaar">
            Getraind op {model.getraind_op.length} wedstrijd(en) — drempel{' '}
            <strong>{model.drempel}</strong>, minimale afstand{' '}
            <strong>{model.min_afstand_s} s</strong>.
          </p>
          <Cijferrij kop="Op de wedstrijden waarop gefit werd" c={model.training} />
          {model.holdout ? (
            <Cijferrij kop="Op de holdout — dít cijfer telt" c={model.holdout} />
          ) : (
            <p className="sa-let-op">
              Er was maar één wedstrijd, dus er is gefit en gemeten op dezelfde beelden. Die
              cijfers zijn te mooi. Analyseer een tweede wedstrijd en stel opnieuw bij.
            </p>
          )}
        </>
      ) : (
        <p className="sa-hint">
          Nog niet getraind — het model werkt met de geschatte drempels (1,2 en 3,0 s).
        </p>
      )}

      <p className="sa-hint">
        {kandidaten.length
          ? `Bruikbaar: ${kandidaten
              .map((k) => `wedstrijd ${k.matchId} (${k.worpen} worpen${
                k.bron === 'reviews' ? ', uit je reviews' : k.bron === 'worpen' ? ', uit de ingevoerde worpen' : ''
              })`)
              .join(', ')}.`
          : 'Nog geen bruikbare wedstrijd: er is een analyse met het houdingsmodel nodig, plus bevestigde voorstellen op de video (of een geijkte video met ingevoerde worpen).'}
      </p>
      {overgeslagen.length > 0 && (
        <p className="sa-hint">
          Overgeslagen: {overgeslagen.map((o) => `wedstrijd ${o.matchId} (${o.reden})`).join(' · ')}.
        </p>
      )}

      {fout && <p className="sa-let-op">{fout}</p>}

      <div className="sa-acties">
        <button type="button" className="va-btn primary" onClick={train} disabled={bezig || !kandidaten.length}>
          {bezig ? 'Bezig met bijstellen…' : model ? 'Opnieuw bijstellen' : 'Bijstellen op deze wedstrijden'}
        </button>
      </div>
    </section>
  )
}
