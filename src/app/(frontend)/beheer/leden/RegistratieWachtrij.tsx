'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

import { toast } from '@/components/Toaster'
import { formatDateBE } from '@/lib/datetime'
import { keuringGeldig } from '@/lib/registratie'

export type Aanvraag = {
  id: number
  naam: string
  clubNaam: string
  teamNaam: string
  birthDate: string
  geslacht: string
  soortLid: string
  medischeKeuringOp: string
  attestUrl: string | null
  ingediendOp: string
  vergunningsnummer: string
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const datum = (s: string) => (s ? formatDateBE(s) : '—')

// Wachtrij van de federatie: wat clubs hebben ingediend. Attest openen, goedkeuren in één klik
// (ook alles tegelijk), of afkeuren met een reden die de club te zien krijgt.
export function RegistratieWachtrij({ aanvragen }: { aanvragen: Aanvraag[] }) {
  const router = useRouter()
  const [club, setClub] = useState('')
  const [zoek, setZoek] = useState('')
  const [gekozen, setGekozen] = useState<Set<number>>(new Set())
  const [nummers, setNummers] = useState<Record<number, string>>(() =>
    Object.fromEntries(aanvragen.map((a) => [a.id, a.vergunningsnummer])),
  )
  const [afkeurVoor, setAfkeurVoor] = useState<number | null>(null)
  const [reden, setReden] = useState('')
  const [bezig, setBezig] = useState(false)

  const clubs = useMemo(() => [...new Set(aanvragen.map((a) => a.clubNaam))].sort(), [aanvragen])
  const zichtbaar = useMemo(() => {
    const q = norm(zoek.trim())
    return aanvragen.filter((a) => (!club || a.clubNaam === club) && (!q || norm(`${a.naam} ${a.teamNaam}`).includes(q)))
  }, [aanvragen, club, zoek])

  const beslis = async (ids: number[], besluit: 'goedkeuren' | 'afkeuren', r?: string) => {
    if (!ids.length) return
    setBezig(true)
    try {
      const res = await fetch('/api/federatie/registraties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          playerIds: ids,
          besluit,
          reden: r,
          vergunningsnummers: Object.fromEntries(ids.map((id) => [id, nummers[id] ?? ''])),
        }),
      })
      const d = (await res.json().catch(() => ({}))) as { error?: string; verwerkt?: number[] }
      if (!res.ok) {
        toast('error', d.error ?? 'Mislukt.')
        return
      }
      const n = d.verwerkt?.length ?? 0
      toast('success', `${n} ${n === 1 ? 'registratie' : 'registraties'} ${besluit === 'goedkeuren' ? 'goedgekeurd' : 'afgekeurd'}.`)
      setGekozen(new Set())
      setAfkeurVoor(null)
      setReden('')
      router.refresh()
    } finally {
      setBezig(false)
    }
  }

  if (aanvragen.length === 0) {
    return (
      <div className="fw-wrap">
        <div className="fw-kop">
          <h2>📥 Aanvragen van clubs</h2>
          <span className="cl-sub">Niets te doen — geen ingediende registraties.</span>
        </div>
      </div>
    )
  }

  const alleZichtbaarGekozen = zichtbaar.length > 0 && zichtbaar.every((a) => gekozen.has(a.id))

  return (
    <div className="fw-wrap">
      <div className="fw-kop">
        <h2>📥 Aanvragen van clubs ({aanvragen.length})</h2>
        <span className="cl-sub">Open het attest, controleer en keur goed. Goedkeuren maakt de vergunning geldig.</span>
      </div>
      <div className="cl-toolbar">
        <select className="acc-club" value={club} onChange={(e) => setClub(e.target.value)} aria-label="Filter op club">
          <option value="">Alle clubs</option>
          {clubs.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input className="acc-search" type="search" value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek op naam of ploeg…" aria-label="Zoek aanvraag" />
        <label className="led-todo">
          <input
            type="checkbox"
            checked={alleZichtbaarGekozen}
            onChange={() =>
              setGekozen(alleZichtbaarGekozen ? new Set() : new Set(zichtbaar.map((a) => a.id)))
            }
          />{' '}
          alles kiezen
        </label>
        <button type="button" className="cl-btn cl-btn-primary" disabled={bezig || gekozen.size === 0} onClick={() => beslis([...gekozen], 'goedkeuren')}>
          ✅ Goedkeuren ({gekozen.size})
        </button>
      </div>
      {zichtbaar.map((a) => {
        const keuringOk = a.soortLid === 'lid' || keuringGeldig(a.medischeKeuringOp)
        return (
          <div key={a.id} className="fw-rij">
            <input
              type="checkbox"
              checked={gekozen.has(a.id)}
              onChange={() =>
                setGekozen((s) => {
                  const n = new Set(s)
                  if (n.has(a.id)) n.delete(a.id)
                  else n.add(a.id)
                  return n
                })
              }
              aria-label={`Kies ${a.naam}`}
            />
            <div className="fw-gegevens">
              <span className="cl-naam">
                {a.naam} <span className="acc-count">· {a.clubNaam} · {a.teamNaam}</span>
              </span>
              <span className="cl-sub">
                {a.soortLid === 'lid' ? 'Gewoon lid' : 'Speler'} · {a.geslacht === 'v' ? 'vrouw' : a.geslacht === 'm' ? 'man' : '—'} · geboren{' '}
                {datum(a.birthDate)}
                {a.soortLid !== 'lid' && (
                  <>
                    {' '}
                    · keuring <span className={keuringOk ? '' : 'fw-warn'}>{datum(a.medischeKeuringOp)}{keuringOk ? '' : ' (verlopen)'}</span>
                  </>
                )}{' '}
                · ingediend {datum(a.ingediendOp)}
              </span>
            </div>
            <div className="fw-acties">
              {a.attestUrl ? (
                <a className="cl-btn" href={a.attestUrl} target="_blank" rel="noopener noreferrer">
                  📄 Attest
                </a>
              ) : (
                a.soortLid !== 'lid' && <span className="fw-warn">geen attest</span>
              )}
              {a.soortLid !== 'lid' && (
                <input
                  className="fw-nr"
                  value={nummers[a.id] ?? ''}
                  onChange={(e) => setNummers((m) => ({ ...m, [a.id]: e.target.value }))}
                  placeholder="vergunningsnr."
                  aria-label={`Vergunningsnummer ${a.naam}`}
                />
              )}
              <button type="button" className="cl-btn cl-btn-primary" disabled={bezig} onClick={() => beslis([a.id], 'goedkeuren')}>
                ✅
              </button>
              <button type="button" className="cl-btn cl-btn-danger" disabled={bezig} onClick={() => setAfkeurVoor(afkeurVoor === a.id ? null : a.id)}>
                Afkeuren
              </button>
            </div>
            {afkeurVoor === a.id && (
              <div className="fw-afkeur">
                <input
                  className="cl-reden"
                  value={reden}
                  onChange={(e) => setReden(e.target.value)}
                  placeholder="Reden (de club ziet dit), bv. attest onleesbaar"
                  autoFocus
                />
                <button type="button" className="cl-btn cl-btn-danger" disabled={bezig || !reden.trim()} onClick={() => beslis([a.id], 'afkeuren', reden)}>
                  Afkeuren bevestigen
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
