'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { toast } from '@/components/Toaster'
import { brusselsParts, brusselsWallUtc, formatDateTimeBE } from '@/lib/datetime'
import type { PlannerWedstrijd } from './Planner'

// Het paneel dat opent als je in de planner op een wedstrijd tikt: alles wat de federatie aan één
// geplande wedstrijd aanpast, op één plaats.
//   • Datum en uur — gaat mee in de wijzigingen van de planner (botsingen meteen zichtbaar, ongedaan
//     maken werkt), en wordt bewaard met "Opslaan en iedereen verwittigen".
//   • Naar een ander weekend — zoals slepen: daarna een kolom aantikken.
//   • Scheidsrechter — meteen bewaard via /api/federatie/toewijzingen (beide scheidsrechters gemeld).
//   • Afgelasten — via /api/match/[id]/afgelasten (clubs en scheidsrechter gemeld); daarna plan je een
//     nieuwe datum hier of in /beheer/afgelastingen.

const twee = (n: number) => String(n).padStart(2, '0')
/** "YYYY-MM-DDTHH:MM" in Brusselse tijd: de waarde van een datetime-local-veld. */
const lokaal = (iso: string) => {
  const p = brusselsParts(new Date(iso))
  return `${p.year}-${twee(p.month)}-${twee(p.day)}T${twee(p.hour)}:${twee(p.minute)}`
}
const naarIso = (v: string): string | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v)
  if (!m) return null
  return brusselsWallUtc(+m[1], +m[2], +m[3], +m[4], +m[5]).toISOString()
}

export type PlannerRef = { id: number; naam: string; club: number | null }

