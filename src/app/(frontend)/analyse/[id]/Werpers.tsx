'use client'

import { useCallback, useEffect, useState } from 'react'

import { dekking, type Werpergroep } from '@/lib/cv-werpers'
import './video-tijdlijn.css'

// Wie is wie: de werpers die de analyse onderscheidde een naam geven.
//
// Het model leest geen rugnummers van truitjes — op dertig meter is zo'n nummer een handvol
// pixels — maar het volgt wél dezelfde persoon zolang die in beeld blijft. Elke worp draagt
// daardoor het volgnummer van zijn werper, en hier zeg je één keer per werper welke speler dat
// is. Acht keuzes in plaats van zestig.
//
// Twee dingen die je moet weten en die hier ook staan:
//  • een werper die even uit beeld liep, komt terug als een nieuwe werper. Dat is geen fout:
//    wijs die gewoon aan dezelfde speler toe.
//  • worpen waarbij het model niemand kon volgen, vallen buiten élke groep. Die blijven een gok,
//    hoe volledig je de rest ook toewijst — vandaar dat ze apart geteld staan.

type Speler = { id: number; naam: string; rugnummer: number; kant: 'home' | 'away' }

const klok = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

export function Werpers({ matchId, naarTijd }: { matchId: number; naarTijd?: (s: number) => void }) {
  const [groepen, setGroepen] = useState<Werpergroep[] | null>(null)
  const [spelers, setSpelers] = useState<Speler[]>([])
  const [toewijzing, setToewijzing] = useState<Record<string, number>>({})
  const [zonderWerper, setZonderWerper] = useState(0)
  const [bezig, setBezig] = useState(false)
  const [bewaard, setBewaard] = useState<string | null>(null)

  const haal = useCallback(async () => {
    try {
      const res = await fetch(`/api/cv/match/${matchId}/werpers`)
      if (!res.ok) return
      const d = (await res.json()) as {
        groepen: Werpergroep[]
        toewijzing: Record<string, number>
        spelers: Speler[]
        zonderWerper: number
      }
      setGroepen(d.groepen ?? [])
      setToewijzing(d.toewijzing ?? {})
      setSpelers(d.spelers ?? [])
      setZonderWerper(d.zonderWerper ?? 0)
    } catch {
      /* stil: dit blok is niet de hoofdzaak van de pagina */
    }
  }, [matchId])

  useEffect(() => {
    void haal()
  }, [haal])

  const zet = async (werper: number, spelerId: number | null) => {
    const volgende = { ...toewijzing }
    if (spelerId == null) delete volgende[String(werper)]
    else volgende[String(werper)] = spelerId
    setToewijzing(volgende)
    setBezig(true)
    setBewaard(null)
    try {
      const res = await fetch(`/api/cv/match/${matchId}/werpers`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ toewijzing: volgende }),
      })
      if (res.ok) setBewaard('Bewaard.')
    } finally {
      setBezig(false)
    }
  }

  if (!groepen || groepen.length === 0) return null

  const d = dekking(groepen, toewijzing)

  return (
    <section className="sa" id="werpers">
      <h3 className="sa-h3">🙋 Wie wierp wat?</h3>
      <p className="sa-lead">
        Het model kan geen rugnummer van een truitje lezen, maar het volgt wél dezelfde persoon
        zolang die in beeld blijft. Hieronder staat elke werper die het onderscheidde, met het
        meeste werk bovenaan. Zeg één keer wie dat is en élke worp van die werper komt op de
        juiste naam.
      </p>

      <div className="ms-cijfers">
        <span>
          <strong>{Math.round(d.deel * 100)}%</strong>
          <em>
            {d.toegewezen} van de {d.worpen} worpen toegewezen
          </em>
        </span>
        <span>
          <strong>{groepen.length}</strong>
          <em>werpers gevonden</em>
        </span>
        {zonderWerper > 0 && (
          <span>
            <strong>{zonderWerper}</strong>
            <em>worpen zonder werper</em>
          </span>
        )}
      </div>

      <table className="wp-tabel">
        <thead>
          <tr>
            <th>Werper</th>
            <th>Worpen</th>
            <th>Wanneer</th>
            <th>Is</th>
          </tr>
        </thead>
        <tbody>
          {groepen.map((g) => (
            <tr key={g.werper} className={toewijzing[String(g.werper)] ? 'gezet' : ''}>
              <th scope="row">
                #{g.werper}
                {g.side && <span className="wp-kant"> {g.side === 'home' ? 'thuis' : 'uit'}</span>}
              </th>
              <td>
                {g.worpen}
                {g.bevestigd < g.worpen && <span className="wp-kant"> ({g.bevestigd} bevestigd)</span>}
              </td>
              <td>
                {naarTijd ? (
                  <button type="button" className="ms-sprong" onClick={() => naarTijd(g.eerste)}>
                    {klok(g.eerste)}
                  </button>
                ) : (
                  klok(g.eerste)
                )}
                {g.laatste > g.eerste && <span className="wp-kant"> – {klok(g.laatste)}</span>}
              </td>
              <td>
                <select
                  value={toewijzing[String(g.werper)] ?? ''}
                  disabled={bezig}
                  onChange={(e) => void zet(g.werper, e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">— wie is dit? —</option>
                  {(['home', 'away'] as const).map((kant) => (
                    <optgroup key={kant} label={kant === 'home' ? 'Thuisploeg' : 'Uitploeg'}>
                      {spelers
                        .filter((s) => s.kant === kant)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.rugnummer} {s.naam}
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
        Liep een speler even uit beeld, dan komt die terug als een nieuwe werper — wijs die gewoon
        aan dezelfde speler toe. Dezelfde speler mag zo vaak voorkomen als nodig.
        {zonderWerper > 0 && (
          <>
            {' '}
            Bij {zonderWerper} worp(en) kon het model niemand volgen; die blijven een gok, hoe
            volledig je de rest ook invult.
          </>
        )}
      </p>
      {bewaard && <p className="sa-klaar">{bewaard}</p>}
    </section>
  )
}
