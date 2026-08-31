'use client'

import { useMemo } from 'react'

import { inWoorden, vergelijk } from '@/lib/cv-score'
import { momentToVideo, type VideoSync } from '@/lib/video-sync'
import './video-tijdlijn.css'

// Hoe goed doet het model het op déze wedstrijd?
//
// De reviewlaan alleen zegt hoeveel voorstellen kloppen, maar niet hoeveel worpen het model
// gemist heeft — en dat tweede is het interessantste. Daarvoor is een onafhankelijke lijst
// nodig van wat er echt gebeurd is, en die is er: de worpen die de aantekenaar tijdens de
// wedstrijd invoerde, via de ijkpunten omgerekend naar hun tijdstip in de video.
//
// Twee lijsten met tijdstippen dus, naast elkaar gelegd. Dat is de lus die het model beter
// maakt: niet nog eens sleutelen aan de heuristiek, maar meten op echte beelden.

type Worp = { half: number; gameClock: number }

export function ModelScore({
  worpen,
  voorstellen,
  sync,
  halfSeconds,
  naarTijd,
}: {
  worpen: Worp[]
  voorstellen: { videoTimeS: number }[]
  sync: VideoSync
  halfSeconds: number
  /** Springen naar een moment in de video (om een gemiste worp te bekijken). */
  naarTijd?: (seconden: number) => void
}) {
  const kaart = useMemo(() => {
    const tijden = worpen.map((w) => momentToVideo(w, sync, halfSeconds))
    return vergelijk(tijden, voorstellen.map((v) => v.videoTimeS))
  }, [worpen, voorstellen, sync, halfSeconds])

  if (!worpen.length && !voorstellen.length) return null

  const pct = (w: number | null) => (w == null ? '—' : `${Math.round(w * 100)}%`)
  const klok = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

  return (
    <section className="ms" id="modelscore">
      <h3 className="sa-h3">📊 Hoe goed doet het model het hier?</h3>
      <p className="sa-hint">{inWoorden(kaart)}</p>

      {kaart.worpen > 0 && kaart.voorstellen > 0 && (
        <>
          <div className="ms-cijfers">
            <span>
              <strong>{pct(kaart.recall)}</strong> gevonden
              <em>
                {kaart.gevonden} van de {kaart.worpen} worpen
              </em>
            </span>
            <span>
              <strong>{pct(kaart.precisie)}</strong> raak
              <em>
                {kaart.gevonden} van de {kaart.voorstellen} voorstellen
              </em>
            </span>
            <span>
              <strong>
                {kaart.medianeAfwijking == null ? '—' : `${kaart.medianeAfwijking.toFixed(1)} s`}
              </strong>
              <em>mediane afwijking</em>
            </span>
          </div>

          {kaart.gemisteTijden.length > 0 && (
            <p className="sa-hint">
              Gemist:{' '}
              {kaart.gemisteTijden.slice(0, 12).map((t, i) => (
                <span key={t}>
                  {i > 0 && ' · '}
                  {naarTijd ? (
                    <button type="button" className="ms-sprong" onClick={() => naarTijd(t)}>
                      {klok(t)}
                    </button>
                  ) : (
                    klok(t)
                  )}
                </span>
              ))}
              {kaart.gemisteTijden.length > 12 && ` … (+${kaart.gemisteTijden.length - 12})`}
            </p>
          )}

          <p className="sa-hint">
            Klopt de ijking van H1 en H2 niet, dan staan de ingevoerde worpen op de verkeerde
            videotijd en zegt dit cijfer niets. Controleer die eerst bij de video hierboven.
          </p>
        </>
      )}
    </section>
  )
}
