'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { richtingTekst } from '@/lib/cv-naar-worp'
import { fmtVideoTime } from '@/lib/video-sync'

// ── CV-review: de voorstellen van de computer-vision-pipeline naast de manuele tijdlijn ────────
// Fase 1: het model vindt kandidaat-worpen (cv-events, videoTimeS = rechtstreeks videoseconden);
// de mens bevestigt of corrigeert ze hier. Elk oordeel gaat via PATCH /api/cv/events/[id]
// (het review-contract) en wordt zo ground truth voor hertraining. De voorstellen zelf tellen
// nergens in mee — het immutable worp-event-model blijft de enige bron van waarheid.

/** Eén CV-voorstel zoals de pagina het server-side uit 'cv-events' leest (depth 0). */
export interface CvVoorstel {
  id: number
  /** Videoseconde van het voorstel — géén ijking nodig, het model kijkt naar de video zelf. */
  videoTimeS: number
  eventType: 'worp' | 'vangst' | 'doelpunt' | 'buitenspel'
  worpType: 'nek' | 'rug' | null
  confidence: number
  reviewed: boolean
  /** Menselijk oordeel; null = nog open (te reviewen). */
  verdict: 'bevestigd' | 'afgewezen' | null
  side: 'home' | 'away' | null
  rugnummer: number | null
  /** Fase 2: landde de bal (volgens het model) in het doelgebied, en waar (veldmeters)? */
  inDoelgebied: boolean
  xM: number | null
  uitbal?: boolean | null
  yM: number | null
  afstandM: number | null
  /** Richting in veldassen: 0° recht naar de uitkant, +90° naar de rechterzijlijn. */
  richtingGraden?: number | null
}

const EVENT_NAAM: Record<CvVoorstel['eventType'], string> = {
  worp: 'worp',
  vangst: 'vangst',
  doelpunt: 'doelpunt',
  buitenspel: 'buitenspel',
}

function worpNaam(t: 'nek' | 'rug' | null): string | null {
  return t === 'nek' ? 'nekworp' : t === 'rug' ? 'rugworp' : null
}

/** Zolang de speler dichter dan dit bij een handmatig gekozen voorstel staat, blijft dát het
 *  actieve voorstel; scrubt de reviewer verder weg, dan volgt het paneel weer de afspeelpositie. */
const PIN_VENSTER_S = 20

/** Eén videoframe (30 fps) — de stapgrootte van de ,/.-sneltoetsen. */
const FRAME_S = 1 / 30

