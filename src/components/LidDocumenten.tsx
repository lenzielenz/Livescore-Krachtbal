'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'

import { toast } from '@/components/Toaster'
import { formatDateBE } from '@/lib/datetime'
import type { DocRij, DocSoort } from '@/lib/lid-documenten'

const SOORTEN: { v: DocSoort; label: string }[] = [
  { v: 'mutualiteit', label: 'Mutualiteit' },
  { v: 'identiteit', label: 'Identiteit' },
  { v: 'toestemming', label: 'Toestemming' },
  { v: 'verzekering', label: 'Verzekering' },
  { v: 'ander', label: 'Ander' },
]
const LABEL = Object.fromEntries(SOORTEN.map((s) => [s.v, s.label])) as Record<DocSoort, string>

/** De documenten van een lid: lijst, opladen en verwijderen (lib/lid-documenten.ts). */
export function LidDocumenten({ playerId, docs, staf }: { playerId: number; docs: DocRij[]; staf: boolean }) {
  const router = useRouter()
  const [titel, setTitel] = useState('')
  const [soort, setSoort] = useState<DocSoort>('mutualiteit')
  const [zichtbaar, setZichtbaar] = useState(true)
  const [bestand, setBestand] = useState<File | null>(null)
  const [bezig, setBezig] = useState(false)
  const kiezer = useRef<HTMLInputElement>(null)

  return (
    <div className="ld">
      {docs.length === 0 ? (
        <p className="wb-sub">Nog geen documenten.</p>
      ) : (
        <ul className="ld-lijst">
          {docs.map((d) => (
            <li key={d.id}>
              <a href={d.url ?? '#'} target="_blank" rel="noopener">
                📄 {d.titel}
              </a>
              <span className="ld-dim">
                {LABEL[d.soort]} · {formatDateBE(d.op)}
                {!d.zichtbaarVoorLid ? ' · enkel club en federatie' : ''}
                {d.opmerking ? ` · ${d.opmerking}` : ''}
              </span>
              {d.magWeg && (
                <button
                  type="button"
                  className="ld-x"
                  aria-label={`${d.titel} verwijderen`}
                  onClick={async () => {
                    if (!confirm(`"${d.titel}" verwijderen?`)) return
                    const res = await fetch(`/api/lid-documenten?id=${d.id}`, { method: 'DELETE', credentials: 'include' })
                    if (!res.ok) return toast('error', ((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Verwijderen mislukt.')
                    router.refresh()
                  }}
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <form
        className="ld-nieuw"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!bestand) return
          setBezig(true)
          try {
            const fd = new FormData()
            fd.set('playerId', String(playerId))
            fd.set('bestand', bestand)
            fd.set('titel', titel)
            fd.set('soort', soort)
            fd.set('zichtbaarVoorLid', String(zichtbaar))
            const res = await fetch('/api/lid-documenten', { method: 'POST', body: fd, credentials: 'include' })
            const j = (await res.json().catch(() => ({}))) as { error?: string }
            if (!res.ok) return toast('error', j.error ?? 'Opladen mislukt.')
            toast('success', 'Document opgeladen.')
            setTitel('')
            setBestand(null)
            if (kiezer.current) kiezer.current.value = ''
            router.refresh()
          } finally {
            setBezig(false)
          }
        }}
      >
        <label>
          Titel
          <input value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="bv. Formulier mutualiteit 2026" required minLength={2} />
        </label>
        <label>
          Soort
          <select value={soort} onChange={(e) => setSoort(e.target.value as DocSoort)}>
            {SOORTEN.map((s) => (
              <option key={s.v} value={s.v}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Bestand (PDF of foto, max. 10 MB)
          <input ref={kiezer} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setBestand(e.target.files?.[0] ?? null)} required />
        </label>
        {staf && (
          <label className="ld-vink">
            <input type="checkbox" checked={zichtbaar} onChange={(e) => setZichtbaar(e.target.checked)} /> Zichtbaar voor het lid (en de ouders)
          </label>
        )}
        <button type="submit" className="wb-btn wb-btn-primary" disabled={bezig || !bestand || titel.trim().length < 2}>
          {bezig ? 'Opladen…' : 'Document opladen'}
        </button>
      </form>
    </div>
  )
}
