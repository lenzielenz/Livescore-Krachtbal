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
    <section style={card}>
      <h3 style={{ margin: '0 0 8px' }}>{label}</h3>
      <input
        placeholder="Naam"
        value={naam}
        onChange={(e) => setNaam(e.target.value)}
        style={{ width: '100%', padding: 8, marginBottom: 8, boxSizing: 'border-box' }}
      />
      <canvas
        ref={canvasRef}
        width={300}
        height={120}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
        style={{ width: '100%', height: 120, border: '1px dashed #bbb', borderRadius: 6, touchAction: 'none', background: '#fff' }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button onClick={clear} style={btnSmall}>
          Wissen
        </button>
        <button onClick={save} className="btn btn--style-primary" style={{ ...btnSmall, flex: 1 }}>
          Aftekenen
        </button>
      </div>
      {msg && <p style={{ fontSize: 13, marginTop: 6 }}>{msg}</p>}
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
    return <p className="empty">Dit blad is ingediend en kan niet meer gewijzigd worden (Item 37).</p>
  }

  return (
    <>
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        <SignaturePad matchId={matchId} who="kapiteinThuis" label="Kapitein thuis" />
        <SignaturePad matchId={matchId} who="kapiteinUit" label="Kapitein uit" />
        <SignaturePad matchId={matchId} who="scheidsrechter" label="Scheidsrechter" />
      </div>
      <div style={{ marginTop: 20 }}>
        <button onClick={submit} disabled={busy} className="btn btn--style-primary" style={{ padding: '10px 20px', cursor: 'pointer' }}>
          {busy ? 'Indienen…' : '📤 Indienen (PDF + mail + federatie)'}
        </button>
        {msg && <p style={{ marginTop: 8 }}>{msg}</p>}
      </div>
    </>
  )
}

const card: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, background: '#fff' }
const btnSmall: React.CSSProperties = { padding: '6px 12px', cursor: 'pointer', border: '1px solid #ccc', borderRadius: 6, background: '#f5f5f5' }
