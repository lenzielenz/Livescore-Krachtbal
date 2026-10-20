'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { toast } from '@/components/Toaster'
import { formatDateBE, formatDateTimeBE } from '@/lib/datetime'
import type { Dossier, OngevalRol } from '@/lib/ongeval-dossier'

const STATUS: Record<string, { label: string; kleur: string }> = {
  gemeld: { label: '📝 Documenten te bezorgen', kleur: '#e0a23d' },
  ingediend: { label: '⏳ Bij de federatie', kleur: '#5aa9e6' },
  afgehandeld: { label: '✅ Afgehandeld', kleur: '#2a9d6a' },
}
const SOORT: Record<string, string> = { aangifte: 'Aangifte', getuigschrift: 'Geneeskundig getuigschrift', ander: 'Ander document' }

/**
 * Eén ongevalsdossier (lib/ongeval-dossier.ts). De speler of ouder (en de club) downloadt de
 * aangifte en het getuigschrift, laadt ze ingevuld terug op en dient in; de federatie handelt af of
 * stuurt terug met een opmerking.
 */
export function OngevalDossierKaart({ d, rol }: { d: Dossier; rol: OngevalRol }) {
  const router = useRouter()
  const [soort, setSoort] = useState('aangifte')
  const [bestand, setBestand] = useState<File | null>(null)
  const [opmerking, setOpmerking] = useState('')
  const [bezig, setBezig] = useState(false)
  const st = STATUS[d.status] ?? STATUS.gemeld
  const heeft = (s: string) => d.documenten.some((x) => x.soort === s)

  const doe = async (fn: () => Promise<Response>, ok: string) => {
    setBezig(true)
    try {
      const res = await fn()
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) return toast('error', j.error ?? 'Mislukt.')
      toast('success', ok)
      router.refresh()
    } finally {
      setBezig(false)
    }
  }
  const actie = (actie: string, tekst: string) =>
    doe(
      () =>
        fetch(`/api/ongeval/${d.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ actie, opmerking }),
        }),
      tekst,
    )
  const opladen = () => {
    if (!bestand) return
    const fd = new FormData()
    fd.set('soort', soort)
    fd.set('bestand', bestand)
    void doe(() => fetch(`/api/ongeval/${d.id}/document`, { method: 'POST', body: fd, credentials: 'include' }), 'Document opgeladen.').then(() =>
      setBestand(null),
    )
  }

  return (
    <article className="od-kaart" style={{ borderColor: st.kleur }}>
      <header className="od-kop">
        <strong>{d.naam}</strong>
        {d.club ? <span className="od-dim"> · {d.club}</span> : null}
        <span className="od-status" style={{ color: st.kleur }}>
          {st.label}
        </span>
      </header>
      <p className="od-dim">
        {d.wedstrijd ? `${d.wedstrijd} · ` : ''}
        {d.datum ? formatDateTimeBE(new Date(d.datum)) : ''}
        {d.moment ? ` · ${d.moment}` : ''}
      </p>
      <p className="od-tekst">{d.omschrijving}</p>
      {d.opmerking && (
        <p className="od-opm">
          <strong>Federatie:</strong> {d.opmerking}
        </p>
      )}

      {d.status !== 'afgehandeld' && rol !== 'federatie' && (
        <ol className="od-stappen">
          <li>
            Download de <a href={`/api/ongeval/${d.id}/pdf`}>aangifte</a> (vul aan en onderteken) en het{' '}
            <a href={`/api/ongeval/${d.id}/getuigschrift`}>geneeskundig getuigschrift</a> (voor de dokter).
          </li>
          <li>Laad beide ingevuld op (een foto of scan volstaat).</li>
          <li>Dien in bij de federatie.</li>
        </ol>
      )}
      {rol === 'federatie' && (
        <p className="od-dim">
          <a href={`/api/ongeval/${d.id}/pdf`}>Aangifte (vooraf ingevuld)</a> · <a href={`/api/ongeval/${d.id}/getuigschrift`}>Getuigschrift (blanco)</a>
        </p>
      )}

      {d.documenten.length > 0 && (
        <ul className="od-docs">
          {d.documenten.map((x) => (
            <li key={x.id}>
              📄{' '}
              {x.url ? (
                <a href={x.url} target="_blank" rel="noreferrer">
                  {SOORT[x.soort] ?? x.soort}
                </a>
              ) : (
                (SOORT[x.soort] ?? x.soort)
              )}{' '}
              <span className="od-dim">· {formatDateBE(new Date(x.datum))}</span>
            </li>
          ))}
        </ul>
      )}

      {d.status === 'gemeld' && (
        <div className="od-upload">
          <select className="wb-input" value={soort} onChange={(e) => setSoort(e.target.value)}>
            <option value="aangifte">Aangifte {heeft('aangifte') ? '✓' : ''}</option>
            <option value="getuigschrift">Geneeskundig getuigschrift {heeft('getuigschrift') ? '✓' : ''}</option>
            <option value="ander">Ander document</option>
          </select>
          <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setBestand(e.target.files?.[0] ?? null)} />
          <button type="button" className="wb-btn" disabled={bezig || !bestand} onClick={opladen}>
            Opladen
          </button>
        </div>
      )}

      {d.status === 'gemeld' && (
        <button
          type="button"
          className="wb-btn wb-btn-primary"
          disabled={bezig || !heeft('aangifte') || !heeft('getuigschrift')}
          title={!heeft('aangifte') || !heeft('getuigschrift') ? 'Laad eerst de aangifte en het getuigschrift op.' : undefined}
          onClick={() => actie('indienen', 'Ingediend bij de federatie.')}
        >
          📤 Indienen bij de federatie
        </button>
      )}

      {rol === 'federatie' && d.status === 'ingediend' && (
        <div className="od-fed">
          <input
            className="wb-input"
            placeholder="Opmerking (verplicht bij terugsturen)"
            value={opmerking}
            onChange={(e) => setOpmerking(e.target.value)}
          />
          <button type="button" className="wb-btn wb-btn-primary" disabled={bezig} onClick={() => actie('afhandelen', 'Afgehandeld.')}>
            ✅ Afgehandeld
          </button>
          <button type="button" className="wb-btn" disabled={bezig || !opmerking.trim()} onClick={() => actie('terugsturen', 'Teruggestuurd naar de speler.')}>
            ↩️ Terugsturen
          </button>
        </div>
      )}
    </article>
  )
}
