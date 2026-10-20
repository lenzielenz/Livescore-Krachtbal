'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { toast } from '@/components/Toaster'

type Ronde = { id: number; seizoen: string; status: 'voorbereiding' | 'open' | 'gesloten' | 'gepubliceerd' }

const STATUS: Record<Ronde['status'], string> = {
  voorbereiding: 'In voorbereiding — nog niemand kan stemmen',
  open: '🟢 Stemmen open',
  gesloten: '🔒 Gesloten — klaar om bekend te maken',
  gepubliceerd: '🏆 Uitslag bekend — staat in de Erelijst',
}

async function post(body: unknown) {
  const res = await fetch('/api/federatie/referendum', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })
  return { ok: res.ok, data: (await res.json().catch(() => ({}))) as Record<string, unknown> }
}

export function RondeBeheer({ ronde, voorstelSeizoen }: { ronde: Ronde | null; voorstelSeizoen: string }) {
  const router = useRouter()
  const [seizoen, setSeizoen] = useState(voorstelSeizoen)
  const [min, setMin] = useState('5')
  const [leeftijd, setLeeftijd] = useState('21')
  const [bezig, setBezig] = useState(false)

  const doe = async (body: unknown, ok: string) => {
    setBezig(true)
    try {
      const r = await post(body)
      if (!r.ok) return toast('error', String(r.data.error ?? 'Mislukt.'))
      toast('success', ok)
      router.refresh()
    } finally {
      setBezig(false)
    }
  }

  const nieuweRonde = !ronde || ronde.status === 'gepubliceerd'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {ronde && (
        <div className="rf-kaart">
          <p className="rf-seizoen">Seizoen {ronde.seizoen}</p>
          <strong>{STATUS[ronde.status]}</strong>
          <div className="rf-acties">
            {(ronde.status === 'voorbereiding' || ronde.status === 'gesloten') && (
              <button type="button" className="rf-knop" disabled={bezig} onClick={() => doe({ actie: 'status', rondeId: ronde.id, status: 'open' }, 'Stemmen zijn open.')}>
                {ronde.status === 'gesloten' ? 'Heropenen' : '▶ Stemmen openen'}
              </button>
            )}
            {ronde.status === 'open' && (
              <button
                type="button"
                className="rf-knop"
                disabled={bezig}
                onClick={() => confirm('De stemronde sluiten? Daarna kan niemand nog stemmen.') && doe({ actie: 'status', rondeId: ronde.id, status: 'gesloten' }, 'Ronde gesloten.')}
              >
                ■ Stemmen sluiten
              </button>
            )}
            {ronde.status === 'gesloten' && (
              <button
                type="button"
                className="rf-knop"
                disabled={bezig}
                onClick={() =>
                  confirm('De uitslag bekendmaken? De winnaars komen in de Erelijst.') && doe({ actie: 'publiceren', rondeId: ronde.id }, 'Uitslag bekendgemaakt.')
                }
              >
                🏆 Uitslag bekendmaken
              </button>
            )}
            {ronde.status === 'gepubliceerd' && (
              <Link href="/erelijst" className="rf-knop rf-sec">
                Bekijk de Erelijst →
              </Link>
            )}
          </div>
        </div>
      )}

      {nieuweRonde && (
        <div className="rf-kaart">
          <strong>Nieuwe stemronde</strong>
          <div className="rf-velden">
            <label className="rf-veld">
              Seizoen
              <input value={seizoen} onChange={(e) => setSeizoen(e.target.value)} placeholder="2026-2027" />
            </label>
            <label className="rf-veld">
              Minimum gespeeld
              <input type="number" min={1} value={min} onChange={(e) => setMin(e.target.value)} />
            </label>
            <label className="rf-veld">
              Belofte: jonger dan
              <input type="number" min={10} value={leeftijd} onChange={(e) => setLeeftijd(e.target.value)} />
            </label>
          </div>
          <button
            type="button"
            className="rf-knop"
            disabled={bezig}
            onClick={() => doe({ actie: 'aanmaken', seizoen, minWedstrijden: Number(min), maxLeeftijdBelofte: Number(leeftijd) }, 'Ronde aangemaakt. Open ze wanneer de spelers mogen stemmen.')}
          >
            Ronde aanmaken
          </button>
        </div>
      )}
    </div>
  )
}
