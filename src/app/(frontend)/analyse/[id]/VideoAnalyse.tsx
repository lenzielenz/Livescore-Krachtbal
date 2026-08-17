'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  activeMomentIndex,
  fmtVideoTime,
  momentToVideo,
  parseVideoSource,
  youtubeEmbedAt,
  type VideoSync,
} from '@/lib/video-sync'

export interface VideoMoment {
  half: number
  gameClock: number
  side: 'home' | 'away'
  /** Korte omschrijving, bv. "12 Jens · rugworp". */
  label: string
  /** Punten van het doelpunt (voor de +1/+2-pil). */
  points?: number
}

// ── Video-analyse: de opname naast de wedstrijdmomenten ───────────────────────────────────────
// Klik een doelpunt → de video springt naar dat beeld. Bij een echt videobestand kan dat exact
// (currentTime) en loopt de lijst mee met het beeld; YouTube laat enkel een herstart op een
// bepaalde seconde toe, dus daar herlaadt de speler bij elke sprong.
export function VideoAnalyse({
  matchId,
  initialUrl,
  initialOffsetH1,
  initialOffsetH2,
  moments,
  halfSeconds,
  teams,
  canEdit,
}: {
  matchId: number
  initialUrl: string | null
  initialOffsetH1: number | null
  initialOffsetH2: number | null
  moments: VideoMoment[]
  halfSeconds: number
  teams: { home: string; away: string }
  canEdit: boolean
}) {
  const [url, setUrl] = useState(initialUrl ?? '')
  const [draftUrl, setDraftUrl] = useState(initialUrl ?? '')
  const [sync, setSync] = useState<VideoSync>({ offsetH1: initialOffsetH1 ?? 0, offsetH2: initialOffsetH2 })
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Waar de video nu staat. Bij een bestand leest de speler dit zelf uit; bij YouTube weten we
  // enkel waar we laatst naartoe sprongen (de iframe vertelt zijn positie niet).
  const [pos, setPos] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  // Herlaad-sleutel voor de YouTube-iframe: bij elke sprong een nieuwe waarde → nieuwe start.
  const [ytSeek, setYtSeek] = useState(0)

  const source = useMemo(() => parseVideoSource(url), [url])
  const isFile = source?.kind === 'file'

  const save = useCallback(
    async (patch: Record<string, unknown>, okMsg: string) => {
      setBusy(true)
      setMsg(null)
      try {
        const res = await fetch(`/api/match/${matchId}/video`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(patch),
        })
        const data = (await res.json()) as { error?: string }
        if (!res.ok) throw new Error(data.error ?? 'Bewaren mislukt.')
        setMsg(okMsg)
        return true
      } catch (e) {
        setMsg((e as Error).message)
        return false
      } finally {
        setBusy(false)
      }
    },
    [matchId],
  )

  /** Spring naar een videopositie (exact bij een bestand, herstart bij YouTube). */
  const seek = useCallback(
    (seconds: number) => {
      const t = Math.max(0, seconds)
      setPos(t)
      if (isFile && videoRef.current) {
        videoRef.current.currentTime = t
        void videoRef.current.play().catch(() => {})
      } else {
        setYtSeek((n) => n + 1)
      }
    },
    [isFile],
  )

  const jumpTo = useCallback(
    (m: VideoMoment) => seek(momentToVideo(m, sync, halfSeconds)),
    [seek, sync, halfSeconds],
  )

  /** IJk: "de video staat nu precies op de aftrap van deze helft". */
  const calibrate = async (half: 1 | 2) => {
    const at = Math.round(isFile ? (videoRef.current?.currentTime ?? pos) : pos)
    const key = half === 1 ? 'videoOffsetH1' : 'videoOffsetH2'
    const ok = await save({ [key]: at }, `Aftrap ${half}e helft geijkt op ${fmtVideoTime(at)}.`)
    if (ok) setSync((s) => (half === 1 ? { ...s, offsetH1: at } : { ...s, offsetH2: at }))
  }

  const saveUrl = async () => {
    const next = draftUrl.trim()
    const ok = await save({ videoUrl: next }, next ? 'Video gekoppeld.' : 'Video losgekoppeld.')
    if (ok) setUrl(next)
  }

  // Sneltoetsen bij een videobestand: ←/→ 5 s, spatie speel/pauze. Niet wanneer je in een veld typt.
  useEffect(() => {
    if (!isFile) return
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return
      const v = videoRef.current
      if (!v) return
      if (e.key === 'ArrowLeft') { e.preventDefault(); v.currentTime = Math.max(0, v.currentTime - 5) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); v.currentTime = v.currentTime + 5 }
      else if (e.key === ' ') { e.preventDefault(); if (v.paused) void v.play().catch(() => {}); else v.pause() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isFile])

  // Welk moment is nu in beeld? Enkel zinvol als we de positie echt kennen (videobestand).
  const activeIdx = isFile ? activeMomentIndex(moments, pos, sync, halfSeconds) : -1

  if (!canEdit && !source) return null

  return (
    <section className="an-card va">
      <h2 className="an-h2">🎥 Video-analyse</h2>

      {canEdit && (
        <div className="va-setup">
          <input
            className="va-url"
            type="url"
            inputMode="url"
            placeholder="YouTube-link of https://…/wedstrijd.mp4"
            value={draftUrl}
            onChange={(e) => setDraftUrl(e.target.value)}
            aria-label="Video-URL"
          />
          <button type="button" className="va-btn" onClick={() => void saveUrl()} disabled={busy || draftUrl.trim() === url.trim()}>
            {url ? 'Bijwerken' : 'Koppelen'}
          </button>
        </div>
      )}

      {!source ? (
        <p className="va-hint">
          Koppel de opname van de wedstrijd. Daarna springt elk doelpunt hieronder rechtstreeks naar het juiste beeld.
        </p>
      ) : source.kind === 'link' ? (
        <p className="va-hint">
          Deze host laat insluiten niet toe.{' '}
          <a href={source.href} target="_blank" rel="noopener noreferrer">Open de video in een nieuw tabblad →</a>{' '}
          Gebruik een YouTube-link of een direct .mp4-bestand om hem hier te kunnen koppelen.
        </p>
      ) : (
        <>
          <div className="va-player">
            {source.kind === 'file' ? (
              <video
                ref={videoRef}
                className="va-video"
                src={source.src}
                controls
                playsInline
                preload="metadata"
                onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
              />
            ) : (
              <iframe
                key={ytSeek}
                className="va-video"
                src={youtubeEmbedAt(source.id, pos)}
                title="Wedstrijdvideo"
                allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            )}
          </div>

          <div className="va-bar">
            <span className="va-pos">
              {isFile ? `⏱ ${fmtVideoTime(pos)}` : `⏱ sprong naar ${fmtVideoTime(pos)}`}
            </span>
            {canEdit && (
              <span className="va-cal">
                <button type="button" className="va-btn small" onClick={() => void calibrate(1)} disabled={busy} title="De video staat nu op de aftrap van de 1e helft">
                  IJk H1 hier
                </button>
                <button type="button" className="va-btn small" onClick={() => void calibrate(2)} disabled={busy} title="De video staat nu op de aftrap van de 2e helft">
                  IJk H2 hier
                </button>
              </span>
            )}
            <span className="va-synced">
              H1 {fmtVideoTime(sync.offsetH1)} · H2 {sync.offsetH2 == null ? 'geschat' : fmtVideoTime(sync.offsetH2)}
            </span>
          </div>

          {!isFile && (
            <p className="va-hint va-hint-sm">
              YouTube herstart bij elke sprong en meldt zijn positie niet — de lijst loopt dus niet mee.
              Een direct .mp4-bestand springt vloeiend én markeert het moment dat je bekijkt.
            </p>
          )}
        </>
      )}

      {msg && <p className="va-msg">{msg}</p>}

      {moments.length === 0 ? (
        <p className="va-hint">Nog geen doelpunten om naar te springen.</p>
      ) : (
        <ol className="va-moments">
          {moments.map((m, i) => (
            <li key={`${m.half}-${m.gameClock}-${i}`}>
              <button
                type="button"
                className={`va-moment side-${m.side}${i === activeIdx ? ' on' : ''}`}
                onClick={() => jumpTo(m)}
                disabled={!source || source.kind === 'link'}
              >
                <span className="va-moment-t">H{m.half} {fmtVideoTime(m.gameClock)}</span>
                <span className="va-moment-team">{m.side === 'home' ? teams.home : teams.away}</span>
                <span className="va-moment-lbl">{m.label}</span>
                {m.points ? <span className="va-moment-pts">+{m.points}</span> : null}
                <span className="va-moment-go" aria-hidden>▶</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
