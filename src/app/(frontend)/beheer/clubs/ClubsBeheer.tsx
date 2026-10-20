'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { toast } from '@/components/Toaster'

export type ClubRij = { id: number; naam: string; plaats: string; ploegen: number; beheerders: string[] }

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

async function post(body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch('/api/federatie/clubs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })
  return { ok: res.ok, data: (await res.json().catch(() => ({}))) as Record<string, unknown> }
}

function Uitnodigen({ club }: { club: ClubRij }) {
  const router = useRouter()
  const [naam, setNaam] = useState('')
  const [email, setEmail] = useState('')
  const [link, setLink] = useState<string | null>(null)
  const [bezig, setBezig] = useState(false)
  return (
    <div className="ft-velden" style={{ alignItems: 'end' }}>
      <label className="ft-veld">
        Naam
        <input value={naam} onChange={(e) => setNaam(e.target.value)} />
      </label>
      <label className="ft-veld">
        E-mail
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <button
        type="button"
        className="ft-btn ft-primair"
        disabled={bezig || !email}
        onClick={async () => {
          setBezig(true)
          try {
            const r = await post({ actie: 'uitnodigen', clubId: club.id, naam, email })
            if (!r.ok) return toast('error', String(r.data.error ?? 'Mislukt.'))
            setLink(String(r.data.link))
            toast('success', r.data.nieuw ? 'Account aangemaakt.' : 'Bestaand account is nu clubbeheerder.')
            router.refresh()
          } finally {
            setBezig(false)
          }
        }}
      >
        Uitnodigen
      </button>
      {link && (
        <div className="ft-link" style={{ gridColumn: '1 / -1' }}>
          <span>Stuur deze link door (eenmalig, 24 uur geldig):</span>
          <code>{link}</code>
          <button
            type="button"
            className="ft-btn"
            onClick={() => {
              void navigator.clipboard?.writeText(link)
              toast('success', 'Gekopieerd.')
            }}
          >
            🔗 Kopieer
          </button>
        </div>
      )}
    </div>
  )
}

export function ClubsBeheer({ clubs }: { clubs: ClubRij[] }) {
  const router = useRouter()
  const [zoek, setZoek] = useState('')
  const [enkelZonder, setEnkelZonder] = useState(false)
  const [open, setOpen] = useState<number | null>(null)
  const [nieuweNaam, setNieuweNaam] = useState('')
  const [nieuwePlaats, setNieuwePlaats] = useState('')

  const zichtbaar = clubs.filter((c) => (!enkelZonder || (c.beheerders.length === 0 && c.ploegen > 0)) && (!zoek || norm(c.naam).includes(norm(zoek))))
  const zonder = clubs.filter((c) => c.beheerders.length === 0 && c.ploegen > 0).length

  return (
    <div className="ft-wrap">
      <div className="ft-kaart">
        <h2>➕ Nieuwe club</h2>
        <div className="ft-velden" style={{ alignItems: 'end' }}>
          <label className="ft-veld">
            Naam
            <input value={nieuweNaam} onChange={(e) => setNieuweNaam(e.target.value)} placeholder="KBC …" />
          </label>
          <label className="ft-veld">
            Gemeente
            <input value={nieuwePlaats} onChange={(e) => setNieuwePlaats(e.target.value)} />
          </label>
          <button
            type="button"
            className="ft-btn ft-primair"
            disabled={nieuweNaam.trim().length < 2}
            onClick={async () => {
              const r = await post({ actie: 'club', naam: nieuweNaam, plaats: nieuwePlaats })
              if (!r.ok) return toast('error', String(r.data.error ?? 'Mislukt.'))
              toast('success', 'Club aangemaakt. Nodig nu een clubbeheerder uit.')
              setNieuweNaam('')
              setNieuwePlaats('')
              setOpen(Number(r.data.id))
              router.refresh()
            }}
          >
            Aanmaken
          </button>
        </div>
      </div>

      <div className="ft-balk">
        <input className="ft-zoek" type="search" placeholder="Zoek club…" value={zoek} onChange={(e) => setZoek(e.target.value)} aria-label="Zoek club" />
        <label className="ft-stat">
          <input type="checkbox" checked={enkelZonder} onChange={(e) => setEnkelZonder(e.target.checked)} /> enkel zonder login ({zonder})
        </label>
      </div>

      {zichtbaar.map((c) => (
        <div key={c.id} className={`ft-kaart ${c.beheerders.length === 0 && c.ploegen > 0 ? 'ft-leeg' : ''}`} style={c.beheerders.length === 0 && c.ploegen > 0 ? { borderLeft: '4px solid #f6c544' } : undefined}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="ft-wedstrijd" style={{ flex: '1 1 200px' }}>
              <strong>{c.naam}</strong>
              <small>
                {c.plaats ? `${c.plaats} · ` : ''}
                {c.ploegen} ploeg{c.ploegen === 1 ? '' : 'en'} · {c.beheerders.length ? `beheerd door ${c.beheerders.join(', ')}` : 'nog geen clubbeheerder'}
              </small>
            </div>
            <button type="button" className="ft-btn" onClick={() => setOpen(open === c.id ? null : c.id)}>
              {open === c.id ? 'Sluiten' : '✉️ Beheerder uitnodigen'}
            </button>
          </div>
          {open === c.id && <Uitnodigen club={c} />}
        </div>
      ))}
    </div>
  )
}
