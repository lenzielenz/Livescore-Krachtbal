'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { SCORECARD_AXES, type ScorecardSkills } from '@/lib/scorecard'

// Eigen scorecard bijstellen: koppel je spelersdossier (voor echte cijfers) en/of geef een
// eigen/coach-beoordeling per as. Na opslaan herlaadt de pagina zodat de kaart meteen klopt.
export function ScorecardEditor({
  players,
  initialPlayerId,
  initialSkills,
  usingStats,
}: {
  players: { id: number; name: string; shirtNumber: number; teamName: string }[]
  initialPlayerId: string
  initialSkills: ScorecardSkills
  usingStats: boolean
}) {
  const router = useRouter()
  const [playerId, setPlayerId] = useState(initialPlayerId)
  const [skills, setSkills] = useState<ScorecardSkills>(() => {
    const s: ScorecardSkills = {}
    for (const a of SCORECARD_AXES) s[a.key] = typeof initialSkills[a.key] === 'number' ? initialSkills[a.key] : 50
    return s
  })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/profile/scorecard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ playerId: playerId || null, skills }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setMsg({ ok: false, text: data.error ?? 'Opslaan mislukt.' })
        return
      }
      setMsg({ ok: true, text: 'Scorecard opgeslagen ✓' })
      router.refresh()
    } catch {
      setMsg({ ok: false, text: 'Er ging iets mis — probeer opnieuw.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="wb-card sc-editor" onSubmit={save}>
      <h2>Mijn scorecard bijstellen</h2>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '0.8rem', color: 'var(--dim)' }}>
        Mijn speler (voor echte matchstatistiek)
        <select className="wb-input" value={playerId} onChange={(e) => setPlayerId(e.target.value)}>
          <option value="">— Niet gekoppeld —</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>#{p.shirtNumber} {p.name} · {p.teamName}</option>
          ))}
        </select>
      </label>

      <p className="sc-edit-hint">
        {usingStats
          ? 'Je kaart toont nu je echte cijfers. De beoordeling hieronder is een terugval als er (nog) geen data is.'
          : 'Nog geen wedstrijddata gevonden — je kaart gebruikt onderstaande beoordeling. Koppel een speler met data voor echte cijfers.'}
      </p>

      <div className="sc-sliders">
        {SCORECARD_AXES.map((a) => (
          <label key={a.key} className="sc-slider">
            <span className="sc-slider-top">
              <span>{a.label}</span>
              <b>{skills[a.key]}</b>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={skills[a.key]}
              onChange={(e) => setSkills((s) => ({ ...s, [a.key]: Number(e.target.value) }))}
            />
          </label>
        ))}
      </div>

      <button type="submit" disabled={busy} className="wb-btn wb-btn-primary">
        {busy ? 'Opslaan…' : 'Scorecard opslaan'}
      </button>
      {msg && <p className="wb-msg" style={{ color: msg.ok ? 'var(--accent)' : '#e0533d' }}>{msg.text}</p>}
    </form>
  )
}
