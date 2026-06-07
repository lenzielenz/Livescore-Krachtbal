'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { FieldSchema, type FieldMarker } from '@/components/FieldSchema'
import { freeThrowNorm, goalLineNorm } from '@/lib/field'
import type { ShotPoint } from '@/lib/match-engine'

const OUTCOME_COLOR: Record<string, string> = {
  goal: '#06d6a0',
  caught: '#4cc9f0',
  out_side: '#ef476f',
  out_back: '#f78c6b',
  in_field: '#8fb3a1',
}
const OUTCOME_LABEL: Record<string, string> = {
  goal: 'doelpunt',
  caught: 'gevangen',
  out_side: 'buiten (zij)',
  out_back: 'buiten (achter)',
  in_field: 'in het veld',
}

// Animatie ("video") van het wedstrijdverloop: speelt de worpen chronologisch af, met de bal die
// over het veld reist langs elk traject. De volgorde van `shots` is al chronologisch (createdAt).
export function FlowReplay({
  shots,
  teams,
  goalAreaDepth = 10,
  matchLabel,
}: {
  shots: ShotPoint[]
  teams: { home: string; away: string }
  goalAreaDepth?: number
  /** Korte omschrijving van de wedstrijd (bv. "1ste Nationale Heren · 7 juni 2026"), wordt in de
   * gedownloade video en de bestandsnaam meegegeven zodat duidelijk is welke match het was. */
  matchLabel?: string
}) {
  const [playing, setPlaying] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [team, setTeam] = useState<'both' | 'home' | 'away'>('both')
  const [recording, setRecording] = useState(false)
  // Voortgang (0–100) + korte status-melding tijdens/na het opnemen, zodat zichtbaar is dat er iets
  // gebeurt (anders lijkt de knop niets te doen).
  const [recPct, setRecPct] = useState(0)
  const [recMsg, setRecMsg] = useState<string | null>(null)
  // Opgenomen video klaar om te bewaren: we downloaden NIET automatisch (dat gebeurt seconden na de
  // tik → buiten de gebruikersactie, wat mobiel blokkeert). De gebruiker tikt zelf "Bewaren".
  const [recReady, setRecReady] = useState<{ url: string; file: File; name: string } | null>(null)
  const lastTs = useRef(0)

  // Object-URL opruimen wanneer het klaar-venster sluit of de component verdwijnt.
  useEffect(() => {
    return () => {
      if (recReady) URL.revokeObjectURL(recReady.url)
    }
  }, [recReady])

  // Volledig genormaliseerde worpen: élk veld dat de replay gebruikt krijgt een veilige waarde,
  // zodat noch de weergave noch de opname ooit op een ontbrekend veld (bv. fromX) kan crashen.
  const safeShots = useMemo(() => {
    const num = (v: unknown, fb: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fb)
    return (Array.isArray(shots) ? shots : [])
      .filter((s) => s && Number.isFinite((s as ShotPoint).x) && Number.isFinite((s as ShotPoint).y))
      .map((s) => {
        const x = num(s.x, 0.5)
        const y = num(s.y, 0.5)
        return {
          ...s,
          x,
          y,
          fromX: num(s.fromX, x),
          fromY: num(s.fromY, y),
          outcome: typeof s.outcome === 'string' ? s.outcome : 'in_field',
          type: s.type === 'rug' ? 'rug' : 'nek',
          teamSide: s.teamSide === 'away' ? 'away' : 'home',
          throwNumber: num(s.throwNumber, 1),
          shirtNumber: num(s.shirtNumber, 0),
        } as ShotPoint
      })
  }, [shots])

  // Enkel de gekozen ploeg afspelen (thuis/uit) of allebei.
  const playShots = useMemo(
    () => (team === 'both' ? safeShots : safeShots.filter((s) => s.teamSide === team)),
    [safeShots, team],
  )

  const total = playShots.length
  const stepMs = 900 / speed
  const totalMs = total * stepMs

  // Bij het wisselen van ploeg (thuis/uit/beide): terug naar het begin, maar blíjf spelen als je
  // al aan het afspelen was — zo zie je meteen de replay van de gekozen ploeg.
  useEffect(() => {
    setElapsed(0)
  }, [playShots])

  useEffect(() => {
    if (!playing) return
    let raf = 0
    lastTs.current = performance.now()
    const tick = (t: number) => {
      const dt = t - lastTs.current
      lastTs.current = t
      setElapsed((e) => {
        const n = e + dt
        if (n >= totalMs) {
          setPlaying(false)
          return totalMs
        }
        return n
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, totalMs])

  const step = total ? Math.min(Math.floor(elapsed / stepMs), total) : 0
  const within = total ? (elapsed - step * stepMs) / stepMs : 0

  const { markers, current } = useMemo(() => {
    const ms: FieldMarker[] = playShots.slice(0, step).map((s) => ({
      x: s.x,
      y: s.y,
      fromX: s.fromX,
      fromY: s.fromY,
      color: OUTCOME_COLOR[s.outcome] ?? '#ffd166',
      r: s.outcome === 'goal' ? 7 : 5,
      label: String(s.throwNumber),
    }))
    let cur: ShotPoint | null = null
    const s = step < total ? playShots[step] : undefined
    if (s) {
      const tp = Math.min(1, within / 0.7) // eerste 70% = reizen, rest = even blijven hangen
      ms.push({
        x: s.fromX + (s.x - s.fromX) * tp,
        y: s.fromY + (s.y - s.fromY) * tp,
        fromX: s.fromX,
        fromY: s.fromY,
        color: '#ffd166',
        r: 7,
      })
      cur = s
    }
    return { markers: ms, current: cur }
  }, [playShots, step, within, total])

  const play = () => {
    if (elapsed >= totalMs) setElapsed(0)
    setPlaying(true)
  }

  // De replay naar een echt videobestand (webm) opnemen via een canvas + MediaRecorder, en
  // downloaden. Respecteert de thuis/uit-keuze. Niet elke browser ondersteunt dit (vooral iOS).
  const recordVideo = async () => {
    if (recording) return
    const list = playShots
    if (list.length === 0) return
    const MR = (globalThis as { MediaRecorder?: typeof MediaRecorder }).MediaRecorder
    // webm eerst: dat neemt op élk Chrome-toestel (ook Android) betrouwbaar op. mp4 enkel als
    // terugval (recente desktop-Chrome) want mp4-opname wordt op de meeste telefoons niet ondersteund.
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find(
      (m) => MR?.isTypeSupported?.(m),
    )
    if (!MR || !mime) {
      setRecMsg('⚠️ Video opnemen wordt niet ondersteund in deze browser. Probeer Chrome.')
      setTimeout(() => setRecMsg(null), 4000)
      return
    }
    const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm'

    const d = goalAreaDepth
    const FW = 320
    const PAD = 16
    // Extra kopruimte als er een wedstrijd-omschrijving is (reeks · datum) onder de ploegnamen.
    const HEAD = matchLabel ? 74 : 54
    const fieldH = (FW * (26 + 2 * d)) / 14
    const cw = FW + 2 * PAD
    const chh = HEAD + fieldH + 2 * PAD
    const x0 = PAD
    const y0 = PAD + HEAD
    const mx = (xn: number) => x0 + xn * FW
    const my = (yn: number) => y0 + yn * fieldH

    const canvas = document.createElement('canvas')
    canvas.width = cw
    canvas.height = chh
    // In de DOM (buiten beeld) zodat de browser het canvas effectief tekent → captureStream
    // krijgt echte frames (een los canvas levert soms een lege/onspeelbare video op).
    canvas.style.cssText = 'position:fixed;left:-100000px;top:0;pointer-events:none;opacity:0.01'
    document.body.appendChild(canvas)
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      canvas.remove()
      return
    }

    const seg = (a: number, b: number, c: number, e: number) => {
      ctx.beginPath()
      ctx.moveTo(a, b)
      ctx.lineTo(c, e)
      ctx.stroke()
    }
    const drawField = () => {
      ctx.fillStyle = '#0e3a28'
      ctx.fillRect(x0, y0, FW, fieldH)
      ctx.strokeStyle = '#e8f5ee'
      ctx.lineWidth = 2
      ctx.strokeRect(x0, y0, FW, fieldH)
      const gl = goalLineNorm(d)
      const ft = freeThrowNorm(d)
      ctx.lineWidth = 1.5
      seg(x0, y0 + gl * fieldH, x0 + FW, y0 + gl * fieldH)
      seg(x0, y0 + (1 - gl) * fieldH, x0 + FW, y0 + (1 - gl) * fieldH)
      ctx.lineWidth = 1
      seg(x0, y0 + ft * fieldH, x0 + FW, y0 + ft * fieldH)
      seg(x0, y0 + (1 - ft) * fieldH, x0 + FW, y0 + (1 - ft) * fieldH)
      ctx.setLineDash([4, 4])
      seg(x0, y0 + 0.5 * fieldH, x0 + FW, y0 + 0.5 * fieldH)
      ctx.setLineDash([])
    }
    const drawShot = (s: ShotPoint | undefined, prog: number) => {
      if (!s) return
      const col = OUTCOME_COLOR[s.outcome] ?? '#ffd166'
      const fx = mx(s.fromX)
      const fy = my(s.fromY)
      const tx = mx(s.fromX + (s.x - s.fromX) * prog)
      const ty = my(s.fromY + (s.y - s.fromY) * prog)
      ctx.strokeStyle = col
      ctx.lineWidth = 2
      ctx.globalAlpha = 0.8
      seg(fx, fy, tx, ty)
      ctx.globalAlpha = 1
      ctx.fillStyle = col
      ctx.beginPath()
      ctx.arc(fx, fy, 2.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(tx, ty, prog >= 1 ? 7 : 6, 0, Math.PI * 2)
      ctx.fill()
      if (prog >= 1) {
        ctx.fillStyle = '#06140d'
        ctx.font = 'bold 9px system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(s.throwNumber), tx, ty)
        ctx.textBaseline = 'alphabetic'
      }
    }
    // Vaste, vlottere stap voor de opname (sneller dan de live-replay) zodat de video niet
    // tientallen seconden duurt en op telefoons betrouwbaar wegschrijft.
    const rstep = 360
    const drawFrame = (ms: number) => {
      const st = Math.min(Math.floor(ms / rstep), list.length)
      const wi = (ms - st * rstep) / rstep
      const scoredN = st + (st < list.length && wi >= 0.7 ? 1 : 0)
      let h = 0
      let a = 0
      for (const s of list.slice(0, scoredN)) {
        if (s.outcome !== 'goal') continue
        const pts = s.type === 'rug' ? 2 : 1
        if (s.teamSide === 'home') h += pts
        else a += pts
      }
      ctx.fillStyle = '#06140d'
      ctx.fillRect(0, 0, cw, chh)
      ctx.textAlign = 'center'
      ctx.fillStyle = '#e8f5ee'
      ctx.font = 'bold 20px system-ui, sans-serif'
      ctx.fillText(`${h} – ${a}`, cw / 2, 28)
      ctx.fillStyle = '#9fb6aa'
      ctx.font = '12px system-ui, sans-serif'
      ctx.fillText(`${teams.home}   vs   ${teams.away}`, cw / 2, 46)
      // Welke wedstrijd het was (reeks · datum), zodat de video op zichzelf duidelijk is.
      if (matchLabel) {
        ctx.fillStyle = '#7c948a'
        ctx.font = '10px system-ui, sans-serif'
        ctx.fillText(matchLabel, cw / 2, 63)
      }
      drawField()
      for (let i = 0; i < st; i++) drawShot(list[i], 1)
      if (st < list.length) drawShot(list[st], Math.min(1, wi / 0.7))
    }

    setRecording(true)
    setRecPct(0)
    setRecMsg(null)
    setPlaying(false)
    try {
      drawFrame(0) // eerste frame klaarzetten vóór de opname start
      // Auto-capture op vaste fps (geen requestFrame): het mengen van beide modi liet op sommige
      // toestellen een lege/onspeelbare video achter.
      const stream = (canvas as HTMLCanvasElement & { captureStream(fps?: number): MediaStream }).captureStream(25)
      const rec = new MR(stream, { mimeType: mime })
      const chunks: BlobPart[] = []
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data)
      }
      const stopped = new Promise<void>((res) => {
        rec.onstop = () => res()
      })

      rec.start(100) // vaak chunks flushen → geldige, afspeelbare video
      const totalDur = list.length * rstep
      const HOLD = 1400
      const start = performance.now()
      await new Promise<void>((resolve) => {
        const frame = (t: number) => {
          const el = t - start
          drawFrame(Math.min(el, totalDur))
          setRecPct(Math.min(100, Math.round((el / totalDur) * 100)))
          if (el < totalDur + HOLD) requestAnimationFrame(frame)
          else resolve()
        }
        requestAnimationFrame(frame)
      })
      setRecPct(100)
      rec.requestData?.() // laatste frames flushen vóór stop
      rec.stop()
      await stopped
      const blob = new Blob(chunks, { type: mime })
      if (blob.size === 0) {
        setRecMsg('⚠️ Opname mislukt — probeer het opnieuw (werkt het best in Chrome).')
        setTimeout(() => setRecMsg(null), 4500)
        return
      }
      // Bestandsnaam met de ploegen (en evt. reeks/datum) zodat meteen duidelijk is welke match het is.
      const slug = (s: string) => s.normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase()
      const parts = ['krachtbal', slug(teams.home), 'vs', slug(teams.away), matchLabel ? slug(matchLabel) : ''].filter(Boolean)
      const name = `${parts.join('-')}.${ext}`
      // Klaarzetten: de gebruiker tikt zelf "Bewaren" (verse gebruikersactie → werkt mobiel betrouwbaar).
      setRecReady({ url: URL.createObjectURL(blob), file: new File([blob], name, { type: mime }), name })
    } catch (err) {
      console.error('video record failed:', err)
      setRecMsg('⚠️ Video opnemen lukte niet op dit toestel. Tip: het werkt het best in Chrome.')
      setTimeout(() => setRecMsg(null), 4500)
    } finally {
      canvas.remove()
      setRecording(false)
    }
  }

  // De opgenomen video bewaren — door de gebruiker zélf getikt (verse gebruikersactie). Op mobiel
  // gebruiken we het deel-/bewaarvenster van het toestel (opslaan in Galerij/Bestanden of delen);
  // anders een gewone download. Lukt geen van beide → openen in een nieuw tabblad als terugval.
  const saveVideo = async () => {
    if (!recReady) return
    const nav = navigator as Navigator & {
      canShare?: (data?: { files?: File[] }) => boolean
      share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>
    }
    try {
      if (nav.share && nav.canShare?.({ files: [recReady.file] })) {
        await nav.share({ files: [recReady.file], title: 'Krachtbal', text: matchLabel ?? 'Krachtbal' })
        return
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return // gebruiker annuleerde → niets doen
      // anders verder naar de download-terugval
    }
    const link = document.createElement('a')
    link.href = recReady.url
    link.download = recReady.name
    document.body.appendChild(link)
    link.click()
    setTimeout(() => link.remove(), 1000)
  }

  const closeReady = () => {
    if (recReady) URL.revokeObjectURL(recReady.url)
    setRecReady(null)
  }

  // Live stand: tel de doelpunten tot nu (de huidige worp telt pas mee zodra de bal geland is).
  const score = useMemo(() => {
    const scoredN = step + (current && within >= 0.7 ? 1 : 0)
    let h = 0
    let a = 0
    for (const s of playShots.slice(0, scoredN)) {
      if (s.outcome !== 'goal') continue
      const pts = s.type === 'rug' ? 2 : 1
      if (s.teamSide === 'home') h += pts
      else a += pts
    }
    return { h, a }
  }, [playShots, step, within, current])

  if (safeShots.length === 0) {
    return <p className="empty">Geen worpen in deze selectie om af te spelen.</p>
  }

  const shown = current ? step + 1 : step
  return (
    <div className="replay">
      <div className="replay-score">
        <span className="rs-team">{teams.home}</span>
        <span className="rs-num side-home">{score.h}</span>
        <span className="rs-dash">–</span>
        <span className="rs-num side-away">{score.a}</span>
        <span className="rs-team">{teams.away}</span>
      </div>
      {/* Toon beide ploegen, of speel enkel thuis / enkel uit af. */}
      <div className="shotmap-controls replay-teams">
        <button type="button" className={team === 'both' ? 'on' : ''} onClick={() => { setTeam('both'); setElapsed(0); setPlaying(true) }}>Beide</button>
        <button type="button" className={`side-home ${team === 'home' ? 'on' : ''}`} onClick={() => { setTeam('home'); setElapsed(0); setPlaying(true) }}>🏠 {teams.home}</button>
        <button type="button" className={`side-away ${team === 'away' ? 'on' : ''}`} onClick={() => { setTeam('away'); setElapsed(0); setPlaying(true) }}>🚌 {teams.away}</button>
      </div>
      <div className="shotmap-controls replay-controls">
        <button type="button" className="replay-play" onClick={() => (playing ? setPlaying(false) : play())} disabled={total === 0}>
          {playing ? '⏸ Pauze' : elapsed >= totalMs ? '↻ Opnieuw' : '▶ Speel af'}
        </button>
        <button type="button" className={speed === 1 ? 'on' : ''} onClick={() => setSpeed(1)}>1×</button>
        <button type="button" className={speed === 2 ? 'on' : ''} onClick={() => setSpeed(2)}>2×</button>
        <button type="button" className="replay-dl" onClick={recordVideo} disabled={recording || total === 0}>
          {recording ? `⏺ Opnemen… ${recPct}%` : '⬇ Download'}
        </button>
      </div>
      <input
        className="replay-scrub"
        type="range"
        min={0}
        max={Math.max(1, Math.round(totalMs))}
        value={Math.round(elapsed)}
        onChange={(e) => {
          setPlaying(false)
          setElapsed(Number(e.target.value))
        }}
        aria-label="Tijdlijn"
      />
      <FieldSchema className="shotmap-field" markers={markers} goalAreaDepthM={goalAreaDepth} />
      {total === 0 && <p className="sb-dim" style={{ textAlign: 'center' }}>Geen worpen van deze ploeg.</p>}
      <div className="replay-status">
        <span className="replay-step">worp {shown}/{total}</span>
        {current && (
          <span className="replay-info">
            #{current.shirtNumber} · {current.type === 'rug' ? 'rugworp (+2)' : 'nekworp (+1)'} ·{' '}
            <span style={{ color: OUTCOME_COLOR[current.outcome] }}>{OUTCOME_LABEL[current.outcome] ?? current.outcome}</span>
          </span>
        )}
        {!current && elapsed >= totalMs && <span className="replay-info">Einde — {total} worpen afgespeeld.</span>}
      </div>
      {/* Duidelijke voortgang/melding tijdens en na het opnemen (anders lijkt er niets te gebeuren). */}
      {(recording || recMsg || recReady) &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="replay-rec-ov" role="status" aria-live="polite" onClick={recReady ? closeReady : undefined}>
            <div className="replay-rec-card" onClick={(e) => e.stopPropagation()}>
              {recording ? (
                <>
                  <p className="replay-rec-title">🎥 Video opnemen… {recPct}%</p>
                  <div className="replay-rec-bar"><span style={{ width: `${recPct}%` }} /></div>
                  <p className="replay-rec-tip">Even geduld en blijf op deze pagina.</p>
                </>
              ) : recReady ? (
                <>
                  <p className="replay-rec-title">✅ Je video is klaar</p>
                  <p className="replay-rec-tip">Tik op bewaren om ze op te slaan of te delen.</p>
                  <div className="replay-rec-actions">
                    <button type="button" className="replay-rec-save" onClick={saveVideo}>📥 Video bewaren</button>
                    <button type="button" className="replay-rec-close" onClick={closeReady}>Sluiten</button>
                  </div>
                  <a className="replay-rec-alt" href={recReady.url} target="_blank" rel="noopener noreferrer">
                    Lukt het niet? Open de video in een nieuw tabblad
                  </a>
                </>
              ) : (
                <p className="replay-rec-title">{recMsg}</p>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
