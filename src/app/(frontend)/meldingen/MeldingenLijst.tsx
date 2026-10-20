'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { formatDateTimeBE } from '@/lib/datetime'

type Melding = { id: number; titel: string; tekst?: string | null; url?: string | null; gelezen: boolean; op: string }

// Je meldingen, nieuwste eerst. Openen markeert alles als gelezen (de 🔔 telt dan weer vanaf nul).
export function MeldingenLijst() {
  const [lijst, setLijst] = useState<Melding[] | null>(null)

  useEffect(() => {
    fetch('/api/meldingen', { credentials: 'include' })
      .then((r) => r.json())
      .then((d: { meldingen?: Melding[] }) => {
        setLijst(d.meldingen ?? [])
        if ((d.meldingen ?? []).some((m) => !m.gelezen)) {
          void fetch('/api/meldingen', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ gelezen: 'alle' }),
          })
          try {
            sessionStorage.removeItem('kb-meldingen-telling')
          } catch {
            /* geen opslag */
          }
        }
      })
      .catch(() => setLijst([]))
  }, [])

  if (!lijst) return <p className="empty">Laden…</p>
  if (lijst.length === 0) return <p className="empty">Nog geen meldingen.</p>
  return (
    <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {lijst.map((m) => {
        const inhoud = (
          <>
            <strong style={{ display: 'block' }}>
              {!m.gelezen && <span style={{ color: '#e0533d' }}>● </span>}
              {m.titel}
            </strong>
            {m.tekst && <span style={{ display: 'block', color: 'var(--dim)', fontSize: '0.86rem', whiteSpace: 'pre-line' }}>{m.tekst}</span>}
            <small style={{ color: 'var(--dim)' }}>{formatDateTimeBE(m.op)}</small>
          </>
        )
        const stijl = { display: 'block', padding: '10px 14px', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--panel)', color: 'var(--txt)', textDecoration: 'none' }
        return (
          <li key={m.id}>
            {m.url ? (
              <Link href={m.url} style={stijl}>
                {inhoud}
              </Link>
            ) : (
              <div style={stijl}>{inhoud}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
