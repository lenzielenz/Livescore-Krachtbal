'use client'

import { useState } from 'react'

import { toast } from '@/components/Toaster'
import { formatDateBE, formatTimeBE } from '@/lib/datetime'

type Voorstel = {
  speeldag: number
  datum: string
  thuisNaam: string
  uitNaam: string
  aftrapUtc: string
  bestaatAl: boolean
}

export function KalenderMaker({
  reeksen,
}: {
  reeksen: { value: string; label: string; ploegen: number }[]
}) {
  const [reeks, setReeks] = useState(reeksen[0]?.value ?? '')
  const [start, setStart] = useState('')
  const [uur, setUur] = useState('14:00')
  const [vrij, setVrij] = useState<string[]>([])
  const [nieuweVrij, setNieuweVrij] = useState('')
  const [enkelHeen, setEnkelHeen] = useState(false)
  const [voorstel, setVoorstel] = useState<Voorstel[] | null>(null)
  const [bezig, setBezig] = useState(false)

  const vraag = async (bevestig: boolean) => {
    setBezig(true)
    try {
      const res = await fetch('/api/federatie/kalender', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reeks, start, standaardUur: uur, vrij, enkelHeen, bevestig }),
      })
      const d = (await res.json().catch(() => ({}))) as {
        error?: string
        voorstel?: Voorstel[]
        aangemaakt?: number
      }
      if (!res.ok) return toast('error', d.error ?? 'Mislukt.')
      if (bevestig) {
        toast('success', `${d.aangemaakt ?? 0} wedstrijden aangemaakt.`)
        setVoorstel(null)
      } else setVoorstel(d.voorstel ?? [])
    } finally {
      setBezig(false)
    }
  }

  const perDag = new Map<number, Voorstel[]>()
  for (const w of voorstel ?? []) perDag.set(w.speeldag, [...(perDag.get(w.speeldag) ?? []), w])
  const nieuw = (voorstel ?? []).filter((w) => !w.bestaatAl).length

  return (
    <div className="ft-wrap">
      <div className="ft-kaart">
        <div className="ft-velden">
          <label className="ft-veld">
            Reeks
            <select value={reeks} onChange={(e) => (setReeks(e.target.value), setVoorstel(null))}>
              {reeksen.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label} ({r.ploegen})
                </option>
              ))}
            </select>
          </label>
          <label className="ft-veld">
            Eerste speeldag
            <input
              type="date"
              value={start}
              onChange={(e) => (setStart(e.target.value), setVoorstel(null))}
            />
          </label>
          <label className="ft-veld">
            Uur als de ploeg geen thuisuur heeft
            <input
              type="time"
              value={uur}
              onChange={(e) => (setUur(e.target.value), setVoorstel(null))}
            />
          </label>
          <label className="ft-veld">
            Vrije datum toevoegen
            <span style={{ display: 'flex', gap: 6 }}>
              <input
                type="date"
                value={nieuweVrij}
                onChange={(e) => setNieuweVrij(e.target.value)}
              />
              <button
                type="button"
                className="ft-btn"
                disabled={!nieuweVrij}
                onClick={() => {
                  setVrij((v) => [...new Set([...v, nieuweVrij])].sort())
                  setNieuweVrij('')
                  setVoorstel(null)
                }}
              >
                +
              </button>
            </span>
          </label>
        </div>
        {vrij.length > 0 && (
          <p className="ft-stat">
            Vrij:{' '}
            {vrij.map((d) => (
              <button
                key={d}
                type="button"
                className="ft-btn"
                style={{ padding: '2px 8px', marginRight: 4 }}
                onClick={() => (setVrij((v) => v.filter((x) => x !== d)), setVoorstel(null))}
              >
                {formatDateBE(`${d}T12:00:00Z`)} ✕
              </button>
            ))}
          </p>
        )}
        <label className="ft-stat">
          <input
            type="checkbox"
            checked={enkelHeen}
            onChange={(e) => (setEnkelHeen(e.target.checked), setVoorstel(null))}
          />{' '}
          enkel heenronde
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="ft-btn"
            disabled={bezig || !start}
            onClick={() => vraag(false)}
          >
            👀 Voorstel tonen
          </button>
          {voorstel && (
            <button
              type="button"
              className="ft-btn ft-primair"
              disabled={bezig || nieuw === 0}
              onClick={() => vraag(true)}
            >
              ✅ {nieuw} wedstrijden aanmaken
            </button>
          )}
        </div>
      </div>

      {voorstel && (
        <div className="ft-dagen">
          {[...perDag.entries()].map(([dag, lijst]) => (
            <section key={dag} className="ft-dag">
              <h2>
                Speeldag {dag}{' '}
                <small>
                  ·{' '}
                  {formatDateBE(`${lijst[0].datum}T12:00:00Z`, {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </small>
              </h2>
              <div className="ft-tabel-wrap">
                <table className="ft-tabel">
                  <tbody>
                    {lijst.map((w, i) => (
                      <tr
                        key={i}
                        className={w.bestaatAl ? 'ft-bestaat' : ''}
                        title={
                          w.bestaatAl ? 'Bestaat al — wordt niet opnieuw aangemaakt' : undefined
                        }
                      >
                        <td>{formatTimeBE(w.aftrapUtc)}</td>
                        <td>{w.thuisNaam}</td>
                        <td>–</td>
                        <td>{w.uitNaam}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
