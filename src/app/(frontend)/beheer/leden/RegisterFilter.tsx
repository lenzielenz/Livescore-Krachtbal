'use client'

import { useRouter } from 'next/navigation'
import { useRef } from 'react'

import type { LedenFilter } from '@/lib/leden-register'

/**
 * De filterbalk van het ledenregister. Een gewoon GET-formulier: elk filter staat in de URL (terug-knop,
 * bladwijzer, een link doorsturen werkt). Een keuzelijst past meteen toe; zoeken met Enter.
 */
export function RegisterFilter({
  filter,
  sort,
  clubs,
  categorieen,
  toonOpties,
  keuringOpties,
}: {
  filter: LedenFilter
  sort: string
  clubs: { id: number; naam: string }[]
  categorieen: string[]
  toonOpties: [string, string][]
  keuringOpties: [string, string][]
}) {
  const router = useRouter()
  const form = useRef<HTMLFormElement>(null)
  const pas = () => form.current?.requestSubmit()
  const heeftFilter = Boolean(filter.zoek || filter.club || filter.toon || filter.keuring || filter.categorie || filter.geslacht)
  return (
    <form
      ref={form}
      className="ft-balk led-filter"
      action="/beheer/leden"
      method="get"
      onSubmit={(e) => {
        // Lege velden niet in de URL; altijd terug naar pagina 1 bij een nieuw filter.
        e.preventDefault()
        const q = new URLSearchParams()
        for (const [k, v] of new FormData(e.currentTarget).entries()) if (String(v) !== '') q.set(k, String(v))
        router.push(`/beheer/leden?${q.toString()}`)
      }}
    >
      <input type="hidden" name="tab" value="register" />
      <input className="ft-zoek" type="search" name="zoek" defaultValue={filter.zoek ?? ''} placeholder="Zoek op naam, vergunningsnummer of e-mail…" aria-label="Zoeken" />
      <select name="club" defaultValue={filter.club ?? ''} onChange={pas} aria-label="Club">
        <option value="">Alle clubs</option>
        {clubs.map((c) => (
          <option key={c.id} value={c.id}>
            {c.naam}
          </option>
        ))}
      </select>
      <select name="toon" defaultValue={filter.toon ?? ''} onChange={pas} aria-label="Toestand">
        <option value="">Elke toestand</option>
        {toonOpties.map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </select>
      <select name="keuring" defaultValue={filter.keuring ?? ''} onChange={pas} aria-label="Keuring">
        <option value="">Elke keuring</option>
        {keuringOpties.map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </select>
      <select name="categorie" defaultValue={filter.categorie ?? ''} onChange={pas} aria-label="Categorie">
        <option value="">Alle categorieën</option>
        {categorieen.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <select name="geslacht" defaultValue={filter.geslacht ?? ''} onChange={pas} aria-label="Geslacht">
        <option value="">M/V</option>
        <option value="m">Man</option>
        <option value="v">Vrouw</option>
      </select>
      <select name="sort" defaultValue={sort} onChange={pas} aria-label="Sorteren">
        <option value="naam">Naam A–Z</option>
        <option value="-naam">Naam Z–A</option>
        <option value="keuring">Oudste keuring eerst</option>
        <option value="-gewijzigd">Laatst gewijzigd</option>
      </select>
      <button type="submit" className="ft-btn ft-primair">
        Zoeken
      </button>
      {heeftFilter && (
        <button type="button" className="ft-btn" onClick={() => router.push('/beheer/leden?tab=register')}>
          Wissen
        </button>
      )}
    </form>
  )
}
