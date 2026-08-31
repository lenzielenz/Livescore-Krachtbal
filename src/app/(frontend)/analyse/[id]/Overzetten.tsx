'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import './video-tijdlijn.css'

// De laatste stap van de video-weg: de bevestigde voorstellen in de wedstrijd zetten.
//
// Tot hier is alles omkeerbaar geweest — een voorstel bevestigen of afwijzen kan je herzien.
// Wat hier gebeurt is dat niet: worpen zijn onwijzigbaar. Vandaar dat dit scherm eerst laat
// zien wat er zou gebeuren (de server rekent het droog voor), inclusief wat er afvalt en wat
// deze weg niet kan, en dat de knop pas daarna komt.

type Rapport = {
  overgezet: number
  overgeslagen: { videoTimeS: number; reden: string }[]
  geweigerd: { videoTimeS: number; reden: string }[]
  droog: boolean
  tweedeHelftVanaf: number | null
  beperkingen: string[]
  metRugnummer?: number
  vrijeWorpen?: number
}

const klok = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

export function Overzetten({ matchId, alWorpen }: { matchId: number; alWorpen: number }) {
  const router = useRouter()
  const [plan, setPlan] = useState<Rapport | null>(null)
  const [gedaan, setGedaan] = useState<Rapport | null>(null)
  const [fout, setFout] = useState<string | null>(null)
  const [bezig, setBezig] = useState(false)
  const [zeker, setZeker] = useState(false)

  const haal = useCallback(async () => {
    try {
      const res = await fetch(`/api/cv/match/${matchId}/overzetten`)
      const data = await res.json()
      if (!res.ok) {
        setFout(String(data?.error ?? ''))
        setPlan(null)
        return
      }
      setFout(null)
      setPlan(data as Rapport)
    } catch {
      /* stil: dit blok is niet de hoofdzaak van de pagina */
    }
  }, [matchId])

  useEffect(() => {
    void haal()
  }, [haal])

  const overzetten = async () => {
    setBezig(true)
    setFout(null)
    try {
      const res = await fetch(`/api/cv/match/${matchId}/overzetten`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bevestig: true }),
      })
      const data = await res.json()
      if (!res.ok) {
        setFout(String(data?.error ?? 'Overzetten mislukt.'))
        return
      }
      setGedaan(data as Rapport)
      // De veldkaart, de statistieken en het scoreverloop leven van de worpen: die staan er nu.
      router.refresh()
    } catch {
      setFout('De server antwoordde niet.')
    } finally {
      setBezig(false)
    }
  }

  if (gedaan) {
    return (
      <section className="sa" id="overzetten">
        <h3 className="sa-h3">✅ In de wedstrijd gezet</h3>
        <p className="sa-klaar">
          {gedaan.overgezet} worpen overgezet. De veldkaart, de statistieken en het scoreverloop
          hieronder zijn nu gevuld.
        </p>
        {gedaan.beperkingen.length > 0 && (
          <ul className="ov-lijst">
            {gedaan.beperkingen.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        )}
        {gedaan.geweigerd.length > 0 && (
          <p className="sa-hint">
            {gedaan.geweigerd.length} worp(en) zijn niet doorgekomen:{' '}
            {gedaan.geweigerd.slice(0, 4).map((g) => `${klok(g.videoTimeS)} (${g.reden})`).join(' · ')}
            {gedaan.geweigerd.length > 4 && ' …'}
          </p>
        )}
      </section>
    )
  }

  if (alWorpen > 0) return null
  if (!plan && !fout) return null

  return (
    <section className="sa" id="overzetten">
      <h3 className="sa-h3">🎬 De voorstellen in de wedstrijd zetten</h3>
      <p className="sa-lead">
        Wat je bevestigd hebt, wordt hiermee een échte worp — met score, balbezit, zone en
        afstand, alsof het aangetekend was. Daarna werken de veldkaart, de spelerskaarten en het
        scoreverloop. Dit kan niet ongedaan gemaakt worden zonder de wedstrijd terug op nul te
        zetten: worpen zijn onwijzigbaar.
      </p>

      {fout && <p className="sa-let-op">{fout}</p>}

      {plan && (
        <>
          <div className="ms-cijfers">
            <span>
              <strong>{plan.overgezet}</strong>
              <em>worpen gaan over</em>
            </span>
            {plan.overgeslagen.length > 0 && (
              <span>
                <strong>{plan.overgeslagen.length}</strong>
                <em>vallen af</em>
              </span>
            )}
          </div>

          {plan.overgeslagen.length > 0 && (
            <p className="sa-hint">
              Valt af:{' '}
              {plan.overgeslagen.slice(0, 5).map((o) => `${klok(o.videoTimeS)} (${o.reden})`).join(' · ')}
              {plan.overgeslagen.length > 5 && ` … (+${plan.overgeslagen.length - 5})`}
            </p>
          )}

          {/* Wat deze weg niet kan. Bewust vóór de knop: het komt straks in de statistieken
              terecht, en dan is het te laat om het te ontdekken. */}
          {plan.beperkingen.length > 0 && (
            <ul className="ov-lijst">
              {plan.beperkingen.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}

          <label className="sa-vink">
            <input type="checkbox" checked={zeker} onChange={(e) => setZeker(e.target.checked)} />
            <span>Ik heb hierboven gelezen wat er overgaat en wat niet.</span>
          </label>

          <div className="sa-acties">
            <button
              type="button"
              className="va-btn primary"
              disabled={bezig || !zeker || plan.overgezet === 0}
              onClick={() => void overzetten()}
            >
              {bezig ? 'Bezig…' : `▶ ${plan.overgezet} worpen in de wedstrijd zetten`}
            </button>
          </div>
        </>
      )}
    </section>
  )
}
