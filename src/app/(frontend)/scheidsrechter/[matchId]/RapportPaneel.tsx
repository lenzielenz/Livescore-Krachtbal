'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { toast } from '@/components/Toaster'
import { formatDateTimeBE } from '@/lib/datetime'

type Aanleiding = 'voorbehoud' | 'uitsluiting' | 'niet_gespeeld' | 'incident' | 'ander'
export type RapportKort = {
  id: number
  aanleidingen: Aanleiding[]
  relaas: string
  ondertekendNaam: string
  ondertekendOp: string
  status: string
  besluit: string | null
  bijlagen: { id: number; naam: string; url: string | null }[]
}

const LABEL: Record<Aanleiding, string> = {
  voorbehoud: 'Voorbehoud aangetekend',
  uitsluiting: 'Uitsluiting',
  niet_gespeeld: 'Wedstrijd niet (volledig) gespeeld',
  incident: 'Incident of onsportief gedrag',
  ander: 'Andere onregelmatigheid',
}
const MIN = 30

/**
 * Het scheidsrechtersrapport (RCVK item 27): wat er gebeurde, voor het scheidsrechterscomité. Verplicht
 * bij een voorbehoud, een uitsluiting of een wedstrijd die niet gespeeld kon worden — dat leest het
 * platform van het blad (`verplicht`). Ondertekenen = je naam typen en indienen; daarna verandert het
 * rapport niet meer. Een aanvulling is een nieuw rapport.
 */
export function RapportPaneel({
  matchId,
  verplicht,
  rapporten,
  standaardNaam,
}: {
  matchId: string | number
  verplicht: Aanleiding[]
  rapporten: RapportKort[]
  standaardNaam: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(verplicht.length > 0 && rapporten.length === 0)
  const [keuze, setKeuze] = useState<Set<Aanleiding>>(new Set(verplicht))
  const [relaas, setRelaas] = useState('')
  const [naam, setNaam] = useState(standaardNaam)
  const [bestanden, setBestanden] = useState<File[]>([])
  const [bezig, setBezig] = useState(false)

  const wissel = (a: Aanleiding) =>
    setKeuze((k) => {
      const n = new Set(k)
      if (n.has(a)) n.delete(a)
      else n.add(a)
      return n
    })

  const indienen = async () => {
    setBezig(true)
    try {
      const f = new FormData()
      f.set('matchId', String(matchId))
      for (const a of keuze) f.append('aanleidingen', a)
      f.set('relaas', relaas)
      f.set('naam', naam)
      for (const b of bestanden) f.append('bijlagen', b)
      const res = await fetch('/api/sr-rapport', { method: 'POST', credentials: 'include', body: f })
      const d = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) return toast('error', d.error ?? 'Indienen mislukt.')
      toast('success', 'Rapport ondertekend en naar het scheidsrechterscomité gestuurd.')
      setRelaas('')
      setBestanden([])
      setOpen(false)
      router.refresh()
    } finally {
      setBezig(false)
    }
  }

  const ontbreekt = verplicht.length > 0 && rapporten.length === 0
  return (
    <section className="wb-card" id="rapport" style={{ marginBottom: 16 }}>
      <h2>🧑‍⚖️ Scheidsrechtersrapport</h2>
      <p className="wb-sub">
        {ontbreekt
          ? `Verplicht voor deze wedstrijd: ${verplicht.map((a) => LABEL[a].toLowerCase()).join(', ')}. Het rapport gaat naar het scheidsrechterscomité (RCVK item 27).`
          : 'Bij een onregelmatigheid, een voorbehoud of een wedstrijd die niet gespeeld kon worden, maak je een rapport voor het scheidsrechterscomité (RCVK item 27).'}
      </p>

      {rapporten.map((r) => (
        <div key={r.id} className="wb-sub" style={{ borderLeft: '3px solid var(--accent)', paddingLeft: 10, margin: '8px 0' }}>
          <strong>Rapport {r.id}</strong> — {r.aanleidingen.map((a) => LABEL[a] ?? a).join(', ')} · ondertekend door {r.ondertekendNaam} op{' '}
          {formatDateTimeBE(r.ondertekendOp, { dateStyle: 'short', timeStyle: 'short' })} ·{' '}
          {r.status === 'afgehandeld' ? '✅ afgehandeld' : '⏳ bij het comité'}{' '}
          <a href={`/api/sr-rapport/${r.id}/pdf`} target="_blank" rel="noreferrer">
            📄 PDF
          </a>
          {r.bijlagen.length > 0 && (
            <>
              {' · bijlagen: '}
              {r.bijlagen.map((b, i) => (
                <span key={b.id}>
                  {i > 0 && ', '}
                  {b.url ? (
                    <a href={b.url} target="_blank" rel="noreferrer">
                      {b.naam}
                    </a>
                  ) : (
                    b.naam
                  )}
                </span>
              ))}
            </>
          )}
          {r.besluit && <div style={{ marginTop: 4 }}>Besluit: {r.besluit}</div>}
        </div>
      ))}

      {!open ? (
        <button type="button" className={`wb-btn ${ontbreekt ? 'wb-btn-primary' : ''}`} onClick={() => setOpen(true)}>
          {rapporten.length ? '➕ Aanvullend rapport' : '📝 Rapport opmaken'}
        </button>
      ) : (
        <>
          <fieldset style={{ border: 0, padding: 0, margin: '8px 0' }}>
            <legend className="wb-sub">Waarover</legend>
            {(Object.keys(LABEL) as Aanleiding[]).map((a) => (
              <label key={a} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={keuze.has(a)} onChange={() => wissel(a)} />
                {LABEL[a]}
              </label>
            ))}
          </fieldset>
          <label className="wb-sub" style={{ display: 'block' }}>
            Relaas van de feiten — wat, wanneer (stand, speeltijd), wie
            <textarea className="wb-input" rows={6} value={relaas} onChange={(e) => setRelaas(e.target.value)} style={{ width: '100%' }} />
            <span style={{ fontSize: '0.8rem' }}>{relaas.trim().length < MIN ? `Nog ${MIN - relaas.trim().length} tekens.` : '✓'}</span>
          </label>
          <label className="wb-sub" style={{ display: 'block', marginTop: 8 }}>
            Bijlagen (foto of PDF, max. 5 × 10 MB)
            <input
              type="file"
              multiple
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={(e) => setBestanden(Array.from(e.target.files ?? []).slice(0, 5))}
            />
          </label>
          <label className="wb-sub" style={{ display: 'block', marginTop: 8 }}>
            Ondertekenen met je naam
            <input className="wb-input" value={naam} onChange={(e) => setNaam(e.target.value)} />
          </label>
          <p className="wb-sub" style={{ fontSize: '0.8rem' }}>Na het indienen verandert het rapport niet meer. Een aanvulling dien je als nieuw rapport in.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="wb-btn wb-btn-primary"
              disabled={bezig || keuze.size === 0 || relaas.trim().length < MIN || naam.trim().length < 2}
              onClick={() => void indienen()}
            >
              {bezig ? 'Bezig…' : '✍️ Ondertekenen en indienen'}
            </button>
            <button type="button" className="wb-btn" disabled={bezig} onClick={() => setOpen(false)}>
              Annuleren
            </button>
          </div>
        </>
      )}
    </section>
  )
}
