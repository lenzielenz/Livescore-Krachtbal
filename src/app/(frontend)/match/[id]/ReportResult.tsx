'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import './report-result.css'

// Uitslag doorgeven ná de wedstrijd: is een match gespeeld zonder live-notatie, dan vult een
// ingelogde supporter hier in één keer de eindstand in. De server schrijft ze als simpleScore
// weg (afgeleide stand, geen los scoreveld) en de vertrouwenslaag labelt ze 🟡 tot andere
// supporters bevestigen. Na het doorgeven herlaadt de pagina: eindstand + bevestig-knoppen.
export function ReportResult({
  matchId,
  loggedIn,
  homeName,
  awayName,
}: {
  matchId: number
  loggedIn: boolean
  homeName: string
  awayName: string
}) {
  const router = useRouter()
  const [home, setHome] = useState('')
  const [away, setAway] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const h = Number(home)
    const a = Number(away)
    if (!Number.isInteger(h) || !Number.isInteger(a) || h < 0 || a < 0 || h > 199 || a > 199) {
      setErr('Geef een geldige eindstand op.')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch(`/api/match/${matchId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'reportresult', home: h, away: a, opId: crypto.randomUUID() }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(j.error || 'Doorgeven mislukt — probeer opnieuw.')
      // Server-pagina opnieuw opbouwen: eindstand, vertrouwenslabel en napraatblokken verschijnen.
      router.refresh()
    } catch (e2) {
      setErr((e2 as Error).message)
      setBusy(false)
    }
  }

  if (!loggedIn) {
    return (
      <section className="rr" id="uitslag">
        <h3 className="rr-h">🏁 Wedstrijd gespeeld?</h3>
        <p className="rr-note">
          <Link href={`/inloggen?next=/match/${matchId}`}>Log in</Link> en geef als eerste de eindstand
          door — andere supporters bevestigen ze daarna.
        </p>
      </section>
    )
  }

  return (
    <section className="rr" id="uitslag">
      <h3 className="rr-h">🏁 Wedstrijd gespeeld? Geef de uitslag door</h3>
      <form className="rr-form" onSubmit={submit}>
        <span className="rr-team">{homeName}</span>
        <input className="rr-score" type="number" min={0} max={199} inputMode="numeric" value={home} onChange={(e) => setHome(e.target.value)} placeholder="–" aria-label={`Eindstand ${homeName}`} />
        <span className="rr-dash">–</span>
        <input className="rr-score" type="number" min={0} max={199} inputMode="numeric" value={away} onChange={(e) => setAway(e.target.value)} placeholder="–" aria-label={`Eindstand ${awayName}`} />
        <span className="rr-team away">{awayName}</span>
        <button type="submit" className="rr-send" disabled={busy}>{busy ? '…' : 'Uitslag doorgeven'}</button>
      </form>
      <p className="rr-hint">
        De wedstrijd wordt hiermee afgesloten met deze eindstand. Andere supporters kunnen ze daarna
        bevestigen of betwisten — zo blijft het bord betrouwbaar.
      </p>
      {err && <p className="rr-err">{err}</p>}
    </section>
  )
}
