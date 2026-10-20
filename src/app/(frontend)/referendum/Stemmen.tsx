'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { toast } from '@/components/Toaster'

type Kies = { id: number; naam: string; clubNaam: string }
type Staat = {
  ronde: { seizoen: string } | null
  magStemmen: boolean
  reden?: string
  competitie?: 'heren' | 'dames'
  ik?: { naam: string; clubNaam: string }
  kiesbaar?: Kies[]
  mijnStem?: { speler: number; punten: number }[] | null
}

const PUNTEN = [5, 4, 3, 2, 1]

export function Stemmen() {
  const [staat, setStaat] = useState<Staat | null>(null)
  const [keuze, setKeuze] = useState<Record<number, number | ''>>({ 5: '', 4: '', 3: '', 2: '', 1: '' })
  const [bezig, setBezig] = useState(false)
  const [bewaard, setBewaard] = useState(false)

  useEffect(() => {
    fetch('/api/referendum/stem', { credentials: 'include' })
      .then((r) => r.json())
      .then((d: Staat) => {
        setStaat(d)
        if (d.mijnStem) {
          setKeuze(Object.fromEntries(PUNTEN.map((p) => [p, d.mijnStem!.find((r) => r.punten === p)?.speler ?? ''])) as Record<number, number | ''>)
          setBewaard(true)
        }
      })
      .catch(() => setStaat({ ronde: null, magStemmen: false, reden: 'Laden mislukt.' }))
  }, [])

  if (!staat) return <p className="empty">Laden…</p>
  if (!staat.magStemmen) {
    return (
      <div className="rf-kaart">
        {staat.ronde && <p className="rf-seizoen">Seizoen {staat.ronde.seizoen}</p>}
        <p>{staat.reden}</p>
        {staat.reden?.startsWith('Log in') && (
          <Link href="/inloggen" className="rf-knop">
            Inloggen →
          </Link>
        )}
      </div>
    )
  }

  const gekozen = new Set(Object.values(keuze).filter((v): v is number => v !== ''))
  const volledig = PUNTEN.every((p) => keuze[p] !== '')

  const stem = async () => {
    setBezig(true)
    try {
      const res = await fetch('/api/referendum/stem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ regels: PUNTEN.map((p) => ({ speler: keuze[p], punten: p })) }),
      })
      const d = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) return toast('error', d.error ?? 'Stemmen mislukt.')
      setBewaard(true)
      toast('success', 'Je stem is bewaard. Je kan ze aanpassen zolang de ronde open is.')
    } finally {
      setBezig(false)
    }
  }

  return (
    <div className="rf-kaart">
      <p className="rf-seizoen">
        Seizoen {staat.ronde?.seizoen} · {staat.competitie === 'dames' ? 'Speelster van het jaar' : 'Speler van het jaar'} · jij: {staat.ik?.naam} (
        {staat.ik?.clubNaam})
      </p>
      {bewaard && <p className="rf-ok">✓ Je stem telt mee. Aanpassen kan tot de federatie de ronde sluit.</p>}
      <div className="rf-lijst">
        {PUNTEN.map((p) => (
          <label key={p} className="rf-rij">
            <span className="rf-punten">{p}</span>
            <select
              value={keuze[p]}
              onChange={(e) => {
                setBewaard(false)
                setKeuze((k) => ({ ...k, [p]: e.target.value ? Number(e.target.value) : '' }))
              }}
              aria-label={`${p} punten`}
            >
              <option value="">Kies een speler…</option>
              {(staat.kiesbaar ?? [])
                .filter((k) => k.id === keuze[p] || !gekozen.has(k.id))
                .map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.naam} — {k.clubNaam}
                  </option>
                ))}
            </select>
          </label>
        ))}
      </div>
      <button type="button" className="rf-knop" disabled={!volledig || bezig} onClick={stem}>
        {bezig ? 'Bezig…' : bewaard ? 'Stem aanpassen' : '🗳️ Stem uitbrengen'}
      </button>
    </div>
  )
}
