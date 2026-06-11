'use client'

import { useEffect, useState } from 'react'

// Opt-in voor push-meldingen (start + eindstand). Werkt enkel met een geconfigureerde publieke
// VAPID-sleutel; zonder sleutel of zonder ondersteuning toont de knop niets.
const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

// VAPID-sleutel (base64url) → Uint8Array, zoals pushManager.subscribe het verwacht. Bouw op een
// concrete ArrayBuffer zodat het als BufferSource voor applicationServerKey aanvaard wordt.
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const arr = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

type State = 'hidden' | 'ios-install' | 'default' | 'denied' | 'subscribed' | 'busy'

export function PushOptIn() {
  const [state, setState] = useState<State>('hidden')
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!VAPID || typeof window === 'undefined') return
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    if (!supported) {
      // iOS ondersteunt push enkel in een géïnstalleerde PWA (toegevoegd aan beginscherm).
      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true
      if (isIOS && !standalone) setState('ios-install')
      return
    }
    if (Notification.permission === 'denied') {
      setState('denied')
      return
    }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(sub ? 'subscribed' : 'default'))
      .catch(() => setState('default'))
  }, [])

  const enable = async () => {
    if (!VAPID) return
    setState('busy')
    setMsg(null)
    try {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') {
        setState(perm === 'denied' ? 'denied' : 'default')
        if (perm !== 'denied') setMsg('Meldingen niet toegestaan.')
        return
      }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID),
      })
      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      })
      if (!res.ok) throw new Error('Inschrijven mislukt — probeer later opnieuw.')
      setState('subscribed')
      setMsg('Je krijgt nu een seintje bij de start en de eindstand.')
    } catch (e) {
      setState('default')
      setMsg((e as Error).message || 'Er ging iets mis.')
    }
  }

  const disable = async () => {
    setState('busy')
    setMsg(null)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {})
        await sub.unsubscribe().catch(() => {})
      }
      setState('default')
      setMsg('Meldingen uitgezet.')
    } catch {
      setState('subscribed')
    }
  }

  if (state === 'hidden') return null

  return (
    <div className="push-optin">
      <h3>🔔 Meldingen</h3>
      {state === 'ios-install' ? (
        <p className="push-optin-hint">
          Voeg de app eerst toe aan je beginscherm (deel-knop → <strong>Zet op beginscherm</strong>), dan kan je
          meldingen aanzetten.
        </p>
      ) : state === 'denied' ? (
        <p className="push-optin-hint">Meldingen staan geblokkeerd. Zet ze terug aan in de browserinstellingen voor deze site.</p>
      ) : state === 'subscribed' ? (
        <>
          <p className="push-optin-hint">✓ Je krijgt een seintje bij start en eindstand.</p>
          <button type="button" className="push-optin-btn off" onClick={disable}>Meldingen uitzetten</button>
        </>
      ) : (
        <>
          <p className="push-optin-hint">Krijg een seintje wanneer een match begint en bij de eindstand.</p>
          <button type="button" className="push-optin-btn" disabled={state === 'busy'} onClick={enable}>
            {state === 'busy' ? 'Bezig…' : '🔔 Zet meldingen aan'}
          </button>
        </>
      )}
      {msg && <p className="push-optin-msg">{msg}</p>}
    </div>
  )
}