export function WedstrijdPaneel({
  w,
  huidig,
  problemen,
  refs,
  onDatum,
  onWeekend,
  onSluit,
  onVernieuw,
}: {
  w: PlannerWedstrijd
  /** De datum zoals ze nu in de planner staat (met de nog niet bewaarde wijziging). */
  huidig: string
  problemen: { t: string; hard: boolean }[]
  refs: PlannerRef[]
  onDatum: (iso: string) => void
  onWeekend: () => void
  onSluit: () => void
  onVernieuw: () => void
}) {
  const [tijd, setTijd] = useState(lokaal(huidig))
  const [ref, setRef] = useState<string>(w.scheidsrechter != null ? String(w.scheidsrechter) : '')
  const [reden, setReden] = useState('')
  const [toelichting, setToelichting] = useState('')
  const [bezig, setBezig] = useState(false)

  // Ander kaartje gekozen, of de datum veranderde (slepen, ongedaan): het formulier volgt.
  useEffect(() => setTijd(lokaal(huidig)), [huidig, w.id])
  useEffect(() => setRef(w.scheidsrechter != null ? String(w.scheidsrechter) : ''), [w.id, w.scheidsrechter])

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onSluit()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onSluit])

  const nieuweIso = naarIso(tijd)
  const tijdGewijzigd = nieuweIso != null && nieuweIso !== huidig
  const nietBewaard = huidig !== w.datum
  // Scheidsrechters van een van beide clubs eerst wegzetten: die fluiten liever niet bij hun eigen club.
  const eigenClub = (r: PlannerRef) => r.club != null && (r.club === w.thuis.club || r.club === w.uit.club)

  const bewaarRef = async () => {
    setBezig(true)
    try {
      const res = await fetch('/api/federatie/toewijzingen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toewijzingen: [{ matchId: w.id, officialId: ref ? Number(ref) : null }] }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) return toast('error', j.error ?? 'Bewaren mislukt.')
      toast('success', ref ? 'Scheidsrechter bewaard — die kreeg een melding.' : 'Scheidsrechter weggehaald — die kreeg een melding.')
      onVernieuw()
    } catch {
      toast('error', 'Geen verbinding.')
    } finally {
      setBezig(false)
    }
  }

  const afgelasten = async () => {
    if (!reden) return toast('error', 'Kies de reden.')
    if (!window.confirm(`${w.thuis.naam} – ${w.uit.naam} afgelasten? Beide clubs en de scheidsrechter krijgen een melding.`)) return
    setBezig(true)
    try {
      const f = new FormData()
      f.set('reden', reden)
      if (toelichting.trim()) f.set('toelichting', toelichting.trim())
      const res = await fetch(`/api/match/${w.id}/afgelasten`, { method: 'POST', body: f })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) return toast('error', j.error ?? 'Afgelasten mislukt.')
      toast('success', 'Afgelast — iedereen is verwittigd. Plan een nieuwe datum wanneer die vastligt.')
      setReden('')
      setToelichting('')
      onVernieuw()
    } catch {
      toast('error', 'Geen verbinding.')
    } finally {
      setBezig(false)
    }
  }

  const huidigeRef = refs.find((r) => r.id === w.scheidsrechter)

  return (
    <>
      <div className="pl-schaduw" onClick={onSluit} aria-hidden />
      <aside className="pl-paneel" role="dialog" aria-modal="true" aria-labelledby="pl-paneel-titel">
        <header className="pl-paneel-kop">
          <div>
            <span className="pl-r1">
              {w.reeks}
              {w.afgelast ? ' · ⛈️ afgelast' : ''}
            </span>
            <h2 id="pl-paneel-titel">
              {w.thuis.naam} – {w.uit.naam}
            </h2>
            <span className="pl-r1">
              {w.thuis.clubNaam || '?'} – {w.uit.clubNaam || '?'}
            </span>
          </div>
          <button type="button" className="pl-sluit" onClick={onSluit} aria-label="Sluiten">
            ✕
          </button>
        </header>

        {problemen.length > 0 && (
          <div className="pl-blok">
            {problemen.map((p) => (
              <span key={p.t} className={p.hard ? 'pl-rood' : 'pl-oranje'}>
                {p.hard ? '⛔' : '⚠️'} {p.t}
              </span>
            ))}
          </div>
        )}

        <section className="pl-blok">
          <h3>📅 Datum en uur</h3>
          <input type="datetime-local" value={tijd} onChange={(e) => setTijd(e.target.value)} className="pl-veld" aria-label="Datum en aanvangsuur" />
          {nietBewaard && <span className="pl-oranje">Nog niet bewaard — was {formatDateTimeBE(w.datum)}</span>}
          <div className="pl-rij">
            <button type="button" className="ft-btn ft-primair" disabled={!tijdGewijzigd} onClick={() => nieuweIso && onDatum(nieuweIso)}>
              Toepassen
            </button>
            {nietBewaard && (
              <button type="button" className="ft-btn" onClick={() => onDatum(w.datum)}>
                Terug naar {formatDateTimeBE(w.datum)}
              </button>
            )}
            <button type="button" className="ft-btn" onClick={onWeekend}>
              ↔ Ander weekend kiezen
            </button>
          </div>
          <span className="pl-uitleg">Bewaren gebeurt met “Opslaan en iedereen verwittigen” bovenaan: clubs, scheidsrechter en spelers horen het nieuwe tijdstip.</span>
        </section>

        <section className="pl-blok">
          <h3>🧑‍⚖️ Scheidsrechter</h3>
          <select value={ref} onChange={(e) => setRef(e.target.value)} className="pl-veld" aria-label="Scheidsrechter">
            <option value="">— nog niemand —</option>
            {refs.filter((r) => !eigenClub(r)).map((r) => (
              <option key={r.id} value={r.id}>
                {r.naam}
              </option>
            ))}
            {refs.some(eigenClub) && (
              <optgroup label="Van een van beide clubs">
                {refs.filter(eigenClub).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.naam}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <div className="pl-rij">
            <button
              type="button"
              className="ft-btn ft-primair"
              disabled={bezig || ref === (w.scheidsrechter != null ? String(w.scheidsrechter) : '')}
              onClick={() => void bewaarRef()}
            >
              Bewaren
            </button>
            {huidigeRef && <span className="pl-uitleg">Nu: {huidigeRef.naam}</span>}
          </div>
        </section>

        {!w.afgelast ? (
          <details className="pl-blok">
            <summary>
              <h3>⛈️ Afgelasten</h3>
            </summary>
            <select value={reden} onChange={(e) => setReden(e.target.value)} className="pl-veld" aria-label="Reden">
              <option value="">Kies de reden…</option>
              <option value="terrein">Terrein onbespeelbaar</option>
              <option value="weer">Weersomstandigheden</option>
              <option value="ander">Andere reden</option>
            </select>
            <textarea value={toelichting} onChange={(e) => setToelichting(e.target.value)} className="pl-veld" rows={2} placeholder="Toelichting (optioneel)" maxLength={1000} />
            <button type="button" className="ft-btn" disabled={bezig || !reden} onClick={() => void afgelasten()}>
              Afgelasten en iedereen verwittigen
            </button>
          </details>
        ) : (
          <section className="pl-blok">
            <h3>⛈️ Afgelast</h3>
            <span className="pl-uitleg">
              Kies hierboven een nieuwe datum en bewaar: de wedstrijd is dan weer gepland. Foto’s en de reden staan bij{' '}
              <Link href="/beheer/afgelastingen">Afgelastingen</Link>.
            </span>
          </section>
        )}

        <nav className="pl-rij pl-links">
          <Link href={`/match/${w.id}`}>Wedstrijdpagina →</Link>
          <Link href={`/match/${w.id}/sheet`}>Wedstrijdblad →</Link>
        </nav>
      </aside>
    </>
  )
}
