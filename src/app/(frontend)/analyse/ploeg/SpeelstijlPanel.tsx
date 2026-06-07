'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import {
  ACCENT_OPTIONS,
  TEMPO_OPTIONS,
  WORP_OPTIONS,
  ZONE_OPTIONS,
  type Speelstijl,
} from '@/lib/speelstijl'

// Editeerbaar tactisch profiel "hoe spelen wij als ploeg". Voedt de strategie-aanbevelingen.
export function SpeelstijlPanel({ teamId, teamName, initial }: { teamId: number; teamName: string; initial: Speelstijl }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [s, setS] = useState<Speelstijl>(initial)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const set = <K extends keyof Speelstijl>(k: K, v: Speelstijl[K]) => setS((p) => ({ ...p, [k]: v }))

  async function save() {
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/analyse/team/${teamId}/speelstijl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(s),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Opslaan mislukt')
      setMsg('Opgeslagen ✓')
      router.refresh() // herbereken de strategie-aanbevelingen met het nieuwe profiel
    } catch (err) {
      setMsg((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rep-stijl">
      <button type="button" className="rep-stijl-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        🎯 Hoe spelen wij? <span className="an-chart-hint">{open ? 'verbergen' : 'speelstijl van ' + teamName + ' instellen'}</span>
      </button>

      {open && (
        <div className="rep-stijl-form">
          <p className="rep-stijl-intro">Geef in hoe deze ploeg speelt. Dit wordt naast de gemeten data gelegd voor gerichte strategie-aanbevelingen.</p>
          <div className="rep-stijl-grid">
            <label className="rep-stijl-fld">
              <span>Accent</span>
              <select value={s.accent ?? ''} onChange={(e) => set('accent', (e.target.value || null) as Speelstijl['accent'])}>
                <option value="">—</option>
                {ACCENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label className="rep-stijl-fld">
              <span>Tempo</span>
              <select value={s.tempo ?? ''} onChange={(e) => set('tempo', (e.target.value || null) as Speelstijl['tempo'])}>
                <option value="">—</option>
                {TEMPO_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label className="rep-stijl-fld">
              <span>Voorkeurszone</span>
              <select value={s.zone ?? ''} onChange={(e) => set('zone', (e.target.value || null) as Speelstijl['zone'])}>
                <option value="">—</option>
                {ZONE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label className="rep-stijl-fld">
              <span>Voorkeur worp</span>
              <select value={s.worp ?? ''} onChange={(e) => set('worp', (e.target.value || null) as Speelstijl['worp'])}>
                <option value="">—</option>
                {WORP_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          </div>
          <label className="rep-stijl-check">
            <input type="checkbox" checked={Boolean(s.verreWorp)} onChange={(e) => set('verreWorp', e.target.checked)} />
            <span>Speelt graag de verre worp (+15 m, links/rechts over)</span>
          </label>
          <label className="rep-stijl-fld rep-stijl-note">
            <span>Eigen strategie / notitie</span>
            <textarea
              rows={3}
              maxLength={600}
              value={s.notitie ?? ''}
              onChange={(e) => set('notitie', e.target.value)}
              placeholder="Bv. snelle omschakeling na vangst, dubbel via de vleugel…"
            />
          </label>
          <div className="rep-stijl-actions">
            <button type="button" className="sk-demo-cta" onClick={save} disabled={saving}>
              {saving ? 'Bewaren…' : 'Bewaren'}
            </button>
            {msg && <span className="rep-stijl-msg">{msg}</span>}
          </div>
        </div>
      )}
    </section>
  )
}
