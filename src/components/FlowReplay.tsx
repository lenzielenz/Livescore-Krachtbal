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
  // Filters die óók in de video tellen: welke worp (alle/1e/2e/3e) en enkel doelpunten.
  const [order, setOrder] = useState<'all' | 'first' | 'second' | 'third'>('all')
  const [goalsOnly, setGoalsOnly] = useState(false)
  // "Net veld": telkens een aanval scoort, verdwijnen de getekende lijnen en gaat het verder, zodat
  // het veld niet volloopt met lijnen.
  const [clearOnGoal, setClearOnGoal] = useState(false)
  const [recording, setRecording] = useState(false)
  // Voortgang (0–100) + korte status-melding tijdens/na het opnemen, zodat zichtbaar is dat er iets
  // gebeurt (anders lijkt de knop niets te doen).
  const [recPct, setRecPct] = useState(0)
  const [recMsg, setRecMsg] = useState<string | null>(null)
  // Opgenomen video klaar om te bewaren: we downloaden NIET automatisch (dat gebeurt seconden na de
  // tik → buiten de gebruikersactie, wat mobiel blokkeert). De gebruiker tikt zelf "Bewaren".
  const [recReady, setRecReady] = useState<{ url: string; file: File; name: string } | null>(null)
  // "Naar mijn telefoon": de clip naar de server sturen en een gewone link + QR tonen. Een echte
  // URL openen/bewaren werkt mobiel veel betrouwbaarder dan een blob-download (vooral op iOS).
  const [phoneBusy, setPhoneBusy] = useState(false)
  const [phoneShare, setPhoneShare] = useState<{ url: string; qr: string } | null>(null)
  // Eén keer uploaden, daarna hergebruiken voor download/QR (niet bij elke tik opnieuw versturen).
  const uploadedUrl = useRef<string | null>(null)
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

  // Ploeg-, worp- en doelpunt-filter — gelden zowel voor het afspelen als voor de opname.
  const playShots = useMemo(() => {
    return safeShots.filter((s) => {
      if (team !== 'both' && s.teamSide !== team) return false
      if (order === 'first' && s.throwNumber !== 1) return false
      if (order === 'second' && s.throwNumber !== 2) return false
      if (order === 'third' && s.throwNumber < 3) return false
      if (goalsOnly && s.outcome !== 'goal') return false
      return true
    })
  }, [safeShots, team, order, goalsOnly])

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

  // "Net veld": toon enkel de worpen sinds het laatste (reeds gepasseerde) doelpunt, zodat het veld
  // na elke score leegloopt en de volgende aanval helder opnieuw begint.
  const trailStart = useMemo(() => {
    if (!clearOnGoal) return 0
    let start = 0
    for (let i = 0; i < step; i++) if (playShots[i]?.outcome === 'goal') start = i + 1
    return start
  }, [clearOnGoal, playShots, step])

  const { markers, current } = useMemo(() => {
    const ms: FieldMarker[] = playShots.slice(trailStart, step).map((s) => ({
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
  }, [playShots, step, within, total, trailStart])

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
    if (!MR) {
      setRecMsg('⚠️ Video opnemen kan niet in deze browser. Werk je iPhone/iPad bij naar een recente iOS-versie, of maak de video op een ander toestel — downloaden kan daarna via de link/QR.')
      setTimeout(() => setRecMsg(null), 6000)
      return
    }
    // mp4 (H.264) eerst: dat kan je wél via WhatsApp/sociale media doorsturen (webm wordt daar niet
    // ondersteund). isTypeSupported liegt op sommige Android-toestellen (zegt mp4 ondersteund, maar
    // de recorder faalt dan), dus we PROBEREN elk type bij het aanmaken en vallen terug op webm.
    const mimeCandidates = [
      'video/mp4;codecs=avc1.42E01E',
      'video/mp4;codecs=h264',
      'video/mp4',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ].filter((m) => MR.isTypeSupported?.(m))

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
    // ZICHTBAAR in beeld (gecentreerd, achter de voortgang-overlay): sommige (Android-)browsers
    // tekenen een onzichtbaar/offscreen canvas niet, waardoor captureStream een lege video oplevert.
    // De fullscreen voortgang-overlay (hogere z-index) bedekt het, dus de gebruiker ziet enkel de balk.
    canvas.style.cssText =
      'position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:145;width:200px;height:auto;border-radius:8px;pointer-events:none'
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
      const glTop = y0 + gl * fieldH
      const glBot = y0 + (1 - gl) * fieldH
      const tickX = Math.min(PAD - 2, 12) // streepje buiten de zijlijn (binnen de marge)
      ctx.lineWidth = 1.5
      seg(x0, glTop, x0 + FW, glTop)
      seg(x0, glBot, x0 + FW, glBot)
      // Doellijn steekt aan beide zijlijnen een eindje buiten het veld (4 streepjes in totaal).
      seg(x0 - tickX, glTop, x0, glTop)
      seg(x0 + FW, glTop, x0 + FW + tickX, glTop)
      seg(x0 - tickX, glBot, x0, glBot)
      seg(x0 + FW, glBot, x0 + FW + tickX, glBot)
      ctx.lineWidth = 1
      seg(x0, y0 + ft * fieldH, x0 + FW, y0 + ft * fieldH)
      seg(x0, y0 + (1 - ft) * fieldH, x0 + FW, y0 + (1 - ft) * fieldH)
      // Middellijn — volle lijn (zoals op het officiële terrein).
      ctx.lineWidth = 1.5
      seg(x0, y0 + 0.5 * fieldH, x0 + FW, y0 + 0.5 * fieldH)
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
    // Opname-stap volgt de gekozen afspeelsnelheid (sneller = kortere video). Basis 360 ms/worp.
    const rstep = 360 / speed
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
      // "Net veld": enkel de worpen sinds het laatste reeds-gescoorde doelpunt tekenen.
      let from = 0
      if (clearOnGoal) for (let i = 0; i < st; i++) if (list[i]?.outcome === 'goal') from = i + 1
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
      for (let i = from; i < st; i++) drawShot(list[i], 1)
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
      const cap = canvas as HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream }
      if (typeof cap.captureStream !== 'function') {
        // Typisch een in-app browser (WhatsApp/Facebook) — daar ontbreekt canvas-opname.
        setRecMsg('⚠️ Dit venster kan geen video opnemen. Open de site rechtstreeks in Chrome (niet via een app) en probeer opnieuw.')
        setTimeout(() => setRecMsg(null), 6000)
        return
      }
      // Probeer meerdere types mét een korte proefopname. Sommige Android-toestellen zeggen dat
      // mp4 ondersteund is en laten de recorder ook aanmaken/starten — maar de encoder sterft
      // meteen daarna (state wordt 'inactive', "InvalidStateError" bij requestData). Dat merk je
      // alleen at runtime, dus: per kandidaat ±0,5 s proefdraaien en pas écht opnemen met een
      // type dat aantoonbaar blijft leven.
      const stream = cap.captureStream!(25)
      const probeer = async (): Promise<{ rec: MediaRecorder; mime: string } | null> => {
        const kandidaten: (string | undefined)[] = [...mimeCandidates, undefined]
        for (const m of kandidaten) {
          let test: MediaRecorder
          try {
            test = m ? new MR(stream, { mimeType: m }) : new MR(stream)
            test.start(100)
          } catch {
            continue
          }
          await new Promise((r) => setTimeout(r, 450))
          const leeft = test.state === 'recording'
          try {
            if (test.state !== 'inactive') test.stop()
          } catch {
            /* proefrecorder opruimen is best-effort */
          }
          if (!leeft) continue
          try {
            const echte = m ? new MR(stream, { mimeType: m }) : new MR(stream)
            return { rec: echte, mime: m ?? (echte.mimeType || 'video/webm') }
          } catch {
            continue
          }
        }
        return null
      }
      const made = await probeer()
      if (!made) {
        setRecMsg('⚠️ Dit toestel weigert de video-opname te starten. Probeer het in Chrome (rechtstreeks, niet via een app) — of maak de video op een pc en haal ze met de QR binnen op je gsm.')
        setTimeout(() => setRecMsg(null), 7000)
        return
      }
      const { rec, mime } = made
      const ext = mime.includes('mp4') ? 'mp4' : 'webm'
      const chunks: BlobPart[] = []
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data)
      }
      // Wacht op onstop, maar niet eindeloos: op sommige toestellen vuurt onstop niet betrouwbaar,
      // waardoor de opname op 100% bleef hangen. Na 3 s gaan we verder met wat we hebben.
      const stopped = new Promise<void>((res) => {
        let done = false
        const finish = () => {
          if (done) return
          done = true
          res()
        }
        rec.onstop = finish
        setTimeout(finish, 3000)
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
      // Afronden met staat-checks: een recorder die onderweg stierf ('inactive') mag de boel
      // niet meer laten crashen — dan tonen we gewoon de "opname mislukt"-melding hieronder.
      try {
        if (rec.state === 'recording') rec.requestData?.() // laatste frames flushen vóór stop
      } catch {
        /* best-effort */
      }
      try {
        if (rec.state !== 'inactive') rec.stop()
      } catch {
        /* al gestopt */
      }
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
      // Toon de technische oorzaak mee: zo weten we bij een melding meteen wat er op dat toestel
      // misliep (en kan de gebruiker een screenshot doorsturen).
      const e = err as Error
      const detail = [e?.name, e?.message].filter(Boolean).join(': ')
      setRecMsg(`⚠️ Opnemen lukte niet${detail ? ` (${detail})` : ''}. Probeer opnieuw in Chrome (rechtstreeks, niet via een app) — of maak de video op een pc en scan de QR met je gsm.`)
      setTimeout(() => setRecMsg(null), 8000)
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

  // Upload de clip één keer naar de server en geef de absolute URL terug (gecachet).
  const uploadClip = async (): Promise<string | null> => {
    if (!recReady) return null
    if (uploadedUrl.current) return uploadedUrl.current
    const res = await fetch('/api/clip', {
      method: 'POST',
      headers: { 'Content-Type': recReady.file.type || 'video/mp4' },
      body: recReady.file,
    })
    const data = (await res.json()) as { url?: string; error?: string }
    if (!res.ok || !data.url) throw new Error(data.error ?? 'Uploaden mislukt.')
    uploadedUrl.current = new URL(data.url, window.location.origin).href
    return uploadedUrl.current
  }

  // Echte bestandsdownload-URL (Content-Disposition: attachment): Android zet de video meteen in
  // Downloads, iOS Safari toont de downloadmanager — dé betrouwbare weg op een gsm.
  const downloadUrl = (base: string) => `${base}?download=1&name=${encodeURIComponent(recReady?.name ?? 'krachtbal-replay')}`

  // Eén tik: upload (indien nodig) en haal de video als echt bestand binnen op DIT toestel.
  const downloadOnDevice = async () => {
    if (!recReady || phoneBusy) return
    setPhoneBusy(true)
    setRecMsg(null)
    try {
      const base = await uploadClip()
      if (!base) return
      const link = document.createElement('a')
      link.href = downloadUrl(base)
      document.body.appendChild(link)
      link.click()
      setTimeout(() => link.remove(), 1000)
    } catch (err) {
      console.error('clip download failed:', err)
      setRecMsg('⚠️ Downloaden lukte niet. Probeer "Link & QR" of "Bewaren / delen".')
      setTimeout(() => setRecMsg(null), 4500)
    } finally {
      setPhoneBusy(false)
    }
  }

  // Link + QR tonen: open/bewaar de video op dit toestel of scan de QR met een ander toestel.
  const sendToPhone = async () => {
    if (!recReady || phoneBusy) return
    setPhoneBusy(true)
    setRecMsg(null)
    try {
      const abs = await uploadClip()
      if (!abs) return
      const QRCode = (await import('qrcode')).default
      const qr = await QRCode.toDataURL(abs, { margin: 1, width: 240 })
      setPhoneShare({ url: abs, qr })
    } catch (err) {
      console.error('clip upload failed:', err)
      setRecMsg('⚠️ Naar de telefoon sturen lukte niet. Probeer het opnieuw.')
      setTimeout(() => setRecMsg(null), 4500)
    } finally {
      setPhoneBusy(false)
    }
  }

  const closeReady = () => {
    if (recReady) URL.revokeObjectURL(recReady.url)
    setRecReady(null)
    setPhoneShare(null)
    uploadedUrl.current = null
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
      {/* Welke worpen tonen (alle/1e/2e/3e) + enkel doelpunten — geldt ook voor de download. */}
      <div className="shotmap-controls replay-filters">
        {([['all', 'Alle'], ['first', '1e worp'], ['second', '2e worp'], ['third', '3e worp']] as const).map(([v, lbl]) => (
          <button key={v} type="button" className={order === v ? 'on' : ''} onClick={() => { setOrder(v); setElapsed(0) }}>{lbl}</button>
        ))}
        <button type="button" className={goalsOnly ? 'on' : ''} onClick={() => { setGoalsOnly((g) => !g); setElapsed(0) }}>🥅 Enkel doelpunten</button>
      </div>
      {/* "Net veld": na elk doelpunt verdwijnen de lijnen en gaat het verder. */}
      <div className="shotmap-controls replay-filters">
        <button type="button" className={clearOnGoal ? 'on' : ''} onClick={() => setClearOnGoal((c) => !c)}>
          🧹 Veld leegmaken na doelpunt
        </button>
      </div>
      <div className="shotmap-controls replay-controls">
        <button type="button" className="replay-play" onClick={() => (playing ? setPlaying(false) : play())} disabled={total === 0}>
          {playing ? '⏸ Pauze' : elapsed >= totalMs ? '↻ Opnieuw' : '▶ Speel af'}
        </button>
        {([0.5, 1, 2, 3] as const).map((sp) => (
          <button key={sp} type="button" className={speed === sp ? 'on' : ''} onClick={() => setSpeed(sp)}>{sp}×</button>
        ))}
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
                  {phoneShare ? (
                    <>
                      <p className="replay-rec-tip">Haal de video binnen met de downloadknop, open ze in de speler, of scan de QR met een ander toestel.</p>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img className="replay-rec-qr" src={phoneShare.qr} alt="QR-code naar de video" width={200} height={200} />
                      <div className="replay-rec-actions">
                        <a className="replay-rec-save" href={downloadUrl(phoneShare.url)}>⬇ Download video</a>
                        <a className="replay-rec-save" href={phoneShare.url} target="_blank" rel="noopener noreferrer">▶ Open de video</a>
                        <button type="button" className="replay-rec-close" onClick={() => { void navigator.clipboard?.writeText(phoneShare.url) }}>🔗 Kopieer link</button>
                      </div>
                      <button type="button" className="replay-rec-alt" onClick={closeReady}>Sluiten</button>
                    </>
                  ) : (
                    <>
                      <p className="replay-rec-tip">
                        ⬇ Downloaden zet ze klaar als mp4 (werkt overal, ook WhatsApp) en haalt ze binnen als
                        bestand. Of bewaar/deel ze via je toestel, of toon een link/QR.
                      </p>
                      <div className="replay-rec-actions">
                        <button type="button" className="replay-rec-save" onClick={downloadOnDevice} disabled={phoneBusy}>
                          {phoneBusy ? '⏳ Bezig…' : '⬇ Downloaden'}
                        </button>
                        <button type="button" className="replay-rec-save" onClick={saveVideo}>📥 Bewaren / delen</button>
                        <button type="button" className="replay-rec-save" onClick={sendToPhone} disabled={phoneBusy}>
                          {phoneBusy ? '⏳ Bezig…' : '📲 Link & QR'}
                        </button>
                        <button type="button" className="replay-rec-close" onClick={closeReady}>Sluiten</button>
                      </div>
                      <a className="replay-rec-alt" href={recReady.url} target="_blank" rel="noopener noreferrer">
                        Lukt het niet? Open de video in een nieuw tabblad
                      </a>
                    </>
                  )}
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
