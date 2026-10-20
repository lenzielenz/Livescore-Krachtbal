'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

/** Zelfde drempel als OVERNEEM_STIL_MS in lib/score-trust.ts (de server beslist). */
const STIL_MS = 3 * 60 * 1000

/**
 * "Overnemen" als het toestel van de aantekenaar uitvalt (batterij leeg, gsm vastgelopen).
 * De scheidsrechter of de federatie kan meteen; iemand anders pas na 3 minuten stilte op dat
 * toestel. De server controleert dat opnieuw (overneemWeigering).
 */
export function Overnemen({
  matchId,
  scorerName,
  laatstActief,
  direct,
}: {
  matchId: number
  scorerName: string
  laatstActief: number | null
  direct: boolean
}) {
  const router = useRouter()
  const [nu, setNu] = useState(() => Date.now())
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  useEffect(() => {
    const t = setInterval(() => setNu(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const stil = laatstActief ? nu - laatstActief : STIL_MS
  const wacht = direct ? 0 : Math.max(0, Math.ceil((STIL_MS - stil) / 1000))
  const kan = wacht === 0

  const neemOver = async () => {
    if (!window.confirm(`Overnemen van ${scorerName}? Op dat toestel kan er daarna niet meer aangetekend worden.`)) return
    setBezig(true)
    setFout(null)
    try {
      const res = await fetch(`/api/match/${matchId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'overnemen' }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Overnemen lukte niet.')
      router.refresh()
    } catch (e) {
      setFout(e instanceof Error ? e.message : 'Geen verbinding — probeer opnieuw.')
      setBezig(false)
    }
  }

  return (
    <div className="sk-overnemen">
      <p>
        Valt het toestel van <b>{scorerName}</b> uit (batterij leeg, gsm vastgelopen)? Neem dan hier over: de stand blijft
        zoals ze op de server staat.
      </p>
      <p className="sk-overnemen-stil">
        {laatstActief
          ? `Laatste teken van dat toestel: ${Math.floor(stil / 60000)} min ${Math.floor((stil % 60000) / 1000)} s geleden.`
          : 'Nog geen teken van dat toestel.'}
      </p>
      <button type="button" className="match-score-cta sk-overnemen-knop" disabled={!kan || bezig} onClick={neemOver}>
        {bezig ? 'Bezig…' : kan ? '✋ Overnemen' : `Overnemen kan over ${wacht} s`}
      </button>
      {!direct && !kan && <p className="sk-overnemen-stil">De scheidsrechter kan meteen overnemen.</p>}
      {fout && (
        <p className="sk-overnemen-fout" role="alert">
          {fout}
        </p>
      )}
    </div>
  )
}
