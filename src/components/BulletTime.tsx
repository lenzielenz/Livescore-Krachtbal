'use client'

import { useEffect, useRef, useState } from 'react'

import { uploadInstant } from '@/lib/instant-upload'
import './bullettime.css'

// Multi-angle "bullet-time": iedereen rond de actie legt hetzelfde moment vast vanuit zijn eigen hoek;
// daarna speelt de app de foto's als één sweepende reeks af (heen en weer = boomerang).
//   count   → aftellen + uitleg, zodat iedereen weet wat er gebeurt en zich klaarzet
//   capture → één tik op het hele vlak opent meteen de camera (géén aparte sluiterknop)
//   sweep   → de verzamelde hoeken snel na elkaar = multi-angle replay
const CAPTURE_MS = 9000
const SWEEP_MS = 15000

export function BulletTime({
  matchId,
  at,
  canCapture,
  onDone,
}: {
  matchId: number
  at: number
  canCapture: boolean
  onDone: () => void
}) {
  const [phase, setPhase] = useState<'count' | 'capture' | 'sweep'>('count')
  const [secs, setSecs] = useState(0)
  const [busy, setBusy] = useState(false)
  const [shot, setShot] = useState(false)
  const [frames, setFrames] = useState<string[]>([])
  const [frameIdx, setFrameIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  // De terug-knop (Android) sluit de multi-angle i.p.v. weg te navigeren van de wedstrijdpagina.
  useEffect(() => {
    window.history.pushState({ overlay: 'bullettime' }, '')
    let viaPop = false
    const onPop = () => {
      viaPop = true
      onDoneRef.current()
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      if (!viaPop && window.history.state?.overlay === 'bullettime') window.history.back()
    }
  }, [])

  // Fase-timing op basis van het gedeelde tijdstip (alle toestellen lopen gelijk).
  useEffect(() => {
    const captureEnd = at + CAPTURE_MS
    const tick = () => {
      const ms = at - Date.now()
      if (ms > 0) {
        setPhase('count')
        setSecs(Math.ceil(ms / 1000))
      } else if (Date.now() < captureEnd) {
        setPhase('capture')
      } else {
        setPhase('sweep')
      }
    }
    tick()
    const iv = setInterval(tick, 200)
    const done = setTimeout(onDoneRef.current, Math.max(0, at - Date.now()) + CAPTURE_MS + SWEEP_MS)
    return () => {
      clearInterval(iv)
      clearTimeout(done)
    }
  }, [at])

  // Bij de sweep: haal de recentste foto's op (de zojuist gemaakte hoeken) en speel ze af.
  useEffect(() => {
    if (phase !== 'sweep') return
    let active = true
    void (async () => {
      try {
        const res = await fetch(`/api/match-instants?where[match][equals]=${matchId}&depth=0&limit=16&sort=-createdAt`, { credentials: 'include' })
        const data = (await res.json().catch(() => ({}))) as { docs?: { filename?: string; url?: string; expiresAt?: string }[] }
        const now = Date.now()
        const urls = (data.docs ?? [])
          .filter((d) => !d.expiresAt || new Date(d.expiresAt).getTime() > now)
          .map((d) => (d.filename ? `/api/match-instants/file/${encodeURIComponent(d.filename)}` : d.url ?? ''))
          .filter(Boolean)
        if (active) setFrames(urls.reverse())
      } catch {
        /* stilte */
      }
    })()
    return () => {
      active = false
    }
  }, [phase, matchId])

  // Sweep-animatie: heen en weer door de hoeken (boomerang) ~9 fps.
  useEffect(() => {
    if (phase !== 'sweep' || frames.length < 2) return
    let i = 0
    let dir = 1
    const iv = setInterval(() => {
      i += dir
      if (i >= frames.length - 1) dir = -1
      else if (i <= 0) dir = 1
      setFrameIdx(Math.max(0, Math.min(frames.length - 1, i)))
    }, 110)
    return () => clearInterval(iv)
  }, [phase, frames])

  const onFile = async (file: File | null) => {
    if (!file || busy) return
    setBusy(true)
    try {
      await uploadInstant(matchId, file)
      setShot(true)
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="bt" role="dialog" aria-label="Multi-angle" onClick={() => phase === 'sweep' && onDone()}>
      <div className="bt-lb bt-lb-top" aria-hidden />
      <div className="bt-lb bt-lb-bottom" aria-hidden />

      {phase === 'count' && (
        <div className="bt-center" onClick={(e) => e.stopPropagation()}>
          <div className="bt-kicker">🎬 MULTI-ANGLE</div>
          <div key={secs} className="bt-count">{secs}</div>
          <div className="bt-sub">Ga met z&apos;n allen rond de actie staan — straks leg je samen, ieder vanuit je eigen hoek, hetzelfde moment vast.</div>
        </div>
      )}

      {phase === 'capture' &&
        (canCapture ? (
          // Géén tussenstap: één tik op het hele vlak opent meteen de camera.
          <button type="button" className="bt-capture" onClick={() => inputRef.current?.click()} disabled={busy}>
            <span className="bt-corner tl" aria-hidden />
            <span className="bt-corner tr" aria-hidden />
            <span className="bt-corner bl" aria-hidden />
            <span className="bt-corner br" aria-hidden />
            <span className="bt-rec"><span className="bt-rec-dot" aria-hidden />REC · jouw hoek</span>
            <span className="bt-cap-cta">{busy ? '📸 …' : shot ? '✓ Vastgelegd — nog een hoek?' : '📸 NU — tik om je hoek vast te leggen'}</span>
            <span className="bt-cap-sub">de replay komt zo automatisch</span>
          </button>
        ) : (
          <div className="bt-center" onClick={(e) => e.stopPropagation()}>
            <div className="bt-kicker bt-now">📸 NU!</div>
            <div className="bt-sub"><a href="/inloggen">Log in</a> om mee te doen aan de multi-angle.</div>
          </div>
        ))}

      {phase === 'sweep' && (
        <div className="bt-sweep">
          {frames.length >= 2 ? (
            <>
              <div className="bt-stage">
                {frames.map((f, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} className={`bt-layer ${i === frameIdx ? 'on' : ''}`} src={f} alt="" draggable={false} />
                ))}
              </div>
              <div className="bt-hud bt-hud-tl"><span className="bt-rec-dot" aria-hidden /> MULTI-ANGLE</div>
              <div className="bt-hud bt-hud-tr">ANGLE {String(frameIdx + 1).padStart(2, '0')}/{String(frames.length).padStart(2, '0')}</div>
              <div className="bt-dots" aria-hidden>
                {frames.map((_, i) => (
                  <span key={i} className={i === frameIdx ? 'on' : ''} />
                ))}
              </div>
              <div className="bt-hint">Tik om te sluiten</div>
            </>
          ) : (
            <div className="bt-center">
              <div className="bt-kicker">🎬 MULTI-ANGLE</div>
              <div className="bt-spinner" aria-hidden />
              <div className="bt-sub">De hoeken verzamelen…</div>
            </div>
          )}
        </div>
      )}

      <input ref={inputRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void onFile(e.target.files?.[0] ?? null)} />
    </div>
  )
}
