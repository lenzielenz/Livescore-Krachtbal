'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

// Delen zoals bij Veo: één link die je in de groepschat zet. Wie hem opent, ziet de analyse en de
// gedeelde notities, zonder account. Intrekken maakt de oude link meteen waardeloos. Wie zelf
// notities moet kunnen schrijven, krijgt toegang via "Analyse delen" met zijn account.

export function AppDelen({ matchId, titel }: { matchId: number; titel: string }) {
  const [pad, setPad] = useState<string | null>(null)
  const [bezig, setBezig] = useState(false)
  const [melding, setMelding] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/analyse/match/${matchId}/deellink`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setPad(d.pad ?? null))
      .catch(() => undefined)
  }, [matchId])

  const url = pad && typeof window !== 'undefined' ? `${window.location.origin}${pad}` : null

  const maak = async () => {
    setBezig(true)
    try {
      const r = await fetch(`/api/analyse/match/${matchId}/deellink`, { method: 'POST' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Link maken mislukt.')
      setPad(d.pad)
      setMelding(null)
    } catch (e) {
      setMelding((e as Error).message)
    } finally {
      setBezig(false)
    }
  }

  const trekIn = async () => {
    if (!window.confirm('De link intrekken? Wie hem al heeft, kan de analyse dan niet meer openen.')) return
    await fetch(`/api/analyse/match/${matchId}/deellink`, { method: 'DELETE' })
    setPad(null)
    setMelding('De link is ingetrokken.')
  }

  const deel = async () => {
    if (!url) return
    if (navigator.share) {
      await navigator.share({ title: titel, text: `Analyse: ${titel}`, url }).catch(() => undefined)
      return
    }
    await navigator.clipboard.writeText(url).catch(() => undefined)
    setMelding('Link gekopieerd.')
  }

  return (
    <div className="appd">
      {url ? (
        <>
          <div className="appd-link">
            <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Deellink" />
            <button type="button" className="appa-knop vol" onClick={deel}>
              Delen
            </button>
          </div>
          <p className="appa-uitleg">
            Wie de link heeft, ziet de analyse en de gedeelde notities, zonder account.{' '}
            <button type="button" className="appd-intrekken" onClick={trekIn}>
              Link intrekken
            </button>
          </p>
        </>
      ) : (
        <button type="button" className="appa-knop vol" disabled={bezig} onClick={maak}>
          {bezig ? 'Bezig…' : 'Deellink maken'}
        </button>
      )}
      <p className="appa-uitleg">
        Moeten anderen ook notities kunnen schrijven? Geef hun account toegang via{' '}
        <Link href="/analyse">Analyse delen</Link>.
      </p>
      {melding && <p className="appa-uitleg" role="status">{melding}</p>}
    </div>
  )
}
