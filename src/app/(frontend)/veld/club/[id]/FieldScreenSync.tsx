'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'

// Houdt het veldscherm in lijn met de koppelstatus: pollt /api/veldscherm/[id]/state en herlaadt
// de serverpagina zodra er een (andere of geen) wedstrijd gekoppeld is. Zo springt de tv vanzelf
// van het wachtscherm naar het scorebord zodra iemand de koppelcode invoert, en weer terug zodra
// de wedstrijd afloopt — zonder de tv ooit aan te raken. Zelfde patroon als VeldSchermSync.tsx.
export function FieldScreenSync({ fieldScreenId, pairedMatchId }: { fieldScreenId: number; pairedMatchId: number | null }) {
  const router = useRouter()
  const cur = useRef(pairedMatchId)

  useEffect(() => {
    cur.current = pairedMatchId
  }, [pairedMatchId])

  useEffect(() => {
    let active = true
    const poll = async () => {
      try {
        const r = await fetch(`/api/veldscherm/${fieldScreenId}/state`, { cache: 'no-store' })
        if (!r.ok) return
        const d = (await r.json()) as { pairedMatchId: number | null }
        if (active && d.pairedMatchId !== cur.current) router.refresh()
      } catch {
        /* netwerkfout — volgende poll probeert opnieuw */
      }
    }
    const t = setInterval(poll, 6000)
    return () => {
      active = false
      clearInterval(t)
    }
  }, [router, fieldScreenId])

  return null
}
