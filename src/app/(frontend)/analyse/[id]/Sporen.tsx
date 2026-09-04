'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import type { SpoorInfo } from '@/lib/cv-fysiek'
import { CAMERA2_BASIS } from '@/lib/cv-samenvoegen'
import './video-tijdlijn.css'

// Wie is wie in de spelerstracking: de sporen die de analyse volgde een naam geven.
//
// De tracker volgt bewegende gedaantes, geen namen — en bij occlusie wisselt hij al eens van
// identiteit. Daarom is dit bewust een menselijke stap (dat was hij op de terminal ook, met een
// wie.json): per spoor zie je wanneer het leefde, waar het gemiddeld stond en hoeveel het liep,
// en zeg je één keer wie dat is. Meteen na elke wijziging herrekent de server de fysieke stats
// (loopafstand, sprintjes, topsnelheid) naar de spelerskaarten.
//
// Dit is een ándere toewijzing dan "Wie wierp wat?": werper-volgnummers komen uit het
// houdingsmodel, tracking-sporen uit de tracker — twee id-ruimtes die niets met elkaar delen.

type Speler = { id: number; naam: string; rugnummer: number; kant: 'home' | 'away' }

const klok = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const spoorLabel = (s: number) => (s >= CAMERA2_BASIS ? `camera 2 · spoor ${s - CAMERA2_BASIS}` : `spoor ${s}`)

export function Sporen({ matchId }: { matchId: number }) {
  const router = useRouter()
  const [sporen, setSporen] = useState<SpoorInfo[] | null>(null)
  const [spelers, setSpelers] = useState<Speler[]>([])
  const [toewijzing, setToewijzing] = useState<Record<string, number>>({})
  const [verouderd, setVerouderd] = useState(false)
  const [bezig, setBezig] = useState(false)
  const [melding, setMelding] = useState<string | null>(null)

  const haal = useCallback(async () => {
    try {
      const res = await fetch(`/api/cv/match/${matchId}/sporen`)
      if (!res.ok) return
      const d = (await res.json()) as {
        sporen: SpoorInfo[]
        toewijzing: Record<string, number>
        spelers: Speler[]
        verouderd?: boolean
      }
      setSporen(d.sporen ?? [])
      setToewijzing(d.toewijzing ?? {})
      setSpelers(d.spelers ?? [])
      setVerouderd(d.verouderd === true)
    } catch {
      /* stil: dit blok is niet de hoofdzaak van de pagina */
    }
  }, [matchId])

  useEffect(() => {
    void haal()
  }, [haal])

  const zet = async (spoor: number, spelerId: number | null) => {
    const volgende = { ...toewijzing }
    if (spelerId == null) delete volgende[String(spoor)]
    else volgende[String(spoor)] = spelerId
    setToewijzing(volgende)
    setBezig(true)
    setMelding(null)
    try {
      const res = await fetch(`/api/cv/match/${matchId}/sporen`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ toewijzing: volgende }),
      })
      if (res.ok) {
        const d = (await res.json()) as { fysiek?: { spelers: number; anoniem: number[] } | null }
        setVerouderd(false)
        setMelding(
          d.fysiek && d.fysiek.spelers > 0
            ? `Bewaard — fysieke stats herrekend voor ${d.fysiek.spelers} speler(s).`
            : 'Bewaard.',
        )
        // De sectie "Fysiek uit de video" is server-gerenderd: die moet de nieuwe cijfers zien.
        router.refresh()
      }
    } finally {
      setBezig(false)
    }
  }

  if (!sporen || sporen.length === 0) return null

  const toegewezen = sporen.filter((s) => toewijzing[String(s.spoor)]).length

  return (
    <section className="sa" id="sporen">
      <h3 className="sa-h3">🏃 Wie liep waar?</h3>
      <p className="sa-lead">
        De tracker volgde deze sporen over het veld. Zeg per spoor welke speler het is — de
        loopafstand, sprintjes en topsnelheid komen dan op de juiste spelerskaart. Wisselde het
        spoor van identiteit (dat gebeurt bij drukte), wijs de stukken dan gewoon allebei toe;
        ze tellen op.
      </p>

      {verouderd && (
        <p className="sa-let-op">
          De tracking is opnieuw gedraaid sinds de vorige toewijzing — de sporen zijn nieuw
          genummerd, dus die toewijzing telt niet meer. Wijs de sporen hieronder opnieuw toe.
        </p>
      )}

      <div className="ms-cijfers">
        <span>
          <strong>{toegewezen}</strong>
          <em>van de {sporen.length} sporen toegewezen</em>
        </span>
      </div>

      <table className="wp-tabel">
        <thead>
          <tr>
            <th>Spoor</th>
            <th>Wanneer</th>
            <th>Gemiddeld op</th>
            <th>Gelopen</th>
            <th>Is</th>
          </tr>
        </thead>
        <tbody>
          {sporen.map((s) => (
            <tr key={s.spoor} className={toewijzing[String(s.spoor)] ? 'gezet' : ''}>
              <th scope="row">{spoorLabel(s.spoor)}</th>
              <td>
                {klok(s.eerste)}
                {s.laatste > s.eerste && <span className="wp-kant"> – {klok(s.laatste)}</span>}
              </td>
              <td>
                {s.gemXM.toFixed(1)}, {s.gemYM.toFixed(1)} m
              </td>
              <td>
                {s.afstandM >= 1000 ? `${(s.afstandM / 1000).toFixed(2)} km` : `${s.afstandM.toFixed(0)} m`}
                {s.sprints > 0 && <span className="wp-kant"> · {s.sprints} sprint{s.sprints === 1 ? '' : 'jes'}</span>}
              </td>
              <td>
                <select
                  value={toewijzing[String(s.spoor)] ?? ''}
                  disabled={bezig}
                  onChange={(e) => void zet(s.spoor, e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">— wie is dit? —</option>
                  {(['home', 'away'] as const).map((kant) => (
                    <optgroup key={kant} label={kant === 'home' ? 'Thuisploeg' : 'Uitploeg'}>
                      {spelers
                        .filter((sp) => sp.kant === kant)
                        .map((sp) => (
                          <option key={sp.id} value={sp.id}>
                            {sp.rugnummer} {sp.naam}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="sa-hint">
        "Gemiddeld op" is de plek in veldmeters (breedte, lengte vanaf de thuis-achterlijn) — zo
        herken je een verdediger van een aanvaller. Sporen die je niet thuisbrengt (scheids,
        publiek langs de lijn) laat je gewoon leeg: die tellen nergens in mee. Let op de
        overlapzone: staat een speler tegelijk op beide camera&apos;s, dan kan dat stuk dubbel
        tellen — wijs bij twijfel per speler de camera toe die hem het best zag.
      </p>
      {melding && <p className="sa-klaar">{melding}</p>}
    </section>
  )
}
