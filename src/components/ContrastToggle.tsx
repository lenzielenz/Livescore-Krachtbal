'use client'

import { useEffect, useState } from 'react'

// Kleine toggle voor de hoog-contrast modus (slecht verlichte zaal / fel zonlicht). Zet
// data-theme="hc" op <html> en onthoudt de keuze in localStorage. Zie styles.css. (AUDIT §1)
export function ContrastToggle({ className }: { className?: string }) {
  const [hc, setHc] = useState(false)

  useEffect(() => {
    const on = localStorage.getItem('kb-contrast') === 'hc'
    setHc(on)
    if (on) document.documentElement.dataset.theme = 'hc'
  }, [])

  const toggle = () => {
    const next = !hc
    setHc(next)
    if (next) {
      document.documentElement.dataset.theme = 'hc'
      localStorage.setItem('kb-contrast', 'hc')
    } else {
      delete document.documentElement.dataset.theme
      localStorage.removeItem('kb-contrast')
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={className}
      aria-pressed={hc}
      title="Hoog-contrast modus (slecht licht / zonlicht)"
    >
      {hc ? '◐ Contrast aan' : '◑ Contrast'}
    </button>
  )
}
