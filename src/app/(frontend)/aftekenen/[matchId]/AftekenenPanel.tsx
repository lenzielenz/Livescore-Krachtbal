'use client'

import { useEffect, useRef, useState } from 'react'

type Who = 'kapiteinThuis' | 'kapiteinUit' | 'scheidsrechter'
type Side = 'home' | 'away' | null

export type SignatureData = {
  naam?: string | null
  handtekening?: string | null
  akkoord?: boolean | null
  tijdstip?: string | null
}

function formatTijdstip(value?: string | null): string | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('nl-BE', { dateStyle: 'short', timeStyle: 'short' })
}

function SignaturePad({
  matchId,
  who,
  label,
  side,
  teamName,
  initial,
}: {
  matchId: string
  who: Who
  label: string
  side: Side
  teamName?: string
  initial?: SignatureData
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [naam, setNaam] = useState(initial?.naam ?? '')
  const [msg, setMsg] = useState<string | null>(null)
  const [hasInk, setHasInk] = useState(false)

  // Een afgetekende handtekening is definitief: ze kan niet meer gewist of overschreven
  // worden (reglement Item 37). We tonen dan een vergrendelde weergave i.p.v. het canvas.
  const alreadySigned = Boolean(initial?.akkoord && initial?.handtekening)
  const [locked, setLocked] = useState(alreadySigned)
  const [signedImg, setSignedImg] = useState<string | null>(
    alreadySigned ? (initial?.handtekening ?? null) : null,
  )
  const [signedAt, setSignedAt] = useState<string | null>(initial?.tijdstip ?? null)

  useEffect(() => {
    if (locked) return
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#111'
  }, [locked])

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!
    const r = c.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true
    const ctx = canvasRef.current!.getContext('2d')!
    const p = pos(e)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
  }
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const ctx = canvasRef.current!.getContext('2d')!
    const p = pos(e)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    setHasInk(true)
  }
  const up = () => {
    drawing.current = false
  }
  const clear = () => {
    const c = canvasRef.current!
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
    setHasInk(false)
  }

  const save = async () => {
    if (!naam.trim()) return setMsg('Vul je naam in.')
    if (!hasInk) return setMsg('Plaats eerst een handtekening.')
    const dataUrl = canvasRef.current!.toDataURL('image/png')
    const res = await fetch(`/api/matchsheet/${matchId}/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ who, naam, handtekening: dataUrl, akkoord: true }),
    })
    const json = await res.json()
    if (res.ok) {
      // Direct vergrendelen: na opslaan kan deze handtekening niet meer gewist worden.
      setSignedImg(dataUrl)
      setSignedAt(new Date().toISOString())
      setLocked(true)
      setMsg(null)
    } else {
      setMsg(json.error || 'Mislukt.')
    }
  }

  const sideClass = side === 'home' ? 'side-home' : side === 'away' ? 'side-away' : ''

  return (
    <section className={`wb-card ${sideClass}`.trim()}>
      <div className="wb-sign-head">
        <h3>{label}</h3>
        {side && (
          <span className={`wb-side-badge ${side}`}>{side === 'home' ? 'THUIS' : 'UIT'}</span>
        )}
      </div>
      {teamName && <p className="wb-sub">{teamName}</p>}

      {locked ? (
        <>
          <input className="wb-input" value={naam} readOnly style={{ marginBottom: 8 }} />
          <div className="wb-sign wb-sign-locked">
            {signedImg && <img src={signedImg} alt={`Handtekening ${label}`} className="wb-sign-img" />}
          </div>
          <p className="wb-lock-note">
            🔒 Afgetekend{signedAt && ` op ${formatTijdstip(signedAt)}`} — definitief, kan niet meer
            gewist worden.
          </p>
        </>
      ) : (
        <>
          <input
            className="wb-input"
            placeholder="Naam"
            value={naam}
            onChange={(e) => setNaam(e.target.value)}
            style={{ marginBottom: 8 }}
          />
          <canvas
            ref={canvasRef}
            width={300}
            height={120}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerLeave={up}
            className="wb-sign"
          />
          <div className="wb-btn-row">
            <button onClick={clear} className="wb-btn">
              Wissen
            </button>
            <button onClick={save} className="wb-btn wb-btn-primary" style={{ flex: 1 }}>
              Aftekenen
            </button>
          </div>
          {msg && <p className="wb-msg">{msg}</p>}
        </>
      )}
    </section>
  )
}

export function AftekenenPanel({
  matchId,
  initialStatus,
  signatures,
  homeTeam,
  awayTeam,
}: {
  matchId: string
  initialStatus: string
  signatures?: Partial<Record<Who, SignatureData>>
  homeTeam?: string
  awayTeam?: string
}) {
  const [status, setStatus] = useState(initialStatus)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    setMsg(null)
    const res = await fetch(`/api/matchsheet/${matchId}/submit`, { method: 'POST' })
    const json = await res.json()
    setBusy(false)
    if (res.ok && json.ok) {
      setStatus(json.status)
      const mail = json.mail?.sent ? 'gemaild' : `niet gemaild (${json.mail?.reason ?? '—'})`
      const fed = json.federation?.uploaded ? 'geüpload' : `niet geüpload (${json.federation?.reason ?? '—'})`
      setMsg(`Ingediend. PDF ${mail}; federatie ${fed}.`)
    } else {
      setMsg(json.error || 'Indienen mislukt.')
    }
  }

  if (status === 'ingediend') {
    return <p className="wb-intro">Dit blad is ingediend en kan niet meer gewijzigd worden (Item 37).</p>
  }

  return (
    <>
      <div className="wb-grid">
        <SignaturePad
          matchId={matchId}
          who="kapiteinThuis"
          label="Kapitein thuis"
          side="home"
          teamName={homeTeam}
          initial={signatures?.kapiteinThuis}
        />
        <SignaturePad
          matchId={matchId}
          who="kapiteinUit"
          label="Kapitein uit"
          side="away"
          teamName={awayTeam}
          initial={signatures?.kapiteinUit}
        />
        <SignaturePad
          matchId={matchId}
          who="scheidsrechter"
          label="Scheidsrechter"
          side={null}
          initial={signatures?.scheidsrechter}
        />
      </div>
      <div style={{ marginTop: 20 }}>
        <button onClick={submit} disabled={busy} className="wb-btn wb-btn-primary" style={{ padding: '11px 22px' }}>
          {busy ? 'Indienen…' : '📤 Indienen (PDF + mail + federatie)'}
        </button>
        {msg && <p className="wb-msg">{msg}</p>}
      </div>
    </>
  )
}
