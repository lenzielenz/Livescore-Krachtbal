'use client'

import { Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

import { type FedNavGroup, zoekItems } from '@/lib/federatie-nav'
import { FedIcon } from './FedIcon'

// Zoekpalet (Ctrl+K): typ "boete", "kaart" of "weekend" en spring rechtstreeks naar het juiste
// werkscherm. Bij ±25 bestemmingen is dit sneller dan door de zijbalk te scrollen. Pijltjes +
// Enter; Esc of klikken ernaast sluit.
export function FedPalette({ open, onClose, groepen }: { open: boolean; onClose: () => void; groepen: FedNavGroup[] }) {
  const router = useRouter()
  const [zoek, setZoek] = useState('')
  const [gekozen, setGekozen] = useState(0)
  const invoer = useRef<HTMLInputElement>(null)
  const lijst = useRef<HTMLUListElement>(null)

  const hits = useMemo(() => zoekItems(groepen, zoek), [groepen, zoek])

  useEffect(() => {
    if (!open) return
    setZoek('')
    setGekozen(0)
    // Pas na het tekenen focussen, anders mist de browser de input.
    const t = setTimeout(() => invoer.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => setGekozen(0), [zoek])

  useEffect(() => {
    lijst.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [gekozen])

  if (!open) return null

  const ga = (href: string) => {
    onClose()
    router.push(href)
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setGekozen((g) => Math.min(g + 1, Math.max(hits.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setGekozen((g) => Math.max(g - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const hit = hits[gekozen]
      if (hit) ga(hit.item.href)
    }
  }

  return (
    <div className="fs-pal-bg" onMouseDown={onClose}>
      <div className="fs-pal" role="dialog" aria-modal="true" aria-label="Zoek een scherm" onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKey}>
        <div className="fs-pal-zoek">
          <Search className="fs-icon" aria-hidden />
          <input
            ref={invoer}
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
            placeholder="Waar wil je naartoe? bv. boetes, kaart, weekend…"
            aria-label="Zoek een scherm"
            role="combobox"
            aria-expanded="true"
            aria-controls="fs-pal-lijst"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd>Esc</kbd>
        </div>
        <ul id="fs-pal-lijst" ref={lijst} className="fs-pal-lijst" role="listbox">
          {hits.map(({ item, groep }, n) => (
            <li
              key={item.key}
              role="option"
              aria-selected={n === gekozen}
              className={n === gekozen ? 'on' : undefined}
              onMouseEnter={() => setGekozen(n)}
              onClick={() => ga(item.href)}
            >
              <FedIcon naam={item.icon} />
              <span className="fs-pal-tekst">
                <strong>{item.label}</strong>
                <small>{item.hint}</small>
              </span>
              <span className="fs-pal-groep">{groep.titel}</span>
            </li>
          ))}
          {hits.length === 0 && <li className="fs-pal-leeg">Niets gevonden voor “{zoek}”.</li>}
        </ul>
      </div>
    </div>
  )
}
