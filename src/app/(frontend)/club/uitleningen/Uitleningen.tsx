'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

import { toast } from '@/components/Toaster'

export type UitleningRij = {
  id: number
  speler: string
  categorie: string
  vanClub: string
  naarClub: string
  ploeg: string
  competitie: string
  status: 'wacht_ontvanger' | 'wacht_federatie' | 'bevestigd' | 'geweigerd' | 'ingetrokken'
  statusLabel: string
  wijUitlener: boolean
  wijOntvanger: boolean
  tekenVan: string | null
  tekenNaar: string | null
  toelichting: string | null
}

const KLEUR: Record<UitleningRij['status'], string> = {
  wacht_ontvanger: '#e0a23d',
  wacht_federatie: '#3d8be0',
  bevestigd: '#2a9d6a',
  geweigerd: '#e0533d',
  ingetrokken: '#7a8699',
}

export function Uitleningen({
  rijen,
  staf,
  spelers,
  ploegen,
  standaardNaam,
}: {
  rijen: UitleningRij[]
  staf: boolean
  spelers: { id: number; naam: string; categorie: string }[]
  ploegen: { id: number; naam: string; club: string; categorie: string }[]
  standaardNaam: string
}) {
  const router = useRouter()
  const [bezig, setBezig] = useState(false)
  const [nieuw, setNieuw] = useState(false)
  const [spelerId, setSpelerId] = useState('')
  const [ploegId, setPloegId] = useState('')
  const [adres, setAdres] = useState('')
  const [naam, setNaam] = useState(standaardNaam)

  // Enkel ploegen van de categorie van de gekozen speler of hoger hebben zin; de server controleert de rest.
  const gekozen = spelers.find((s) => String(s.id) === spelerId)
  const ploegenPerClub = useMemo(() => {
    const m = new Map<string, typeof ploegen>()
    for (const p of ploegen) m.set(p.club, [...(m.get(p.club) ?? []), p])
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [ploegen])

  const post = async (body: Record<string, unknown>, ok: string) => {
    setBezig(true)
    try {
      const res = await fetch('/api/uitlening', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) })
      const d = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast('error', d.error ?? 'Mislukt.')
        return false
      }
      toast('success', ok)
      router.refresh()
      return true
    } catch {
      toast('error', 'Geen verbinding.')
      return false
    } finally {
      setBezig(false)
    }
  }

  const opstellen = async () => {
    const gelukt = await post({ actie: 'opstellen', spelerId: Number(spelerId), naarPloegId: Number(ploegId), adres, naam }, 'Overeenkomst opgesteld en getekend. De ontvangende club krijgt een melding.')
    if (gelukt) {
      setNieuw(false)
      setSpelerId('')
      setPloegId('')
      setAdres('')
    }
  }

  return (
    <>
      {staf && (
        <div style={{ marginBottom: 16 }}>
          {!nieuw ? (
            <button type="button" className="ft-btn ft-primair" onClick={() => setNieuw(true)}>
              ➕ Een jeugdspeler uitlenen
            </button>
          ) : (
            <section className="wb-card">
              <h2>Nieuwe overeenkomst</h2>
              <div className="bl-form">
                <label>
                  Speler (eigen club)
                  <select className="wb-input" value={spelerId} onChange={(e) => setSpelerId(e.target.value)}>
                    <option value="">Kies…</option>
                    {spelers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.naam} ({s.categorie})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Naar de ploeg (competitie)
                  <select className="wb-input" value={ploegId} onChange={(e) => setPloegId(e.target.value)}>
                    <option value="">Kies…</option>
                    {ploegenPerClub.map(([club, lijst]) => (
                      <optgroup key={club} label={club || 'Andere club'}>
                        {lijst.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.naam} ({p.categorie})
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
                <label className="bl-breed">
                  Adres van de speler (vermeld in de overeenkomst)
                  <input className="wb-input" value={adres} onChange={(e) => setAdres(e.target.value)} placeholder="Straat nr, postcode gemeente" />
                </label>
                <label>
                  Ondertekenen met je naam
                  <input className="wb-input" value={naam} onChange={(e) => setNaam(e.target.value)} />
                </label>
              </div>
              {gekozen && <p className="wb-sub">Naam, leeftijd en categorie ({gekozen.categorie}) komen uit het spelersdossier.</p>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="ft-btn ft-primair"
                  disabled={bezig || !spelerId || !ploegId || adres.trim().length < 5 || naam.trim().length < 2}
                  onClick={() => void opstellen()}
                >
                  {bezig ? 'Bezig…' : '✍️ Ondertekenen en versturen'}
                </button>
                <button type="button" className="ft-btn" onClick={() => setNieuw(false)} disabled={bezig}>
                  Annuleren
                </button>
              </div>
            </section>
          )}
        </div>
      )}

      {rijen.length === 0 ? (
        <p className="empty">Nog geen uitleningen.</p>
      ) : (
        <div className="od-lijst" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
          {rijen.map((r) => (
            <Kaart key={r.id} r={r} bezig={bezig} standaardNaam={standaardNaam} post={post} />
          ))}
        </div>
      )}
    </>
  )
}

function Kaart({
  r,
  bezig,
  standaardNaam,
  post,
}: {
  r: UitleningRij
  bezig: boolean
  standaardNaam: string
  post: (body: Record<string, unknown>, ok: string) => Promise<boolean>
}) {
  const [naam, setNaam] = useState(standaardNaam)
  const [reden, setReden] = useState('')
  const [intrekken, setIntrekken] = useState(false)
  const magTekenen = r.wijOntvanger && r.status === 'wacht_ontvanger'
  const magIntrekken = (r.wijUitlener || r.wijOntvanger) && (r.status === 'wacht_ontvanger' || r.status === 'wacht_federatie')
  return (
    <article className="od-kaart" style={{ borderColor: KLEUR[r.status] }}>
      <header className="od-kop">
        <strong>
          {r.speler} {r.categorie ? `(${r.categorie})` : ''}
        </strong>
        <span className="od-status">{r.statusLabel}</span>
      </header>
      <p className="od-tekst">
        {r.vanClub} → {r.naarClub}, ploeg {r.ploeg}
      </p>
      <p className="od-dim">
        Competitie {r.competitie}
        {r.tekenVan ? ` · getekend door ${r.tekenVan}` : ''}
        {r.tekenNaar ? ` en ${r.tekenNaar}` : ''}
      </p>
      {r.toelichting && <p className="od-dim">Toelichting: {r.toelichting}</p>}
      <p className="od-dim">
        <a href={`/api/uitlening/${r.id}/pdf`} target="_blank" rel="noreferrer">
          📄 Overeenkomst (PDF)
        </a>
      </p>
      {magTekenen && (
        <>
          <input className="ft-zoek" value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="Je naam (handtekening)" />
          <button
            type="button"
            className="ft-btn ft-primair"
            disabled={bezig || naam.trim().length < 2}
            onClick={() => void post({ actie: 'tekenen', id: r.id, naam }, 'Getekend. De overeenkomst ligt nu bij de federatie.')}
          >
            ✍️ Ondertekenen namens {r.naarClub}
          </button>
        </>
      )}
      {magIntrekken &&
        (intrekken ? (
          <>
            <textarea className="ft-zoek" rows={2} placeholder="Waarom trek je de overeenkomst in?" value={reden} onChange={(e) => setReden(e.target.value)} />
            <button type="button" className="ft-btn" disabled={bezig} onClick={() => void post({ actie: 'intrekken', id: r.id, reden }, 'Overeenkomst ingetrokken.')}>
              Intrekken bevestigen
            </button>
          </>
        ) : (
          <button type="button" className="ft-btn" disabled={bezig} onClick={() => setIntrekken(true)}>
            Intrekken
          </button>
        ))}
    </article>
  )
}
