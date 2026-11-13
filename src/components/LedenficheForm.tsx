'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { toast } from '@/components/Toaster'
import type { Fiche } from '@/lib/ledenfiche'

/** De ledenfiche bewerken (adres, contact, noodcontact, toestemmingen). Bewaart via /api/ledenfiche. */
export function LedenficheForm({ playerId, begin }: { playerId: number; begin: Fiche }) {
  const router = useRouter()
  const [f, setF] = useState<Fiche>(begin)
  const [bezig, setBezig] = useState(false)
  const gewijzigd = JSON.stringify(f) !== JSON.stringify(begin)
  const veld = (k: keyof Fiche, label: string, o: { type?: string; auto?: string; breed?: boolean; plaats?: string } = {}) => (
    <label className={o.breed ? 'lf-breed' : undefined}>
      {label}
      <input
        type={o.type ?? 'text'}
        autoComplete={o.auto}
        placeholder={o.plaats}
        value={(f[k] as string | null) ?? ''}
        onChange={(e) => setF({ ...f, [k]: e.target.value })}
      />
    </label>
  )
  return (
    <form
      className="lf"
      onSubmit={async (e) => {
        e.preventDefault()
        setBezig(true)
        try {
          const res = await fetch('/api/ledenfiche', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ playerId, ...f }) })
          const j = (await res.json().catch(() => ({}))) as { error?: string }
          if (!res.ok) return toast('error', j.error ?? 'Bewaren mislukt.')
          toast('success', 'Gegevens bewaard.')
          router.refresh()
        } finally {
          setBezig(false)
        }
      }}
    >
      <fieldset>
        <legend>Adres</legend>
        {veld('straat', 'Straat en nummer', { auto: 'street-address', breed: true })}
        {veld('postcode', 'Postcode', { auto: 'postal-code' })}
        {veld('gemeente', 'Gemeente', { auto: 'address-level2' })}
        {veld('land', 'Land', { plaats: 'BE' })}
      </fieldset>
      <fieldset>
        <legend>Contact</legend>
        {veld('telefoon', 'Telefoon', { type: 'tel', auto: 'tel' })}
        {veld('nationaliteit', 'Nationaliteit', { plaats: 'Belg' })}
        {veld('noodcontactNaam', 'Noodcontact: naam', { plaats: 'bv. mama, papa, partner' })}
        {veld('noodcontactTelefoon', 'Noodcontact: telefoon', { type: 'tel' })}
      </fieldset>
      <fieldset>
        <legend>Toestemmingen</legend>
        <label className="lf-vink">
          <input type="checkbox" checked={f.toestemmingFoto} onChange={(e) => setF({ ...f, toestemmingFoto: e.target.checked })} />
          Foto&apos;s en video van wedstrijden en activiteiten mogen gepubliceerd worden
        </label>
        <label className="lf-vink">
          <input type="checkbox" checked={f.toestemmingNieuws} onChange={(e) => setF({ ...f, toestemmingNieuws: e.target.checked })} />
          Nieuwsbrief van de federatie ontvangen
        </label>
      </fieldset>
      <button type="submit" className="wb-btn wb-btn-primary" disabled={bezig || !gewijzigd}>
        {bezig ? 'Bewaren…' : 'Bewaren'}
      </button>
    </form>
  )
}
