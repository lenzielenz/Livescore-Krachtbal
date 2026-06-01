'use client'

import { useEffect, useRef, useState } from 'react'

type Who = 'kapiteinThuis' | 'kapiteinUit' | 'scheidsrechter'

function SignaturePad({
  matchId,
  who,
  label,
}: {
  matchId: string
  who: Who
  label: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [naam, setNaam] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [hasInk, setHasInk] = useState(false)

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#111'
  }, [])

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
    setMsg(res.ok ? '✓ Afgetekend.' : json.error || 'Mislukt.')
  }

  return (
    <section className="wb-card">
      <h3>{label}</h3>
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
    </section>
  )
}

export function AftekenenPanel({ matchId, initialStatus }: { matchId: string; initialStatus: string }) {
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
        <SignaturePad matchId={matchId} who="kapiteinThuis" label="Kapitein thuis" />
        <SignaturePad matchId={matchId} who="kapiteinUit" label="Kapitein uit" />
        <SignaturePad matchId={matchId} who="scheidsrechter" label="Scheidsrechter" />
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
