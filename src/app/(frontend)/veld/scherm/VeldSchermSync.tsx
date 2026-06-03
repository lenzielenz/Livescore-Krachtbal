'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'

// Houdt het generieke veldscherm in lijn met de centrale selectie: pollt /api/veld en
// herlaadt de serverpagina zodra er een ándere (of geen) wedstrijd gekozen is. Zo wissel
// je de wedstrijd op de veld-tv vanaf je gsm, zonder de tv aan te raken.
export function VeldSchermSync({ currentId }: { currentId: number | null }) {
  const router = useRouter()
  const cur = useRef(currentId)

  useEffect(() => {
    cur.current = currentId
  }, [currentId])

  useEffect(() => {
    let active = true
    const poll = async () => {
      try {
        const r = await fetch('/api/veld', { cache: 'no-store' })
        if (!r.ok) return
        const d = (await r.json()) as { id: number | null }
        if (active && d.id !== cur.current) router.refresh()
      } catch {
        /* netwerkfout — volgende poll probeert opnieuw */
      }
    }
    const t = setInterval(poll, 6000)
    return () => {
      active = false
      clearInterval(t)
    }
  }, [router])

  return null
}
