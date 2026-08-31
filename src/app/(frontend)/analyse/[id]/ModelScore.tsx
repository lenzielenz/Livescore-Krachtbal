'use client'

import { useMemo } from 'react'

import { inWoorden, vergelijk, verschuiving, videoscore, type Voorstel } from '@/lib/cv-score'
import { momentToVideo, type VideoSync } from '@/lib/video-sync'
import './video-tijdlijn.css'

// Hoe goed doet het model het op déze wedstrijd?
//
// Twee maten, en de eerste is de belangrijkste omdat ze op de vídeo zelf leeft:
//
//  1. Wat het model in de opname vond, en wat jij daarvan bevestigde. Elk voorstel draagt zijn
//     eigen tijdstip in de video en jouw oordeel hangt aan datzelfde voorstel — daar komt geen
//     ijking van de wedstrijdklok aan te pas. Klopt de ijking van helft 1 of 2 niet, dan
//     verandert er aan dit cijfer niets.
//  2. Pas daarna, en alleen als de video geijkt ís: de vergelijking met de worpen die tijdens de
//     wedstrijd ingevoerd werden. Dat is de enige manier om te weten hoeveel het model MIST —
//     je beoordeelt immers alleen wat het aandroeg. Zonder ijking staat die vergelijking op de
//     verkeerde seconden en zegt ze niets; dan tonen we ze ook niet.

type Worp = { half: number; gameClock: number }

export function ModelScore({
  worpen,
  voorstellen,
  sync,
  halfSeconds,
  geijkt = true,
  naarTijd,
}: {
  worpen: Worp[]
  voorstellen: Voorstel[]
  sync: VideoSync
  halfSeconds: number
  /** Is de video geijkt? Zo niet, dan slaan we de vergelijking met de ingevoerde worpen over. */
  geijkt?: boolean
  /** Springen naar een moment in de video (om een gemiste worp te bekijken). */
  naarTijd?: (seconden: number) => void
}) {
  const { kaart, scheef } = useMemo(() => {
    const tijden = worpen.map((w) => momentToVideo(w, sync, halfSeconds))
    const voorgesteld = voorstellen.map((v) => v.videoTimeS)
    return { kaart: vergelijk(tijden, voorgesteld), scheef: verschuiving(tijden, voorgesteld) }
  }, [worpen, voorstellen, sync, halfSeconds])

  const video = useMemo(() => videoscore(voorstellen), [voorstellen])

  if (!worpen.length && !voorstellen.length) return null

  const pct = (w: number | null) => (w == null ? '—' : `${Math.round(w * 100)}%`)
  const klok = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

  return (
    <section className="ms" id="modelscore">
      <h3 className="sa-h3">📊 Hoe goed doet het model het hier?</h3>

      {video.voorstellen > 0 && (
        <>
          <p className="sa-hint">
            In de video: <strong>{video.voorstellen} voorstellen</strong>
            {video.van != null && video.tot != null ? ` tussen ${klok(video.van)} en ${klok(video.tot)}` : ''}
            {video.metLanding > 0 ? `, waarvan ${video.metLanding} met een landingspunt` : ''}.
          </p>
          <div className="ms-cijfers">
            <span>
              <strong>{pct(video.precisie)}</strong> klopte
              <em>
                {video.bevestigd} van de {video.beoordeeld} beoordeeld
              </em>
            </span>
            <span>
              <strong>{video.voorstellen - video.beoordeeld}</strong>
              <em>nog te beoordelen</em>
            </span>
          </div>
          {video.beoordeeld === 0 && (
            <p className="sa-hint">
              Beoordeel de voorstellen hierboven; dan weet je meteen hoeveel ervan kloppen. Dat
              cijfer staat los van de ijking — het leeft op de videotijdlijn zelf.
            </p>
          )}
        </>
      )}

      {geijkt && kaart.worpen > 0 && kaart.voorstellen > 0 && (
        <>
          <p className="sa-hint">
            En tegenover de worpen die tijdens de wedstrijd ingevoerd werden — de enige manier om
            te zien wat het model <em>miste</em>, maar alleen zo goed als de ijking van de video:
          </p>
          <p className="sa-hint">{inWoorden(kaart)}</p>
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

          {kaart.gevonden === 0 && scheef != null && Math.abs(scheef) > 3 ? (
            <p className="sa-let-op">
              Geen enkel voorstel valt samen met een ingevoerde worp, maar ze liggen wél
              stelselmatig <strong>{klok(Math.abs(scheef))}</strong>{' '}
              {scheef > 0 ? 'later' : 'vroeger'} dan je worpen. Dat wijst op een ijking die
              zoveel verschoven staat — niet op een model dat niets vond. Zet de ijking van de
              helft(en) hierboven goed en dit cijfer verandert mee.
            </p>
          ) : (
            <p className="sa-hint">
              Klopt de ijking van H1 en H2 niet, dan staan de ingevoerde worpen op de verkeerde
              videotijd en zegt dit cijfer niets. Controleer die eerst bij de video hierboven.
            </p>
          )}
        </>
      )}
    </section>
  )
}
