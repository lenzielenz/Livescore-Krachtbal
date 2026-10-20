'use client'

import { useMemo, useState } from 'react'

import type { ClubRij } from '@/lib/federatie-statistieken'

const KOLOMMEN: { key: keyof ClubRij; label: string }[] = [
  { key: 'naam', label: 'Club' },
  { key: 'ploegen', label: 'Ploegen' },
  { key: 'leden', label: 'Leden' },
  { key: 'spelers', label: 'Spelers' },
  { key: 'speelgerechtigd', label: 'Mogen spelen' },
  { key: 'jeugd', label: 'Jeugd' },
  { key: 'meisjes', label: 'Meisjes' },
  { key: 'jongens', label: 'Jongens' },
  { key: 'forfaits', label: 'Forfaits' },
]

// Per club, sorteerbaar (klik op een kolom). Met een CSV-knop om verder te werken in een rekenblad.
export function ClubTabel({ clubs }: { clubs: ClubRij[] }) {
  const [sorteer, setSorteer] = useState<{ key: keyof ClubRij; op: boolean }>({ key: 'leden', op: false })
  const rijen = useMemo(() => {
    const r = [...clubs]
    r.sort((a, b) => {
      const x = a[sorteer.key]
      const y = b[sorteer.key]
      const v = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))
      return sorteer.op ? v : -v
    })
    return r
  }, [clubs, sorteer])

  const csv = () => {
    const kop = KOLOMMEN.map((k) => k.label).join(';')
    const regels = rijen.map((c) => KOLOMMEN.map((k) => String(c[k.key]).replace(/;/g, ',')).join(';'))
    const blob = new Blob([[kop, ...regels].join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'clubs.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <section className="st-kaart">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className="st-sub">{clubs.length} clubs · klik op een kolom om te sorteren</span>
        <button type="button" className="ft-btn" onClick={csv}>
          ⬇ CSV
        </button>
      </div>
      <div className="st-tabel-wrap">
        <table className="st-tabel">
          <thead>
            <tr>
              {KOLOMMEN.map((k) => (
                <th key={k.key} className={k.key === 'naam' ? '' : 'st-num'}>
                  <button
                    type="button"
                    onClick={() => setSorteer((s) => ({ key: k.key, op: s.key === k.key ? !s.op : k.key === 'naam' }))}
                    aria-sort={sorteer.key === k.key ? (sorteer.op ? 'ascending' : 'descending') : 'none'}
                  >
                    {k.label}
                    {sorteer.key === k.key ? (sorteer.op ? ' ▲' : ' ▼') : ''}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rijen.map((c) => (
              <tr key={c.id}>
                {KOLOMMEN.map((k) => (
                  <td key={k.key} className={k.key === 'naam' ? '' : 'st-num'}>
                    {String(c[k.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