// De component omarmt de bestaande tijdlijn (children = balk + legende + sync-rapport): de
// voorstellenlaan komt erbóven, het reviewpaneel eronder. Zonder voorstellen rendert hij enkel
// zijn children — de pagina verandert dan met geen pixel.
export function CvReview({
  voorstellen,
  tlEinde,
  pos,
  onSeek,
  onFrameStap,
  children,
}: {
  voorstellen: CvVoorstel[]
  /** Schaal van de tijdlijnbalk (zelfde als de manuele laan), in videoseconden. */
  tlEinde: number
  /** Huidige afspeelpositie (videoseconden) — bepaalt het actieve voorstel. */
  pos: number
  /** Spring naar een videopositie (dezelfde seek als de manuele markers). */
  onSeek: (seconds: number) => void
  /** Eén frame verspringen (pauzeert de video); enkel beschikbaar bij een videobestand. */
  onFrameStap?: (deltaSeconds: number) => void
  children?: ReactNode
}) {
  // Lokale kopie voor optimistische updates: een klik toont meteen het oordeel, de PATCH volgt;
  // mislukt die, dan draaien we het voorstel terug en tonen we de fout.
  const [lijst, setLijst] = useState<CvVoorstel[]>(voorstellen)
  const [pinId, setPinId] = useState<number | null>(null)
  const [bezigId, setBezigId] = useState<number | null>(null)
  const [fout, setFout] = useState<string | null>(null)

  const gesorteerd = useMemo(() => lijst.slice().sort((a, b) => a.videoTimeS - b.videoTimeS || a.id - b.id), [lijst])
  const open = useMemo(() => gesorteerd.filter((v) => v.verdict == null), [gesorteerd])

  // Het actieve voorstel: het handmatig gekozen (j/k of klik) zolang de speler er dichtbij staat,
  // anders het voorstel dat het dichtst bij de afspeelpositie ligt.
  const actief = useMemo(() => {
    if (gesorteerd.length === 0) return null
    const gepind = pinId != null ? gesorteerd.find((v) => v.id === pinId) : undefined
    if (gepind && Math.abs(gepind.videoTimeS - pos) <= PIN_VENSTER_S) return gepind
    return gesorteerd.reduce((best, v) => (Math.abs(v.videoTimeS - pos) < Math.abs(best.videoTimeS - pos) ? v : best))
  }, [gesorteerd, pinId, pos])

  // Als worp behandelen: dan bieden knoppen én sneltoetsen nekworp/rugworp aan. Vóór het
  // keydown-effect afgeleid, zodat de n/r-gate dezelfde waarheid ziet als de knoppen.
  const isWorp =
    actief != null && (actief.eventType === 'worp' || actief.eventType === 'doelpunt' || actief.worpType != null)

  const kies = useCallback(
    (v: CvVoorstel) => {
      setPinId(v.id)
      onSeek(v.videoTimeS)
    },
    [onSeek],
  )

  /** Volgend (+1) of vorig (−1) OPEN voorstel t.o.v. het actieve, met omloop. */
  const navigeer = useCallback(
    (richting: 1 | -1) => {
      if (open.length === 0) return
      const vanaf = actief?.videoTimeS ?? pos
      const vanafId = actief?.id ?? -1
      const verder = open.filter((v) =>
        richting === 1
          ? v.videoTimeS > vanaf || (v.videoTimeS === vanaf && v.id > vanafId)
          : v.videoTimeS < vanaf || (v.videoTimeS === vanaf && v.id < vanafId),
      )
      const doel =
        richting === 1
          ? (verder[0] ?? open[0]) // voorbij het einde → terug naar het eerste open voorstel
          : (verder[verder.length - 1] ?? open[open.length - 1])
      kies(doel)
    },
    [open, actief, pos, kies],
  )

  /** Het oordeel doorsturen volgens het review-contract (PATCH /api/cv/events/[id]). */
  const review = useCallback(
    async (
      v: CvVoorstel,
      actie: 'bevestig' | 'wijsaf',
      worpType?: 'nek' | 'rug',
      eventType?: CvVoorstel['eventType'],
      speler?: { side?: 'home' | 'away'; rugnummer?: number | null },
    ) => {
      if (bezigId != null) return
      setBezigId(v.id)
      setFout(null)
      const vorige = v
      // Optimistisch: het oordeel staat er meteen; worpTypeOrigineel bewaart server-side de
      // oorspronkelijke modelclaim, dus worpType overschrijven is hier veilig.
      setLijst((l) =>
        l.map((x) =>
          x.id === v.id
            ? {
                ...x,
                reviewed: true,
                verdict: actie === 'bevestig' ? 'bevestigd' : 'afgewezen',
                worpType: worpType ?? x.worpType,
                eventType: eventType ?? x.eventType,
                side: speler?.side ?? x.side,
                rugnummer: speler && 'rugnummer' in speler ? (speler.rugnummer ?? null) : x.rugnummer,
              }
            : x,
        ),
      )
      try {
        const res = await fetch(`/api/cv/events/${v.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            actie,
            ...(worpType ? { worpType } : {}),
            ...(eventType ? { eventType } : {}),
            ...(speler?.side ? { side: speler.side } : {}),
            ...(speler && 'rugnummer' in speler ? { rugnummer: speler.rugnummer ?? null } : {}),
          }),
        })
        let data: { error?: string; event?: { reviewed?: boolean; verdict?: 'bevestigd' | 'afgewezen'; worpType?: 'nek' | 'rug' | null; eventType?: CvVoorstel['eventType'] } } = {}
        try {
          data = await res.json()
        } catch {}
        if (!res.ok) {
          if (res.status === 401) throw new Error('Niet aangemeld met federatie-toegang — log opnieuw in.')
          if (res.status === 404) throw new Error('Voorstel niet gevonden — is het intussen verwijderd?')
          throw new Error(data.error ?? 'Reviewen mislukt.')
        }
        // Het antwoord is de waarheid: neem de velden van de server over (hoort gelijk te zijn
        // aan onze optimistische stand, maar zo kan er nooit drift ontstaan).
        const ev = data.event
        if (ev) {
          setLijst((l) =>
            l.map((x) =>
              x.id === v.id
                ? {
                    ...x,
                    reviewed: ev.reviewed ?? true,
                    verdict: ev.verdict ?? x.verdict,
                    worpType: ev.worpType !== undefined ? ev.worpType : x.worpType,
                    eventType: ev.eventType ?? x.eventType,
                  }
                : x,
            ),
          )
        }
      } catch (e) {
        setLijst((l) => l.map((x) => (x.id === vorige.id ? vorige : x)))
        setFout((e as Error).message)
      } finally {
        setBezigId(null)
      }
    },
    [bezigId],
  )

  // ── Sneltoetsen: alleen wanneer er voorstellen zijn en er geen invoerveld focus heeft ──
  // j/k = volgend/vorig open voorstel (en ernaartoe springen), Enter = bevestigen, x = afwijzen,
  // n/r = worptype op nek/rug zetten én bevestigen, ,/. = één frame terug/vooruit (pauzeert).
  useEffect(() => {
    if (gesorteerd.length === 0) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement | null
      if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return
      // Enter op een knop is de knop zelf (native klik) — anders zou één Enter dubbel werken.
      if (e.key === 'Enter' && el && /^(BUTTON|A|SUMMARY)$/.test(el.tagName)) return
      switch (e.key) {
        case 'j':
          e.preventDefault()
          navigeer(1)
          break
        case 'k':
          e.preventDefault()
          navigeer(-1)
          break
        case 'Enter':
          if (actief) {
            e.preventDefault()
            void review(actief, 'bevestig')
          }
          break
        case 'x':
          if (actief) {
            e.preventDefault()
            void review(actief, 'wijsaf')
          }
          break
        case 'n':
          // Zelfde gate als de nekworp/rugworp-knoppen: op een vangst- of buitenspel-voorstel
          // mag één toetsaanslag geen worptype zetten dat de UI nooit aanbood.
          if (actief && isWorp) {
            e.preventDefault()
            void review(actief, 'bevestig', 'nek')
          }
          break
        case 'r':
          if (actief && isWorp) {
            e.preventDefault()
            void review(actief, 'bevestig', 'rug')
          }
          break
        case ',':
          if (onFrameStap) {
            e.preventDefault()
            onFrameStap(-FRAME_S)
          }
          break
        case '.':
          if (onFrameStap) {
            e.preventDefault()
            onFrameStap(FRAME_S)
          }
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [gesorteerd.length, actief, isWorp, navigeer, review, onFrameStap])

  // Zonder voorstellen: enkel de bestaande tijdlijn, de pagina blijft exact zoals ze was.
  if (gesorteerd.length === 0) return <>{children}</>

  const pct = (seconds: number) => `${Math.max(0, Math.min(100, (seconds / Math.max(1e-6, tlEinde)) * 100))}%`

  return (
    <>
      {/* De voorstellenlaan: holle, gestippelde markers boven de manuele balk — duidelijk "nog
          geen waarheid". Opacity schaalt met confidence; gereviewde voorstellen dempen we. */}
      <div className="va-cv-laan" aria-label="CV-voorstellen op de videotijdlijn">
        <span className="va-cv-laan-lbl" aria-hidden>CV</span>
        {gesorteerd.map((v) => {
          const naam = worpNaam(v.worpType)
          const status = v.verdict ?? 'open'
          const titel = `CV ${fmtVideoTime(v.videoTimeS)} · ${EVENT_NAAM[v.eventType]}${naam ? ` (${naam})` : ''} · ${Math.round(v.confidence * 100)}%${v.verdict ? ` · ${v.verdict}` : ''}`
          return (
            <button
              key={v.id}
              type="button"
              className={`va-cv-m ${v.eventType} ${status}${actief?.id === v.id ? ' actief' : ''}${v.worpType === 'rug' ? ' rug' : ''}`}
              style={{ left: pct(v.videoTimeS), ...(v.verdict == null ? { opacity: 0.35 + 0.65 * Math.max(0, Math.min(1, v.confidence)) } : {}) }}
              title={titel}
              aria-label={titel}
              onClick={() => kies(v)}
            />
          )
        })}
      </div>

      {children}

      {/* Het reviewpaneel: het actieve voorstel groot in beeld, met de drie oordelen. */}
      <div className="va-cv-paneel">
        <div className="va-cv-kop">
          <strong>🤖 CV-voorstellen</strong>
          <span className={`va-cv-teller${open.length === 0 ? ' klaar' : ''}`}>
            {open.length === 0
              ? 'alles gereviewd'
              : `nog ${open.length} ${open.length === 1 ? 'voorstel' : 'voorstellen'} te reviewen`}
          </span>
          <span className="va-cv-nav">
            <button type="button" className="va-btn small" onClick={() => navigeer(-1)} disabled={open.length === 0} title="Vorig open voorstel (k)">
              ‹ vorig
            </button>
            <button type="button" className="va-btn small" onClick={() => navigeer(1)} disabled={open.length === 0} title="Volgend open voorstel (j)">
              volgend ›
            </button>
          </span>
        </div>

        {actief && (
          <div className={`va-cv-actief ${actief.verdict ?? 'open'}`}>
            <div className="va-cv-info">
              <button type="button" className="va-cv-tijd" onClick={() => kies(actief)} title="Spring naar dit moment in de video">
                ⏱ {fmtVideoTime(actief.videoTimeS)}
              </button>
              <span className="va-cv-type">
                {EVENT_NAAM[actief.eventType]}
                {worpNaam(actief.worpType) ? ` · ${worpNaam(actief.worpType)}` : ''}
              </span>
              {actief.side != null && (
                <span className="va-cv-wie">
                  {actief.side === 'home' ? 'thuis' : 'uit'}
                  {actief.rugnummer != null ? ` #${actief.rugnummer}` : ''}
                </span>
              )}
              {actief.xM != null && actief.yM != null && (
                <span className="va-cv-zone" title="Landingspunt volgens het model (veldmeters)">
                  {actief.uitbal ? '↗ uitbal' : actief.inDoelgebied ? '🎯 doelgebied' : 'veld'} · {actief.xM.toFixed(1)}, {actief.yM.toFixed(1)} m
                  {actief.afstandM != null ? ` · worp ${actief.afstandM.toFixed(1)} m` : ''}
                  {richtingTekst(actief.richtingGraden) != null
                    ? ` · ${richtingTekst(actief.richtingGraden)}`
                    : ''}
                </span>
              )}
              <span className="va-cv-conf" title="Zekerheid van het model">
                {Math.round(actief.confidence * 100)}%
              </span>
              <span className={`va-cv-pil ${actief.verdict ?? 'open'}`}>
                {actief.verdict === 'bevestigd' ? '✓ bevestigd' : actief.verdict === 'afgewezen' ? '✗ afgewezen' : 'open'}
              </span>
            </div>
            <div className="va-cv-acties">
              <button
                type="button"
                className="va-btn small va-cv-ok"
                onClick={() => void review(actief, 'bevestig')}
                disabled={bezigId != null}
                title="Bevestigen (Enter)"
              >
                ✓ Bevestigen
              </button>
              <button
                type="button"
                className="va-btn small va-cv-nee"
                onClick={() => void review(actief, 'wijsaf')}
                disabled={bezigId != null}
                title="Afwijzen (x)"
              >
                ✗ Afwijzen
              </button>
              {isWorp && (
                <>
                  <button
                    type="button"
                    className="va-btn small"
                    onClick={() => void review(actief, 'bevestig', 'nek')}
                    disabled={bezigId != null}
                    title="Worptype op nekworp zetten en bevestigen (n)"
                  >
                    nekworp ✓
                  </button>
                  <button
                    type="button"
                    className="va-btn small"
                    onClick={() => void review(actief, 'bevestig', 'rug')}
                    disabled={bezigId != null}
                    title="Worptype op rugworp zetten en bevestigen (r)"
                  >
                    rugworp ✓
                  </button>
                </>
              )}
              {/* Speler corrigeren (fase 3): team omklikken of het rugnummer intikken —
                  bevestigt meteen, net als de andere correcties. */}
              <span className="va-cv-speler">
                <button
                  type="button"
                  className={`va-btn small${actief.side === 'home' ? ' aan' : ''}`}
                  onClick={() => void review(actief, 'bevestig', undefined, undefined, { side: 'home' })}
                  disabled={bezigId != null}
                  title="Werper bij de thuisploeg zetten en bevestigen"
                >
                  thuis
                </button>
                <button
                  type="button"
                  className={`va-btn small${actief.side === 'away' ? ' aan' : ''}`}
                  onClick={() => void review(actief, 'bevestig', undefined, undefined, { side: 'away' })}
                  disabled={bezigId != null}
                  title="Werper bij de uitploeg zetten en bevestigen"
                >
                  uit
                </button>
                <input
                  type="number"
                  min={0}
                  max={99}
                  placeholder="nr"
                  defaultValue={actief.rugnummer ?? ''}
                  key={`nr-${actief.id}`}
                  disabled={bezigId != null}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return
                    e.preventDefault()
                    e.stopPropagation()
                    const ruw = (e.target as HTMLInputElement).value.trim()
                    const nr = ruw === '' ? null : Number(ruw)
                    if (nr !== null && (!Number.isInteger(nr) || nr < 0 || nr > 99)) return
                    void review(actief, 'bevestig', undefined, undefined, { rugnummer: nr })
                  }}
                  title="Rugnummer intikken en met Enter bevestigen (leeg = wissen)"
                />
              </span>
              {/* Soort corrigeren: een als "worp" gedetecteerde vangst moet ook in de browser
                  omgezet kunnen worden — dat is precies de correctielus voor hertraining. */}
              <label className="va-cv-soort">
                soort:
                <select
                  value={actief.eventType}
                  disabled={bezigId != null}
                  onChange={(e) => void review(actief, 'bevestig', undefined, e.target.value as CvVoorstel['eventType'])}
                  title="Eventsoort corrigeren en bevestigen"
                >
                  <option value="worp">worp</option>
                  <option value="vangst">vangst</option>
                  <option value="doelpunt">doelpunt</option>
                  <option value="buitenspel">buitenspel</option>
                </select>
              </label>
            </div>
          </div>
        )}

        {fout && <p className="va-msg">{fout}</p>}

        <p className="va-cv-legende">
          Sneltoetsen: <kbd>j</kbd>/<kbd>k</kbd> volgend/vorig open voorstel · <kbd>Enter</kbd> bevestigen ·{' '}
          <kbd>x</kbd> afwijzen · <kbd>n</kbd>/<kbd>r</kbd> nek-/rugworp én bevestigen
          {onFrameStap ? (
            <>
              {' '}· <kbd>,</kbd>/<kbd>.</kbd> één frame terug/vooruit
            </>
          ) : null}
        </p>
      </div>
    </>
  )
}
