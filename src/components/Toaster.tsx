'use client'

import { useEffect, useState } from 'react'

import './toaster.css'

type ToastType = 'success' | 'error' | 'info'
type ToastItem = { id: number; type: ToastType; msg: string }

let seq = 0

/** Toon een toast vanuit om het even welke client-component: toast('success', '…'). */
export function toast(type: ToastType, msg: string): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('krachtbal-toast', { detail: { type, msg } }))
}

// Globale toaster: luistert naar toast-events en toont een stapel meldingen rechtsonder.
export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => {
    const onToast = (e: Event) => {
      const d = (e as CustomEvent).detail as { type: ToastType; msg: string }
      if (!d?.msg) return
      const id = ++seq
      setItems((prev) => [...prev, { id, type: d.type ?? 'info', msg: d.msg }])
      window.setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== id)), 3600)
    }
    window.addEventListener('krachtbal-toast', onToast)
    return () => window.removeEventListener('krachtbal-toast', onToast)
  }, [])

  return (
    <div className="toaster" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.type}`} role="status">
          <span className="toast-ico">{t.type === 'success' ? '✓' : t.type === 'error' ? '✕' : 'ℹ'}</span>
          <span className="toast-msg">{t.msg}</span>
        </div>
      ))}
    </div>
  )
}
