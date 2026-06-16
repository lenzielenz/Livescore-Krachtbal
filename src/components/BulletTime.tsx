'use client'

import { useEffect, useRef, useState } from 'react'

import './bullettime.css'

// Multi-angle "bullet-time": iedereen rond de actie legt tegelijk hetzelfde moment vast vanuit zijn
// eigen hoek; daarna speelt de app de foto's als één sweepende reeks af (heen en weer = boomerang).
// Drie fasen, gestuurd door één gedeeld tijdstip (`at`) zodat alle toestellen gelijk lopen:
//   count  → aftellen + ga rond de actie staan
//   capture→ grote knop om je foto te maken (jouw hoek)
//   sweep  → de verzamelde hoeken snel na elkaar = multi-angle replay

const CAPTURE_MS = 9000
const SWEEP_MS = 14000

async function resize(file: File, max = 1100, quality = 0.8): Promise<Blob> {
  const img = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Geen canvas')
  ctx.drawImage(img, 0, 0, w, h)
  return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('resize'))), 'image/jpeg', quality))
}

export function BulletTime({ matchId, at, canCapture, onDone }: { matchId: number; at: number; canCapture: boolean; onDone: () => void }) {
  const [phase, setPhase] = useState<'count' | 'capture' | 'sweep'>('count')
  const [secs, setSecs] = useState(0)
  const [busy, setBusy] = useState(false)
  const [shot, setShot] = useState(false)
  const [frames, setFrames] = useState<string[]>([])
  const [frameIdx, setFrameIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Fase-timing op basis van het gedeelde tijdstip.
  useEffect(() => {
    const tick = () => {
      const ms = at - Date.now()
      if (ms > 0) {
        setPhase('count')
        setSecs(Math.ceil(ms / 1000))
      } else if (Date.now() < at + CAPTURE_MS) {
        setPhase('capture')
      } else {
        setPhase('sweep')
      }
    }
    tick()
    const iv = setInterval(tick, 200)
    const done = setTimeout(onDone, Math.max(0, at - Date.now()) + CAPTURE_MS + SWEEP_MS)
    return () => {
      clearInterval(iv)
      clearTimeout(done)
    }
  }, [at, onDone])

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
        if (active) setFrames(urls.reverse()) // oudste → nieuwste voor een consistente sweep
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
      const blob = await resize(file)
      const fd = new FormData()
      fd.append('photo', new File([blob], 'angle.jpg', { type: 'image/jpeg' }))
      await fetch(`/api/match/${matchId}/instant`, { method: 'POST', body: fd })
      setShot(true)
    } catch {
      /* stilte */
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="bt" role="dialog" aria-label="Multi-angle" onClick={onDone}>
      {phase === 'count' && (
        <div className="bt-center" onClick={(e) => e.stopPropagation()}>
          <div className="bt-title">🎥 MULTI-ANGLE</div>
          <div key={secs} className="bt-count">{secs}</div>
          <div className="bt-sub">Ga met z&apos;n allen rond de actie staan — ieder zijn hoek!</div>
        </div>
      )}

      {phase === 'capture' && (
        <div className="bt-center" onClick={(e) => e.stopPropagation()}>
          <div className="bt-title bt-now">📸 NU — vanuit jouw hoek!</div>
          {canCapture ? (
            shot ? (
              <div className="bt-sub">Top! 📸 Wacht op de andere hoeken…</div>
            ) : (
              <button type="button" className="bt-snap" onClick={() => inputRef.current?.click()} disabled={busy}>
                {busy ? 'Bezig…' : 'Maak je foto'}
              </button>
            )
          ) : (
            <div className="bt-sub">
              <a href="/inloggen">Log in</a> om mee te doen aan de multi-angle.
            </div>
          )}
        </div>
      )}

      {phase === 'sweep' && (
        <div className="bt-sweep" onClick={(e) => e.stopPropagation()}>
          <div className="bt-title">🎥 MULTI-ANGLE REPLAY</div>
          {frames.length >= 2 ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="bt-frame" src={frames[frameIdx]} alt="Multi-angle" />
              <div className="bt-dots" aria-hidden>
                {frames.map((_, i) => (
                  <span key={i} className={i === frameIdx ? 'on' : ''} />
                ))}
              </div>
            </>
          ) : (
            <div className="bt-sub">Hoeken verzamelen…</div>
          )}
          <div className="bt-hint">Tik om te sluiten</div>
        </div>
      )}

      <input ref={inputRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void onFile(e.target.files?.[0] ?? null)} />
    </div>
  )
}
