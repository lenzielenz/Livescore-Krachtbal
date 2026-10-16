'use client'

import { useCallback, useEffect, useState } from 'react'

import type { ClientNotitie } from '@/lib/analyse-notities'

// De notities van een analyse ophalen en toevoegen (gedeeld door de video en de 3D-tekeningen).

export function useNotities(matchId: number, deel?: string) {
  const [notities, setNotities] = useState<ClientNotitie[]>([])
  const [magSchrijven, setMagSchrijven] = useState(false)
  const [laden, setLaden] = useState(true)
  const [fout, setFout] = useState<string | null>(null)
  const adres = `/api/analyse/match/${matchId}/notities${deel ? `?deel=${encodeURIComponent(deel)}` : ''}`

  const herlaad = useCallback(async () => {
    try {
      const r = await fetch(adres, { cache: 'no-store' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Notities konden niet geladen worden.')
      setNotities(d.notities)
      setMagSchrijven(Boolean(d.magSchrijven))
      setFout(null)
    } catch (e) {
      setFout((e as Error).message)
    } finally {
      setLaden(false)
    }
  }, [adres])

  useEffect(() => {
    void herlaad()
  }, [herlaad])

  const voegToe = useCallback(
    async (body: Record<string, unknown>) => {
      const r = await fetch(`/api/analyse/match/${matchId}/notities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Bewaren mislukt.')
      await herlaad()
    },
    [matchId, herlaad],
  )

  return { notities, magSchrijven, laden, fout, herlaad, voegToe }
}
