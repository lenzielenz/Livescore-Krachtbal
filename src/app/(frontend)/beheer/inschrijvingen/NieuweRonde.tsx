'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { toast } from '@/components/Toaster'

export function NieuweRonde() {
  const router = useRouter()
  const jaar = new Date().getFullYear()
  const [v, setV] = useState({ seizoen: `${jaar}-${jaar + 1}`, deadline: '', eersteWeekend: '', laatsteWeekend: '', toelichting: '' })
  const [vrij, setVrij] = useState<{ weekend: string; reden: string }[]>([])
  const [d, setD] = useState({ weekend: '', reden: '' })
  const [bezig, setBezig] = useState(false)
  const maak = async () => {
    setBezig(true)
    try {
      const res = await fetch('/api/federatie/inschrijvingen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actie: 'ronde', ...v, vrijeWeekends: vrij }) })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) return toast('error', j.error ?? 'Mislukt.')
      toast('success', 'Ronde geopend — alle clubs zijn verwittigd.')
      router.push('/beheer/inschrijvingen')
      router.refresh()
    } finally {
      setBezig(false)
    }
  }
  return (
    <section className="ft-kaart">
      <div className="ft-velden">
        <label className="ft-veld">
          Seizoen
          <input value={v.seizoen} onChange={(e) => setV({ ...v, seizoen: e.target.value })} />
        </label>
        <label className="ft-veld">
          Inschrijven tot en met
          <input type="date" value={v.deadline} onChange={(e) => setV({ ...v, deadline: e.target.value })} />
        </label>
        <label className="ft-veld">
          Eerste speelweekend
          <input type="date" value={v.eersteWeekend} onChange={(e) => setV({ ...v, eersteWeekend: e.target.value })} />
        </label>
        <label className="ft-veld">
          Laatste speelweekend
          <input type="date" value={v.laatsteWeekend} onChange={(e) => setV({ ...v, laatsteWeekend: e.target.value })} />
        </label>
      </div>
      <strong>Weekends zonder competitie</strong>
      {vrij.map((x, i) => (
        <div key={i} className="ft-stat">
          {x.weekend} {x.reden ? `· ${x.reden}` : ''}{' '}
          <button type="button" className="ft-btn" onClick={() => setVrij(vrij.filter((_, j) => j !== i))}>
            ✕
          </button>
        </div>
      ))}
      <div className="ft-balk" style={{ position: 'static', padding: 0 }}>
        <input type="date" value={d.weekend} onChange={(e) => setD({ ...d, weekend: e.target.value })} aria-label="Datum" />
        <input placeholder="Reden (bv. bekerfinale)" value={d.reden} onChange={(e) => setD({ ...d, reden: e.target.value })} />
        <button
          type="button"
          className="ft-btn"
          disabled={!d.weekend}
          onClick={() => {
            setVrij([...vrij, d])
            setD({ weekend: '', reden: '' })
          }}
        >
          + Toevoegen
        </button>
      </div>
      <label className="ft-veld">
        Toelichting voor de clubs
        <textarea rows={3} value={v.toelichting} onChange={(e) => setV({ ...v, toelichting: e.target.value })} />
      </label>
      <div>
        <button type="button" className="ft-btn ft-primair" disabled={bezig} onClick={() => void maak()}>
          Inschrijvingen openen
        </button>
      </div>
    </section>
  )
}
