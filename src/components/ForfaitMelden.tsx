'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { toast } from '@/components/Toaster'
import { formatDateTimeBE } from '@/lib/datetime'

type Kant = 'thuis' | 'uit'

/**
 * Een forfait vooraf melden (RCVK item 34, lib/forfait.ts): welke ploeg komt niet, en waarom. De
 * tegenpartij, de scheidsrechter, de spelers en de federatie horen het meteen; de wedstrijd gaat niet
 * door. Vóór vrijdag 12u van het speelweekend telt het als tijdig, daarna als laat (andere boete, en
 * ook telefonisch melden aan de secretaris van het NSC). Wordt de wedstrijd nadien verplaatst, dan
 * vervalt het forfait.
 */
export function ForfaitMelden({ matchId, kanten, grens }: { matchId: number; kanten: { kant: Kant; naam: string }[]; grens: string | null }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [kant, setKant] = useState<Kant>(kanten[0]?.kant ?? 'thuis')
  const [reden, setReden] = useState('')
  const [bezig, setBezig] = useState(false)
  if (!kanten.length) return null
  const laat = grens != null && Date.now() >= new Date(grens).getTime()

  const meld = async () => {
    const naam = kanten.find((k) => k.kant === kant)?.naam ?? 'deze ploeg'
    if (!window.confirm(`Forfait melden voor ${naam}? De wedstrijd gaat dan niet door en iedereen wordt verwittigd.`)) return
    setBezig(true)
    try {
      const res = await fetch(`/api/match/${matchId}/forfait`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ kant, reden }),
      })
      const d = (await res.json().catch(() => ({}))) as { error?: string; moment?: string }
      if (!res.ok) return toast('error', d.error ?? 'Melden mislukt.')
      toast('success', d.moment === 'laat' ? 'Forfait gemeld (laat). Bel ook de secretaris van het NSC.' : 'Forfait gemeld. Iedereen is verwittigd.')
      setOpen(false)
      router.refresh()
    } finally {
      setBezig(false)
    }
  }

  return (
    <section className="wb-card" style={{ marginTop: 12 }}>
      <h3 style={{ margin: '0 0 6px' }}>🚫 Forfait melden</h3>
      <p className="wb-sub">
        {grens
          ? laat
            ? `Na vrijdag 12u (${formatDateTimeBE(grens)}): dit telt als een laat forfait. Bel ook de secretaris van het NSC.`
            : `Tijdig tot ${formatDateTimeBE(grens)}. Daarna telt het als laat forfait, met een hogere boete.`
          : 'Meld het zo vroeg mogelijk.'}{' '}
        Wordt de wedstrijd nadien verplaatst, dan vervalt het forfait.
      </p>
      {open ? (
        <div className="bl-form">
          {kanten.length > 1 && (
            <label>
              Ploeg
              <select className="wb-input" value={kant} onChange={(e) => setKant(e.target.value === 'uit' ? 'uit' : 'thuis')}>
                {kanten.map((k) => (
                  <option key={k.kant} value={k.kant}>
                    {k.naam}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="bl-breed">
            Reden
            <input className="wb-input" value={reden} onChange={(e) => setReden(e.target.value)} placeholder="bv. te weinig spelers door griep" />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="wb-btn" onClick={() => setOpen(false)} disabled={bezig}>
              Annuleren
            </button>
            <button type="button" className="wb-btn wb-btn-primary" onClick={() => void meld()} disabled={bezig || reden.trim().length < 5}>
              {bezig ? 'Bezig…' : 'Forfait melden'}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="wb-btn" onClick={() => setOpen(true)}>
          Een ploeg komt niet
        </button>
      )}
    </section>
  )
}
