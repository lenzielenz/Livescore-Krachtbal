'use client'

import { useMemo, useState } from 'react'

type TocEntry = { depth: number; text: string; id: string }

// Client-side inhoudsopgave met zoekfilter — handig voor scheidsrechters die snel één item zoeken.
export function ReglementNav({ toc }: { toc: TocEntry[] }) {
  const [q, setQ] = useState('')
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return toc
    return toc.filter((t) => t.text.toLowerCase().includes(needle))
  }, [q, toc])

  return (
    <nav style={{ position: 'sticky', top: 16 }}>
      <input
        placeholder="Zoek in het reglement…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ width: '100%', padding: 8, marginBottom: 12, boxSizing: 'border-box', borderRadius: 6, border: '1px solid #ccc' }}
      />
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: '70vh', overflowY: 'auto' }}>
        {filtered.map((t) => (
          <li key={t.id} style={{ paddingLeft: (t.depth - 1) * 10 }}>
            <a href={`#${t.id}`} style={{ display: 'block', padding: '3px 0', fontSize: 13, color: '#374151', textDecoration: 'none' }}>
              {t.text}
            </a>
          </li>
        ))}
        {filtered.length === 0 && <li style={{ color: '#888', fontSize: 13 }}>Geen resultaten.</li>}
      </ul>
    </nav>
  )
}
