'use client'

import { X } from 'lucide-react'
import { type ReactNode, useEffect, useRef } from 'react'

// Een klein dialoogvenster voor het federatieplatform: één taak, één formulier, Esc of klikken
// ernaast sluit. Gebruikt door "Snel doen" (scheidsrechter, taak, bericht) en door het bord.
export function FedDialoog({ titel, onClose, children, breed }: { titel: string; onClose: () => void; children: ReactNode; breed?: boolean }) {
  const eerste = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    // Het eerste invoerveld krijgt de focus zodra het venster er staat.
    const t = setTimeout(() => eerste.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus(), 0)
    return () => {
      window.removeEventListener('keydown', onKey)
      clearTimeout(t)
    }
  }, [onClose])
  return (
    <div className="fs-pal-bg fs-dlg-bg" onMouseDown={onClose}>
      <div className={`fs-dlg ${breed ? 'fs-dlg-breed' : ''}`} role="dialog" aria-modal="true" aria-label={titel} onMouseDown={(e) => e.stopPropagation()}>
        <header className="fs-dlg-kop">
          <h2>{titel}</h2>
          <button type="button" className="fs-icoonknop" onClick={onClose} aria-label="Sluiten">
            <X className="fs-icon" aria-hidden />
          </button>
        </header>
        <div className="fs-dlg-body" ref={eerste}>
          {children}
        </div>
      </div>
    </div>
  )
}
